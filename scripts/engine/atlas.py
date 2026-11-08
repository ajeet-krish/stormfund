"""Storm Atlas precompute: public/data/engine/atlas.json.

Called by scripts.engine.build after profiles.json lands:

    uv run python -m scripts.engine.build

The atlas document shades the 77 district cartogram tiles by verdict
band shares. It carries the single five band vocabulary from
src/lib/verdict.ts (critical, storm_warning, watch, fair_skies,
clear), source provenance (path, sha256, rows), every district row
from districts.csv joined to its account count, the account to
district join, and per district counts of the five bands at baseline
plus under each shock preset from src/lib/shockPresets.ts (layoff,
cost_spike, emergency_repair, combo).

Math contract:

* baseline bands map each profile's stored runway answer
  (runway_state plus runway_deci_months as stored in profiles.json)
  through band_for_runway, the port of verdictBand in
  src/lib/verdict.ts;
* scenario bands apply the same twist math as the validated Python
  twin in scripts/engine/shocks.py (scale_cents for the EI and bills
  factors, round_half_up for the one off cost, runway for the shocked
  answer), then band the shocked runway answer with the same helper;
* every district's five counts sum to its account_count, every
  account appears in exactly one district, and every district id in the
  counts exists in the districts block.

Determinism: no timestamps, key order fixed by sorting districts and
accounts numerically and by the canonical band and preset order, so
two consecutive builds are byte identical including atlas.json. The
profiles source entry records the canonical artifact path (not the
build output directory), which keeps tmp directory builds byte
identical to the shipped artifact.

Run from the repository root for a standalone report is not needed;
the build entry point owns writing. See scripts/engine/test_atlas.py
for the artifact contract tests.
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Callable, Mapping

from scripts.engine import load, shocks
from scripts.engine.metrics import round_half_up
from scripts.pipeline_lib import rel_to_root, sha256_file

OUTPUT_NAME: str = "atlas.json"
SCHEMA_VERSION: int = 1
GENERATED_BY: str = "scripts.engine.build"

DISTRICTS_PATH: Path = load.DATA_DIR / "districts.csv"

# Canonical repo relative path of the profiles artifact in the sources
# block, independent of the output directory the build writes to, so
# tmp builds stay byte identical to the shipped atlas.json.
PROFILES_SOURCE_PATH: str = "public/data/engine/profiles.json"

# The five verdict band ids in severity order (lowest runway first),
# verbatim from VERDICT_BANDS in src/lib/verdict.ts. This is the one
# vocabulary on every surface; test_atlas.py pins the order against the
# TS ladder and fails on any drift.
BANDS: tuple[str, ...] = (
    "critical",
    "storm_warning",
    "watch",
    "fair_skies",
    "clear",
)

# One entry per preset id from src/lib/shockPresets.ts, fields copied
# verbatim into the integer form the math uses. durationMonths is
# display only and never enters the math, so it is not carried.
# test_atlas.py re parses shockPresets.ts and fails on any drift.
# incomeFactor 0.55 becomes ei_pct 55, the same rounding applyTwist
# does with Math.round(incomeFactor * 100).
PRESETS: dict[str, dict[str, int | bool]] = {
    "layoff": {
        "job_loss": True,
        "ei_pct": 55,
        "bills_delta_pct": 0,
        "one_off_tenths": 0,
        "extra_monthly_cents": 0,
    },
    "cost_spike": {
        "job_loss": False,
        "ei_pct": 55,
        "bills_delta_pct": 15,
        "one_off_tenths": 0,
        "extra_monthly_cents": 0,
    },
    "emergency_repair": {
        "job_loss": False,
        "ei_pct": 55,
        "bills_delta_pct": 0,
        "one_off_tenths": 10,
        "extra_monthly_cents": 0,
    },
    "combo": {
        "job_loss": True,
        "ei_pct": 55,
        "bills_delta_pct": 15,
        "one_off_tenths": 0,
        "extra_monthly_cents": 0,
    },
}

DISTRICT_COLUMNS: tuple[str, ...] = (
    "district_id",
    "district_name",
    "region",
    "inhabitants",
    "unemployment_rate_2023",
    "average_salary",
)


def empty_counts() -> dict[str, int]:
    """All zero counts in the canonical band order."""
    return {band: 0 for band in BANDS}


def band_for_runway(state: str, deci_months: int) -> str:
    """The verdict band for one runway answer, src/lib/verdict.ts order.

    Pure port of verdictBand: the two special states are decided before
    any threshold, so buffer_depleted always reads critical and
    no_shortfall always reads clear no matter what deci months carry.
    The finite ladder then cuts at 10, 30, 60, and 120 tenths of a
    month, first match wins.
    """
    if state == "buffer_depleted":
        return "critical"
    if state == "no_shortfall":
        return "clear"
    deci = int(deci_months)
    if deci < 10:
        return "critical"
    if deci < 30:
        return "storm_warning"
    if deci < 60:
        return "watch"
    if deci < 120:
        return "fair_skies"
    return "clear"


def band_for_profile(profile: Mapping[str, object]) -> str:
    """The stored runway answer of one profiles.json entry, banded."""
    return band_for_runway(
        str(profile["runway_state"]), int(profile["runway_deci_months"])
    )


def load_account_district(path: Path = load.ACCOUNTS_PATH) -> dict[str, int]:
    """account_id string to district_id int from accounts.csv.

    Keys are strings (the artifact key type) sorted in numeric order.
    One row per account is enforced loudly.
    """
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [
            column
            for column in ("account_id", "district_id")
            if column not in (reader.fieldnames or ())
        ]
        if missing:
            raise load.DataError(
                f"{load.rel_to_root(path)} is missing columns: "
                + ", ".join(missing)
            )
        pairs: dict[str, int] = {}
        for row in reader:
            account_id = str(int(row["account_id"]))
            district_id = int(row["district_id"])
            if account_id in pairs:
                raise load.DataError(
                    f"{load.rel_to_root(path)}: duplicate account {account_id}"
                )
            pairs[account_id] = district_id
    return {key: pairs[key] for key in sorted(pairs, key=int)}


def load_districts(path: Path = DISTRICTS_PATH) -> list[dict[str, object]]:
    """All district rows parsed, sorted by district_id ascending.

    unemployment_rate_2023 and average_salary parse to float or None
    when the cell is empty. no_data is True when any cell of the row is
    missing, which is the district 69 case (its 2022 columns are
    empty); an incomplete district renders as "no data", never as 0.
    """
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [
            column
            for column in DISTRICT_COLUMNS
            if column not in (reader.fieldnames or ())
        ]
        if missing:
            raise load.DataError(
                f"{load.rel_to_root(path)} is missing columns: "
                + ", ".join(missing)
            )
        rows: list[dict[str, object]] = []
        for row in reader:
            no_data = any(
                value is None or str(value).strip() == "" for value in row.values()
            )
            rows.append(
                {
                    "district_id": int(row["district_id"]),
                    "district_name": row["district_name"],
                    "region": row["region"],
                    "inhabitants": int(row["inhabitants"]),
                    "unemployment_rate_2023": _float_or_none(
                        row["unemployment_rate_2023"]
                    ),
                    "average_salary": _float_or_none(row["average_salary"]),
                    "no_data": no_data,
                }
            )
    rows.sort(key=lambda entry: int(entry["district_id"]))  # type: ignore[arg-type]
    ids = [int(entry["district_id"]) for entry in rows]
    if len(ids) != len(set(ids)):
        raise load.DataError(f"{load.rel_to_root(path)}: duplicate district_id")
    return rows


def _float_or_none(text: str | None) -> float | None:
    """Empty cell reads None, otherwise the exact float value."""
    if text is None or str(text).strip() == "":
        return None
    return float(text)


def shocked_band(
    profile: Mapping[str, object], preset: Mapping[str, int | bool]
) -> str:
    """One profile under one preset, through the shocks.py math.

    Mirrors applyTwist in src/lib/shocks.ts: income scales to the EI
    percent only on job loss, bills delta adds to spending, the one off
    cost subtracts from the buffer only, and the runway runs over the
    shocked income and spending. The band helper then reads the shocked
    runway answer, so a preset only ever moves districts along the five
    bands.
    """
    income = int(profile["income_cents"])
    spending = int(profile["spending_cents"])
    buffer_cents = int(profile["buffer_cents"])
    household_bills = int(profile["household_bills_cents"])

    ei_pct = int(preset["ei_pct"])
    income_after = (
        int(shocks.scale_cents(income, ei_pct)) if preset["job_loss"] else income
    )
    bills_delta = int(
        shocks.scale_cents(household_bills, int(preset["bills_delta_pct"]))
    )
    spending_after = (
        spending + bills_delta + int(preset["extra_monthly_cents"])
    )
    one_off = round_half_up(spending * int(preset["one_off_tenths"]), 10)
    answer = shocks.runway(buffer_cents, one_off, income_after, spending_after)
    return band_for_runway(answer.state, answer.deci_months)


def count_bands(
    profiles: Mapping[str, Mapping[str, object]],
    account_district: Mapping[str, int],
    district_ids: set[int],
    band_of: Callable[[Mapping[str, object]], str],
) -> dict[str, dict[str, int]]:
    """Per district band counts for one band view of every profile."""
    counts: dict[str, dict[str, int]] = {
        str(district_id): empty_counts() for district_id in sorted(district_ids)
    }
    for account_id in sorted(profiles, key=int):
        district_id = account_district[account_id]
        band = band_of(profiles[account_id])
        counts[str(district_id)][band] += 1
    return counts


def _check_invariants(
    baseline: Mapping[str, Mapping[str, int]],
    scenarios: Mapping[str, Mapping[str, Mapping[str, int]]],
    district_ids: set[int],
    account_district: Mapping[str, int],
) -> None:
    """Counts sum to account_count and cover exactly the district ids."""
    district_keys = {str(district_id) for district_id in district_ids}
    account_counts = Counter(account_district.values())
    buckets: list[tuple[str, Mapping[str, Mapping[str, int]]]] = [
        ("baseline", baseline),
        *scenarios.items(),
    ]
    for name, bucket in buckets:
        if set(bucket) != district_keys:
            raise load.DataError(
                f"atlas {name}: district keys differ from districts.csv"
            )
        for district_key, counts in bucket.items():
            if set(counts) != set(BANDS):
                raise load.DataError(
                    f"atlas {name} district {district_key}: band keys "
                    "differ from the five verdict bands"
                )
            total = sum(counts.values())
            expected = account_counts[int(district_key)]
            if total != expected:
                raise load.DataError(
                    f"atlas {name} district {district_key}: counts sum to "
                    f"{total}, expected account_count {expected}"
                )


def build_atlas(
    profiles_document: Mapping[str, object], profiles_path: Path
) -> dict[str, object]:
    """Assemble the full atlas.json document.

    profiles_document is the profiles.json document the build just
    wrote; profiles_path is that file, hashed for the sources block.
    Raises load.ChecksumError when a join CSV drifts from
    data/tangerine/SHA256SUMS and load.DataError on join violations.
    """
    load.verify_source_checksums(
        (load.ACCOUNTS_PATH, DISTRICTS_PATH), sums_path=load.SUMS_PATH
    )
    profiles = profiles_document["profiles"]
    if not isinstance(profiles, dict):
        raise load.DataError("profiles document has no profiles mapping")

    account_district = load_account_district()
    districts = load_districts()
    district_ids = {int(entry["district_id"]) for entry in districts}

    unknown = sorted(
        {district_id for district_id in account_district.values()
         if district_id not in district_ids}
    )
    if unknown:
        raise load.DataError(
            "accounts.csv references district ids missing from "
            f"districts.csv: {unknown[:5]}"
        )
    profile_ids = set(profiles)
    missing = sorted(set(account_district) - profile_ids, key=int)
    extra = sorted(profile_ids - set(account_district), key=int)
    if missing or extra:
        raise load.DataError(
            "profiles.json and accounts.csv disagree on the account set: "
            f"accounts without profiles {missing[:5]}, profiles without "
            f"accounts {extra[:5]}"
        )

    baseline = count_bands(
        profiles, account_district, district_ids, band_for_profile
    )
    scenarios: dict[str, dict[str, dict[str, int]]] = {}
    for preset_id, preset in PRESETS.items():
        scenarios[preset_id] = count_bands(
            profiles,
            account_district,
            district_ids,
            lambda profile, preset=preset: shocked_band(profile, preset),
        )
    _check_invariants(baseline, scenarios, district_ids, account_district)

    account_counts = Counter(account_district.values())
    district_entries: list[dict[str, object]] = []
    for entry in districts:
        district_id = int(entry["district_id"])
        district_entries.append(
            {
                "district_id": district_id,
                "district_name": entry["district_name"],
                "region": entry["region"],
                "inhabitants": entry["inhabitants"],
                "unemployment_rate_2023": entry["unemployment_rate_2023"],
                "average_salary": entry["average_salary"],
                "account_count": account_counts.get(district_id, 0),
                "no_data": entry["no_data"],
            }
        )

    join_records = load.source_records((load.ACCOUNTS_PATH, DISTRICTS_PATH))
    sources: list[dict[str, object]] = [
        {
            "path": PROFILES_SOURCE_PATH,
            "sha256": sha256_file(profiles_path),
            "rows": len(profiles),
        },
        *(record.as_dict() for record in join_records),
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_by": GENERATED_BY,
        "states": list(BANDS),
        "sources": sources,
        "districts": district_entries,
        "account_district": dict(account_district),
        "baseline": baseline,
        "scenarios": scenarios,
    }


def report_line(atlas_document: Mapping[str, object], size: int, out_path: Path) -> str:
    """One build report line for the atlas artifact."""
    districts = atlas_document["districts"]
    scenarios = atlas_document["scenarios"]
    return (
        f"  atlas: {len(districts)} districts, "
        f"{len(atlas_document['account_district'])} accounts, "
        f"{len(scenarios)} scenarios ({rel_to_root(out_path)}, "
        f"{size / 1024:.1f} kB)"
    )
