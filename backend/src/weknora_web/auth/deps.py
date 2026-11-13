from fastapi import Request

from weknora_web.api.errors import AppError
from weknora_web.auth.session import COOKIE_NAME, token_is_valid
from weknora_web.settings import get_settings


def require_access(request: Request) -> None:
    settings = get_settings()
    token = request.cookies.get(COOKIE_NAME)
    if not token_is_valid(settings.access_session_secret, token):
        raise AppError("access_required", "需要先验证访问口令", 401)
