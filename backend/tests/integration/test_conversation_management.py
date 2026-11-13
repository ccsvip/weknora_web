import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import weknora_web.services.conversation_admin as conversation_admin
from weknora_web.db import get_session_factory, reset_engine
from weknora_web.models import Citation, Conversation, Message
from weknora_web.weknora.client import KnowledgeBaseView


def login(client) -> None:
    assert client.post("/api/v1/access-sessions", json={"password": "correct-password"}).status_code == 200


def create_conversation(client, knowledge_base_id: str = "kb-1") -> dict:
    response = client.post("/api/v1/conversations", json={"knowledge_base_id": knowledge_base_id})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_list_order_isolation_and_restart(world) -> None:
    client, fake = world
    login(client)
    first = create_conversation(client)
    second = create_conversation(client)
    assert client.post(
        f"/api/v1/conversations/{first['id']}/messages",
        json={"content": "甲的问题"},
    ).status_code == 200
    assert client.post(
        f"/api/v1/conversations/{second['id']}/messages",
        json={"content": "乙的问题"},
    ).status_code == 200
    listed = client.get("/api/v1/conversations").json()["data"]
    assert [item["id"] for item in listed[:2]] == [second["id"], first["id"]]
    first_body = client.get(f"/api/v1/conversations/{first['id']}").json()["data"]
    second_body = client.get(f"/api/v1/conversations/{second['id']}").json()["data"]
    assert all("乙的问题" not in message["body"] for message in first_body["messages"])
    assert all("甲的问题" not in message["body"] for message in second_body["messages"])

    reset_engine()
    reloaded = get_session_factory()()
    kept = reloaded.get(Conversation, uuid.UUID(first["id"]))
    assert kept is not None
    assert kept.title == "甲的问题"
    reloaded.close()
    assert client.get(f"/api/v1/conversations/{second['id']}").status_code == 200
    assert len(fake.sessions) == 2


def test_hundred_conversations_list_within_ten_seconds(world) -> None:
    client, _fake = world
    login(client)
    db = get_session_factory()()
    now = datetime.now(timezone.utc)
    for index in range(100):
        db.add(
            Conversation(
                id=uuid.uuid4(),
                weknora_session_id=f"seed-{index}",
                knowledge_base_id="kb-1",
                knowledge_base_name="手册",
                title=f"标题{index:03d}",
                continuable=True,
                created_at=now,
                updated_at=now + timedelta(seconds=index),
            )
        )
    db.commit()
    db.close()
    started = time.perf_counter()
    response = client.get("/api/v1/conversations")
    elapsed = time.perf_counter() - started
    assert response.status_code == 200
    assert len(response.json()["data"]) == 100
    assert elapsed < 10


def test_delete_success_and_upstream_failure(world) -> None:
    client, fake = world
    login(client)
    kept = create_conversation(client)
    doomed = create_conversation(client)
    fake.chat_mode = "with_citations"
    client.post(f"/api/v1/conversations/{doomed['id']}/messages", json={"content": "机密正文不应出现"})
    doomed_id = uuid.UUID(doomed["id"])
    assert client.delete(f"/api/v1/conversations/{doomed['id']}").status_code == 204
    assert client.get(f"/api/v1/conversations/{doomed['id']}").status_code == 404
    leftover = get_session_factory()()
    remaining_message_ids = {row.id for row in leftover.scalars(select(Message)).all()}
    assert leftover.scalars(select(Message).where(Message.conversation_id == doomed_id)).all() == []
    assert all(row.message_id in remaining_message_ids for row in leftover.scalars(select(Citation)).all())
    leftover.close()
    assert client.get(f"/api/v1/conversations/{kept['id']}").status_code == 200
    records = client.get("/api/v1/activity-records", params={"conversation_id": doomed["id"]})
    deleted = [row for row in records.json()["data"] if row["kind"] == "conversation_deleted"]
    assert len(deleted) == 1
    assert "机密正文不应出现" not in deleted[0]["summary"]
    assert len(fake.sessions) == 1
    assert fake.delete_calls

    blocked = create_conversation(client)
    client.post(f"/api/v1/conversations/{blocked['id']}/messages", json={"content": "仍要保留"})
    fake.delete_error = True
    failed = client.delete(f"/api/v1/conversations/{blocked['id']}")
    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "delete_failed"
    opened = client.get(f"/api/v1/conversations/{blocked['id']}")
    assert opened.status_code == 200
    assert opened.json()["data"]["messages"]
    kinds = [
        row["kind"]
        for row in client.get(
            "/api/v1/activity-records",
            params={"conversation_id": blocked["id"]},
        ).json()["data"]
    ]
    assert "conversation_deleted" not in kinds


def test_local_delete_failure_clears_session_and_blocks_continue(world, monkeypatch) -> None:
    client, fake = world
    login(client)
    created = create_conversation(client)
    session_id = next(iter(fake.sessions))

    def boom(_db, _conversation) -> None:
        raise RuntimeError("disk")

    monkeypatch.setattr(conversation_admin, "commit_local_delete", boom)
    failed = client.delete(f"/api/v1/conversations/{created['id']}")
    assert failed.status_code == 502
    opened = client.get(f"/api/v1/conversations/{created['id']}")
    assert opened.status_code == 200
    assert opened.json()["data"]["continuable"] is False
    kinds = [
        row["kind"]
        for row in client.get(
            "/api/v1/activity-records",
            params={"conversation_id": created["id"]},
        ).json()["data"]
    ]
    assert "conversation_deleted" not in kinds
    reloaded = get_session_factory()()
    row = reloaded.get(Conversation, uuid.UUID(created["id"]))
    assert row is not None
    assert row.weknora_session_id is None
    assert row.continuable is False
    reloaded.close()
    assert session_id not in fake.sessions


def test_missing_knowledge_base_or_session_rejects_new_questions(world) -> None:
    client, fake = world
    login(client)
    created = create_conversation(client)
    assert client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "原来的问题"},
    ).status_code == 200
    calls = len(fake.chat_calls)
    fake.kbs = []
    rejected = client.post(
        f"/api/v1/conversations/{created['id']}/messages",
        json={"content": "知识库没了"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "conversation_not_continuable"
    stored = client.get(f"/api/v1/conversations/{created['id']}").json()["data"]
    assert stored["continuable"] is False
    assert any(message["body"] == "原来的问题" for message in stored["messages"])
    assert all(message["body"] != "知识库没了" for message in stored["messages"])
    assert len(fake.chat_calls) == calls

    fake.kbs = [KnowledgeBaseView(id="kb-1", name="手册", description="说明")]
    other = create_conversation(client)
    assert (
        client.post(
            f"/api/v1/conversations/{other['id']}/messages",
            json={"content": "还能问"},
        ).status_code
        == 200
    )
    before = len(fake.chat_calls)
    fake.sessions.clear()
    lost = client.post(
        f"/api/v1/conversations/{other['id']}/messages",
        json={"content": "会话没了"},
    )
    assert lost.status_code == 409
    assert lost.json()["error"]["code"] == "conversation_not_continuable"
    kept = client.get(f"/api/v1/conversations/{other['id']}").json()["data"]
    assert kept["continuable"] is False
    assert any(message["body"] == "还能问" for message in kept["messages"])
    assert all(message["body"] != "会话没了" for message in kept["messages"])
    assert len(fake.chat_calls) == before + 1
    again = client.post(
        f"/api/v1/conversations/{other['id']}/messages",
        json={"content": "再试一次"},
    )
    assert again.status_code == 409
    assert len(fake.chat_calls) == before + 1
