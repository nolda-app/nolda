# NOLDA 장소 데이터 수집 파이프라인

마포구 놀거리 추천 서비스 NOLDA를 위해 장소 데이터를 두 갈래로 수집한다.

- **일반 장소** (카페/맛집/놀거리/전시 등 상시 영업 장소) — 네이버 지역검색 API
- **팝업스토어** (기간 한정 임시 장소) — 네이버 블로그 검색 + 본문 스크래핑

두 데이터는 각자 원본을 유지한 채, 마지막 가공 단계에서 하나의 `place` 스키마로 합쳐진다.

관련 파일: [nolda-지역검색.ipynb](nolda-지역검색.ipynb) · [nolda-블로그.ipynb](nolda-블로그.ipynb) · [nolda-장소가공.ipynb](nolda-장소가공.ipynb) · [nolda_common.py](nolda_common.py) (공유 상수)

실행 방법/환경 설정은 [README.md](README.md) 참고.

---

## 1. 일반 장소 데이터 프로세스

### 1-1. 프로세스

```
[.env 인증]
    │
    ▼
[지역검색 API] 마포구 관심 동 × 카테고리 순회 호출
    (카페/맛집은 sort=comment + sort=random 이중 호출로 커버리지 확대)
    │
    ▼
[raw CSV 누적 저장] title+address 기준 중복 제거, 기존 데이터 유지
    │
    ▼
(nolda-장소가공.ipynb로 이동)
[부적합 카테고리 제외] 병원/약국/편의점 등
    │
    ▼
[place 스키마로 매핑] 좌표 변환(mapx/mapy ÷ 1e7), link를 네이버 검색 링크로 통일
```

### 1-2. 기능 요약

| 단계 | 파일 | 기능 |
|---|---|---|
| 인증 설정 | `nolda-지역검색.ipynb` | `.env`의 `client_ID`/`client_secret`로 NCP API 헤더 구성 |
| 대량 수집 | `nolda-지역검색.ipynb` | `MAPO_DONGS`(동) × `categories`(업종) 순회 호출, 재실행해도 안전(누적) |
| 카페/맛집 보강 | `nolda-지역검색.ipynb` | 지역검색 API는 쿼리당 결과 5건 하드캡이라, `sort=comment`/`sort=random` 이중 호출 + 세부 키워드로 커버리지 확대 |
| 부적합 카테고리 제외 | `nolda-장소가공.ipynb` | `EXCLUDED_CATEGORIES`(병원/약국/편의점 등)에 해당하는 행은 최종 산출물에서 제외 (원본은 유지) |
| 스키마 매핑 | `nolda-장소가공.ipynb` | 지역검색 응답 → `place` 스키마 변환 |

### 1-3. 원본 스키마 (`data/naver_local_search_mapo.csv`)

지역검색 API 응답을 그대로 저장한 것 + 수집 메타데이터.

| 컬럼 | 설명 |
|---|---|
| title, link, category, description, telephone, address, roadAddress, mapx, mapy | 네이버 지역검색 API 응답 그대로 |
| dong | 수집 시 사용한 동 이름 (쿼리 파라미터) |
| category_keyword | 수집 시 사용한 카테고리 키워드 (쿼리 파라미터, 예: "카페", "오락실") |

### 1-4. 유의사항

- 지역검색 API는 `display`를 아무리 올려도 쿼리 하나당 결과가 **무조건 5건으로 캡**되어 있음 (`total` 필드로 확인). 더 모으려면 쿼리 자체를 다양화(동/카테고리 세분화, `sort` 값 변경)하는 수밖에 없음.
- `link`, `telephone` 필드는 지역검색 API 자체에 거의 비어있음 — 업체가 등록해둔 경우만 채워짐(페이스북/인스타그램 등 제각각).
- 원본 CSV(`naver_local_search_mapo.csv`)는 append-only라 계속 커짐. 부적합 카테고리는 원본에서 삭제하고 있음(운영 판단에 따라 다시 원복 가능).

---

## 2. 팝업스토어 데이터 프로세스

### 2-1. 프로세스

```
[.env 인증]
    │
    ▼
[블로그 검색 API] 지역 × 키워드("팝업스토어") 조합 검색
    │
    ▼
[본문 스크래핑] 검색 결과 링크의 PostView.naver 페이지를 재요청해 본문 전체 텍스트 확보
    (검색 API의 description은 요약이라 장소/기간 정보가 잘리는 경우가 많음)
    │
    ▼
[raw CSV 저장] link 기준 중복 제거, 이미 수집한 링크는 재요청 안 함
    │
    ▼
(nolda-장소가공.ipynb로 이동)
[연예뉴스성 글 제외] "연예인이 팝업에 방문했다" 류 기사 필터링
    │
    ▼
[텍스트 추출] 정규식으로 장소명 후보 / 주소 / 진행기간 추출
    │
    ▼
[형태소 분석 정제] kiwipiepy로 명사류만 남기고 조사/어미/동사/형용사/불용어 제거
    │
    ▼
[지역검색 재조회] 정제된 장소명으로 지역검색 API 재호출 → 성공 시 좌표/카테고리 보강
    │
    ▼
[카테고리 확정] 비어있거나 "팝업스토어"로 시작 안 하면(엉뚱한 업체 매칭 포함) "팝업스토어"로 강제 지정
    │
    ▼
[병합 + 만료 처리] 일반 장소 데이터와 병합 후, 진행기간이 지난 팝업은 별도 파일로 분리
```

### 2-2. 기능 요약

| 단계 | 파일 | 기능 | 상태/한계 |
|---|---|---|---|
| 검색+스크래핑 | `nolda-블로그.ipynb` | `AREAS`(동) × `KEYWORDS` 조합으로 블로그 검색 → 본문 스크래핑 | 재실행 시 이미 수집한 `link`는 스킵 |
| 연예뉴스 필터 | `nolda-장소가공.ipynb` | 블로거명/기사 바이라인/제목 클릭베이트 패턴으로 연예뉴스성 글 제외 | 휴리스틱 기반, 완벽하지 않음. 새 패턴 발견 시 `NEWS_*_PATTERN`에 추가 |
| 장소명/주소 추출 | `nolda-장소가공.ipynb` | 정규식으로 "~팝업스토어" 패턴, "서울(특별시) 마포구 ..." 주소 패턴 추출 | 브랜드명이 부분적으로만 잡히는 경우 있음 |
| 형태소 분석 정제 | `nolda-장소가공.ipynb` | kiwipiepy로 명사류만 남김, `USER_WORDS`로 "올리브영" 같은 신조어 브랜드명 분리 방지 | 완전한 브랜드명(NER) 추출은 아님 |
| 지역검색 재조회 | `nolda-장소가공.ipynb` | 정제된 이름으로 재검색 → 마포구 주소 매칭 시 좌표/카테고리 보강 | 100건 중 약 40건 보강 성공, 나머지는 주소만 보관 |
| 카테고리 확정 | `nolda-장소가공.ipynb` | 팝업 파이프라인을 거친 모든 행은 `category`가 "팝업스토어"(또는 세부 카테고리)로 강제 지정 | 100% 보장됨 |
| 진행기간 추출 | `nolda-장소가공.ipynb` | 본문에서 "YYYY.MM.DD~MM.DD" 류 날짜 범위 추출 → `event_start`/`event_end` | 파싱 성공률 약 40%, 나머지는 만료 판정 불가(계속 활성 취급) |
| 만료 처리 | `nolda-장소가공.ipynb` | `event_end`가 오늘보다 과거인 행을 `places_expired.csv`로 분리(삭제 아님) | 날짜 파싱 안 된 팝업은 만료 처리되지 않음 |

### 2-3. 원본 스키마 (`data/naver_blog_content.csv`)

| 컬럼 | 설명 |
|---|---|
| title, link, description, bloggername, bloggerlink, postdate | 네이버 블로그 검색 API 응답 |
| query | 수집 시 사용한 검색어(지역+키워드) |
| content | 본문 스크래핑 결과 (전체 텍스트) |

### 2-4. 유의사항

- 팝업스토어는 임시 장소라 지역검색 DB에 아예 없는 경우가 많음 — 이 경우 본문에서 추출한 주소만 남고 좌표(`lat`/`lng`)는 비어있음.
- 같은 팝업을 다루는 블로그 글이 여러 개면, 지역검색 재조회 성공 시 같은 `name`+`address`로 자동 병합됨(정규식/형태소 결과가 매번 완전히 똑같지 않으면 별도 행으로 남을 수 있음).
- `nolda-장소가공.ipynb`는 원본(`naver_local_search_mapo.csv`, `naver_blog_content.csv`)에서 **매번 전체를 새로 계산**해서 `places_mapo.csv`를 덮어씀 — 추출 로직을 고치면 재실행만으로 전체가 최신 로직 기준으로 갱신됨.

---

## 3. 최종 병합 스키마 (`data/places_mapo.csv`, `data/places_expired.csv`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | `name`+`address` 기반 결정적 uuid5 — 재실행해도 같은 장소는 같은 id 유지 |
| name | text | 장소명 (지역검색 title 또는 블로그에서 추출·정제한 이름) |
| category | text | 지역검색 카테고리 그대로, 팝업은 항상 "팝업스토어"(또는 세부 카테고리)로 시작 |
| address | text | 지번 주소 |
| road_address | text, nullable | 도로명 주소 (팝업이 지역검색 미보강 시 없음) |
| lat, lng | numeric, nullable | 위도/경도 (네이버 mapy/mapx ÷ 1e7). 팝업이 지역검색 미보강 시 없음 |
| link | text | `name` 기준 네이버 검색 링크로 통일 (업체 홈페이지/블로그 글 주소 아님) |
| phone | text, nullable | 전화번호 — 지역검색 API에 거의 비어있음. 상세 스크래핑 필요(미구현) |
| business_hours | jsonb, nullable | 영업시간 — **미구현**, 상세 스크래핑 필요 |
| menu | jsonb, nullable | 메뉴 — **미구현**, 상세 스크래핑 필요 |
| tags | text[] | 취향 태그 — **미구현**, 블로그 리뷰 분석 결과로 채울 예정 |
| area | text, nullable | 마포구 내 관심 동 (`nolda_common.MAPO_DONGS` 기준). 블로그 유래 장소는 주소에서 못 찾으면 비어있음 |
| event_start, event_end | date(ISO 문자열), nullable | 팝업 진행기간. 상시 영업 장소는 항상 없음. **원래 place 스키마엔 없던 컬럼 — Supabase 테이블에도 추가 필요** |
| source | text | `local`(지역검색) 또는 `blog_popup`(블로그 파이프라인) — 원본 추적용, place 스키마 확정 시 제외 여부 논의 필요 |
| raw_json | jsonb | 원본 API 응답(또는 블로그 원본 행) 통째로 보관 |
| fetched_at | timestamptz | 이 행이 계산된 시각 |

**아직 안 채워진 컬럼**: `phone`(상세), `business_hours`, `menu`, `tags` — 상세 페이지 스크래핑/블로그 리뷰 분석은 다음 단계.
