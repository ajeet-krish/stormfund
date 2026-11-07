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

RunwayState = Literal["finite", "no_shortfall", "buffer_depleted"]

# The 120 month cap expressed in tenths of a month.
RUNWAY_CAP_DECI_MONTHS: int = 1200


@dataclass(frozen=True)
class Runway:
    """One runway answer: a state label plus tenths of a month."""

    state: RunwayState
    deci_months: int


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
