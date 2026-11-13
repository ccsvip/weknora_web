import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from weknora_web.auth.deps import require_access
from weknora_web.db import get_db
from weknora_web.models import ActivityRecord

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_access)])


@router.get("/activity-records")
def list_activity_records(
    db: Session = Depends(get_db),
    conversation_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=200),
) -> dict:
    stmt = select(ActivityRecord).order_by(ActivityRecord.created_at.desc()).limit(limit)
    if conversation_id is not None:
        stmt = (
            select(ActivityRecord)
            .where(ActivityRecord.conversation_id == conversation_id)
            .order_by(ActivityRecord.created_at.desc())
            .limit(limit)
        )
    rows = db.scalars(stmt).all()
    return {
        "data": [
            {
                "id": str(row.id),
                "conversation_id": str(row.conversation_id),
                "conversation_title": row.conversation_title,
                "kind": row.kind,
                "summary": row.summary,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }
