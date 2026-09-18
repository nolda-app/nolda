-- Supabase SQL Editor에서 한 번 실행 — 업체 대표사진 URL 컬럼 추가.
-- 실행 후 python backend/scripts/load_places_to_db.py 를 다시 돌리면 data/place_images.csv 값이 채워짐.
alter table places add column if not exists image_url text;
