"""네이버 플레이스 상세페이지에서 phone/business_hours/menu 스크래핑.

공식 지역검색 API는 telephone 필드를 항상 비워서 내려주고(문서에 명시된 하위호환용 필드),
영업시간/메뉴 필드 자체가 없음 -> 상세페이지(pcmap.place.naver.com)를 Selenium으로 직접 열어서 수집.

대상: PLACES_TO_SCRAPE에 하드코딩된 25곳 (backend/PLACE_DETAIL_SCRAPING_HANDOFF.md 참고).
pid는 임의 uuid라 상세페이지 URL을 바로 만들 수 없어서, 매번 지도 검색으로 진입해
실제 placeId(및 카테고리별 URL 경로)를 얻는다.

차단 문구("과도한 접근" 등)가 감지되면 그 즉시 전체 중단한다 — 재시도하거나
우회하지 않는다. 결과는 매 건마다 CSV에 append하므로 중간에 멈춰도 그때까지 결과는 남는다.

실행: python backend/scripts/scrape_place_details.py
"""
import csv
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ROOT = Path(__file__).resolve().parents[2]
OUT_CSV = ROOT / "backend" / "data" / "place_details_selenium.csv"
FIELDNAMES = ["pid", "name", "phone", "business_hours", "menu", "status", "scraped_at"]

BLOCK_PATTERNS = ["과도한 접근", "이용이 제한", "일시적으로 차단", "비정상적인 접근"]

# backend/PLACE_DETAIL_SCRAPING_HANDOFF.md 3번 표 그대로
PLACES_TO_SCRAPE = [
    {"pid": "11413571-3470-59bd-b260-e15073ffde6f", "name": "오시 망원본점", "address": "서울특별시 마포구 월드컵로17길 48 지 1층 오시 망원본점"},
    {"pid": "29143361-bff5-56e7-9fe2-2cb86ebee036", "name": "하와이조개 홍대점", "address": "서울특별시 마포구 와우산로21길 19-8 태경빌딩 지하 1층"},
    {"pid": "37851c6b-ea94-59b2-b162-01a9e14a3e5c", "name": "연하동 연남본점", "address": "서울특별시 마포구 연남로 6"},
    {"pid": "43323b27-c9bc-53fb-aa74-c1cc984bdf03", "name": "평화연남", "address": "서울특별시 마포구 동교로 254-1"},
    {"pid": "62c29d0f-a1e8-5150-bbdc-25f7859c0e53", "name": "츠케루", "address": "서울특별시 마포구 와우산로23길 9 1층 102호"},
    {"pid": "e618ce89-a8d7-5cbb-a08b-b451f9f45537", "name": "빌라 더 다이닝 홍대본점", "address": "서울특별시 마포구 동교로30길 16 JnS.Bldg"},
    {"pid": "3c67d723-3960-5981-9070-9ddd168c9d35", "name": "앤트러사이트 합정점", "address": "서울특별시 마포구 토정로5길 10"},
    {"pid": "42949cb5-be91-555d-a0c9-3e2837a24344", "name": "티노마드", "address": "서울특별시 마포구 포은로 112 2층"},
    {"pid": "b6756f3d-90ae-50fd-834a-eb0ccdfc0189", "name": "어글리베이커리", "address": "서울특별시 마포구 월드컵로13길 73 1층 어글리 베이커리"},
    {"pid": "c80529f8-d49e-5112-8454-da85ec876236", "name": "코코로카라", "address": "서울특별시 마포구 연남로1길 41"},
    {"pid": "ee8b3ed2-6f0e-5150-87ff-50727bcd11ed", "name": "버터앤쉘터 연남점", "address": "서울특별시 마포구 성미산로 170 102호"},
    {"pid": "fa6c1365-28e3-5aae-868c-efd69cbc0811", "name": "만화살롱 유어마나", "address": "서울특별시 마포구 와우산로 13 B1"},
    {"pid": "0b6b45d0-3cba-50e2-817d-c94080b70aad", "name": "배터리88 홍대", "address": "서울특별시 마포구 와우산로19길 6 1층"},
    {"pid": "1faa0faf-4c46-5d08-9552-9b3efcedc108", "name": "로바타 우직", "address": "서울특별시 마포구 포은로 86-1 1층"},
    {"pid": "5440c4e0-8ed3-59f4-9340-2f6124049fa4", "name": "야키토리 고꼬연남", "address": "서울특별시 마포구 성미산로26길 41 1층 101호"},
    {"pid": "874c9436-2eba-5cb5-8092-83132231cea4", "name": "산울림1992", "address": "서울특별시 마포구 서강로9길 60 산울림1992"},
    {"pid": "26583c6d-dd58-5ded-9b02-40397e73d9cc", "name": "홈즈앤루팡24 오티티 보드게임 플러스 연남점", "address": "서울특별시 마포구 동교로38안길 24 2층,3층,4층"},
    {"pid": "3f53882c-e816-5249-bf03-dc973f639485", "name": "그리젠", "address": "서울특별시 마포구 월드컵로23길 45 2층"},
    {"pid": "a146ba81-ace5-52d4-983d-c1f852e3a7c6", "name": "더클라임 클라이밍 연남점", "address": "서울특별시 마포구 양화로 186 3층"},
    {"pid": "ec724734-f482-5366-b591-8afbbf2c1b07", "name": "홍대볼링장", "address": "서울특별시 마포구 양화로 156 308호"},
    {"pid": "3b361e79-17bd-5aa2-9a53-262281b2f99f", "name": "스페이스 아크", "address": "서울특별시 마포구 토정로3길 16 안쪽 마당, 1층"},
    {"pid": "6f2a216e-7783-57f5-9cb4-383b045e2e55", "name": "서울에너지드림센터", "address": "서울특별시 마포구 증산로 14"},
    {"pid": "83eb7d55-4a7e-533a-ab25-7f2a8d919c4c", "name": "아트스페이스 합정", "address": "서울특별시 마포구 포은로 24"},
    {"pid": "bee31df0-78db-537b-a4d4-05331544976b", "name": "오늘애니", "address": "서울특별시 마포구 와우산로10길 3 1층, 2층, 3층"},
    {"pid": "d56e89e8-49ba-526b-862c-6d78c5d10379", "name": "문화비축기지", "address": "서울특별시 마포구 증산로 87"},
]


class BlockedError(Exception):
    pass


def check_blocked(page_text: str) -> None:
    for pat in BLOCK_PATTERNS:
        if pat in page_text:
            raise BlockedError(f"차단 문구 감지: '{pat}'")


def road_token(addr: str) -> str | None:
    """'서울(특별시) 마포구 와우산로23길 9 ...' -> '와우산로23길' (동/도로명까지만 비교용으로 추출)."""
    idx = addr.find("마포구")
    if idx == -1:
        return None
    rest = addr[idx + len("마포구"):].strip()
    return rest.split()[0] if rest else None


def labeled_value(soup: BeautifulSoup, label: str) -> str | None:
    """'전화번호'/'영업시간' 같은 라벨(span.place_blind)의 부모 row 전체 텍스트에서 라벨을 뗀 값."""
    node = soup.find(string=lambda s: s and s.strip() == label)
    if not node:
        return None
    row = node.parent.parent.parent  # place_blind span -> strong -> row div
    text = row.get_text(" ", strip=True)
    return text[len(label):].strip() or None


def extract_menu(soup: BeautifulSoup) -> str:
    items = []
    for item in soup.find_all("div", class_="MXkFw"):
        name_el = item.select_one(".lPzHi")
        price_el = item.select_one(".p2H02")
        name = name_el.get_text(" ", strip=True) if name_el else None
        price = price_el.get_text(" ", strip=True) if price_el else None
        if name:
            items.append(f"{name} {price}".strip())
    return "; ".join(items)


def extract_fee_table(soup: BeautifulSoup) -> str:
    """체험/문화 등 '메뉴' 탭이 없는 업종은 홈 화면에 '가격표'라는 별도 라벨로 이용료가 나온다
    (클라이밍장 이용권, 보드카페 이용료, 만화카페 시간권 등). 구조는 메뉴와 달라서 별도 선택자 필요."""
    items = []
    for row in soup.find_all("div", class_="JLkY7"):
        name_el = row.select_one(".A_cdD") or row.select_one(".li2Pi")
        price_el = row.select_one(".CLSES")
        name = name_el.get_text(" ", strip=True) if name_el else None
        price = price_el.get_text(" ", strip=True) if price_el else None
        if name:
            items.append(f"{name} {price}".strip() if price else name)
    return "; ".join(items)


def find_place_id(driver, query: str) -> str | None:
    """지도 검색 진입 -> entryIframe(단일 매칭 시 자동 진입) 또는 searchIframe(목록)에서 첫 결과 클릭."""
    driver.get(f"https://map.naver.com/p/search/{query}")

    try:
        iframe = WebDriverWait(driver, 6).until(
            EC.presence_of_element_located((By.ID, "entryIframe"))
        )
    except Exception:
        iframe = None

    if iframe is None:
        # 단일 매칭이 아니라 후보 목록(searchIframe)이 뜬 경우 -> 첫 번째 결과 클릭
        try:
            search_iframe = driver.find_element(By.ID, "searchIframe")
        except Exception:
            return None
        driver.switch_to.frame(search_iframe)
        try:
            first_link = driver.find_element(By.CSS_SELECTOR, "li a")
            driver.execute_script("arguments[0].click();", first_link)
        except Exception:
            driver.switch_to.default_content()
            return None
        time.sleep(1.5)
        driver.switch_to.default_content()
        try:
            iframe = WebDriverWait(driver, 6).until(
                EC.presence_of_element_located((By.ID, "entryIframe"))
            )
        except Exception:
            return None

    src = iframe.get_attribute("src") or ""
    m = re.search(r"/(\d{6,})(?:/|\?|$)", src)
    return m.group(1) if m else None


def scrape_one(driver, place: dict) -> dict:
    row = {"pid": place["pid"], "name": place["name"], "phone": "", "business_hours": "",
           "menu": "", "status": "", "scraped_at": datetime.now(timezone.utc).isoformat()}

    place_id = find_place_id(driver, f"{place['name']} 마포")
    if place_id is None:
        row["status"] = "not_found"
        return row

    # entryIframe 안이 아니라 최상위 문서로 직접 진입 -> iframe 스위칭 불필요, Naver가
    # 카테고리별 실제 경로(restaurant/cafe/...)로 자동 리다이렉트해준다.
    driver.get(f"https://pcmap.place.naver.com/place/{place_id}/home")
    time.sleep(2)
    check_blocked(driver.execute_script("return document.body.innerText") or "")

    soup = BeautifulSoup(driver.page_source, "html.parser")

    addr_text = labeled_value(soup, "주소") or ""
    # "마포구"까지는 25곳 전부 동일해서 도로명(예: "와우산로23길")까지 비교해야 다른 지점과의
    # 오매칭을 잡아낼 수 있다 (예: "츠케루"가 이름만 같은 다른 지점으로 매칭된 사례 있었음)
    expected_road = road_token(place["address"])
    actual_road = road_token(addr_text)
    if expected_road and expected_road != actual_road:
        row["status"] = "mismatch"
        # 그래도 얻을 수 있는 값은 채워서 사람이 나중에 눈으로 확인할 수 있게 남긴다
    else:
        row["status"] = "ok"

    phone_raw = labeled_value(soup, "전화번호") or ""
    phone_match = re.search(r"[\d][\d\-]{6,}\d", phone_raw)
    row["phone"] = phone_match.group(0) if phone_match else ""

    try:
        expand_btn = driver.find_element(
            By.XPATH, "//a[contains(., '펼쳐보기')] | //span[contains(., '펼쳐보기')]"
        )
        driver.execute_script("arguments[0].click();", expand_btn)
        time.sleep(1)
        soup = BeautifulSoup(driver.page_source, "html.parser")
    except Exception:
        pass
    hours_raw = labeled_value(soup, "영업시간") or ""
    # "접기"/"펼쳐보기"(토글 버튼) 및 "영업시간 수정 제안하기"(편집 제안 링크)는 UI 텍스트라 제거
    hours_raw = re.split(r"\s*(?:접기|펼쳐보기)\s*영업시간 수정 제안하기", hours_raw)[0]
    row["business_hours"] = hours_raw.strip()

    try:
        driver.get(f"https://pcmap.place.naver.com/place/{place_id}/menu/list")
        time.sleep(2)
        check_blocked(driver.execute_script("return document.body.innerText") or "")
        menu_soup = BeautifulSoup(driver.page_source, "html.parser")
        row["menu"] = extract_menu(menu_soup) or extract_fee_table(menu_soup)
    except BlockedError:
        raise
    except Exception:
        pass  # 메뉴 탭이 없는 업종(갤러리/전시관 등) -> 빈 값 유지

    return row


def main() -> None:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    is_new = not OUT_CSV.exists()

    driver = webdriver.Chrome()
    driver.maximize_window()

    with open(OUT_CSV, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        if is_new:
            writer.writeheader()
            f.flush()

        try:
            for i, place in enumerate(PLACES_TO_SCRAPE, 1):
                print(f"[{i}/{len(PLACES_TO_SCRAPE)}] {place['name']}")
                try:
                    row = scrape_one(driver, place)
                except BlockedError as e:
                    print(f"  차단 감지 -> 즉시 중단: {e}")
                    writer.writerow({"pid": place["pid"], "name": place["name"], "phone": "",
                                      "business_hours": "", "menu": "", "status": "blocked",
                                      "scraped_at": datetime.now(timezone.utc).isoformat()})
                    f.flush()
                    break

                writer.writerow(row)
                f.flush()
                print(f"  -> {row['status']} | phone={row['phone']!r} | hours={row['business_hours'][:40]!r}")

                if i < len(PLACES_TO_SCRAPE):
                    time.sleep(random.uniform(5, 15))
        finally:
            driver.quit()

    print(f"완료. 결과: {OUT_CSV}")


if __name__ == "__main__":
    main()
