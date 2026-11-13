"""唯一的 WeKnora 客户端。页面和其他模块不得直接请求上游。"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass, field

import httpx

from weknora_web.settings import get_settings


@dataclass
class KnowledgeBaseView:
    id: str
    name: str
    description: str | None


@dataclass
class CitationDraft:
    knowledge_id: str | None
    title: str
    excerpt: str


@dataclass
class AnswerDelta:
    text: str


@dataclass
class StreamFinished:
    status: str
    citations: list[CitationDraft] = field(default_factory=list)


class UpstreamError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict,
        envelope: dict,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.envelope = envelope


class UpstreamUnavailable(Exception):
    pass


class WeKnoraClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        # 只带工作区 API Key。不附加 X-Tenant-ID 或 Authorization。
        # 403 与 409 表示授权或租户上下文错误，换租户重试会扩大访问范围，所以这里没有重试循环。
        return {"X-API-Key": self._api_key}

    def _client(self) -> httpx.Client:
        return httpx.Client(transport=self._transport, timeout=httpx.Timeout(60.0, read=None))

    def list_knowledge_bases(self) -> list[KnowledgeBaseView]:
        url = f"{self._base_url}/api/v1/knowledge-bases"
        with self._client() as client:
            try:
                response = client.get(url, headers=self._headers())
            except httpx.TransportError as exc:
                raise UpstreamUnavailable() from exc
        if response.status_code >= 400:
            raise _error_from_response(response)
        payload = response.json()
        _require_success(payload, response.status_code)
        views: list[KnowledgeBaseView] = []
        for item in payload.get("data") or []:
            views.append(
                KnowledgeBaseView(
                    id=str(item["id"]),
                    name=str(item.get("name") or ""),
                    description=item.get("description"),
                )
            )
        return views

    def create_session(self, title: str) -> str:
        url = f"{self._base_url}/api/v1/sessions"
        # 请求体只有标题。不发送 kind，也不发送 assistant，让 v0.9.0 使用普通会话。
        body = {"title": title}
        with self._client() as client:
            try:
                response = client.post(url, headers=self._headers(), json=body)
            except httpx.TransportError as exc:
                raise UpstreamUnavailable() from exc
        if response.status_code not in (200, 201):
            raise _error_from_response(response)
        payload = response.json()
        _require_success(payload, response.status_code)
        session_id = (payload.get("data") or {}).get("id")
        if not session_id:
            raise UpstreamError(
                response.status_code,
                "upstream_failed",
                "missing session id",
                {},
                payload if isinstance(payload, dict) else {},
            )
        return str(session_id)

    def delete_session(self, session_id: str) -> None:
        if not session_id:
            return
        url = f"{self._base_url}/api/v1/sessions/{session_id}"
        with self._client() as client:
            try:
                response = client.delete(url, headers=self._headers())
            except httpx.TransportError as exc:
                raise UpstreamUnavailable() from exc
        if response.status_code >= 400:
            raise _error_from_response(response)
        payload = response.json()
        _require_success(payload, response.status_code)

    def iter_knowledge_chat(
        self,
        session_id: str,
        query: str,
        knowledge_base_id: str,
    ) -> Iterator[AnswerDelta | StreamFinished]:
        # 只发送这次的新问题，以及这一段对话绑定的一个知识库。不拼接本地历史。
        url = f"{self._base_url}/api/v1/knowledge-chat/{session_id}"
        body = {"query": query, "knowledge_base_ids": [knowledge_base_id]}
        client = self._client()
        try:
            response = client.send(
                client.build_request("POST", url, headers=self._headers(), json=body),
                stream=True,
            )
        except httpx.TransportError as exc:
            client.close()
            raise UpstreamUnavailable() from exc
        if response.status_code >= 400:
            raw = response.read()
            response.close()
            client.close()
            raise _error_from_bytes(response.status_code, raw)
        return _parse_sse(response, client)


def get_client() -> WeKnoraClient:
    settings = get_settings()
    return WeKnoraClient(settings.weknora_base_url, settings.weknora_api_key)


def _require_success(payload: object, status_code: int) -> None:
    if not isinstance(payload, dict) or payload.get("success") is not True:
        error = payload.get("error") if isinstance(payload, dict) else None
        if not isinstance(error, dict):
            error = {"code": "upstream_failed", "message": "upstream error", "details": {}}
        raise UpstreamError(
            status_code,
            str(error.get("code") or "upstream_failed"),
            str(error.get("message") or "upstream error"),
            error.get("details") if isinstance(error.get("details"), dict) else {},
            payload if isinstance(payload, dict) else {},
        )


def _error_from_response(response: httpx.Response) -> UpstreamError:
    return _error_from_bytes(response.status_code, response.content)


def _error_from_bytes(status_code: int, raw: bytes) -> UpstreamError:
    try:
        payload = json.loads(raw.decode() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict) or "error" not in payload:
        payload = {
            "success": False,
            "error": {"code": "upstream_failed", "message": "upstream error", "details": {}},
        }
    error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
    details = error.get("details") if isinstance(error.get("details"), dict) else {}
    return UpstreamError(
        status_code,
        str(error.get("code") or "upstream_failed"),
        str(error.get("message") or "upstream error"),
        details,
        payload,
    )


def _parse_sse(
    response: httpx.Response,
    client: httpx.Client,
) -> Iterator[AnswerDelta | StreamFinished]:
    citations: list[CitationDraft] = []
    saw_error = False
    finished = False

    def observe(event_name: str, payload: dict) -> AnswerDelta | None:
        nonlocal saw_error, finished
        citations.extend(_citations_from(payload))
        if payload.get("response_type") == "error" or event_name == "error":
            saw_error = True
        if event_name == "complete" or payload.get("done") is True:
            finished = True
        if payload.get("response_type") == "answer" and payload.get("content"):
            return AnswerDelta(str(payload["content"]))
        return None

    try:
        buffer = ""
        for chunk in response.iter_text():
            buffer += chunk.replace("\r\n", "\n")
            while "\n\n" in buffer:
                raw, buffer = buffer.split("\n\n", 1)
                parsed = _parse_event(raw)
                if parsed is None:
                    continue
                delta = observe(*parsed)
                if delta is not None:
                    yield delta
        if buffer.strip():
            parsed = _parse_event(buffer)
            if parsed is not None:
                delta = observe(*parsed)
                if delta is not None:
                    yield delta
        status = "complete" if finished and not saw_error else "interrupted"
        yield StreamFinished(status=status, citations=_dedupe(citations))
    except httpx.TransportError:
        yield StreamFinished(status="interrupted", citations=_dedupe(citations))
    finally:
        response.close()
        client.close()


def _parse_event(raw: str) -> tuple[str, dict] | None:
    event_name = "message"
    data_lines: list[str] = []
    for line in raw.split("\n"):
        if not line or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line[len("event:") :].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())
    if not data_lines:
        return None
    try:
        payload = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return event_name, payload


def _citations_from(payload: dict) -> list[CitationDraft]:
    refs = payload.get("knowledge_references")
    if not isinstance(refs, list):
        return []
    drafts: list[CitationDraft] = []
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        knowledge_id = ref.get("knowledge_id")
        drafts.append(
            CitationDraft(
                knowledge_id=str(knowledge_id) if knowledge_id else None,
                title=str(ref.get("knowledge_title") or ""),
                excerpt=str(ref.get("content") or ""),
            )
        )
    return drafts


def _dedupe(drafts: list[CitationDraft]) -> list[CitationDraft]:
    seen: set[tuple[str | None, str]] = set()
    unique: list[CitationDraft] = []
    for draft in drafts:
        key = (draft.knowledge_id, draft.excerpt)
        if key in seen:
            continue
        seen.add(key)
        unique.append(draft)
    return unique
