"""백엔드 API 테스트 공용 준비 — 실제 Supabase·OpenAI 없이 돌린다.

course_store는 db.get_client()로 Supabase를 쓰므로, 같은 메서드 체인(table→select/eq/upsert/…→execute)을
메모리에서 흉내 내는 FakeDB로 바꿔 끼운다. 실제 DB 쿼리가 맞는지는 이 테스트로 알 수 없다.
"""
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

os.environ.pop("SUPABASE_URL", None)  # 실수로 운영 DB를 부르지 않게
os.environ.pop("SUPABASE_KEY", None)

import auth  # noqa: E402
import course_store  # noqa: E402
import main  # noqa: E402


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.op, self.payload, self.filters, self.cap, self.conflict = "select", None, [], None, []

    def select(self, *_):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def order(self, *_, **__):
        return self

    def limit(self, n):
        self.cap = n
        return self

    def insert(self, rows):
        self.op, self.payload = "insert", rows
        return self

    def upsert(self, row, on_conflict=""):
        self.op, self.payload = "upsert", row
        self.conflict = [c.strip() for c in on_conflict.split(",") if c.strip()]
        return self

    def update(self, values):
        self.op, self.payload = "update", values
        return self

    def delete(self):
        self.op = "delete"
        return self

    def _match(self, row):
        return all(row.get(c) == v for c, v in self.filters)

    def execute(self):
        if self.db.fail:
            raise RuntimeError("DB 오류")
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == "insert":
            rows.extend(dict(r) for r in (self.payload if isinstance(self.payload, list) else [self.payload]))
            return SimpleNamespace(data=[])
        if self.op == "upsert":
            hit = next((r for r in rows if all(r.get(c) == self.payload.get(c) for c in self.conflict)), None)
            if hit:
                hit.update(self.payload)
            else:
                rows.append(dict(self.payload))
            return SimpleNamespace(data=[])
        if self.op == "update":
            hit = [r for r in rows if self._match(r)]
            for r in hit:
                r.update(self.payload)
            return SimpleNamespace(data=[dict(r) for r in hit])  # Supabase처럼 바뀐 행을 돌려준다
        if self.op == "delete":
            rows[:] = [r for r in rows if not self._match(r)]
            return SimpleNamespace(data=[])
        found = [dict(r) for r in rows if self._match(r)]
        return SimpleNamespace(data=found[: self.cap] if self.cap else found)


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.fail = False

    def table(self, name):
        return _Query(self, name)

    def rows(self, name):
        return self.tables.get(name, [])


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(course_store, "get_client", lambda: fake)
    monkeypatch.setattr(auth, "get_client", lambda: fake)
    return fake


@pytest.fixture
def client(db):
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def fake_login(monkeypatch):
    """Bearer 토큰이 'user-…'로 시작하면 그 사용자로 본다 (실제 JWT 서명은 쓰지 않는다)"""
    def verify(token):
        if token.startswith("user-"):
            return token
        raise auth.AuthError("로그인이 만료됐어요. 다시 로그인해 주세요")
    monkeypatch.setattr(auth, "verify_token", verify)


@pytest.fixture
def course(db):
    """DB에 이미 만들어져 있는 AI 코스 1건"""
    cid = str(uuid.uuid4())
    db.tables["courses"] = [{"id": cid, "title": "테스트 코스", "status": "generated", "course_json": {"id": cid, "title": "테스트 코스", "items": []}}]
    return cid


@pytest.fixture
def guest():
    return str(uuid.uuid4())
