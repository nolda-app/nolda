"""코스 품질 점검 스크립트(scripts/eval_courses.py --check)의 기준선 판정.
스크립트 자체는 실제 DB·OpenAI가 있어야 돌아가므로 여기서는 판정 함수만 확인한다."""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import eval_courses as E  # noqa: E402

GOOD = Counter(courses=16, taste=12, sec=160)  # 4개 조건 × 코스 4개, 평균 40초


def test_기준을_지키면_통과한다():
    assert E.violations(GOOD, 4) == ([], [])


def test_코스가_모자라거나_영업시간_밖이거나_과다하면_실패한다():
    fails, _ = E.violations(GOOD + Counter(short=1, closed=2, overuse=1, zero_cost=3), 4)
    assert len(fails) == 4
    assert any("4개 미만" in f for f in fails) and any("영업시간 밖" in f for f in fails)


def test_평균_시간이_기준을_넘으면_실패한다():
    fails, _ = E.violations(Counter(courses=16, taste=16, sec=300), 4)  # 평균 75초
    assert fails and "75초" in fails[0]


def test_취향_맞춤_비율이_낮으면_경고만_한다():
    fails, warns = E.violations(Counter(courses=16, taste=4, sec=100), 4)
    assert fails == [] and len(warns) == 1
