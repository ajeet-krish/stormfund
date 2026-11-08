"""The judge runway formula as one pure function in integer cents.

Runway (months) from docs/tangerine-challenge.md, branch order exact:

    buffer_left = B - one_off_costs
    gap         = spending_after_shock - income_after_shock
    if buffer_left <= 0:  state = buffer_depleted, deci_months = 0
    elif gap <= 0:        state = no_shortfall,    deci_months = 1200
    else:                 state = finite, deci_months = half up
                            (10 * buffer_left / gap), capped at 1200

The finite branch is exact integer arithmetic:
deci_months = (20 * buffer_left + gap) // (2 * gap) for positive
operands, which equals ROUND_HALF_UP(10 * buffer_left / gap), then
min(1200). No float can flip a branch or drift between build, verify,
and tests. deci_months is tenths of a month: 1200 means 120 months.

Run from the repository root:

    uv run python -m scripts.engine.build
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from scripts.engine.metrics import round_half_up

RunwayState = Literal["finite", "no_shortfall", "buffer_depleted"]

# The 120 month cap expressed in tenths of a month.
RUNWAY_CAP_DECI_MONTHS: int = 1200


@dataclass(frozen=True)
class Runway:
    """One runway answer: a state label plus tenths of a month."""

    state: RunwayState
    deci_months: int


def scale_cents(base_cents: int | np.ndarray, pct: int) -> int | np.ndarray:
    """A percentage of a base amount in integer cents, rounded half up.

    scale_cents(H, 15) is the 15 percent bills increase the challenge
    doc writes as 0.15 x H, and pct is an integer count of percent (0 to
    100). Scalars follow round_half_up(base * pct, 100) exactly, the
    mirror of scaleCents in src/lib/shocks.ts; numpy arrays apply the
    same rule elementwise so the vectorized goal_plans twin can share
    one rounding definition with the scalar plan functions.
    """
    product = base_cents * pct
    if isinstance(product, np.ndarray):
        sign = np.where(product >= 0, 1, -1)
        magnitude = (np.abs(product) + 50) // 100
        return sign * magnitude
    return round_half_up(int(product), 100)


def runway(
    buffer_cents: int,
    one_off_cents: int,
    income_cents: int,
    spending_cents: int,
) -> Runway:
    """Judge runway for one account, all values integer cents.

    income_cents and spending_cents are the post shock values; the
    baseline runway passes I and S unchanged with one_off_cents = 0.
    """
    buffer_left = buffer_cents - one_off_cents
    gap = spending_cents - income_cents
    if buffer_left <= 0:
        return Runway("buffer_depleted", 0)
    if gap <= 0:
        return Runway("no_shortfall", RUNWAY_CAP_DECI_MONTHS)
    deci_months = (20 * buffer_left + gap) // (2 * gap)
    if deci_months > RUNWAY_CAP_DECI_MONTHS:
        deci_months = RUNWAY_CAP_DECI_MONTHS
    return Runway("finite", deci_months)
