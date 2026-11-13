"""创建对话和提交问题。回答正文只累加上游 answer，不在本地编造。"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from weknora_web.api.errors import AppError
from weknora_web.models import ActivityRecord, Citation, Conversation, Message
from weknora_web.weknora.client import (
    AnswerDelta,
    CitationDraft,
    KnowledgeBaseView,
    StreamFinished,
    UpstreamError,
    UpstreamUnavailable,
    WeKnoraClient,
)

QUESTION_LIMIT = 8000
TITLE_LIMIT = 40
EXCERPT_LIMIT = 500


def create_conversation(db: Session, client: WeKnoraClient, knowledge_base_id: str) -> Conversation:
    match = _find_knowledge_base(client, knowledge_base_id)
    try:
        session_id = client.create_session(match.name)
    except UpstreamError as exc:
        raise _map_upstream(exc) from exc
    except UpstreamUnavailable as exc:
        raise _unavailable() from exc
    now = _now()
    conversation = Conversation(
        id=uuid.uuid4(),
        weknora_session_id=session_id,
        knowledge_base_id=match.id,
        knowledge_base_name=match.name,
        title=match.name,
        continuable=True,
        created_at=now,
        updated_at=now,
    )
    db.add(conversation)
    db.add(_activity(conversation, "conversation_created", "已创建对话", now))
    db.commit()
    return conversation


def open_message_stream(
    db: Session,
    client: WeKnoraClient,
    conversation_id: uuid.UUID,
    content: str,
) -> Iterator[str]:
    conversation = _require_conversation(db, conversation_id)
    stripped = _validate_question(content)
    if not conversation.continuable:
        raise AppError("conversation_not_continuable", "这段对话不能继续提问", 409)
    if _has_streaming(db, conversation.id):
        raise AppError("conversation_busy", "这段对话正在回答", 409)
    _ensure_knowledge_base_still_available(db, client, conversation)

    now = _now()
    prior_users = db.scalar(
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id == conversation.id, Message.role == "user")
    )
    if not prior_users:
        conversation.title = stripped[:TITLE_LIMIT]
    user = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="user",
        body=content,
        status="complete",
        created_at=now,
    )
    assistant = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="assistant",
        body="",
        status="streaming",
        created_at=now + timedelta(microseconds=1),
    )
    conversation.updated_at = now
    db.add(user)
    db.add(assistant)
    db.commit()

    if not conversation.weknora_session_id:
        _reject_new_turn(db, conversation, user, assistant, clear_session=False)
        raise AppError("conversation_not_continuable", "这段对话不能继续提问", 409)

    try:
        upstream = iter(
            client.iter_knowledge_chat(
                conversation.weknora_session_id,
                stripped,
                conversation.knowledge_base_id,
            )
        )
        first = next(upstream)
    except StopIteration:
        first = StreamFinished(status="interrupted", citations=[])
        upstream = iter(())
    except UpstreamUnavailable as exc:
        _finish_interrupted(db, conversation, assistant, "upstream_unavailable")
        raise _unavailable() from exc
    except UpstreamError as exc:
        if exc.status_code == 404:
            # 上游会话已经不在。撤掉这次尚未完成的提问，避免在原对话下另开一段会话。
            _reject_new_turn(db, conversation, user, assistant, clear_session=True)
            raise AppError("conversation_not_continuable", "这段对话不能继续提问", 409) from exc
        if exc.status_code == 403:
            conversation.continuable = False
        _finish_interrupted(db, conversation, assistant, _map_upstream(exc).code)
        raise _map_upstream(exc) from exc

    return _forward(db, conversation, assistant, first, upstream)


def conversation_payload(conversation: Conversation) -> dict:
    return {
        "id": str(conversation.id),
        "knowledge_base_id": conversation.knowledge_base_id,
        "knowledge_base_name": conversation.knowledge_base_name,
        "title": conversation.title,
        "continuable": conversation.continuable,
        "created_at": _iso(conversation.created_at),
        "updated_at": _iso(conversation.updated_at),
    }


def message_payload(db: Session, message: Message) -> dict:
    citations = db.scalars(
        select(Citation).where(Citation.message_id == message.id).order_by(Citation.position)
    ).all()
    return {
        "id": str(message.id),
        "role": message.role,
        "body": message.body,
        "status": message.status,
        "created_at": _iso(message.created_at),
        "citations": [
            {"title": item.title, "excerpt": item.excerpt, "position": item.position}
            for item in citations
        ],
    }


def _forward(
    db: Session,
    conversation: Conversation,
    assistant: Message,
    first: AnswerDelta | StreamFinished,
    upstream: Iterator[AnswerDelta | StreamFinished],
) -> Iterator[str]:
    def generate() -> Iterator[str]:
        status = "interrupted"
        drafts: list[CitationDraft] = []
        stream_error: AppError | None = None
        try:
            for item in _chain(first, upstream):
                if isinstance(item, AnswerDelta):
                    assistant.body += item.text
                    db.commit()
                    yield _sse(
                        "message",
                        {
                            "message_id": str(assistant.id),
                            "status": "streaming",
                            "delta": item.text,
                        },
                    )
                else:
                    status = item.status if item.status in {"complete", "interrupted"} else "interrupted"
                    drafts = item.citations
                    break
        except UpstreamUnavailable:
            status = "interrupted"
            stream_error = _unavailable()
        except UpstreamError as exc:
            status = "interrupted"
            if exc.status_code in {403, 404}:
                conversation.continuable = False
            if exc.status_code == 404:
                conversation.weknora_session_id = None
            stream_error = _map_upstream(exc)
        if status == "complete" and stream_error is not None:
            status = "interrupted"
        assistant.status = status
        stored = _store_citations(db, assistant, drafts)
        conversation.updated_at = _now()
        summary = "回答已完成" if status == "complete" else "回答已中断"
        kind = "message_completed" if status == "complete" else "message_failed"
        db.add(_activity(conversation, kind, summary, conversation.updated_at))
        db.commit()
        if stream_error is not None:
            yield _sse("error", {"code": stream_error.code, "message": stream_error.message})
        if stored:
            yield _sse(
                "references",
                {
                    "message_id": str(assistant.id),
                    "citations": [
                        {"title": item.title, "excerpt": item.excerpt} for item in stored
                    ],
                },
            )
        yield _sse("done", {"message_id": str(assistant.id), "status": status})

    return generate()


def _chain(
    first: AnswerDelta | StreamFinished,
    upstream: Iterator[AnswerDelta | StreamFinished],
) -> Iterator[AnswerDelta | StreamFinished]:
    yield first
    yield from upstream


def _validate_question(content: str) -> str:
    stripped = content.strip()
    if stripped == "":
        raise AppError("validation_error", "问题不能为空", 422)
    if len(content) > QUESTION_LIMIT:
        raise AppError("validation_error", "问题不能超过 8000 个字符", 422)
    return stripped


def _find_knowledge_base(client: WeKnoraClient, knowledge_base_id: str) -> KnowledgeBaseView:
    try:
        views = client.list_knowledge_bases()
    except UpstreamError as exc:
        raise _map_upstream(exc) from exc
    except UpstreamUnavailable as exc:
        raise _unavailable() from exc
    for item in views:
        if item.id == knowledge_base_id:
            return item
    raise AppError("upstream_forbidden", "知识库不在允许范围内", 403)


def _ensure_knowledge_base_still_available(
    db: Session,
    client: WeKnoraClient,
    conversation: Conversation,
) -> None:
    try:
        views = client.list_knowledge_bases()
    except UpstreamUnavailable as exc:
        raise _unavailable() from exc
    except UpstreamError as exc:
        if exc.status_code == 403:
            conversation.continuable = False
            conversation.updated_at = _now()
            db.commit()
        raise _map_upstream(exc) from exc
    if any(item.id == conversation.knowledge_base_id for item in views):
        return
    conversation.continuable = False
    conversation.updated_at = _now()
    db.commit()
    raise AppError("conversation_not_continuable", "这段对话不能继续提问", 409)


def _reject_new_turn(
    db: Session,
    conversation: Conversation,
    user: Message,
    assistant: Message,
    *,
    clear_session: bool,
) -> None:
    db.delete(assistant)
    db.delete(user)
    if clear_session:
        conversation.weknora_session_id = None
    conversation.continuable = False
    conversation.updated_at = _now()
    db.commit()


def _finish_interrupted(
    db: Session,
    conversation: Conversation,
    assistant: Message,
    _code: str,
) -> None:
    assistant.status = "interrupted"
    conversation.updated_at = _now()
    db.add(_activity(conversation, "message_failed", "回答已中断", conversation.updated_at))
    db.commit()


def _store_citations(
    db: Session,
    assistant: Message,
    drafts: list[CitationDraft],
) -> list[Citation]:
    stored: list[Citation] = []
    seen: set[tuple[str | None, str]] = set()
    for draft in drafts:
        excerpt = draft.excerpt[:EXCERPT_LIMIT]
        key = (draft.knowledge_id, excerpt)
        if key in seen:
            continue
        seen.add(key)
        title = draft.title.strip() or "未命名引用"
        row = Citation(
            id=uuid.uuid4(),
            message_id=assistant.id,
            knowledge_id=draft.knowledge_id,
            title=title,
            excerpt=excerpt,
            position=len(stored),
        )
        db.add(row)
        stored.append(row)
    return stored


def _has_streaming(db: Session, conversation_id: uuid.UUID) -> bool:
    found = db.scalar(
        select(Message.id).where(
            Message.conversation_id == conversation_id,
            Message.status == "streaming",
        )
    )
    return found is not None


def _require_conversation(db: Session, conversation_id: uuid.UUID) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise AppError("conversation_not_found", "找不到这段对话", 404)
    return conversation


def _activity(
    conversation: Conversation,
    kind: str,
    summary: str,
    created_at: datetime,
) -> ActivityRecord:
    return ActivityRecord(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        conversation_title=conversation.title,
        kind=kind,
        summary=summary,
        created_at=created_at,
    )


def _map_upstream(exc: UpstreamError) -> AppError:
    if exc.status_code == 403:
        return AppError("upstream_forbidden", "上游拒绝了这次请求", 403)
    if exc.status_code == 409:
        return AppError("upstream_conflict", "上游报告了租户冲突", 409)
    return AppError("upstream_failed", "上游没有完成这次请求", 502)


def _unavailable() -> AppError:
    return AppError("upstream_unavailable", "暂时连不上上游", 502)


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()
