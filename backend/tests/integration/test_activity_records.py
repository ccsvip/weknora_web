import time


def login(client) -> None:
    assert client.post("/api/v1/access-sessions", json={"password": "correct-password"}).status_code == 200


def test_activity_order_filter_and_delete_summary(world) -> None:
    client, fake = world
    login(client)
    first = client.post("/api/v1/conversations", json={"knowledge_base_id": "kb-1"})
    assert first.status_code == 201
    first_id = first.json()["data"]["id"]
    assert (
        client.post(
            f"/api/v1/conversations/{first_id}/messages",
            json={"content": "机密正文不应出现"},
        ).status_code
        == 200
    )
    fake.chat_mode = "interrupted"
    assert (
        client.post(
            f"/api/v1/conversations/{first_id}/messages",
            json={"content": "这次会中断"},
        ).status_code
        == 200
    )
    second = client.post("/api/v1/conversations", json={"knowledge_base_id": "kb-1"})
    second_id = second.json()["data"]["id"]
    assert client.delete(f"/api/v1/conversations/{first_id}").status_code == 204

    started = time.perf_counter()
    filtered = client.get("/api/v1/activity-records", params={"conversation_id": first_id})
    assert time.perf_counter() - started < 5
    assert filtered.status_code == 200
    rows = filtered.json()["data"]
    assert [row["conversation_id"] for row in rows] == [first_id] * len(rows)
    kinds = {row["kind"] for row in rows}
    assert kinds == {
        "conversation_created",
        "message_completed",
        "message_failed",
        "conversation_deleted",
    }
    created_at = [row["created_at"] for row in rows]
    assert created_at == sorted(created_at, reverse=True)
    deleted = next(row for row in rows if row["kind"] == "conversation_deleted")
    assert "机密正文不应出现" not in deleted["summary"]
    assert "test-api-key" not in filtered.text
    assert "correct-password" not in filtered.text
    others = client.get("/api/v1/activity-records", params={"conversation_id": second_id})
    assert all(row["kind"] != "conversation_deleted" for row in others.json()["data"])
