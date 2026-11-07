"""Generate a seeded synthetic person level table in the IBM HR Analytics mold.

Writes data/mock/ibm_hr.csv with roughly 1000 to 1500 rows (default 1200) for
the Attrition FC backup game, then feeds scripts/build_players.py. Run from
the repository root:

    uv run python -m scripts.generate_mock_ibm_hr [--seed 20261107] [--rows 1200]

Every row is synthetic. The file opens with a header comment that says so and
data/mock/README.md repeats the disclaimer. No real employee records are used
or implied.

COLUMN DESIGN (IBM HR Analytics Employee Attrition dataset mold)

* EmployeeNumber: sequential row id starting at 1001, the provenance rowId.
* Age, DistanceFromHome, YearsAtCompany, TrainingTimesLastYear: skewed
  integer draws, YearsAtCompany never exceeds Age minus 18.
* Department: Research and Development, Sales, Human Resources.
* JobSatisfaction, EnvironmentSatisfaction: 1 to 4, PerformanceRating 3 or 4.
* OverTime: "Yes" for about 28 percent of people.
* MonthlyIncome: department base plus tenure and age premiums with noise.
* Attrition: "Yes" for about 16 percent overall. The probability rises by
  roughly 16 points for OverTime people and by smaller amounts for low
  satisfaction, short tenure, and low income, so OverTime correlates with
  Attrition the way the real dataset does.
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date
from pathlib import Path
from typing import Sequence

import numpy as np

from scripts.pipeline_lib import REPO_ROOT, rel_to_root

DEFAULT_SEED: int = 20261107
DEFAULT_ROWS: int = 1200
DEFAULT_OUT: Path = REPO_ROOT / "data" / "mock" / "ibm_hr.csv"
FIRST_EMPLOYEE_NUMBER: int = 1001

DEPARTMENTS: tuple[str, ...] = ("Research & Development", "Sales", "Human Resources")
DEPARTMENT_WEIGHTS: tuple[float, ...] = (0.55, 0.30, 0.15)
DEPARTMENT_INCOME_BASE: dict[str, float] = {
    "Research & Development": 6500.0,
    "Sales": 7000.0,
    "Human Resources": 5800.0,
}

SATISFACTION_WEIGHTS: tuple[float, ...] = (0.10, 0.30, 0.35, 0.25)
TRAINING_WEIGHTS: tuple[float, ...] = (0.05, 0.12, 0.30, 0.25, 0.15, 0.08, 0.05)

OVERTIME_SHARE: float = 0.28
ATTRITION_BASE_PROBABILITY: float = 0.062
ATTRITION_OVERTIME_BONUS: float = 0.16
TARGET_ATTRITION_RATE: float = 0.16

CSV_COLUMNS: tuple[str, ...] = (
    "EmployeeNumber",
    "Age",
    "Department",
    "DistanceFromHome",
    "JobSatisfaction",
    "EnvironmentSatisfaction",
    "OverTime",
    "YearsAtCompany",
    "MonthlyIncome",
    "PerformanceRating",
    "TrainingTimesLastYear",
    "Attrition",
)


def attrition_probability(
    over_time: bool,
    job_satisfaction: int,
    environment_satisfaction: int,
    years_at_company: int,
    monthly_income: float,
) -> float:
    """Compute the per person attrition probability with OverTime as the dominant driver."""
    probability = ATTRITION_BASE_PROBABILITY
    if over_time:
        probability += ATTRITION_OVERTIME_BONUS
    if job_satisfaction <= 2:
        probability += 0.04
    if environment_satisfaction <= 2:
        probability += 0.03
    if years_at_company <= 2:
        probability += 0.07
    if years_at_company >= 8:
        probability -= 0.04
    if monthly_income < 4500:
        probability += 0.04
    return float(np.clip(probability, 0.02, 0.65))


def generate_rows(rng: np.random.Generator, row_count: int) -> list[dict[str, object]]:
    """Draw one synthetic person dict per row (deterministic for a given seed)."""
    people: list[dict[str, object]] = []
    for offset in range(row_count):
        age = int(np.clip(round(float(rng.normal(34.0, 9.0))), 18, 60))
        max_tenure = age - 18
        years_at_company = min(max_tenure, int(rng.exponential(4.0)))
        distance = int(np.clip(round(float(rng.exponential(4.0)) + 1.0), 1, 29))
        job_satisfaction = int(rng.choice((1, 2, 3, 4), p=SATISFACTION_WEIGHTS))
        environment_satisfaction = int(rng.choice((1, 2, 3, 4), p=SATISFACTION_WEIGHTS))
        over_time = bool(rng.random() < OVERTIME_SHARE)
        department = str(rng.choice(DEPARTMENTS, p=DEPARTMENT_WEIGHTS))
        income = (
            DEPARTMENT_INCOME_BASE[department]
            + 95.0 * years_at_company
            + 35.0 * max(age - 25, 0)
            + float(rng.normal(0.0, 900.0))
        )
        monthly_income = float(np.clip(round(income), 2000, 25000))
        performance_rating = 3 if rng.random() < 0.72 else 4
        training_times = int(rng.choice((0, 1, 2, 3, 4, 5, 6), p=TRAINING_WEIGHTS))
        probability = attrition_probability(
            over_time, job_satisfaction, environment_satisfaction, years_at_company, monthly_income
        )
        attrition = bool(rng.random() < probability)
        people.append(
            {
                "EmployeeNumber": FIRST_EMPLOYEE_NUMBER + offset,
                "Age": age,
                "Department": department,
                "DistanceFromHome": distance,
                "JobSatisfaction": job_satisfaction,
                "EnvironmentSatisfaction": environment_satisfaction,
                "OverTime": "Yes" if over_time else "No",
                "YearsAtCompany": years_at_company,
                "MonthlyIncome": int(monthly_income),
                "PerformanceRating": performance_rating,
                "TrainingTimesLastYear": training_times,
                "Attrition": "Yes" if attrition else "No",
            }
        )
    return people


def write_csv(path: Path, people: Sequence[dict[str, object]], seed: int) -> None:
    """Write the CSV with a synthetic data header comment first."""
    path.parent.mkdir(parents=True, exist_ok=True)
    generated_on = date.today().isoformat()
    with path.open("w", newline="", encoding="utf-8") as handle:
        handle.write(
            f"# SYNTHETIC DATA: generated by scripts/generate_mock_ibm_hr.py "
            f"(seed={seed}, rows={len(people)}, generated={generated_on}). "
            f"IBM HR Analytics mold for offline testing, not real employee records.\n"
        )
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(CSV_COLUMNS)
        for person in people:
            writer.writerow([person[column] for column in CSV_COLUMNS])


def main(argv: Sequence[str] | None = None) -> int:
    """Parse CLI arguments, generate the table, and print the seed log."""
    parser = argparse.ArgumentParser(description="Generate the synthetic IBM HR style table")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="numpy random seed")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS, help="row count (about 1000 to 1500)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output CSV path")
    args = parser.parse_args(argv)

    if args.rows < 1:
        print("error: --rows must be positive", file=sys.stderr)
        return 1
    if not 1000 <= args.rows <= 1500:
        print(f"note: rows={args.rows} is outside the recommended 1000 to 1500 range")

    rng = np.random.default_rng(args.seed)
    people = generate_rows(rng, args.rows)
    write_csv(args.out, people, args.seed)

    attrition_yes = sum(1 for person in people if person["Attrition"] == "Yes")
    overtime_people = [person for person in people if person["OverTime"] == "Yes"]
    overtime_attrition = sum(1 for person in overtime_people if person["Attrition"] == "Yes")
    regular_people = [person for person in people if person["OverTime"] == "No"]
    regular_attrition = sum(1 for person in regular_people if person["Attrition"] == "Yes")
    attrition_rate = attrition_yes / len(people)
    overtime_rate = overtime_attrition / len(overtime_people) if overtime_people else 0.0
    regular_rate = regular_attrition / len(regular_people) if regular_people else 0.0

    print("generate_mock_ibm_hr summary")
    print(f"  seed={args.seed} (logged in the CSV header comment)")
    print(f"  rows: {len(people)} (recommended 1000 to 1500)")
    print(f"  attrition rate: {attrition_rate:.1%} (target around {TARGET_ATTRITION_RATE:.0%})")
    print(
        f"  OverTime share: {len(overtime_people) / len(people):.1%} "
        f"(attrition {overtime_rate:.1%} with OverTime vs {regular_rate:.1%} without)"
    )
    print(f"  wrote {rel_to_root(args.out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
