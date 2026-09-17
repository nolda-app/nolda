-- Supabase SQL Editor에서 한 번 실행 (테이블 없으면 생성).
-- 개인정보(닉네임 등)가 들어가지만 백엔드가 서비스 role key로만 접근하고
-- 프론트에서 anon key로 직접 건드리지 않으니 지금은 RLS 안 켬. 프론트 직접 접근을 열 때 다시 검토.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  provider text not null,        -- 'kakao' | 'google'
  provider_id text not null,     -- 소셜 고유 ID (문자열로 저장 — 카카오는 숫자, 구글은 문자열)
  email text,                    -- 카카오는 검수 전까지 비어있음
  nickname text,
  avatar_url text,
  created_at timestamptz default now(),
  unique (provider, provider_id)
);
