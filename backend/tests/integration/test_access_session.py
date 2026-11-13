from fastapi.testclient import TestClient

from weknora_web.main import create_app


def test_health_does_not_require_access(world) -> None:
    client, _fake = world
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_wrong_password_sets_no_cookie(world) -> None:
    client, _fake = world
    response = client.post("/api/v1/access-sessions", json={"password": "nope"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "access_denied"
    assert "set-cookie" not in response.headers
    assert client.get("/api/v1/conversations").status_code == 401


def test_cookie_has_no_expiry_and_survives_new_app(world) -> None:
    client, _fake = world
    response = client.post("/api/v1/access-sessions", json={"password": "correct-password"})
    assert response.status_code == 200
    assert response.json() == {"data": {}}
    header = response.headers["set-cookie"].lower()
    assert "weknora_web_access=" in header
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "path=/" in header
    assert "max-age" not in header
    assert "expires" not in header
    assert "correct-password" not in header
    assert client.get("/api/v1/conversations").status_code == 200

    cookie = response.cookies["weknora_web_access"]
    with TestClient(create_app()) as restarted:
        restarted.cookies.set("weknora_web_access", cookie)
        assert restarted.get("/api/v1/conversations").status_code == 200


def test_logout_requires_password_again(world) -> None:
    client, _fake = world
    assert client.post("/api/v1/access-sessions", json={"password": "correct-password"}).status_code == 200
    assert client.delete("/api/v1/access-sessions/current").status_code == 204
    again = client.get("/api/v1/knowledge-bases")
    assert again.status_code == 401
    assert again.json()["error"]["code"] == "access_required"
