from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from weknora_web.api.errors import AppError
from weknora_web.auth.deps import require_access
from weknora_web.db import get_db
from weknora_web.services.chat import open_message_stream
from weknora_web.weknora.client import WeKnoraClient, get_client

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_access)])


class CreateMessageBody(BaseModel):
    content: str


def _conversation_id(value: str):
    from weknora_web.api.conversations import _conversation_id as parse

    return parse(value)


@router.post("/conversations/{conversation_id}/messages")
def create_message(
    conversation_id: str,
    body: CreateMessageBody,
    db: Session = Depends(get_db),
    client: WeKnoraClient = Depends(get_client),
) -> StreamingResponse:
    # 不缓冲这段响应。页面要在回答进行时按到达追加正文，至少每秒能看到新文字。
    stream = open_message_stream(db, client, _conversation_id(conversation_id), body.content)
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
