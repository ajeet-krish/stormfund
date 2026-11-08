"""Verify the published findings against a fresh recomputation.

Mirrors the checksum discipline of scripts/build_world.py: every headline
number in public/data/findings.json and public/data/model_card.json is
recomputed from source and compared, plus two independent checks (the
baseline month end series against world.json, and the no dash equivalents
rule from AGENTS.md on the generated artifacts). The report headline
check runs only when the report file exists, because docs/findings.md
was retired from the repository.

Run from the repository root:

    uv run python -m scripts.analysis.verify_findings
    uv run python -m scripts.analysis.build_findings --verify
    uv run pytest
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from scripts.analysis.build_findings import compute_all
from scripts.analysis.ledger import (
    FINDINGS_PATH,
    MODEL_CARD_PATH,
    REPORT_PATH,
    TRANSACTIONS_PATH,
    WORLD_PATH,
    signed_dollars,
)
from scripts.pipeline_lib import rel_to_root

FLOAT_ABS_TOL: float = 1e-6
DASH_CHARACTERS: tuple[str, ...] = ("\u2014", "\u2013", "\u2212")
TABLE_SEPARATOR = re.compile(r"^\|[-\s|]+\|$")


@dataclass
class CheckResult:
    """One verification check with human readable failure details."""

    name: str
    passed: bool
    details: list[str] = field(default_factory=list)


def iter_mismatches(expected: Any, actual: Any, path: str = "root") -> list[str]:
    """Return a list of path descriptions where two structures disagree."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        problems: list[str] = []
        for key in sorted(set(expected) | set(actual)):
            child = f"{path}.{key}"
            if key not in expected:
                problems.append(f"{child}: present in file, missing from recomputation")
            elif key not in actual:
                problems.append(f"{child}: missing from file")
            else:
                problems.extend(iter_mismatches(expected[key], actual[key], child))
        return problems
    if isinstance(expected, list) and isinstance(actual, list):
        problems = []
        if len(expected) != len(actual):
            problems.append(
                f"{path}: length {len(actual)} in file versus {len(expected)} recomputed"
            )
        for index, (left, right) in enumerate(zip(expected, actual)):
            problems.extend(iter_mismatches(left, right, f"{path}[{index}]"))
        return problems
    if isinstance(expected, bool) or isinstance(actual, bool):
        if expected is not actual:
            return [f"{path}: {actual!r} in file versus {expected!r} recomputed"]
        return []
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        if not math.isclose(float(expected), float(actual), rel_tol=1e-9, abs_tol=FLOAT_ABS_TOL):
            return [f"{path}: {actual!r} in file versus {expected!r} recomputed"]
        return []
    if expected != actual:
        return [f"{path}: {actual!r} in file versus {expected!r} recomputed"]
    return []


def dash_violations(text: str) -> list[str]:
    """Find em dashes, en dashes, minus signs, double hyphens, spaced hyphens.

    Markdown table separator rows are skipped because they are structural
    syntax, not typography, and existing docs use them.
    """
    problems: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if TABLE_SEPARATOR.fullmatch(stripped):
            continue
        for character in DASH_CHARACTERS:
            if character in line:
                problems.append(
                    f"line {number}: dash character U+{ord(character):04X} present"
                )
        if "--" in line:
            problems.append(f"line {number}: double hyphen present")
        if " - " in line:
            problems.append(f"line {number}: spaced hyphen present")
    return problems


def check_file_matches(
    name: str, path: Path, expected: dict[str, Any]
) -> CheckResult:
    """Load one JSON artifact and compare it with the recomputation."""
    if not path.is_file():
        return CheckResult(name, False, [f"{rel_to_root(path)} does not exist"])
    try:
        actual = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return CheckResult(name, False, [f"{rel_to_root(path)} is not valid JSON: {error}"])
    problems = iter_mismatches(expected, actual)
    return CheckResult(name, not problems, problems[:20])


def check_report_headlines(path: Path, computed: dict[str, Any]) -> CheckResult:
    """Confirm the report file carries this run's headline numbers."""
    if not path.is_file():
        return CheckResult("report headlines", False, [f"{rel_to_root(path)} does not exist"])
    text = path.read_text(encoding="utf-8")
    headline = computed["headline"]
    required = [
        f"{headline['structuralSharePct']:.2f}%",
        f"{headline['deficitModelTestAuc']:.3f}",
        signed_dollars(headline["bestInterventionFloorGainCents"]).lstrip("+"),
        signed_dollars(headline["bestAlignedDrawdownImprovementCents"]).lstrip("+"),
        "SYNTHETIC DATA NOTICE",
        "## The question we asked",
        "## What we did",
        "## What we found",
        "### F1",
        "### F2",
        "### F3",
        "### F4",
        "### F5",
        "## Limitations",
        headline["deficitModelSplitDate"],
        str(computed["meta"]["seed"]),
    ]
    missing = [item for item in required if item not in text]
    details = [f"missing from {rel_to_root(path)}: {item!r}" for item in missing]
    return CheckResult("report headlines", not details, details)


def check_report_and_data_no_dashes(
    findings_path: Path, model_card_path: Path, report_path: Path
) -> CheckResult:
    """Apply the AGENTS.md no dash equivalents rule to generated artifacts.

    The two JSON artifacts are always required. The report is optional:
    docs/findings.md was retired, so an absent report is skipped instead
    of failing.
    """
    problems: list[str] = []
    paths = [findings_path, model_card_path]
    if report_path.is_file():
        paths.append(report_path)
    for path in paths:
        if not path.is_file():
            problems.append(f"{rel_to_root(path)} does not exist")
            continue
        for violation in dash_violations(path.read_text(encoding="utf-8")):
            problems.append(f"{rel_to_root(path)}: {violation}")
    return CheckResult("no dash equivalents in artifacts", not problems, problems[:20])


def check_baseline_cross_check(computed: dict[str, Any]) -> CheckResult:
    """Confirm the simulated baseline equals world.json month ends."""
    cross = computed["meta"]["baselineCrossCheck"]
    details: list[str] = []
    if not cross["matches"]:
        for index, (left, right) in enumerate(
            zip(cross["simulatedMonthlyCents"], cross["worldMonthlyCents"])
        ):
            if left != right:
                details.append(f"month {index}: simulated {left} versus world {right}")
    return CheckResult("baseline matches world.json month ends", bool(cross["matches"]), details)


def check_seed_logged(computed: dict[str, Any], model_card: dict[str, Any]) -> CheckResult:
    """Both artifacts must record the seed for reproducibility."""
    problems: list[str] = []
    if computed["meta"]["seed"] != 20261107:
        problems.append(f"findings seed is {computed['meta']['seed']}, expected 20261107")
    if model_card.get("randomSeed") != 20261107:
        problems.append(f"model card seed is {model_card.get('randomSeed')}, expected 20261107")
    return CheckResult("seeds logged", not problems, problems)


def run_verification(
    findings_path: Path = FINDINGS_PATH,
    model_card_path: Path = MODEL_CARD_PATH,
    report_path: Path = REPORT_PATH,
    transactions_path: Path = TRANSACTIONS_PATH,
    world_path: Path = WORLD_PATH,
) -> list[CheckResult]:
    """Recompute everything once and run every check against the artifacts."""
    computed_bundle = compute_all(transactions_path, world_path)
    findings = computed_bundle.findings
    model_card = computed_bundle.model_card
    results = [
        check_file_matches("findings.json matches recomputation", findings_path, findings),
        check_file_matches("model_card.json matches recomputation", model_card_path, model_card),
        check_baseline_cross_check(findings),
        check_seed_logged(findings, model_card),
        check_report_and_data_no_dashes(findings_path, model_card_path, report_path),
    ]
    # The headline check is report dependent: docs/findings.md was retired,
    # so an absent report skips the check instead of failing it.
    if report_path.is_file():
        results.insert(2, check_report_headlines(report_path, findings))
    return results


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry: print every check and exit 0 only when all pass."""
    parser = argparse.ArgumentParser(description="Verify the findings artifacts")
    parser.add_argument("--findings-out", type=Path, default=FINDINGS_PATH)
    parser.add_argument("--model-card-out", type=Path, default=MODEL_CARD_PATH)
    parser.add_argument("--report-out", type=Path, default=REPORT_PATH)
    args = parser.parse_args(argv)
    results = run_verification(args.findings_out, args.model_card_out, args.report_out)
    print("verify_findings: recomputation and artifact checks")
    failed = 0
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"  [{status}] {result.name}")
        if not result.passed:
            failed += 1
            for detail in result.details:
                print(f"        {detail}")
    passed = len(results) - failed
    print(f"checks: {passed}/{len(results)} passed")
    print(f"verify_findings: {'PASS' if failed == 0 else 'FAIL'}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
