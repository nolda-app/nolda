"""소셜 로그인 (카카오 우선, 구글은 이어서).

필수 값은 이메일 하나뿐이라 스코프도 account_email만 요청 (닉네임은 동의항목 미설정 상태라 뺌 —
필요해지면 콘솔에서 profile_nickname 사용함으로 켜고 스코프에 추가).
로그인 성공 후엔 우리 JWT를 발급해서 프론트로 넘긴다 (youtube.py의 result_id 쿼리 패턴과 동일).
"""
import os, secrets
from datetime import datetime, timedelta, timezone

import httpx
import jwt as pyjwt

from db import get_client

KAKAO_SCOPE = "account_email"
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30

# 개발용 인메모리 — 서버 재시작 시 사라짐 (youtube.py의 _verifiers와 같은 이유로 충분)
_states: set[str] = set()  # login → callback CSRF 확인용


class AuthError(Exception):
    pass


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise AuthError("JWT_SECRET이 설정되지 않았어요 (backend/.env)")
    return secret


def kakao_login_url() -> str:
    cid, redirect = os.getenv("KAKAO_CLIENT_ID"), os.getenv("KAKAO_REDIRECT_URI")
    if not (cid and redirect):
        raise AuthError("KAKAO_CLIENT_ID / KAKAO_REDIRECT_URI가 설정되지 않았어요 (backend/.env)")
    state = secrets.token_urlsafe(16)
    _states.add(state)
    return (
        "https://kauth.kakao.com/oauth/authorize"
        f"?client_id={cid}&redirect_uri={redirect}&response_type=code"
        f"&scope={KAKAO_SCOPE}&state={state}"
    )


def kakao_callback(code: str, state: str) -> str:
    """code 교환 → 카카오 프로필 조회 → users upsert → 우리 JWT 발급"""
    if state not in _states:
        raise AuthError("로그인 요청이 만료됐어요. 다시 시도해 주세요")
    _states.discard(state)

    cid, secret, redirect = (os.getenv(k) for k in ("KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "KAKAO_REDIRECT_URI"))
    if not (cid and redirect):
        raise AuthError("KAKAO_CLIENT_ID / KAKAO_REDIRECT_URI가 설정되지 않았어요 (backend/.env)")

    token_res = httpx.post(
        "https://kauth.kakao.com/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": cid,
            "client_secret": secret or "",
            "redirect_uri": redirect,
            "code": code,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if token_res.status_code != 200:
        raise AuthError(f"카카오 토큰 교환 실패: {token_res.text}")
    access_token = token_res.json()["access_token"]

    profile_res = httpx.get(
        "https://kapi.kakao.com/v2/user/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if profile_res.status_code != 200:
        raise AuthError(f"카카오 프로필 조회 실패: {profile_res.text}")
    profile = profile_res.json()
    account = profile.get("kakao_account", {})

    row = {
        "provider": "kakao",
        "provider_id": str(profile["id"]),
        "email": account.get("email"),
        "nickname": account.get("profile", {}).get("nickname", ""),
        "avatar_url": account.get("profile", {}).get("profile_image_url"),
    }
    try:
        db = get_client()
        res = db.table("users").upsert(row, on_conflict="provider,provider_id").execute()
    except RuntimeError as e:
        raise AuthError(str(e)) from e
    return issue_token(res.data[0]["id"])


def issue_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_TTL_DAYS)}
    return pyjwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGO)


def verify_token(token: str) -> str:
    """유효하면 user_id 반환"""
    try:
        payload = pyjwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGO])
    except pyjwt.PyJWTError as e:
        raise AuthError("로그인이 만료됐어요. 다시 로그인해 주세요") from e
    return payload["sub"]


def get_user(user_id: str) -> dict | None:
    db = get_client()
    res = db.table("users").select("*").eq("id", user_id).limit(1).execute()
    return res.data[0] if res.data else None
