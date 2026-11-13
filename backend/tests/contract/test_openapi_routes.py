from pathlib import Path

import yaml
from fastapi.routing import APIRoute

from weknora_web.main import create_app

SPEC = Path(__file__).resolve().parents[3] / "specs" / "001-weknora-web-app" / "contracts" / "openapi.yaml"
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
FORBIDDEN = ("upload", "agent", "embedding", "completions", "/models")


def test_routes_match_openapi_and_exclude_out_of_scope_paths() -> None:
    document = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    base = document["servers"][0]["url"].rstrip("/")
    expected: set[tuple[str, str]] = set()
    for path, item in document["paths"].items():
        for method, _operation in item.items():
            if method not in HTTP_METHODS:
                continue
            expected.add((method.upper(), base + path))

    found: set[tuple[str, str]] = set()
    for route in _walk(create_app().routes):
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            found.add((method, route.path))
            lowered = route.path.lower()
            assert not any(piece in lowered for piece in FORBIDDEN)
            assert method not in {"PUT", "PATCH"}

    assert found == expected


def _walk(routes: list) -> list:
    found = []
    for route in routes:
        original = getattr(route, "original_router", None)
        if original is not None:
            found.extend(_walk(original.routes))
            continue
        found.append(route)
    return found
