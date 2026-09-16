"""Supabase 클라이언트. SUPABASE_URL/SUPABASE_KEY는 backend/.env (커밋 안 됨, .env.example 참고)."""
import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_client() -> Client:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not (url and key):
        raise RuntimeError("SUPABASE_URL/SUPABASE_KEY가 설정되지 않았어요 (backend/.env)")
    return create_client(url, key)
