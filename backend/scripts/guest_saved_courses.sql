-- Supabase SQL Editor에서 한 번 실행. courses_table.sql(+ users_table.sql)을 먼저 실행해야 함.
-- 로그인 없이 둘러보는 게스트가 저장한 코스를 서버에 기록한다 (기기마다 만든 랜덤 게스트 ID 기준).
-- 게스트가 나중에 로그인하면 saved_courses로 합치되, 이 기록은 지우지 않고 merged_user_id만 표시한다.
-- 백엔드만 접근한다는 전제로 RLS 안 켬 (courses_table.sql과 동일).
create table if not exists guest_saved_courses (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null,                 -- 프론트가 기기에 만든 uuid (X-Guest-Id 헤더)
  course_ref text not null,               -- courses.id(uuid) 또는 기본 코스 id(c1…) — 기본 코스는 courses 테이블에 없어서 FK를 걸지 않음
  saved_at timestamptz default now(),
  merged_user_id uuid references users(id) on delete set null,  -- 로그인해서 계정으로 합쳐진 경우
  unique (guest_id, course_ref)
);

create index if not exists guest_saved_courses_guest_idx on guest_saved_courses (guest_id, saved_at desc);
