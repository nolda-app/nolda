-- 팀에서 courses 테이블을 먼저 만든 경우 모자란 부분만 추가 (여러 번 실행해도 안전).
-- 백엔드는 service_role 키로 접근하므로 RLS는 켜 둔 채로 둬도 됨 (anon 키로는 쓰기 불가).

-- 저장한 코스 (로그인 사용자) — 없으면 로그인 사용자의 코스 저장이 DB에 안 남음
create table if not exists saved_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  saved_at timestamptz default now(),
  unique (user_id, course_id)
);
create index if not exists saved_courses_user_idx on saved_courses (user_id, saved_at desc);

-- 코스 안 장소 타임라인 (추천 분석용, 없어도 공유·저장은 됨)
create table if not exists course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  seq int not null,
  place_id uuid references places(id) on delete set null,
  name text, kind text, time text, duration_min int, cost int, note text,
  unique (course_id, seq)
);
alter table saved_courses enable row level security;
alter table course_items enable row level security;
