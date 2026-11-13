import uuid

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from weknora_web.api.errors import AppError
from weknora_web.auth.deps import require_access
from weknora_web.db import get_db
from weknora_web.services.chat import conversation_payload, create_conversation
from weknora_web.services.conversation_admin import (
    delete_conversation,
    get_conversation,
    list_conversations,
)
from weknora_web.weknora.client import WeKnoraClient, get_client

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_access)])


class CreateConversationBody(BaseModel):
    knowledge_base_id: str = Field(min_length=1)


def _conversation_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise AppError("conversation_not_found", "找不到这段对话", 404) from exc


@router.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=200),
) -> dict:
    return {"data": list_conversations(db, limit)}


@router.post("/conversations", status_code=201)
def post_conversation(
    body: CreateConversationBody,
    db: Session = Depends(get_db),
    client: WeKnoraClient = Depends(get_client),
) -> dict:
    conversation = create_conversation(db, client, body.knowledge_base_id)
    return {"data": conversation_payload(conversation)}


@router.get("/conversations/{conversation_id}")
def get_one_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
) -> dict:
    return {"data": get_conversation(db, _conversation_id(conversation_id))}


@router.delete("/conversations/{conversation_id}", status_code=204)
def remove_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    client: WeKnoraClient = Depends(get_client),
) -> Response:
    delete_conversation(db, client, _conversation_id(conversation_id))
    return Response(status_code=204)
