"""访问会话 cookie。值是签名时间戳，不是访问口令，也不是上游凭证。"""

from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Response

from weknora_web.settings import Settings

COOKIE_NAME = "weknora_web_access"


def issue_token(secret: str) -> str:
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), timestamp.encode(), hashlib.sha256).hexdigest()
    return f"{timestamp}.{signature}"


def token_is_valid(secret: str, token: str | None) -> bool:
    if not token or "." not in token:
        return False
    timestamp, signature = token.split(".", 1)
    if not timestamp.isdigit():
        return False
    expected = hmac.new(secret.encode(), timestamp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def passwords_match(given: str, expected: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(given.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )


def attach_access_cookie(response: Response, settings: Settings, token: str) -> None:
    # 不设置 Max-Age 或 Expires：这是浏览器会话 cookie，关闭浏览器即消失。
    # 签名放在 cookie 里，不依赖进程内存，所以服务端重启后同一浏览器仍可通过。
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        secure=settings.cookie_secure,
    )


def clear_access_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
