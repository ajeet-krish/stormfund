"""Pytest suite for the E4 plan engine twin, scripts/engine/plans.py.

Asserts the frozen scripts/engine/golden_plans.json: the five fixture
accounts under the standard COMBO twist (job loss, EI at 55 percent,
bills plus 15 percent, no one off cost) with visible workings, plus the
twist independent goal block. The construction mirrors
src/lib/planMath.golden.test.ts, so a rule change in either language
fails on its own side instead of drifting across the twin.

Beyond the golden file, the suite carries the mirrored unit cases from
src/lib/planMath.test.ts: hand computed goal goldens for the three
fixture accounts, lever availability in ladder order, the defensive
clamps, monotonic gains, cumulative composition (the last step equals
one runway run over the summed effects), and the backup horizon
branches. Every +N months figure is asserted as a difference of two
shocks.runway answers, never a formula of its own.

Run from the repository root:

    uv run pytest scripts/engine/test_plans.py
"""

from __future__ import annotations

import itertools
import json
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import pytest

from scripts.engine import plans, verify
from scripts.engine.metrics import round_half_up
from scripts.engine.shocks import Runway, runway, scale_cents

GOLDEN_PLANS_PATH: Path = Path(__file__).with_name("golden_plans.json")
FIXTURES_PATH: Path = Path(__file__).with_name("golden_fixtures.json")

# The int8 state codes backup_plans reads: 0 is the depleted buffer
# (always a full horizon short), 1 is no shortfall (always survives),
# and 2 is numeric (survives at or beyond the horizon).
STATE_CODES: dict[str, int] = {
    "buffer_depleted": 0,
    "no_shortfall": 1,
    "finite": 2,
}

# The standard COMBO twist, pinned field by field against the golden file.
COMBO_TWIST: dict[str, Any] = {
    "job_loss": True,
    "income_factor_pct": 55,
    "bills_delta_pct": 15,
    "one_off_months_tenths": 0,
    "extra_monthly_cents": 0,
    "duration_months": 6,
}

# The five frozen accounts in fixture file order.
GOLDEN_ACCOUNT_IDS: tuple[str, ...] = ("68257", "23838", "49900", "98952", "42988")


@pytest.fixture(scope="session")
def golden() -> dict[str, Any]:
    """The frozen plan golden document."""
    return json.loads(GOLDEN_PLANS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def golden_fixtures() -> dict[str, Any]:
    """The frozen fixture metric document."""
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def fixture_of(doc: dict[str, Any], account_id: str) -> dict[str, Any]:
    """One fixture entry by account id, failing loudly when missing."""
    for entry in doc["fixtures"]:
        if entry["account_id"] == account_id:
            return entry
    raise AssertionError(f"missing golden fixture {account_id}")


def apply_twist(profile: dict[str, Any], twist: dict[str, Any]) -> dict[str, Any]:
    """One twist applied to one profile, mirroring src/lib/shocks.ts.

    Integer cents only: income scales by the EI percent when the job is
    lost, bills delta scales household bills, the one off cost is
    round_half_up(spending x tenths, 10) and subtracts from the buffer
    only, and the runway re runs over the profile buffer with that one
    off cost.
    """
    income = int(profile["income_cents"])
    if twist["job_loss"]:
        income = scale_cents(income, int(twist["income_factor_pct"]))
    bills_delta = scale_cents(
        int(profile["household_bills_cents"]), int(twist["bills_delta_pct"])
    )
    spending = int(profile["spending_cents"]) + bills_delta + int(
        twist["extra_monthly_cents"]
    )
    one_off = round_half_up(
        int(profile["spending_cents"]) * int(twist["one_off_months_tenths"]), 10
    )
    buffer_left = int(profile["buffer_cents"]) - one_off
    answer = runway(int(profile["buffer_cents"]), one_off, income, spending)
    return {
        "income_cents": income,
        "spending_cents": spending,
        "one_off_cents": one_off,
        "buffer_left_cents": buffer_left,
        "runway": answer,
    }


def lever_kwargs(profile: dict[str, Any], shocked: dict[str, Any]) -> dict[str, int]:
    """lever_ladder inputs: shocked numbers from the twist, lever sizes
    from the profile metrics (never from the shocked ones)."""
    return {
        "shocked_income_cents": int(shocked["income_cents"]),
        "shocked_spending_cents": int(shocked["spending_cents"]),
        "one_off_cents": int(shocked["one_off_cents"]),
        "buffer_cents": int(profile["buffer_cents"]),
        "fixed_costs_cents": int(profile["fixed_costs_cents"]),
        "loan_payment_cents": int(profile["loan_payment_cents"]),
        "insurance_cents": int(profile["insurance_cents"]),
        "typical_spending_cents": int(profile["spending_cents"]),
    }


def combo_ladder_kwargs(profile: dict[str, Any]) -> dict[str, int]:
    """The lever inputs one fixture gets under the standard COMBO twist."""
    return lever_kwargs(profile, apply_twist(profile, COMBO_TWIST))


# ============================================================
# The synthetic golden ladder and base inputs, mirrored from
# src/lib/planMath.test.ts so both twins assert one hand computation.
# ============================================================
SYNTHETIC_LADDER: dict[str, int] = {
    "shocked_income_cents": 300_000,
    "shocked_spending_cents": 400_000,
    "one_off_cents": 0,
    "buffer_cents": 2_000_000,
    "fixed_costs_cents": 200_000,
    "loan_payment_cents": 50_000,
    "insurance_cents": 30_000,
    "typical_spending_cents": 400_000,
}

AVAILABILITY_BASE: dict[str, int] = {
    "shocked_income_cents": 300_000,
    "shocked_spending_cents": 400_000,
    "one_off_cents": 0,
    "buffer_cents": 2_000_000,
    "fixed_costs_cents": 200_000,
    "loan_payment_cents": 0,
    "insurance_cents": 0,
    "typical_spending_cents": 200_000,
}


# ============================================================
# Golden file structure and the frozen twist.
# ============================================================

def test_golden_file_ships_the_five_accounts_in_fixture_order(
    golden: dict[str, Any],
) -> None:
    """The frozen plan ids appear in fixture file order."""
    assert tuple(plan["account_id"] for plan in golden["plans"]) == GOLDEN_ACCOUNT_IDS


def test_golden_twist_is_the_standard_combo_twist(golden: dict[str, Any]) -> None:
    """The frozen twist pins the shipped combo preset field by field."""
    assert golden["twist"] == COMBO_TWIST
    assert golden["twist"]["duration_months"] == plans.BACKUP_HORIZON_MONTHS


# ============================================================
# Shocked numbers under the frozen twist.
# ============================================================

def test_shocked_numbers_match_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Every shocked income, spending, one off, buffer, and runway."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        shocked = apply_twist(profile, golden["twist"])
        want = plan["expected"]["shocked"]
        assert shocked["income_cents"] == want["income_cents"], account
        assert shocked["spending_cents"] == want["spending_cents"], account
        assert shocked["one_off_cents"] == want["one_off_cents"], account
        assert shocked["buffer_left_cents"] == want["buffer_left_cents"], account
        assert shocked["runway"].state == want["runway_state"], account
        assert shocked["runway"].deci_months == want["runway_deci_months"], account


# ============================================================
# Lever ladder against the golden file.
# ============================================================

def test_ladder_baseline_equals_the_shocked_runway(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """The ladder baseline is the shocked runway, never a second opinion."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        shocked = apply_twist(profile, golden["twist"])
        ladder = plans.lever_ladder(**lever_kwargs(profile, shocked))
        assert ladder["baseline_state"] == shocked["runway"].state, account
        assert ladder["baseline_deci_months"] == shocked["runway"].deci_months, account
        expected = plan["expected"]["ladder"]
        assert ladder["baseline_state"] == expected["baseline_state"], account
        assert ladder["baseline_deci_months"] == expected["baseline_deci_months"], account


def test_ladder_steps_match_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Every step id, effect, runway, plus, and step to the tenth."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        shocked = apply_twist(profile, golden["twist"])
        ladder = plans.lever_ladder(**lever_kwargs(profile, shocked))
        expected_steps = plan["expected"]["ladder"]["steps"]
        assert len(ladder["steps"]) == len(expected_steps), account

        for index, (step, want) in enumerate(zip(ladder["steps"], expected_steps)):
            where = f"{account} step {index}"
            assert step["id"] == want["id"], where
            assert step["label"] == plans.LEVER_LABELS[want["id"]], where
            assert step["caveat"] == plans.LEVER_CAVEATS[want["id"]], where
            assert step["spending_delta_cents"] == want["spending_delta_cents"], where
            assert step["spending_after_cents"] == want["spending_after_cents"], where
            assert step["state"] == want["state"], where
            assert step["deci_months"] == want["deci_months"], where
            assert step["plus_deci_months"] == want["plus_deci_months"], where
            assert step["step_deci_months"] == want["step_deci_months"], where
            assert step["income_after_cents"] == shocked["income_cents"], where
            assert step["buffer_left_cents"] == shocked["buffer_left_cents"], where


def test_insurance_lever_never_fires_on_fixtures(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Fixture insurance is 0, so shop_insurance never appears."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        assert profile["insurance_cents"] == 0, account
        shocked = apply_twist(profile, golden["twist"])
        ladder = plans.lever_ladder(**lever_kwargs(profile, shocked))
        ids = [step["id"] for step in ladder["steps"]]
        assert "shop_insurance" not in ids, account


def test_golden_steps_never_trip_the_spending_floor(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Raw running sums stay non negative, so the guard is unreachable."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        kwargs = combo_ladder_kwargs(profile)
        ladder = plans.lever_ladder(**kwargs)
        running = kwargs["shocked_spending_cents"]
        for step in ladder["steps"]:
            running += step["spending_delta_cents"]
            assert running >= 0, account
            assert step["spending_after_cents"] == running, account


def test_lever_sizes_come_from_profile_numbers() -> None:
    """The shocked spending never sizes a lever, only profile metrics."""
    smaller = plans.lever_ladder(**{**SYNTHETIC_LADDER, "shocked_spending_cents": 400_000})
    larger = plans.lever_ladder(**{**SYNTHETIC_LADDER, "shocked_spending_cents": 999_999})
    deltas_small = [step["spending_delta_cents"] for step in smaller["steps"]]
    deltas_large = [step["spending_delta_cents"] for step in larger["steps"]]
    assert deltas_small == deltas_large == [-30_000, -150_000, -50_000]


# ============================================================
# Backup verdicts against the golden file and the horizon branches.
# ============================================================

def test_backup_verdicts_match_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """The floor, the survival flag, and the shortfall per account."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        shocked = apply_twist(profile, golden["twist"])
        result = plans.backup_plans(
            np.array([profile["fixed_costs_cents"]], dtype="int64"),
            np.array([profile["loan_payment_cents"]], dtype="int64"),
            np.array([STATE_CODES[shocked["runway"].state]], dtype="int8"),
            np.array([shocked["runway"].deci_months], dtype="int64"),
        )
        want = plan["expected"]["backup"]
        assert int(result["cutFloor"][0]) == want["cut_floor_cents"], account
        assert bool(result["survives"][0]) is want["survives"], account
        assert int(result["shortfallTenths"][0]) == want["shortfall_deci_months"], (
            account
        )


def test_backup_plans_horizon_branches() -> None:
    """The four runway states judged against the 6 month horizon."""
    fixed = np.array([150_000, 150_000, 150_000, 150_000], dtype="int64")
    loan = np.array([50_000, 50_000, 50_000, 50_000], dtype="int64")
    state = np.array(
        [
            STATE_CODES["finite"],
            STATE_CODES["finite"],
            STATE_CODES["no_shortfall"],
            STATE_CODES["buffer_depleted"],
        ],
        dtype="int8",
    )
    tenths = np.array([45, 60, 1200, 0], dtype="int64")
    result = plans.backup_plans(fixed, loan, state, tenths)
    # finite 45 falls 15 tenths under the horizon of 60.
    assert bool(result["survives"][0]) is False
    assert int(result["shortfallTenths"][0]) == 15
    # exactly the horizon survives with no shortfall.
    assert bool(result["survives"][1]) is True
    assert int(result["shortfallTenths"][1]) == 0
    # no shortfall always survives.
    assert bool(result["survives"][2]) is True
    assert int(result["shortfallTenths"][2]) == 0
    # a depleted buffer is always a full horizon short.
    assert bool(result["survives"][3]) is False
    assert int(result["shortfallTenths"][3]) == 60
    # the cut floor names F plus P on every row.
    assert list(result["cutFloor"]) == [200_000, 200_000, 200_000, 200_000]


def test_backup_plans_accepts_a_caller_horizon() -> None:
    """A 3 month horizon judges tenths against 30 instead of 60."""
    result = plans.backup_plans(
        np.array([100_000], dtype="int64"),
        np.array([0], dtype="int64"),
        np.array([STATE_CODES["finite"]], dtype="int8"),
        np.array([30], dtype="int64"),
        horizon_months=3,
    )
    assert bool(result["survives"][0]) is True
    assert int(result["shortfallTenths"][0]) == 0


# ============================================================
# Goal block, status words, and milestone chips against the golden file.
# ============================================================

def _golden_goal_inputs(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
    """Fixture incomes, spendings, and the golden goal rows in plan order."""
    incomes: list[int] = []
    spendings: list[int] = []
    rows: list[dict[str, Any]] = []
    for plan in golden["plans"]:
        profile = fixture_of(golden_fixtures, plan["account_id"])["expected"]
        incomes.append(int(profile["income_cents"]))
        spendings.append(int(profile["spending_cents"]))
        rows.append(plan["expected"]["goal"])
    return (
        np.array(incomes, dtype="int64"),
        np.array(spendings, dtype="int64"),
        rows,
    )


def test_goal_block_matches_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Target, contribution, months, and cut for the five accounts."""
    incomes, spendings, rows = _golden_goal_inputs(golden, golden_fixtures)
    result = plans.goal_plans(incomes, spendings)
    for index, want in enumerate(rows):
        account = golden["plans"][index]["account_id"]
        assert int(result["target"][index]) == want["target_cents"], account
        assert int(result["contribution"][index]) == want["contribution_cents"], account
        assert int(result["months"][index]) == want["months"], account
        assert int(result["cut"][index]) == want["cut_cents"], account


def test_goal_status_words_match_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """needs income, cut needed, or on track, one word per account."""
    incomes, spendings, rows = _golden_goal_inputs(golden, golden_fixtures)
    result = plans.goal_plans(incomes, spendings)
    status = plans.goal_status(incomes, result["contribution"], result["cut"])
    for index, want in enumerate(rows):
        account = golden["plans"][index]["account_id"]
        assert str(status[index]) == want["status"], account


def test_milestone_chips_match_the_golden_file(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """Every chip amount and reach month, 1, 2, 3, and 6 months of spending."""
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        chips = plans.goal_milestones(
            int(profile["income_cents"]), int(profile["spending_cents"])
        )
        want_rows = plan["expected"]["goal"]["milestones"]
        assert len(chips) == len(want_rows), account
        for chip, want in zip(chips, want_rows):
            assert chip["months_of_spending"] == want["months_of_spending"], account
            assert chip["amount_cents"] == want["amount_cents"], account
            assert chip["months_to_reach"] == want["months_to_reach"], account


def test_three_month_chip_equals_the_goal_months(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> None:
    """The E2 invariant: the goal chip month count is the goal month count."""
    incomes, spendings, _ = _golden_goal_inputs(golden, golden_fixtures)
    result = plans.goal_plans(incomes, spendings)
    for index, plan in enumerate(golden["plans"]):
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        chips = plans.goal_milestones(
            int(profile["income_cents"]), int(profile["spending_cents"])
        )
        goal_chip = next(chip for chip in chips if chip["is_goal"])
        assert goal_chip["months_of_spending"] == plans.GOAL_TARGET_MONTHS, account
        assert goal_chip["months_to_reach"] == int(result["months"][index]), account


# ============================================================
# Hand computed goal goldens, the E2 style fixture accounts mirrored
# from src/lib/planMath.test.ts.
# ============================================================
# Account A, the surplus saver: I 400000, S 250000, target 750000,
# floor 20000, contribution 150000, months 5, no cut, on track.
# Account B, the monthly deficit: I 300000, S 320000, target 960000,
# floor 15000, contribution 15000, months 64, cut 35000, cut needed.
# Account C, no income: I 0, S 200000, target 600000, contribution 0,
# months and cut both sentinels, needs income.
GOAL_ACCOUNT_IDS: tuple[int, ...] = (400_000, 300_000, 0)
GOAL_ACCOUNT_SPENDING: tuple[int, ...] = (250_000, 320_000, 200_000)


def test_goal_plans_hand_computed_fixture_accounts() -> None:
    """The three E2 fixture accounts, exact integer cents end to end."""
    incomes = np.array(GOAL_ACCOUNT_IDS, dtype="int64")
    spendings = np.array(GOAL_ACCOUNT_SPENDING, dtype="int64")
    result = plans.goal_plans(incomes, spendings)
    assert list(result["target"]) == [750_000, 960_000, 600_000]
    assert list(result["contribution"]) == [150_000, 15_000, 0]
    assert list(result["months"]) == [5, 64, plans.MONTHS_UNREACHABLE]
    assert list(result["cut"]) == [0, 35_000, plans.CUT_NOT_APPLICABLE]
    status = plans.goal_status(incomes, result["contribution"], result["cut"])
    assert list(status) == ["on track", "cut needed", "needs income"]


def test_goal_plans_boundaries_and_sentinels() -> None:
    """Ceil division on a whole month, the half up floor tie, and I equal S."""
    incomes = np.array([400_000, 10, 300_000], dtype="int64")
    spendings = np.array([100_000, 20, 300_000], dtype="int64")
    result = plans.goal_plans(incomes, spendings)
    # 300000 over 300000 is 1 month exactly, never 2.
    assert int(result["contribution"][0]) == 300_000
    assert int(result["months"][0]) == 1
    assert int(result["cut"][0]) == 0
    # 5 percent of 10 cents ties at half a cent and rounds away from zero.
    assert int(result["contribution"][1]) == 1
    assert int(result["months"][1]) == 60
    assert int(result["cut"][1]) == 11
    # income equal to spending still needs a cut of exactly the floor.
    assert int(result["contribution"][2]) == 15_000
    assert int(result["months"][2]) == 60
    assert int(result["cut"][2]) == 15_000
    status = plans.goal_status(incomes, result["contribution"], result["cut"])
    assert str(status[2]) == "cut needed"


def test_goal_milestones_hand_computed() -> None:
    """Chips count new savings from zero; no income reports the sentinel."""
    chips = plans.goal_milestones(400_000, 250_000)
    assert [chip["amount_cents"] for chip in chips] == [
        250_000, 500_000, 750_000, 1_500_000,
    ]
    assert [chip["months_to_reach"] for chip in chips] == [2, 4, 5, 10]
    assert [chip["is_goal"] for chip in chips] == [False, False, True, False]
    assert [chip["is_stretch"] for chip in chips] == [False, False, False, True]

    empty = plans.goal_milestones(0, 200_000)
    assert [chip["amount_cents"] for chip in empty] == [
        200_000, 400_000, 600_000, 1_200_000,
    ]
    assert [chip["months_to_reach"] for chip in empty] == [-1, -1, -1, -1]


def test_plan_constants_match_the_documented_contract() -> None:
    """The exported constants, mirroring the TypeScript module exactly."""
    assert plans.GOAL_TARGET_MONTHS == 3
    assert plans.GOAL_STRETCH_MONTHS == 6
    assert plans.GOAL_MILESTONE_MONTHS == (1, 2, 3, 6)
    assert plans.GOAL_CONTRIBUTION_FLOOR_PCT == 5
    assert plans.BACKUP_HORIZON_MONTHS == 6
    assert plans.BACKUP_SCENARIO_LABEL == "job loss, EI at 55 percent for 6 months"
    assert plans.MONTHS_UNREACHABLE == -1
    assert plans.CUT_NOT_APPLICABLE == -1
    assert plans.LEVER_ORDER == (
        "shop_insurance",
        "trim_discretionary",
        "defer_loan",
    )


# ============================================================
# Lever ladder unit goldens: the synthetic all three lever hand
# computation, availability, and the defensive clamps.
# ============================================================

def test_synthetic_ladder_matches_the_hand_computation() -> None:
    """Baseline 200, insurance 286, trim 1200, defer 1200, exact gains."""
    ladder = plans.lever_ladder(**SYNTHETIC_LADDER)
    assert ladder["baseline_state"] == "finite"
    assert ladder["baseline_deci_months"] == 200
    assert len(ladder["steps"]) == 3

    insurance, trim, defer = ladder["steps"]
    assert insurance["id"] == "shop_insurance"
    assert insurance["spending_delta_cents"] == -30_000
    assert insurance["income_after_cents"] == 300_000
    assert insurance["spending_after_cents"] == 370_000
    assert insurance["buffer_left_cents"] == 2_000_000
    assert (insurance["state"], insurance["deci_months"]) == ("finite", 286)
    assert insurance["plus_deci_months"] == 86
    assert insurance["step_deci_months"] == 86

    assert trim["id"] == "trim_discretionary"
    assert trim["spending_delta_cents"] == -150_000
    assert trim["spending_after_cents"] == 220_000
    assert (trim["state"], trim["deci_months"]) == ("no_shortfall", 1200)
    assert trim["plus_deci_months"] == 1000
    assert trim["step_deci_months"] == 914

    assert defer["id"] == "defer_loan"
    assert defer["spending_delta_cents"] == -50_000
    assert defer["spending_after_cents"] == 170_000
    assert (defer["state"], defer["deci_months"]) == ("no_shortfall", 1200)
    assert defer["plus_deci_months"] == 1000
    assert defer["step_deci_months"] == 0


def test_synthetic_ladder_ships_labels_and_caveats() -> None:
    """The exact label and counterfactual caveat each row prints."""
    ladder = plans.lever_ladder(**SYNTHETIC_LADDER)
    assert [step["label"] for step in ladder["steps"]] == [
        "Shop insurance",
        "Trim discretionary",
        "Defer loan",
    ]
    assert [step["caveat"] for step in ladder["steps"]] == [
        "simulated counterfactual: premiums re-shopped, upper bound of renegotiation",
        "simulated counterfactual: all discretionary spending above the fixed cost floor trimmed",
        "simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled",
    ]


def test_lever_availability_matrix_in_ladder_order() -> None:
    """Free moves first; each lever appears only when its input allows."""
    matrix: list[tuple[str, dict[str, int], list[str]]] = [
        ("nothing available", {}, []),
        ("insurance only", {"insurance_cents": 30_000}, ["shop_insurance"]),
        (
            "discretionary only",
            {"typical_spending_cents": 400_000},
            ["trim_discretionary"],
        ),
        ("loan only, floor eats the disc", {"loan_payment_cents": 50_000}, ["defer_loan"]),
        (
            "all three, free moves first",
            {
                "insurance_cents": 30_000,
                "typical_spending_cents": 400_000,
                "loan_payment_cents": 50_000,
            },
            ["shop_insurance", "trim_discretionary", "defer_loan"],
        ),
    ]
    for name, overrides, expected_ids in matrix:
        ladder = plans.lever_ladder(**{**AVAILABILITY_BASE, **overrides})
        assert [step["id"] for step in ladder["steps"]] == expected_ids, name


def test_trim_dropped_when_spending_sits_under_the_floor() -> None:
    """S 200000 under F 200000 plus P 50000 leaves no discretionary room."""
    ladder = plans.lever_ladder(
        **{**AVAILABILITY_BASE, "loan_payment_cents": 50_000}
    )
    assert [step["id"] for step in ladder["steps"]] == ["defer_loan"]


def test_negative_buffer_keeps_every_step_depleted() -> None:
    """A depleted buffer reports zero gain for every honest lever."""
    ladder = plans.lever_ladder(
        **{
            **AVAILABILITY_BASE,
            "buffer_cents": -73_269,
            "insurance_cents": 30_000,
            "typical_spending_cents": 400_000,
            "loan_payment_cents": 50_000,
        }
    )
    assert ladder["baseline_state"] == "buffer_depleted"
    assert ladder["baseline_deci_months"] == 0
    assert len(ladder["steps"]) == 3
    for step in ladder["steps"]:
        assert (step["state"], step["deci_months"]) == ("buffer_depleted", 0)
        assert step["plus_deci_months"] == 0
        assert step["step_deci_months"] == 0
        assert step["buffer_left_cents"] < 0
    assert ladder["steps"][-1]["spending_after_cents"] == 170_000


def test_spending_floor_clamps_the_running_total_at_zero() -> None:
    """The max(0, ...) guard fires when lever sizes exceed shocked spending."""
    ladder = plans.lever_ladder(
        shocked_income_cents=5_000,
        shocked_spending_cents=1_000,
        one_off_cents=0,
        buffer_cents=100_000,
        fixed_costs_cents=200_000,
        loan_payment_cents=0,
        insurance_cents=30_000,
        typical_spending_cents=400_000,
    )
    assert [step["id"] for step in ladder["steps"]] == [
        "shop_insurance",
        "trim_discretionary",
    ]
    for step in ladder["steps"]:
        assert step["spending_after_cents"] == 0
    # The deltas still size from the profile, never from the floored total.
    assert ladder["steps"][0]["spending_delta_cents"] == -30_000
    assert ladder["steps"][1]["spending_delta_cents"] == -200_000


# ============================================================
# E4 invariants over the fixtures and a wide integer grid: monotonic
# gains, cumulative composition, and +N as a difference of two runway
# answers.
# ============================================================

GRID_INCOMES: tuple[int, ...] = (0, 1, 999, 100_000, 300_000)
GRID_SPENDINGS: tuple[int, ...] = (0, 500, 999, 400_000)
GRID_BUFFERS: tuple[int, ...] = (-100, 0, 1, 5_000, 2_000_000)
GRID_FIXEDS: tuple[int, ...] = (0, 50_000, 200_000)
GRID_LOANS: tuple[int, ...] = (0, 50_000)
GRID_INSURANCES: tuple[int, ...] = (0, 30_000)
GRID_TYPICALS: tuple[int, ...] = (0, 250_000, 400_000)
GRID_ONE_OFFS: tuple[int, ...] = (0, 1_000)
GRID_SIZE: int = 7_200


def _grid_ladders() -> list[tuple[str, dict[str, int], dict[str, Any]]]:
    """The five fixture ladders under COMBO plus the full integer grid."""
    rows: list[tuple[str, dict[str, int], dict[str, Any]]] = []
    for income in GRID_INCOMES:
        for spending in GRID_SPENDINGS:
            for buffer in GRID_BUFFERS:
                for fixed in GRID_FIXEDS:
                    for loan in GRID_LOANS:
                        for insurance in GRID_INSURANCES:
                            for typical in GRID_TYPICALS:
                                for one_off in GRID_ONE_OFFS:
                                    kwargs = {
                                        "shocked_income_cents": income,
                                        "shocked_spending_cents": spending,
                                        "one_off_cents": one_off,
                                        "buffer_cents": buffer,
                                        "fixed_costs_cents": fixed,
                                        "loan_payment_cents": loan,
                                        "insurance_cents": insurance,
                                        "typical_spending_cents": typical,
                                    }
                                    rows.append(
                                        ("grid", kwargs, plans.lever_ladder(**kwargs))
                                    )
    return rows


@pytest.fixture(scope="module")
def ladders(
    golden: dict[str, Any], golden_fixtures: dict[str, Any]
) -> list[tuple[str, dict[str, int], dict[str, Any]]]:
    """Fixture ladders under COMBO first, then the integer grid."""
    rows: list[tuple[str, dict[str, int], dict[str, Any]]] = []
    for plan in golden["plans"]:
        account = plan["account_id"]
        profile = fixture_of(golden_fixtures, account)["expected"]
        kwargs = combo_ladder_kwargs(profile)
        rows.append((account, kwargs, plans.lever_ladder(**kwargs)))
    rows.extend(_grid_ladders())
    return rows


def test_grid_covers_the_fixtures_and_the_integer_grid(
    ladders: list[tuple[str, dict[str, int], dict[str, Any]]]
) -> None:
    """Five fixtures plus the full product grid, sized like the twin."""
    expected = len(GOLDEN_ACCOUNT_IDS) + GRID_SIZE
    product = (
        len(GRID_INCOMES)
        * len(GRID_SPENDINGS)
        * len(GRID_BUFFERS)
        * len(GRID_FIXEDS)
        * len(GRID_LOANS)
        * len(GRID_INSURANCES)
        * len(GRID_TYPICALS)
        * len(GRID_ONE_OFFS)
    )
    assert product == GRID_SIZE
    assert len(ladders) == expected


def test_gains_are_never_negative_and_the_runway_never_lowers(
    ladders: list[tuple[str, dict[str, int], dict[str, Any]]]
) -> None:
    """Every step only adds months and only lowers spending."""
    for name, kwargs, ladder in ladders:
        previous_spending = kwargs["shocked_spending_cents"]
        for step in ladder["steps"]:
            where = f"{name} {step['id']}"
            assert step["plus_deci_months"] >= 0, where
            assert step["step_deci_months"] >= 0, where
            assert step["deci_months"] >= ladder["baseline_deci_months"], where
            assert step["spending_after_cents"] <= previous_spending, where
            assert step["income_after_cents"] == kwargs["shocked_income_cents"], where
            assert (
                step["buffer_left_cents"]
                == kwargs["buffer_cents"] - kwargs["one_off_cents"]
            ), where
            previous_spending = step["spending_after_cents"]


def test_last_step_equals_one_runway_over_the_summed_effects(
    ladders: list[tuple[str, dict[str, int], dict[str, Any]]]
) -> None:
    """Cumulative composition: summed deltas land on the same runway."""
    for name, kwargs, ladder in ladders:
        total = sum(step["spending_delta_cents"] for step in ladder["steps"])
        final_spending = max(0, kwargs["shocked_spending_cents"] + total)
        if not ladder["steps"]:
            assert final_spending == kwargs["shocked_spending_cents"], name
            continue
        last = ladder["steps"][-1]
        assert last["spending_after_cents"] == final_spending, name
        fresh = runway(
            kwargs["buffer_cents"],
            kwargs["one_off_cents"],
            kwargs["shocked_income_cents"],
            final_spending,
        )
        assert last["state"] == fresh.state, name
        assert last["deci_months"] == fresh.deci_months, name


def test_every_gain_is_a_difference_of_two_runway_answers(
    ladders: list[tuple[str, dict[str, int], dict[str, Any]]]
) -> None:
    """plus and step recompute as fresh runway differences, always."""
    for name, kwargs, ladder in ladders:
        baseline = runway(
            kwargs["buffer_cents"],
            kwargs["one_off_cents"],
            kwargs["shocked_income_cents"],
            kwargs["shocked_spending_cents"],
        )
        assert ladder["baseline_state"] == baseline.state, name
        assert ladder["baseline_deci_months"] == baseline.deci_months, name

        previous = Runway(baseline.state, baseline.deci_months)
        for step in ladder["steps"]:
            where = f"{name} {step['id']}"
            fresh = runway(
                kwargs["buffer_cents"],
                kwargs["one_off_cents"],
                kwargs["shocked_income_cents"],
                step["spending_after_cents"],
            )
            assert step["state"] == fresh.state, where
            assert step["deci_months"] == fresh.deci_months, where
            assert step["plus_deci_months"] == fresh.deci_months - baseline.deci_months, (
                where
            )
            assert step["step_deci_months"] == fresh.deci_months - previous.deci_months, (
                where
            )
            previous = Runway(fresh.state, fresh.deci_months)


# ============================================================
# Content rule: the frozen file prints no dash violations.
# ============================================================

def _iter_strings(value: Any, path: str = "root") -> Iterator[tuple[str, str]]:
    """Yield (json path, string) for every key and string value."""
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            yield child_path, str(key)
            yield from _iter_strings(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _iter_strings(child, f"{path}[{index}]")
    elif isinstance(value, str):
        yield path, value


def test_golden_strings_have_no_dash_violations(golden: dict[str, Any]) -> None:
    """No em dash, en dash, minus sign, double hyphen, or spaced hyphen."""
    problems: list[str] = []
    for path, text in _iter_strings(golden):
        for violation in verify.dash_violations(text):
            problems.append(f"{path}: {violation}")
    assert problems == []
