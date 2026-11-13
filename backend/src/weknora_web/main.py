"""应用入口。配置缺失时在绑定端口之前退出。"""

from __future__ import annotations

import sys

import uvicorn
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from weknora_web.api.access import router as access_router
from weknora_web.api.activity import router as activity_router
from weknora_web.api.conversations import router as conversations_router
from weknora_web.api.errors import AppError, app_error_handler, validation_error_handler
from weknora_web.api.knowledge_bases import router as knowledge_bases_router
from weknora_web.api.messages import router as messages_router
from weknora_web.settings import get_settings, missing_setting_names


def create_app() -> FastAPI:
    app = FastAPI(title="WeKnora Web API", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(access_router)
    app.include_router(knowledge_bases_router)
    app.include_router(conversations_router)
    app.include_router(messages_router)
    app.include_router(activity_router)
    return app


app = create_app()


def serve() -> None:
    missing = missing_setting_names()
    if missing:
        for name in missing:
            print(f"missing configuration: {name}", file=sys.stderr)
        sys.exit(1)
    settings = get_settings()
    if not settings.api_port.isdigit():
        print("missing configuration: API_PORT", file=sys.stderr)
        sys.exit(1)
    uvicorn.run(app, host="0.0.0.0", port=int(settings.api_port))
