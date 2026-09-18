"""유튜브 좋아요·구독 기록 → 취향 집계.

1회 분석 방식: 로그인 → 좋아요·구독 수집·집계 → 결과만 메모리에 보관하고 토큰은 버린다.
(테스트 모드 refresh token 7일 만료와 무관, 토큰 유출 위험도 없음)
"""
import os, secrets
from collections import Counter

SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]
MAX_VIDEOS = 200  # videos.list 1회 = 1유닛, 50개씩 → 최대 4유닛
MAX_SUBS = 200  # subscriptions.list 1회 = 1유닛

# 키워드 규칙 (소문자 부분 일치). "cat:<id> "는 유튜브 카테고리 ID(17 스포츠, 19 여행, 10 음악, 1 영화, 20 게임) — 뒤 공백까지 맞춰야 cat:1이 cat:17에 안 걸림
# '술'·'책'·'바'처럼 짧은 단어는 미술·산책·바다에 섞여 들어가서 뺐다
MOOD_RULES = {
    "calm": ("힐링·브이로그", ["힐링", "asmr", "명상", "브이로그", "vlog", "캠핑", "relax"]),
    "active": ("운동·스포츠", ["cat:17 ", "운동", "헬스", "러닝크루", "달리기", "등산", "클라이밍", "축구", "fitness", "workout", "running"]),
    "new": ("여행·체험", ["cat:19 ", "여행", "체험", "다큐", "원데이클래스", "travel", "documentary"]),
    "food": ("먹방·맛집", ["먹방", "맛집", "요리", "레시피", "food", "cooking", "mukbang"]),
}
SPEND_RULES = {
    "meal": ("식사·요리", ["먹방", "맛집", "요리", "레시피", "한식", "파스타", "food", "cooking"]),
    "cafe": ("카페·디저트", ["카페", "커피", "디저트", "베이킹", "베이커리", "빵집", "cafe", "coffee", "dessert"]),
    "drink": ("술·바", ["와인", "위스키", "칵테일", "맥주", "혼술", "술자리", "wine", "whisky", "cocktail", "beer"]),
    "play": ("문화·예술", ["cat:10 ", "cat:1 ", "전시", "미술", "공연", "뮤지컬", "연극", "영화", "museum", "concert", "exhibition"]),
}
# 활동성: 야외·활동 vs 실내 비율로 4단계 (적음 low / 중간 mid / 많음 high / 매우 많음 very)
PACE_RULES = {
    "walk": ("야외·활동", ["cat:19 ", "cat:17 ", "산책", "여행", "등산", "캠핑", "러닝크루", "travel", "hiking", "walk"]),
    "sit": ("실내", ["cat:20 ", "cat:1 ", "게임", "영화", "드라마", "독서", "북튜버", "game", "movie"]),
}
TAG_RULES = {
    "전시": ["전시", "미술", "갤러리", "museum", "gallery", "exhibition"],
    "야경": ["야경", "night view", "nightview"],
    "사진": ["사진", "카메라", "필름카메라", "photography", "camera"],
    "로컬": ["동네", "골목", "노포", "로컬", "local"],
    "기록": ["다이어리", "기록", "독서", "북튜버", "문구", "journal"],
    "자연": ["자연", "캠핑", "등산", "산책", "숲", "nature", "hiking"],
}

# 개발용 인메모리 저장소 — 서버 재시작 시 사라짐 (추후 Supabase로 교체)
_verifiers: dict[str, str] = {}  # state → PKCE code_verifier (login→callback 사이 보관)
_results: dict[str, dict] = {}  # result_id → 집계 결과


class YoutubeError(Exception):
    pass


def _flow(state: str | None = None):
    from google_auth_oauthlib.flow import Flow

    cid, secret, redirect = (os.getenv(k) for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"))
    if not (cid and secret and redirect):
        raise YoutubeError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI가 설정되지 않았어요 (backend/.env)")
    if redirect.startswith("http://localhost"):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # 로컬 http 리디렉션 허용
    # 같은 클라이언트로 구글 로그인을 붙인 뒤로, 유튜브 권한만 요청해도 구글이 이미 승인된
    # email·openid를 얹어 돌려준다(include_granted_scopes). 그대로 두면 oauthlib이
    # "scope가 바뀌었다"며 토큰 교환을 거부하므로 이 검사를 완화한다.
    os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
    config = {"web": {"client_id": cid, "client_secret": secret, "redirect_uris": [redirect],
                      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                      "token_uri": "https://oauth2.googleapis.com/token"}}
    return Flow.from_client_config(config, scopes=SCOPES, redirect_uri=redirect, state=state)


def authorize_url() -> str:
    flow = _flow()
    url, state = flow.authorization_url(prompt="consent", include_granted_scopes="true")
    _verifiers[state] = flow.code_verifier
    return url


def finish_authorization(code: str, state: str) -> str:
    """구글이 돌려준 code로 토큰 교환 → 좋아요·구독 집계 → result_id 반환"""
    verifier = _verifiers.pop(state, None)
    if verifier is None:
        raise YoutubeError("로그인 요청이 만료됐어요. 다시 시도해 주세요")
    flow = _flow(state)
    flow.code_verifier = verifier
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        raise YoutubeError(f"구글 토큰 교환 실패: {e}") from e
    result = summarize(*fetch_youtube(flow.credentials))
    result_id = secrets.token_urlsafe(16)
    _results[result_id] = result
    return result_id


def get_result(result_id: str) -> dict | None:
    return _results.get(result_id)


def fetch_youtube(creds) -> tuple[list[dict], list[dict], dict[str, str]]:
    """좋아요 영상 · 구독 채널 · 카테고리 이름"""
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError

    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)

    def pages(method, limit: int, **params) -> list[dict]:
        items, token = [], None
        while len(items) < limit:
            res = method(maxResults=50, pageToken=token, **params).execute()
            items += res.get("items", [])
            token = res.get("nextPageToken")
            if not token:
                break
        return items[:limit]

    try:
        liked = pages(yt.videos().list, MAX_VIDEOS, part="snippet,topicDetails", myRating="like")
        subs = pages(yt.subscriptions().list, MAX_SUBS, part="snippet", mine=True)
        cats = yt.videoCategories().list(part="snippet", regionCode="KR", hl="ko").execute()
    except HttpError as e:
        raise YoutubeError(f"YouTube API 호출 실패: {e}") from e
    names = {c["id"]: c["snippet"]["title"] for c in cats.get("items", [])}
    return liked, subs, names


def _rule_scores(texts: list[str], rules: dict[str, tuple[str, list[str]]]) -> dict[str, int]:
    """규칙마다 키워드가 걸린 항목이 몇 개인지"""
    return {k: sum(any(w in t for w in words) for t in texts) for k, (_, words) in rules.items()}


def _top_rule(scores: dict[str, int], rules: dict[str, tuple[str, list[str]]], unit: str) -> tuple[str | None, str]:
    """가장 많이 걸린 쪽 (0개면 None)"""
    best = max(scores, key=scores.get)
    if not scores[best]:
        return None, ""
    return best, f"유튜브 {rules[best][0]} {scores[best]}{unit}"


def summarize(videos: list[dict], subs: list[dict], cat_names: dict[str, str], top: int = 10) -> dict:
    """AI 없이 집계 + 키워드 규칙으로 취향 힌트 — 다음 단계(LLM 분석)에서 hints를 교체할 예정"""
    cats, channels, tags, topics = Counter(), Counter(), Counter(), Counter()
    texts = []  # 영상·채널 1개당 검색용 문자열 1개
    for v in videos:
        s = v.get("snippet", {})
        cid = s.get("categoryId", "")
        cats[cat_names.get(cid, "기타")] += 1
        channels[s.get("channelTitle", "")] += 1
        vtags = s.get("tags", [])[:15]
        tags.update(t.lower() for t in vtags)
        # topicCategories 예: https://en.wikipedia.org/wiki/Food → Food
        vtopics = [u.rsplit("/", 1)[-1].replace("_", " ") for u in v.get("topicDetails", {}).get("topicCategories", [])]
        topics.update(vtopics)
        texts.append(" ".join([f"cat:{cid}", s.get("title", ""), *vtags, *vtopics]).lower())
    sub_names = [x["snippet"]["title"] for x in subs]
    texts += [f"{x['snippet']['title']} {x['snippet'].get('description', '')[:200]}".lower() for x in subs]

    mood_scores = _rule_scores(texts, MOOD_RULES)
    spend_scores = _rule_scores(texts, SPEND_RULES)
    mood, mood_ev = _top_rule(mood_scores, MOOD_RULES, "개")
    spend, spend_ev = _top_rule(spend_scores, SPEND_RULES, "개")
    walk, sit = (sum(any(w in t for w in PACE_RULES[k][1]) for t in texts) for k in ("walk", "sit"))
    if walk + sit:
        r = walk / (walk + sit)
        pace = "very" if r >= 0.75 else "high" if r >= 0.5 else "mid" if r >= 0.25 else "low"
        pace_ev = f"유튜브 야외·활동 {walk}개 · 실내 {sit}개"
    else:
        pace, pace_ev = None, ""
    tag_scores = {k: sum(any(w in t for w in words) for t in texts) for k, words in TAG_RULES.items()}
    top_tags = [k for k in sorted(tag_scores, key=tag_scores.get, reverse=True) if tag_scores[k]][:3]

    n = len(videos) or 1
    return {
        "likes": len(videos),
        "subs": len(subs),
        "categories": [{"name": k, "ratio": round(c / n, 2)} for k, c in cats.most_common(top)],
        "channels": [k for k, _ in channels.most_common(top) if k],
        "sub_channels": sub_names[:30],
        "tags": [k for k, _ in tags.most_common(top * 2)],
        "topics": [k for k, _ in topics.most_common(top)],
        "titles": [v["snippet"]["title"] for v in videos[:30]],  # LLM 분석용 샘플
        # 사진과 가중 합산하려고 원시 점수를 그대로 넘긴다 (taste.py가 비율로 바꿔 씀)
        "scores": {
            "n": len(texts),  # 판단에 쓴 항목 수 (영상 + 채널) — 근거가 얼마나 많은지
            "mood": mood_scores,
            "spend": spend_scores,
            "pace": {"walk": walk, "sit": sit},
            "tags": tag_scores,
        },
        "hints": {
            "mood": mood, "spend": spend, "pace": pace, "tags": top_tags,
            "evidence": {
                "mood": mood_ev, "spend": spend_ev, "pace": pace_ev,
                "tags": " · ".join(f"{k} {tag_scores[k]}" for k in top_tags),
            },
        },
    }
