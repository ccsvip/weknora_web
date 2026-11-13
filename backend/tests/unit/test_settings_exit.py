import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SENTINEL = "should-not-leak-9f3a"


def _env(missing: str, blank: bool) -> dict[str, str]:
    values = {
        "ACCESS_PASSWORD": "correct-password",
        "WEKNORA_API_KEY": SENTINEL,
        "ACCESS_SESSION_SECRET": "test-session-secret",
        "DATABASE_URL": "sqlite://",
        "API_PORT": "9",
        "WEKNORA_BASE_URL": "http://weknora.test",
    }
    if blank:
        values[missing] = "   "
    else:
        del values[missing]
    env = {
        "PATH": os.environ["PATH"],
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
        "PATHEXT": os.environ.get("PATHEXT", ""),
        "PYTHONPATH": str(BACKEND / "src"),
        "PYTHONIOENCODING": "utf-8",
    }
    env.update(values)
    return env


@pytest.mark.parametrize("name", ["ACCESS_PASSWORD", "WEKNORA_API_KEY", "ACCESS_SESSION_SECRET"])
@pytest.mark.parametrize("blank", [True, False])
def test_process_exits_before_listen_when_secret_missing(name: str, blank: bool) -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "weknora_web"],
        cwd=BACKEND,
        env=_env(name, blank),
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    output = completed.stdout + completed.stderr
    assert completed.returncode != 0
    assert f"missing configuration: {name}" in output
    assert SENTINEL not in output
    assert "Uvicorn running" not in output
