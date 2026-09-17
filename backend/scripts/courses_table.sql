-- Supabase SQL Editor에서 한 번 실행 (테이블 없으면 생성).
-- 사용자에게 추천된 코스를 저장(찜) — course_json에 그때 보여준 코스 전체를 그대로 스냅샷으로 저장한다.
-- AI가 매번 새로 짜는 코스라 참조할 원본이 없어서, 나중에 추천 로직이 바뀌어도 "저장한 그 코스"가 그대로 보이게
-- 통짜로 저장한다(course_items/legs를 별도 테이블로 정규화하지 않음).
--
-- users 테이블(scripts/users_table.sql)과 마찬가지로 백엔드가 service role key로만 접근 —
-- 프론트에서 anon key로 직접 건드리지 않는 동안은 RLS 안 켬.
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),   -- 로그인 없이 둘러보기(게스트)는 null, session_id로 구분
  session_id text,
  course_json jsonb not null,          -- 저장 시점에 보여준 BuiltCourse 전체 (title/area/items/tags/... 스냅샷)
  request_json jsonb,                  -- 그 코스를 만들 때 쓴 조건(취향/예산/시간 등) 스냅샷 — 재현용
  title text,
  area text,
  match_score int,
  status text not null default 'saved',  -- 'saved' | 'removed' (하드 삭제 대신 상태만 바꿔서 히스토리 남김)
  created_at timestamptz default now()
);

create index if not exists courses_user_id_idx on courses(user_id);
create index if not exists courses_session_id_idx on courses(session_id);
