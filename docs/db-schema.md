# DB 스키마 (Supabase / Postgres)

지금까지 확정된 내용 반영: 로그인 재도입([2026-09-04](meeting-2026-09-04.md)), 카드/사진 업로드 기반 이탈도 분석과 네이버 지역검색 장소 수집([2026-09-07](data-strategy-2026-09-07.md)), 프론트 `planner`에 구현된 코스/타임라인/이동동선 구조([frontend/src/planner/logic.ts](../frontend/src/planner/logic.ts)).

## ERD 개요

```
users ──< uploaded_data
  │
  ├──1:1── user_tastes
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
카카오·구글 로그인은 이미 구현돼 있는데([backend/auth.py](../backend/auth.py)) Supabase에 테이블이 없으면 로그인 마지막 단계(토큰 발급 직전 upsert)에서 막힙니다. **아직 안 만들었다면 Supabase SQL Editor에서 [`backend/scripts/users_table.sql`](../backend/scripts/users_table.sql)을 그대로 실행**하세요 (아래 표와 동일한 내용).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| provider | text | `kakao` \| `google` (네이버는 아직 미구현) |
| provider_id | text | 소셜 로그인 고유 ID |
| email | text nullable | 카카오는 이메일 동의항목을 꺼두면 비어있을 수 있음 |
| nickname | text | |
| avatar_url | text nullable | |
| created_at | timestamptz | |

`unique(provider, provider_id)` — email엔 unique를 걸지 않음 (제공자마다 없을 수도 있고, 같은 이메일로 카카오·구글 각각 가입하면 별개 계정으로 취급).

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
네이버 검색 API(지역검색) 응답 + 상세 스크래핑([#7](https://github.com/nolda-app/nolda/issues/7)) 결과를 합친 장소 캐시. 코스 생성 시 재호출 비용을 줄이고, 코스 아이템이 특정 장소를 참조할 수 있게 함.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| name | text | 업체명 (네이버 `title`) |
| category | text | 네이버 `category` 그대로 |
| address | text | |
| road_address | text | |
| lat | numeric | 위도 — 네이버 `mapy / 1e7` |
| lng | numeric | 경도 — 네이버 `mapx / 1e7` |
| link | text nullable | 업체 링크 (네이버 `link` 또는 자체 홈페이지) |
| phone | text nullable | 전화 — 지역검색 API엔 거의 비어있어 상세 스크래핑으로 보완 |
| business_hours | jsonb nullable | 영업시간 (요일별), 상세 스크래핑 |
| menu | jsonb nullable | 메뉴 (이름/가격 배열), 상세 스크래핑 |
| tags | text[] | 취향 태그 — 조용함/데이트/혼밥/사진/주차/웨이팅 등, 블로그 리뷰 분석 결과([#7](https://github.com/nolda-app/nolda/issues/7) [4]단계) |
| area | text | 마포구 내 동네 태그 (연남/합정/망원 등) |
| raw_json | jsonb | 원본 응답 보관 |
| event_start | timestamptz | 날짜 시작 시각 (팝업스토어) |
| event_end | timestamptz | 날짜 종료 시각 (팝업스토어) |
| fetched_at | timestamptz | 캐시 갱신 시각 |

### `user_tastes`
사용자 취향 프로필 — `uploaded_data.analysis_json`들을 집계한 현재 상태 스냅샷. 코스 추천 시마다 jsonb를 다시 집계하지 않고 바로 조회하기 위한 정규화 테이블. 컬럼명은 `frontend/src/planner/data.ts`의 `Q` 키와 맞춤.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users, unique | 사용자당 1행 |
| mood | text | 쉬는 방식 — `calm` \| `active` \| `new` \| `food` |
| crowd | text | 사람 많은 곳 선호 — `busy` \| `mid` \| `quiet` |
| hour | text | 자주 나가는 시간 — `morning` \| `noon` \| `sunset` \| `night` |
| spend | text | 돈을 쓰는 곳 — `cafe` \| `meal` \| `drink` \| `play` |
| tags | text[] | 사진에서 자주 나온 것 — `전시`/`야경`/`사진`/`로컬`/`기록`/`자연` |
| updated_at | timestamptz | 최근 분석 반영 시각 |

로그인 없이 둘러보기(게스트)는 이 테이블에 남지 않고 `courses.taste_snapshot_json`에만 세션 스코프로 남는다.

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
- `user_tastes`의 컬럼명(mood/crowd/hour/spend/tags)은 한글 라벨("쉬는 방식" 등)을 그대로 컬럼명으로 쓰지 않고, 이미 프론트에서 쓰고 있는 영문 키로 정규화함 — 프론트/백엔드 계약 일관성 유지.
