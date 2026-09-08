# DB 스키마 (Supabase / Postgres)

지금까지 확정된 내용 반영: 로그인 재도입([2026-09-04](meeting-2026-09-04.md)), 카드/사진 업로드 기반 이탈도 분석과 네이버 지역검색 장소 수집([2026-09-07](data-strategy-2026-09-07.md)), 프론트 `planner`에 구현된 코스/타임라인/이동동선 구조([frontend/src/planner/logic.ts](../frontend/src/planner/logic.ts)).

## ERD 개요

```
users ──< uploaded_data
  │
  ├──< courses ──< course_items ──> places
  │       │            │
  │       │            └──< course_item_legs (구간 이동)
  │       │
  │       ├──< saved_courses
  │       ├──< click_logs
  │       └──< feedback
  │
places (네이버 지역검색 캐시, courses/course_items와 독립적으로도 조회)
```

## 테이블

### `users`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| email | text unique | |
| nickname | text | |
| provider | text | `kakao` \| `naver` \| `google` \| `email` |
| provider_id | text | 소셜 로그인 고유 ID |
| created_at | timestamptz | |

### `uploaded_data`
카드 스크린샷 / 사진 업로드 1건당 1행. 원본 이미지는 Storage에 잠깐 보관 후 만료(개인정보 최소 보관), 분석 결과만 영구 저장.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users | |
| source | text | `card` \| `photo` |
| storage_path | text nullable | 원본 파일 경로 (TTL 후 null 처리) |
| analysis_json | jsonb | 아래 구조 |
| created_at | timestamptz | |

`analysis_json` 구조 ([데이터 전략 문서](data-strategy-2026-09-07.md) 기준, 이탈도 필드 추가):
```json
{
  "source": "card",
  "spending": { "food": 45, "cafe": 25, "culture": 20, "activity": 10 },
  "price_tendency": "mid",
  "keywords": ["분위기 좋은", "소규모", "한식"],
  "anomaly_signals": [
    { "merchant": "최강오락실연남점", "amount": 5000, "time": "22:11", "reason": "저녁·저빈도·평소 없던 카테고리" }
  ],
  "analyzed_at": "2026-09-07T14:00:00Z"
}
```

### `places`
네이버 검색 API(지역검색) 응답 캐시. 코스 생성 시 재호출 비용을 줄이고, 코스 아이템이 특정 장소를 참조할 수 있게 함.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| naver_title | text | |
| category | text | 네이버 `category` 그대로 |
| address | text | |
| road_address | text | |
| mapx / mapy | text | 네이버 좌표계 원본값 |
| area | text | 마포구 내 동네 태그 (연남/합정/망원 등) |
| raw_json | jsonb | 원본 응답 보관 |
| fetched_at | timestamptz | 캐시 갱신 시각 |

### `courses`
AI가 생성한 코스 1건. 로그인 없이 둘러보기(guest) 지원을 위해 `user_id`는 nullable, 대신 `session_id`로 게스트 세션 식별.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users, nullable | 게스트면 null |
| session_id | text nullable | 게스트 식별용 |
| request_json | jsonb | 조건 스냅샷: budget, hours, party_size, purpose, area 등 |
| taste_snapshot_json | jsonb | 생성 시점에 사용한 `analysis_json`들의 요약 |
| title | text | |
| area | text | |
| start_time | text | `HH:MM` |
| total_minutes | int | |
| total_cost | int | 1인 기준 |
| match_score | int | 취향 매칭 % |
| status | text | `generated` \| `saved` |
| created_at | timestamptz | |

### `course_items`
코스 내 활동 타임라인. `frontend/src/planner/logic.ts`의 `BuiltItem`과 1:1 대응.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| course_id | uuid fk → courses | |
| seq | int | 순서 |
| place_id | uuid fk → places, nullable | AI가 지어낸 장소면 null |
| name | text | |
| kind | text | 산책/카페/식사/체험/문화/한잔 등 |
| time | text | `HH:MM` |
| duration_min | int | |
| cost | int | |
| note | text | |
| bookable | boolean | |
| provider | text nullable | `캐치테이블 예약` \| `네이버 예약` |
| book_status | text | `none` \| `requested` \| `confirmed` |

### `course_item_legs`
아이템 사이 이동 구간. `course_items.seq`와 `seq+1` 사이.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| course_id | uuid fk → courses | |
| from_seq | int | |
| to_seq | int | |
| mode | text | 도보/버스/지하철/택시 |
| duration_min | int | |
| distance_label | text | 예: `700m`, `2.4km · 110번` |

### `saved_courses`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users | |
| course_id | uuid fk → courses | |
| saved_at | timestamptz | |

`unique(user_id, course_id)`

### `click_logs`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users, nullable | |
| session_id | text nullable | |
| course_id | uuid fk → courses, nullable | |
| action | text | `view` \| `open` \| `book` \| `save` \| `condition_change` |
| meta_json | jsonb nullable | |
| created_at | timestamptz | |

### `feedback`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users | |
| course_id | uuid fk → courses | |
| rating | int | 1~5 |
| comment | text nullable | |
| created_at | timestamptz | |

## 설계 메모

- `uploaded_data`의 원본 이미지는 분석 후 바로 삭제하거나 짧은 TTL만 유지 — 개인정보(카드번호·얼굴 등) 최소 보관 원칙. `analysis_json`만 영구 보관 대상.
- `courses.request_json` / `taste_snapshot_json`을 스냅샷으로 남기는 이유: 이후 추천 알고리즘이 바뀌어도 "그때 왜 이 코스가 나왔는지" 재현 가능해야 함 (Phase 2 유저 기반 협업 필터링 학습 데이터로도 재사용).
- `places`는 마포구 한정 MVP라 지역 캐시 크기가 작음 — 별도 배치 수집 없이 코스 생성 요청 시점에 lazy하게 채워도 됨.
