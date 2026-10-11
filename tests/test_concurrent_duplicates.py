from __future__ import annotations

import os
import threading
import time

import pytest

from tests.conftest import AUTH

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="needs real PostgreSQL (advisory locks); set TEST_DATABASE_URL",
)


class SlowExtractor:
    """Makes the LLM step slow enough that concurrent requests genuinely overlap."""

    def __init__(self, inner, delay=1.0):
        self._inner, self._delay = inner, delay
        self.calls = 0
        self._lock = threading.Lock()

    def extract(self, text):
        with self._lock:
            self.calls += 1
        time.sleep(self._delay)
        return self._inner.extract(text)


def test_simultaneous_identical_uploads_pay_for_one_llm_call(client, db_engine, fake_extractor, sample_bytes):
    from fastapi.testclient import TestClient

    from app.api.invoices import get_invoice_extractor
    from app.main import app

    slow = SlowExtractor(fake_extractor)
    app.dependency_overrides[get_invoice_extractor] = lambda: slow
    data = sample_bytes("invoice_text.pdf")
    responses = []

    def worker():
        with TestClient(app) as c:
            responses.append(c.post("/invoices", files={"file": ("a.pdf", data, "application/pdf")}, headers=AUTH))

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    assert sorted(r.status_code for r in responses) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in responses}) == 1
    assert slow.calls == 1  # advisory lock: the other three waited, then got the stored record


def test_different_files_do_not_block_each_other(client, db_engine, fake_extractor, sample_bytes):
    from fastapi.testclient import TestClient

    from app.api.invoices import get_invoice_extractor
    from app.main import app

    slow = SlowExtractor(fake_extractor, delay=1.5)
    app.dependency_overrides[get_invoice_extractor] = lambda: slow
    names = ["invoice_text.pdf", "invoice_wrong_totals.pdf"]
    results = {}

    def worker(name):
        with TestClient(app) as c:
            results[name] = c.post(
                "/invoices", files={"file": (name, sample_bytes(name), "application/pdf")}, headers=AUTH
            ).status_code

    started = time.perf_counter()
    threads = [threading.Thread(target=worker, args=(n,)) for n in names]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    elapsed = time.perf_counter() - started

    assert results == {"invoice_text.pdf": 201, "invoice_wrong_totals.pdf": 201}
    assert elapsed < 2.8, f"two different files ran serially ({elapsed:.1f}s)"
