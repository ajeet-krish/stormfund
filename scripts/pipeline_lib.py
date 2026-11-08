"""Shared helpers for the Ledger Odyssey offline data pipeline.

Used by the engine builder, the frozen findings analysis, the ingest probe,
and the mock ledger generator. Every helper is deterministic and seed free.

Checksum recipe (mirrored by the TypeScript Inspector, see the traceability
section of docs/architecture.md):

1. Pair every provenance row id with its value in cents. The value column is
   announced by the aggregation text suffix "checksum value = <field>"
   (amountCents for transaction entities, balanceCents for balance series and
   debt horizon entities, monthlyIncomeCents for player entities).
2. Sort the pairs ascending by row id (plain code point order).
3. Join the "{rowId}:{valueCents}" lines with a single LF character.
4. SHA256 the UTF-8 bytes and return the lowercase hex digest.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Mapping, Sequence

REPO_ROOT: Path = Path(__file__).resolve().parents[1]

VALUE_FIELD_SUFFIX: str = "checksum value = "

# Ingestion limits shared by the CSV builders (security review,
# docs/reviews.md, Nov 05 2026). Inputs above 50 MB are rejected before
# pd.read_csv can allocate them.
MAX_INPUT_CSV_BYTES: int = 50 * 1024 * 1024

# int64 bounds as floats. Every float64 in [INT64_MIN_FLOAT,
# INT64_LIMIT_FLOAT) converts exactly to int64, while +2**63 and any non
# finite value would silently wrap inside an astype("int64") cast, so both
# builders check finiteness and these bounds before any cast.
INT64_MIN_FLOAT: float = float(-(1 << 63))
INT64_LIMIT_FLOAT: float = float(1 << 63)


def canonical_column(name: str) -> str:
    """Normalize a CSV header to snake_case (EmployeeNumber becomes employee_number)."""
    split_camel = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(name))
    lowered = split_camel.strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "_", lowered)
    return cleaned.strip("_")


def sha256_file(path: Path) -> str:
    """Return the SHA256 hex digest of a file's bytes."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def slugify(text: str) -> str:
    """Lowercase text and collapse runs of non alphanumeric characters into one hyphen."""
    pieces: list[str] = []
    pending_hyphen = False
    for char in str(text).lower():
        if char.isalnum():
            if pending_hyphen and pieces:
                pieces.append("-")
            pending_hyphen = False
            pieces.append(char)
        else:
            pending_hyphen = True
    return "".join(pieces) or "x"


def unique_id(base: str, used: set[str]) -> str:
    """Return base, or base suffixed with the smallest integer that keeps it unique."""
    candidate = base
    counter = 2
    while candidate in used:
        candidate = f"{base}-{counter}"
        counter += 1
    used.add(candidate)
    return candidate


def cents_to_dollars(cents: int) -> str:
    """Format integer cents as a plain CAD dollar number, for example 1,234.56."""
    return f"{cents / 100.0:,.2f}"


def preview_ids(row_ids: Sequence[str], flagged: Sequence[bool], limit: int = 5) -> str:
    """Join the first few row ids selected by flagged, for friendly error messages."""
    picked = [str(row_id) for row_id, mark in zip(row_ids, flagged) if bool(mark)][:limit]
    return ", ".join(picked)


def checksum(row_ids: Sequence[str], values: Mapping[str, int]) -> str:
    """SHA256 over LF joined '{rowId}:{valueCents}' lines sorted by row id.

    Row ids are ASCII (TAN-000001, employee numbers), so Python's code point
    sort equals the UTF-16 code unit comparison the TypeScript mirror uses in
    src/data/checksum.ts; a non ASCII row id would need an explicit tie break
    rule to stay byte for byte identical.
    """
    ordered = sorted(row_ids)
    payload = "\n".join(f"{row_id}:{values[row_id]}" for row_id in ordered)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def make_provenance(
    row_ids: Sequence[str],
    value_field: str,
    value_maps: Mapping[str, Mapping[str, int]],
    filter_description: str,
    aggregation: str,
) -> dict[str, object]:
    """Build the Provenance object {rowIds, filter, agg, checkSum}."""
    ordered = sorted(row_ids)
    values = value_maps[value_field]
    return {
        "rowIds": ordered,
        "filter": filter_description,
        "agg": f"{aggregation}; checksum value = {value_field}",
        "checkSum": checksum(ordered, values),
    }


def value_field_from_agg(aggregation: str) -> str:
    """Read back the value column announced by make_provenance."""
    if VALUE_FIELD_SUFFIX not in aggregation:
        raise ValueError(
            f"aggregation text is missing the '{VALUE_FIELD_SUFFIX}' suffix: {aggregation!r}"
        )
    return str(aggregation).rsplit(VALUE_FIELD_SUFFIX, 1)[1]


def verify_provenance(
    provenance: Mapping[str, object],
    value_maps: Mapping[str, Mapping[str, int]],
) -> bool:
    """Recompute a provenance checksum from source value maps and compare it."""
    try:
        field = value_field_from_agg(str(provenance["agg"]))
        values = value_maps[field]
        row_ids = [str(row_id) for row_id in provenance["rowIds"]]
        expected = str(provenance["checkSum"])
    except (KeyError, TypeError, ValueError):
        return False
    if any(row_id not in values for row_id in row_ids):
        return False
    return checksum(row_ids, values) == expected


def rel_to_root(path: Path) -> str:
    """Render a path relative to the repository root when possible."""
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)
