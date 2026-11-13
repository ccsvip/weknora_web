"""部署配置。端口和密钥只从环境变量读取，不提供默认值。"""

from __future__ import annotations

import os
from dataclasses import dataclass

# 缺失任意一项时，进程必须在监听之前退出。
REQUIRED_SETTINGS = (
    "ACCESS_PASSWORD",
    "WEKNORA_API_KEY",
    "ACCESS_SESSION_SECRET",
    "DATABASE_URL",
    "API_PORT",
    "WEKNORA_BASE_URL",
)


def missing_setting_names() -> list[str]:
    missing: list[str] = []
    for name in REQUIRED_SETTINGS:
        raw = os.environ.get(name)
        if raw is None or raw.strip() == "":
            missing.append(name)
    return missing


@dataclass(frozen=True)
class Settings:
    access_password: str
    weknora_api_key: str
    access_session_secret: str
    database_url: str
    api_port: str
    weknora_base_url: str
    cookie_secure: bool


def get_settings() -> Settings:
    missing = missing_setting_names()
    if missing:
        raise RuntimeError("missing configuration: " + ", ".join(missing))
    secure = os.environ.get("ACCESS_COOKIE_SECURE", "").strip().lower() == "true"
    return Settings(
        access_password=os.environ["ACCESS_PASSWORD"].strip(),
        weknora_api_key=os.environ["WEKNORA_API_KEY"].strip(),
        access_session_secret=os.environ["ACCESS_SESSION_SECRET"].strip(),
        database_url=os.environ["DATABASE_URL"].strip(),
        api_port=os.environ["API_PORT"].strip(),
        weknora_base_url=os.environ["WEKNORA_BASE_URL"].strip(),
        cookie_secure=secure,
    )
