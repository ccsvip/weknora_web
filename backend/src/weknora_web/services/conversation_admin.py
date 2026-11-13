"""对话的列表、读取和删除。

先删 WeKnora 会话，再删本地。上游失败时本地必须原样留下，
避免出现“本地没了、上游会话还在”。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from weknora_web.api.errors import AppError
from weknora_web.models import ActivityRecord, Citation, Conversation, Message
from weknora_web.services.chat import conversation_payload, message_payload
from weknora_web.weknora.client import UpstreamError, UpstreamUnavailable, WeKnoraClient


def list_conversations(db: Session, limit: int) -> list[dict]:
    rows = db.scalars(
        select(Conversation).order_by(Conversation.updated_at.desc()).limit(limit)
    ).all()
    return [conversation_payload(row) for row in rows]


def get_conversation(db: Session, conversation_id: uuid.UUID) -> dict:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise AppError("conversation_not_found", "找不到这段对话", 404)
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at)
    ).all()
    payload = conversation_payload(conversation)
    payload["messages"] = [message_payload(db, item) for item in messages]
    return payload


def delete_conversation(db: Session, client: WeKnoraClient, conversation_id: uuid.UUID) -> None:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise AppError("conversation_not_found", "找不到这段对话", 404)
    if conversation.weknora_session_id:
        try:
            client.delete_session(conversation.weknora_session_id)
        except (UpstreamError, UpstreamUnavailable) as exc:
            raise AppError("delete_failed", "删除没有完成，对话仍保留", 502) from exc
    try:
        commit_local_delete(db, conversation)
    except Exception:
        db.rollback()
        kept = db.get(Conversation, conversation_id)
        if kept is not None:
            kept.weknora_session_id = None
            kept.continuable = False
            kept.updated_at = datetime.now(timezone.utc)
            db.commit()
        raise AppError("delete_failed", "删除没有完成，对话仍保留", 502) from None


def commit_local_delete(db: Session, conversation: Conversation) -> None:
    messages = db.scalars(select(Message).where(Message.conversation_id == conversation.id)).all()
    for message in messages:
        citations = db.scalars(select(Citation).where(Citation.message_id == message.id)).all()
        for citation in citations:
            db.delete(citation)
        db.delete(message)
    title = conversation.title
    conversation_id = conversation.id
    db.delete(conversation)
    db.add(
        ActivityRecord(
            id=uuid.uuid4(),
            conversation_id=conversation_id,
            conversation_title=title,
            kind="conversation_deleted",
            summary="已删除对话",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
