from weknora_web.weknora.client import (
    AnswerDelta,
    CitationDraft,
    KnowledgeBaseView,
    StreamFinished,
    UpstreamError,
    UpstreamUnavailable,
)


class FakeWeKnora:
    def __init__(self) -> None:
        self.kbs = [KnowledgeBaseView(id="kb-1", name="手册", description="说明")]
        self.sessions: dict[str, str] = {}
        self.chat_calls: list[dict] = []
        self.delete_calls: list[str] = []
        self.fail_create = False
        self.delete_error = False
        self.list_error: Exception | None = None
        self.chat_mode = "complete"

    def list_knowledge_bases(self) -> list[KnowledgeBaseView]:
        if self.list_error is not None:
            raise self.list_error
        return list(self.kbs)

    def create_session(self, title: str) -> str:
        if self.fail_create:
            raise UpstreamError(
                500,
                "boom",
                "boom",
                {},
                {"success": False, "error": {"code": "boom", "message": "boom", "details": {}}},
            )
        session_id = f"sess-{len(self.sessions) + 1}"
        self.sessions[session_id] = title
        return session_id

    def delete_session(self, session_id: str) -> None:
        if not session_id:
            return
        self.delete_calls.append(session_id)
        if self.delete_error:
            raise UpstreamError(
                500,
                "nope",
                "nope",
                {},
                {"success": False, "error": {"code": "nope", "message": "nope", "details": {}}},
            )
        self.sessions.pop(session_id, None)

    def iter_knowledge_chat(self, session_id: str, query: str, knowledge_base_id: str):
        self.chat_calls.append(
            {
                "session_id": session_id,
                "query": query,
                "knowledge_base_ids": [knowledge_base_id],
            }
        )
        if session_id not in self.sessions:
            raise UpstreamError(
                404,
                "not_found",
                "missing",
                {},
                {"success": False, "error": {"code": "not_found", "message": "missing", "details": {}}},
            )
        if self.chat_mode == "interrupted":
            yield AnswerDelta("已收到")
            yield StreamFinished(status="interrupted", citations=[])
            return
        if self.chat_mode == "with_citations":
            yield AnswerDelta("你好")
            yield StreamFinished(
                status="complete",
                citations=[CitationDraft("k1", "手册", "摘录")],
            )
            return
        yield AnswerDelta("你好")
        yield StreamFinished(status="complete", citations=[])


def failure(status: int, code: str) -> UpstreamError:
    envelope = {"success": False, "error": {"code": code, "message": code, "details": {"secret": "hide"}}}
    return UpstreamError(status, code, code, {"secret": "hide"}, envelope)
