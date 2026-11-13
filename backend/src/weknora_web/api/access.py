from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from weknora_web.api.errors import AppError
from weknora_web.auth.deps import require_access
from weknora_web.auth.session import (
    attach_access_cookie,
    clear_access_cookie,
    issue_token,
    passwords_match,
)
from weknora_web.settings import get_settings

router = APIRouter(prefix="/api/v1")


class PasswordBody(BaseModel):
    password: str


@router.post("/access-sessions")
def create_access_session(body: PasswordBody) -> JSONResponse:
    settings = get_settings()
    if not passwords_match(body.password, settings.access_password):
        raise AppError("access_denied", "访问口令不正确", 401)
    response = JSONResponse({"data": {}})
    attach_access_cookie(response, settings, issue_token(settings.access_session_secret))
    return response


@router.delete(
    "/access-sessions/current",
    status_code=204,
    dependencies=[Depends(require_access)],
)
def delete_current_access_session() -> Response:
    response = Response(status_code=204)
    clear_access_cookie(response)
    return response
