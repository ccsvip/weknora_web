FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
RUN pip install --no-cache-dir .

# 先升级表结构，再由模块按 API_PORT 启动 Uvicorn。这里不写默认端口。
CMD ["sh", "-c", "alembic upgrade head && python -m weknora_web"]
