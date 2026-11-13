import json

import httpx

from weknora_web.weknora.client import AnswerDelta, StreamFinished, UpstreamError, WeKnoraClient


def client_for(handler) -> WeKnoraClient:
    return WeKnoraClient("http://weknora.test", "secret-key", transport=httpx.MockTransport(handler))


def envelope(code: str = "forbidden") -> dict:
    return {
        "success": False,
        "error": {"code": code, "message": "no", "details": {"secret": "hide-me"}},
    }


def assert_key_only(request: httpx.Request) -> None:
    assert request.headers["x-api-key"] == "secret-key"
    assert "x-tenant-id" not in request.headers
    assert "authorization" not in request.headers


def test_list_success_and_empty() -> None:
    payloads = [
        {"success": True, "data": [{"id": "kb-1", "name": "手册", "description": "说明", "extra": "忽略"}]},
        {"success": True, "data": []},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert_key_only(request)
        assert request.url.path == "/api/v1/knowledge-bases"
        return httpx.Response(200, json=payloads.pop(0))

    client = client_for(handler)
    listed = client.list_knowledge_bases()
    assert [(item.id, item.name, item.description) for item in listed] == [("kb-1", "手册", "说明")]
    assert client.list_knowledge_bases() == []


def test_create_session_success_and_failure() -> None:
    def ok(request: httpx.Request) -> httpx.Response:
        assert_key_only(request)
        body = json.loads(request.content)
        assert body == {"title": "手册"}
        return httpx.Response(201, json={"success": True, "data": {"id": "sess-1"}})

    assert client_for(ok).create_session("手册") == "sess-1"

    def also_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True, "data": {"id": "sess-2"}})

    assert client_for(also_ok).create_session("手册") == "sess-2"

    def failed(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json=envelope("boom"))

    pytest_raises_envelope(client_for(failed).create_session, "手册")


def test_failure_envelope_fields_and_single_403_409() -> None:
    for status, code in ((403, "forbidden"), (409, "conflict")):
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request, status=status, code=code) -> httpx.Response:
            seen.append(request)
            assert_key_only(request)
            return httpx.Response(status, json=envelope(code))

        client = client_for(handler)
        try:
            client.list_knowledge_bases()
            raise AssertionError("expected upstream error")
        except UpstreamError as exc:
            assert exc.envelope["success"] is False
            assert set(exc.envelope["error"]) == {"code", "message", "details"}
            assert exc.envelope["error"]["code"] == code
            assert "hide-me" not in str(exc)
        assert len(seen) == 1


def test_sse_answer_citations_and_complete() -> None:
    sse = "\n".join(
        [
            'data: {"response_type":"thinking","content":"内部思考"}',
            "",
            'data: {"response_type":"answer","content":"你"}',
            "",
            'data: {"response_type":"answer","content":"好","knowledge_references":[{"knowledge_id":"k1","knowledge_title":"手册","content":"摘录"}]}',
            "",
            "event: complete",
            'data: {"done": true}',
            "",
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert_key_only(request)
        body = json.loads(request.content)
        assert body == {"query": "新问题", "knowledge_base_ids": ["kb-9"]}
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse)

    items = list(client_for(handler).iter_knowledge_chat("sess-1", "新问题", "kb-9"))
    text = "".join(item.text for item in items if isinstance(item, AnswerDelta))
    assert text == "你好"
    assert "内部思考" not in text
    finished = items[-1]
    assert isinstance(finished, StreamFinished)
    assert finished.status == "complete"
    assert [(item.knowledge_id, item.title, item.excerpt) for item in finished.citations] == [
        ("k1", "手册", "摘录")
    ]


def test_sse_drop_before_complete_is_interrupted() -> None:
    sse = 'data: {"response_type":"answer","content":"已收到"}\n\n'

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=sse)

    items = list(client_for(handler).iter_knowledge_chat("sess-1", "问", "kb-1"))
    text = "".join(item.text for item in items if isinstance(item, AnswerDelta))
    assert text == "已收到"
    assert isinstance(items[-1], StreamFinished)
    assert items[-1].status == "interrupted"


def test_empty_references_produce_no_citations() -> None:
    sse = "\n".join(
        [
            'data: {"response_type":"answer","content":"正文","knowledge_references":[]}',
            "",
            "event: complete",
            'data: {"done": true}',
            "",
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=sse)

    items = list(client_for(handler).iter_knowledge_chat("sess-1", "问", "kb-1"))
    finished = items[-1]
    assert isinstance(finished, StreamFinished)
    assert finished.status == "complete"
    assert finished.citations == []


def pytest_raises_envelope(func, *args) -> None:
    try:
        func(*args)
    except UpstreamError as exc:
        assert exc.envelope["success"] is False
        assert "code" in exc.envelope["error"]
        assert "message" in exc.envelope["error"]
        assert "details" in exc.envelope["error"]
        return
    raise AssertionError("expected upstream error")
