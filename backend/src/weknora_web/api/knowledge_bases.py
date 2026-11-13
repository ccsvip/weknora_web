from fastapi import APIRouter, Depends

from weknora_web.auth.deps import require_access
from weknora_web.weknora.client import UpstreamError, UpstreamUnavailable, WeKnoraClient, get_client

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_access)])


@router.get("/knowledge-bases")
def list_knowledge_bases(client: WeKnoraClient = Depends(get_client)) -> dict:
    try:
        views = client.list_knowledge_bases()
    except UpstreamUnavailable:
        return {"data": [], "reason": "upstream_unreachable"}
    except UpstreamError as exc:
        # 403 不是空知识库。缺少 retrieve 与其他拒绝分开说明，页面才能禁用提问并说出原因。
        if exc.status_code == 403 and (
            exc.code == "missing_capability" or "capability" in exc.code.lower()
        ):
            return {"data": [], "reason": "missing_capability"}
        if exc.status_code == 403:
            return {"data": [], "reason": "upstream_forbidden"}
        return {"data": [], "reason": "upstream_unreachable"}
    if not views:
        return {"data": [], "reason": "no_knowledge_bases"}
    return {
        "data": [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "accessible": True,
            }
            for item in views
        ],
        "reason": "none",
    }
