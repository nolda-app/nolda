-- Supabase SQL Editor에서 한 번 실행 (테이블 없으면 생성).
-- 공개 장소 정보 캐시라 개인정보 없음 -> RLS 안 켬 (anon key로 읽기/쓰기 다 됨).
-- 나중에 사용자 데이터가 섞이면 그때 RLS 붙이기.
create table if not exists places (
  id uuid primary key,
  name text not null,
  category text,
  address text,
  lat numeric,
  lng numeric,
  kind text,               -- 식사/카페/한잔/체험/문화/산책/운동 (코스 생성용 분류)
  area text,               -- 마포구 내 동네 (연남/망원/합정 등)
  tags text[] default '{}',
  phone text,
  business_hours text,     -- 요약 문장 (원문은 아직 구조화 안 함)
  menu_summary text,
  price_per_person integer,
  fetched_at timestamptz default now()
);
