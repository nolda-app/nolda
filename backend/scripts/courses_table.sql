-- Supabase SQL Editor에서 한 번 실행 (테이블 없으면 생성).
-- users_table.sql을 먼저 실행해야 함 (courses.user_id, saved_courses.user_id가 users를 참조).
-- 기존 테이블들과 같이 백엔드만 접근한다는 전제로 RLS 안 켬. 프론트에서 직접 읽게 되면 그때 RLS 붙이기.

-- AI·기본 코스 1건 (docs/db-schema.md courses + 공유 링크로 다시 열기 위한 course_json)
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,  -- 게스트면 null
  session_id text,
  request_json jsonb,          -- 코스를 만든 조건·취향 요청 그대로 (추천 재현·정확도 분석용)
  taste_snapshot_json jsonb,
  title text not null,
  area text,
  start_time text,             -- HH:MM
  total_minutes int,
  total_cost int,              -- 1인 기준
  match_score int,
  status text default 'generated',  -- generated | saved
  source text,                 -- ai(AI 추천) | rule(DB 기반 기본 코스)
  course_json jsonb not null,  -- 프론트 Course 형태 그대로
  created_at timestamptz default now()
);

-- 코스 안 장소 타임라인
create table if not exists course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  seq int not null,
  place_id uuid references places(id) on delete set null,
  name text,
  kind text,
  time text,                   -- HH:MM
  duration_min int,
  cost int,
  note text,
  unique (course_id, seq)
);

-- 사용자가 저장한 코스
create table if not exists saved_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  saved_at timestamptz default now(),
  unique (user_id, course_id)
);

create index if not exists courses_created_at_idx on courses (created_at desc);
create index if not exists saved_courses_user_idx on saved_courses (user_id, saved_at desc);
