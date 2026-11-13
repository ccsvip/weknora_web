import json
import uuid
from datetime import datetime, timezone

from weknora_web.db import get_session_factory
from weknora_web.models import Message
from tests.fake_upstream import failure


def login(client) -> None:
    assert client.post("/api/v1/access-sessions", json={"password": "correct-password"}).status_code == 200


def create_conversation(client) -> dict:
    response = client.post("/api/v1/conversations", json={"knowledge_base_id": "kb-1"})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def parse_sse(raw: str) -> list[tuple[str, dict]]:
    events = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        name = "message"
        data = ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
        events.append((name, json.loads(data)))
    return events


def test_blank_and_too_long_questions_are_rejected(world) -> None:
    client, fake = world
    login(client)
    created = create_conversation(client)
    blank = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "   "},
    )
    assert blank.status_code == 422
    assert blank.json()["error"]["code"] == "validation_error"
    long = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "问" * 8001},
    )
    assert long.status_code == 422
    stored = client.get(f"/api/v1/conversations/{created['id']}")
    assert stored.json()["data"]["messages"] == []
    assert fake.chat_calls == []


def test_stream_order_citations_and_interrupted_without_invented_text(world) -> None:
    client, fake = world
    login(client)
    created = create_conversation(client)
    fake.chat_mode = "with_citations"
    response = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "  第一问  "},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert response.headers["x-accel-buffering"] == "no"
    events = parse_sse(response.text)
    names = [name for name, _payload in events]
    assert names[0] == "message"
    assert "references" in names
    assert names[-1] == "done"
    assert events[-1][1]["status"] == "complete"
    assert fake.chat_calls[0]["query"] == "第一问"
    assert fake.chat_calls[0]["knowledge_base_ids"] == ["kb-1"]
    stored = client.get(f"/api/v1/conversations/{created['id']}").json()["data"]
    assert stored["title"] == "第一问"
    assert stored["messages"][1]["body"] == "你好"
    assert stored["messages"][1]["citations"][0]["title"] == "手册"

    fake.chat_mode = "interrupted"
    failed = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "第二问"},
    )
    failed_events = parse_sse(failed.text)
    assert failed_events[-1][1]["status"] == "interrupted"
    again = client.get(f"/api/v1/conversations/{created['id']}").json()["data"]
    interrupted = again["messages"][-1]
    assert interrupted["status"] == "interrupted"
    assert interrupted["body"] == "已收到"
    assert "第二问" not in interrupted["body"]
    assert fake.chat_calls[-1]["query"] == "第二问"
    assert "第一问" not in fake.chat_calls[-1]["query"]


def test_second_submit_while_streaming_is_busy(world) -> None:
    client, fake = world
    login(client)
    created = create_conversation(client)
    db = get_session_factory()()
    db.add(
        Message(
            id=uuid.uuid4(),
            conversation_id=uuid.UUID(created["id"]),
            role="assistant",
            body="",
            status="streaming",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()
    response = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "还在回答"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conversation_busy"
    assert fake.chat_calls == []


def test_session_create_failure_leaves_no_conversation(world) -> None:
    client, fake = world
    login(client)
    fake.fail_create = True
    response = client.post("/api/v1/conversations", json={"knowledge_base_id": "kb-1"})
    assert response.status_code == 502
    assert client.get("/api/v1/conversations").json()["data"] == []


def test_knowledge_base_reasons_are_distinct(world) -> None:
    client, fake = world
    login(client)
    fake.kbs = []
    empty = client.get("/api/v1/knowledge-bases")
    assert empty.json() == {"data": [], "reason": "no_knowledge_bases"}
    fake.list_error = failure(403, "missing_capability")
    missing = client.get("/api/v1/knowledge-bases")
    assert missing.json()["reason"] == "missing_capability"
    assert missing.json()["data"] == []
    assert "hide" not in missing.text
    fake.list_error = failure(403, "tenant_forbidden")
    forbidden = client.get("/api/v1/knowledge-bases")
    assert forbidden.json()["reason"] == "upstream_forbidden"
