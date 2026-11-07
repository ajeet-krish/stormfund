"""Probe any tabular file and print the schema verdict the adapter needs.

The real Tangerine dataset drops Saturday Nov 07 2026 with an unpublished
schema (docs/research.md, "Tangerine dataset preparation research"). This
probe is the schema agnostic half of ingest: it reads one csv, tsv, or xlsx
file and prints in a single pass:

* filename, sha256, and size;
* detected encoding (utf-8-sig, utf-8, or latin-1) and detected delimiter
  (comma, semicolon, or tab);
* columns with dtypes and null counts per column;
* three sample rows;
* date range candidates plus a date format verdict: any first position value
  above 12 proves DD/MM, any second position value above 12 proves MM/DD;
* the sign convention verdict (single signed amount, separate debit/credit
  columns, or positive amount with a type column);
* numeric column candidates for amount and balance, tolerant of currency
  strings such as "$23,679" and "1234,56";
* category like column candidates with their top 10 value counts;
* a final VERDICT block stating what the tomorrow adapter should map onto
  the canonical contract (transaction_id, date, hour, amount,
  merchant_category, account_balance).

Run from the repository root:

    uv run python -m scripts.ingest.probe_schema --input <file>

The probe is read only and prints to stdout, so unlike the builders it does
not contain paths to REPO_ROOT: the real file may land anywhere (Downloads,
a USB stick, a mounted share). Every failure goes through fail(), the same
friendly one line on stderr and exit code 1 that scripts/build_world.py
uses, never a traceback.
"""

from __future__ import annotations

import argparse
import codecs
import csv
import importlib.util
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import NoReturn, Sequence

import pandas as pd

from scripts.pipeline_lib import (
    MAX_INPUT_CSV_BYTES,
    canonical_column,
    rel_to_root,
    sha256_file,
)

# Encoding and delimiter detection reads at most this many bytes, so a huge
# extract cannot slow the probe down. UTF-8 sequences are at most 4 bytes,
# which detect_encoding uses to tell a split character from bad data.
DETECT_PREFIX_BYTES: int = 1 << 20

# Above the 50 MB builder cap the probe reads only this many data rows and
# says so on the report, instead of trying to profile a file the builder
# would reject anyway.
PROBE_ROW_SAMPLE: int = 100_000

DELIMITERS: dict[str, str] = {",": "comma", ";": "semicolon", "\t": "tab"}
EXCEL_ENGINES: dict[str, str] = {".xlsx": "openpyxl", ".xlsm": "openpyxl", ".xls": "xlrd"}

SAMPLE_ROWS: int = 3
MAX_REPORTED_COLUMNS: int = 40
MAX_CATEGORY_COLUMNS: int = 8
MAX_CATEGORY_DISTINCT: int = 60
MAX_TYPE_DISTINCT: int = 20
MIN_NUMERIC_PARSE_SHARE: float = 0.9
MIN_DATE_MATCH_SHARE: float = 0.9
TOP_CATEGORY_VALUES: int = 10
MAX_CELL_WIDTH: int = 40

# Canonical target columns of the build_world contract, in hint priority
# order. Hints match on underscore boundaries (see has_hint) so "amount_paid"
# never satisfies the "id" hint.
ID_TARGET_HINTS: tuple[str, ...] = (
    "transaction_id",
    "transactionid",
    "txn_id",
    "reference_number",
    "reference",
    "ref",
    "id",
)
DATE_TARGET_HINTS: tuple[str, ...] = ("date",)
HOUR_TARGET_HINTS: tuple[str, ...] = ("hour",)
AMOUNT_TARGET_HINTS: tuple[str, ...] = ("amount", "montant")
CATEGORY_TARGET_HINTS: tuple[str, ...] = (
    "merchant_category",
    "category",
    "categorie",
    "mcc",
    "classification",
)
BALANCE_TARGET_HINTS: tuple[str, ...] = (
    "account_balance",
    "balance",
    "solde",
    "closing_balance",
    "running_balance",
)

AMOUNT_NAME_HINTS: tuple[str, ...] = ("amount", "montant", "value", "price", "sum", "total")
BALANCE_NAME_HINTS: tuple[str, ...] = ("balance", "solde")
DEBIT_NAME_HINTS: tuple[str, ...] = ("debit", "withdrawal", "withdrawn", "money_out", "outflow")
CREDIT_NAME_HINTS: tuple[str, ...] = ("credit", "deposit", "deposited", "money_in", "inflow")
TYPE_NAME_HINTS: tuple[str, ...] = ("type", "kind", "nature", "action")
TYPE_VALUE_HINTS: frozenset[str] = frozenset(
    {"debit", "credit", "withdrawal", "deposit", "refund", "payment", "purchase", "transfer"}
)
DATE_NAME_HINTS: tuple[str, ...] = ("date", "time", "timestamp", "jour", "day")

ISO_DATE_RE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}(?:[ T]\d{1,2}:\d{2}(?:[:.]\d+)?)?$")
NUMERIC_DATE_RE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$")
COMPACT_DATE_RE = re.compile(r"^\d{8}$")
TIME_PART_RE = re.compile(r"[ T]\d{1,2}:\d{2}")

# Currency style numbers: optional accounting parentheses, an optional CAD,
# USD, or EUR marker, then digits with thousands or decimal separators.
MONEY_TOKEN_RE = re.compile(
    r"^\s*(\(?)\s*(?:CA\$|C\$|US\$|\$|CAD|USD|EUR)?\s*([\d.,+\-]+)\s*(\)?)\s*$",
    re.IGNORECASE,
)


def fail(message: str) -> NoReturn:
    """Print a pipeline error and stop with exit code 1."""
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_money(text: object) -> float | None:
    """Parse a currency style number, or return None when the value is not one.

    Handles CAD and USD markers, dollar signs, thousands commas, decimal
    commas, and accounting parentheses (parentheses mean negative, so the
    value is negated whatever sign it carries). Identifier strings such as
    TAN-000001 stay None because the pattern is anchored and letters never
    reach the numeric body.
    """
    match = MONEY_TOKEN_RE.match(str(text))
    if match is None:
        return None
    opened, body, closed = match.group(1), match.group(2), match.group(3)
    if bool(opened) != bool(closed):
        return None
    if "," in body and "." in body:
        # Both separators present: the last one is the decimal point.
        if body.rfind(",") > body.rfind("."):
            body = body.replace(".", "").replace(",", ".")
        else:
            body = body.replace(",", "")
    elif body.count(",") > 1:
        body = body.replace(",", "")
    elif "," in body:
        head, _, tail = body.rpartition(",")
        # A single comma with a three digit tail and a short head is a
        # thousands separator ("1,234"); anything else is a decimal comma.
        if head and len(tail) == 3 and len(head.lstrip("+-")) <= 3:
            body = f"{head}{tail}"
        else:
            body = f"{head}.{tail}"
    try:
        value = float(body)
    except ValueError:
        return None
    return -abs(value) if opened else value


def detect_encoding(raw: bytes, truncated: bool) -> str:
    """Return utf-8-sig for a BOM, utf-8 when the bytes decode, else latin-1.

    Detection usually runs on a truncated prefix, so a decode error inside
    the last four bytes (the longest UTF-8 sequence) can be a multi byte
    character split by the cut rather than bad data; only then is the prefix
    trimmed and retried. When raw is the whole file, any decode error means
    latin-1.
    """
    if raw.startswith(codecs.BOM_UTF8):
        return "utf-8-sig"
    try:
        raw.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError as exc:
        if truncated and exc.start > 0 and exc.start + 4 >= len(raw):
            try:
                raw[: exc.start].decode("utf-8")
            except UnicodeDecodeError:
                return "latin-1"
            return "utf-8"
        return "latin-1"


def sniffable_text(text: str) -> str:
    """Drop blank and comment lines, the rows that would poison a sniff."""
    lines = [
        line
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    return "\n".join(lines)[:8192]


def detect_delimiter(text: str) -> str:
    """Return the delimiter character: csv.Sniffer first, count as fallback."""
    sample = sniffable_text(text)
    if not sample:
        fail("no non comment lines to sniff a delimiter from, the file has no table to probe")
    try:
        return csv.Sniffer().sniff(sample, delimiters="".join(DELIMITERS)).delimiter
    except csv.Error:
        pass
    counts = {char: sample.count(char) for char in DELIMITERS}
    best = max(counts, key=lambda char: counts[char])
    if counts[best] == 0:
        fail(
            "no comma, semicolon, or tab found in the first lines: "
            "the file does not look like a delimited table"
        )
    return best


def engine_installed(name: str) -> bool:
    """Report whether an importable module is present, without importing it."""
    return importlib.util.find_spec(name) is not None


def excel_engine(suffix: str) -> str:
    """Return the pandas engine for an Excel suffix, or fail when it is missing."""
    engine = EXCEL_ENGINES.get(suffix, "")
    if not engine:
        fail(
            f"unsupported spreadsheet suffix {suffix!r}: the probe reads "
            ".csv, .tsv, .xlsx, .xlsm, and .xls files"
        )
    if not engine_installed(engine):
        fail(
            f"{suffix} input needs the {engine} engine, which is not installed: "
            f"export the sheet to csv and probe that (or add it with uv add {engine})"
        )
    return engine


@dataclass
class ProbeTable:
    """One probe run: the raw facts about the file plus the parsed frame."""

    path: Path
    size_bytes: int
    checksum: str
    encoding: str  # empty for binary workbooks
    delimiter: str  # one of DELIMITERS keys, empty for binary workbooks
    frame: pd.DataFrame
    row_sampled: bool = False


def read_workbook(path: Path, engine: str) -> pd.DataFrame:
    """Read the first worksheet, routing every spreadsheet error through fail()."""
    try:
        frame = pd.read_excel(path, sheet_name=0, engine=engine)
    except Exception as exc:  # zip corruption, protected sheet, bad layout
        fail(f"cannot read {rel_to_root(path)} with {engine}: {exc}")
    if frame.shape[1] == 0:
        fail(f"{rel_to_root(path)}: first worksheet has no columns")
    if len(frame) == 0:
        fail(f"{rel_to_root(path)}: no data rows below the header")
    return frame


def read_delimited(
    path: Path, delimiter: str, encoding: str, nrows: int | None
) -> pd.DataFrame:
    """pd.read_csv with the friendly fail() routes the builders use."""
    try:
        return pd.read_csv(
            path, sep=delimiter, encoding=encoding, comment="#", nrows=nrows
        )
    except pd.errors.EmptyDataError:
        fail(f"{rel_to_root(path)}: no columns to parse (empty or comment-only file)")
    except pd.errors.ParserError as exc:
        fail(
            f"{rel_to_root(path)}: rows do not line up with the "
            f"{DELIMITERS[delimiter]} delimiter: {exc}"
        )
    except OSError as exc:
        fail(f"cannot read {rel_to_root(path)}: {exc}")


def read_table(path: Path) -> ProbeTable:
    """Read one tabular file (sampled above the builder cap) and collect the probe facts."""
    resolved = path.expanduser()
    if not resolved.is_file():
        fail(f"input file not found: {rel_to_root(resolved)}")
    size_bytes = resolved.stat().st_size
    if size_bytes == 0:
        fail(f"{rel_to_root(resolved)}: file is empty (zero bytes)")
    checksum = sha256_file(resolved)
    suffix = resolved.suffix.lower()

    if suffix in EXCEL_ENGINES:
        engine = excel_engine(suffix)
        frame = read_workbook(resolved, engine)
        return ProbeTable(
            path=resolved,
            size_bytes=size_bytes,
            checksum=checksum,
            encoding="",
            delimiter="",
            frame=frame,
        )

    truncated = size_bytes > DETECT_PREFIX_BYTES
    with resolved.open("rb") as handle:
        prefix = handle.read(DETECT_PREFIX_BYTES)
    encoding = detect_encoding(prefix, truncated)
    decoded = prefix.decode(encoding, errors="replace")
    if "\x00" in decoded:
        fail(
            f"{rel_to_root(resolved)} contains NUL bytes: it looks like a binary "
            "file, not a delimited table"
        )
    delimiter = detect_delimiter(decoded)

    row_sampled = size_bytes > MAX_INPUT_CSV_BYTES
    nrows = PROBE_ROW_SAMPLE if row_sampled else None
    try:
        frame = read_delimited(resolved, delimiter, encoding, nrows)
    except UnicodeDecodeError:
        # Prefix detection can miss a latin-1 byte far past the probe prefix.
        print(
            f"note: {rel_to_root(resolved)} does not decode as {encoding} in "
            "full, re-reading as latin-1",
            file=sys.stderr,
        )
        encoding = "latin-1"
        frame = read_delimited(resolved, delimiter, encoding, nrows)

    if frame.shape[1] == 0:
        fail(f"{rel_to_root(resolved)}: parsed zero columns")
    if len(frame) == 0:
        fail(f"{rel_to_root(resolved)}: no data rows below the header")
    return ProbeTable(
        path=resolved,
        size_bytes=size_bytes,
        checksum=checksum,
        encoding=encoding,
        delimiter=delimiter,
        frame=frame,
        row_sampled=row_sampled,
    )


@dataclass
class NumericCandidate:
    """A column that parses as numbers or money, with its sign profile."""

    column: str
    count: int
    minimum: float
    maximum: float
    negatives: int
    positives: int


def numeric_series(series: pd.Series) -> pd.Series | None:
    """Parse a column into floats, or return None when it is not numeric.

    Numeric dtypes qualify as they are; object columns qualify when at least
    MIN_NUMERIC_PARSE_SHARE of their non null values parse as money, so a
    description column with one number in it never becomes a candidate.
    """
    non_null = series.dropna()
    if len(non_null) == 0:
        return None
    if pd.api.types.is_bool_dtype(series):
        return None
    if pd.api.types.is_numeric_dtype(series):
        return non_null.astype("float64")
    numeric = pd.to_numeric(non_null.map(parse_money), errors="coerce")
    if float(numeric.notna().mean()) < MIN_NUMERIC_PARSE_SHARE:
        return None
    return numeric.dropna().astype("float64")


def numeric_candidates(frame: pd.DataFrame) -> list[NumericCandidate]:
    """Every column that parses as numbers or money, with min, max, and signs."""
    out: list[NumericCandidate] = []
    for column in frame.columns:
        values = numeric_series(frame[column])
        if values is None:
            continue
        out.append(
            NumericCandidate(
                column=str(column),
                count=int(len(values)),
                minimum=float(values.min()),
                maximum=float(values.max()),
                negatives=int((values < 0).sum()),
                positives=int((values > 0).sum()),
            )
        )
    return out


@dataclass
class DateCandidate:
    """One date like column with its range, format, and order verdict."""

    column: str
    matched: int
    total: int
    kind: str  # iso, numeric, compact, datetime, or name
    format_label: str  # what the adapter should parse
    verdict: str  # ISO, DD/MM, MM/DD, ambiguous, compact, or unparsed
    dayfirst: bool
    start: str  # range start, empty when unparsed
    end: str  # range end, empty when unparsed
    proof: str = ""
    has_time: bool = False


def stamp_label(value: object) -> str:
    """Render a timestamp as a date when the time is midnight, else date time."""
    stamp = pd.Timestamp(value)
    if stamp.hour == 0 and stamp.minute == 0 and stamp.second == 0:
        return stamp.date().isoformat()
    return stamp.strftime("%Y-%m-%d %H:%M:%S")


def range_labels(parsed: pd.Series, texts: pd.Series) -> tuple[str, str]:
    """Small to large range labels, falling back to string order when unparsed."""
    good = parsed.dropna()
    if len(good) > 0:
        return stamp_label(good.min()), stamp_label(good.max())
    return str(texts.min()), str(texts.max())


def iso_candidate(column: str, texts: pd.Series) -> DateCandidate:
    """A column of YYYY-MM-DD style values, with an optional time part."""
    parsed = pd.to_datetime(texts, errors="coerce", format="ISO8601")
    if bool(parsed.isna().all()):
        try:
            parsed = pd.to_datetime(texts, errors="coerce")
        except ValueError:
            parsed = pd.Series(pd.NaT, index=texts.index)
    start, end = range_labels(parsed, texts)
    return DateCandidate(
        column=column,
        matched=len(texts),
        total=len(texts),
        kind="iso",
        format_label="YYYY-MM-DD",
        verdict="ISO",
        dayfirst=False,
        start=start,
        end=end,
        proof="",
        has_time=bool(texts.str.contains(TIME_PART_RE).any()),
    )


def numeric_date_candidate(column: str, texts: pd.Series) -> DateCandidate:
    """Resolve DD/MM versus MM/DD: a first position value above 12 proves DD/MM."""
    parts = texts.str.extract(NUMERIC_DATE_RE)
    first = pd.to_numeric(parts.iloc[:, 0], errors="coerce")
    second = pd.to_numeric(parts.iloc[:, 1], errors="coerce")
    first_max = int(first.max()) if bool(first.notna().any()) else 0
    second_max = int(second.max()) if bool(second.notna().any()) else 0
    if first_max > 12 and second_max <= 12:
        verdict = "DD/MM"
        proof = f"first position value {first_max} proves day first"
    elif second_max > 12 and first_max <= 12:
        verdict = "MM/DD"
        proof = f"second position value {second_max} proves month first"
    elif first_max > 12 and second_max > 12:
        verdict = "ambiguous"
        proof = (
            f"both positions exceed 12 (first max {first_max}, second max "
            f"{second_max}), so the rows disagree"
        )
    else:
        verdict = "ambiguous"
        proof = (
            "every value is at most 12 in both positions, so a known date "
            "must break the tie"
        )
    dayfirst = verdict in {"DD/MM", "ambiguous"}
    format_label = {
        "DD/MM": "DD/MM/YYYY",
        "MM/DD": "MM/DD/YYYY",
        "ambiguous": "DD/MM/YYYY or MM/DD/YYYY",
    }[verdict]
    try:
        parsed = pd.to_datetime(
            texts, errors="coerce", dayfirst=dayfirst, format="mixed"
        )
    except ValueError:
        parsed = pd.Series(pd.NaT, index=texts.index)
    start, end = range_labels(parsed, texts)
    return DateCandidate(
        column=column,
        matched=len(texts),
        total=len(texts),
        kind="numeric",
        format_label=format_label,
        verdict=verdict,
        dayfirst=dayfirst,
        start=start,
        end=end,
        proof=proof,
        has_time=bool(texts.str.contains(TIME_PART_RE).any()),
    )


def compact_date_candidate(column: str, texts: pd.Series) -> DateCandidate:
    """Eight digit dates such as 20251101, with Excel serials as the other read."""
    numbers = pd.to_numeric(texts, errors="coerce")
    plausible_share = float(((numbers >= 19000101) & (numbers <= 20991231)).mean())
    if plausible_share >= MIN_DATE_MATCH_SHARE:
        parsed = pd.to_datetime(texts, errors="coerce", format="%Y%m%d")
        start, end = range_labels(parsed, texts)
        return DateCandidate(
            column=column,
            matched=len(texts),
            total=len(texts),
            kind="compact",
            format_label="YYYYMMDD",
            verdict="compact",
            dayfirst=False,
            start=start,
            end=end,
            proof="eight digit values inside the 19000101 to 20991231 band",
        )
    serial_share = float(((numbers >= 30000) & (numbers <= 60000)).mean())
    if serial_share >= MIN_DATE_MATCH_SHARE:
        proof = "values sit in the 30000 to 60000 band, which looks like Excel serial day numbers"
    else:
        proof = "values are eight digits but fall outside any plausible date range"
    return DateCandidate(
        column=column,
        matched=0,
        total=len(texts),
        kind="compact",
        format_label="undetermined",
        verdict="unparsed",
        dayfirst=False,
        start="",
        end="",
        proof=proof,
    )


def name_only_candidate(column: str, texts: pd.Series) -> DateCandidate:
    """The name says date but no value matches a known pattern: say why."""
    numbers = pd.to_numeric(texts, errors="coerce")
    numeric_share = float(numbers.notna().mean())
    serial_share = (
        float(((numbers >= 30000) & (numbers <= 60000)).mean())
        if numeric_share >= MIN_DATE_MATCH_SHARE
        else 0.0
    )
    if serial_share >= MIN_DATE_MATCH_SHARE:
        proof = "values look like Excel serial day numbers (the 30000 to 60000 band)"
    else:
        proof = "values match neither YYYY-MM-DD nor a slash date pattern"
    return DateCandidate(
        column=column,
        matched=0,
        total=len(texts),
        kind="name",
        format_label="undetermined",
        verdict="unparsed",
        dayfirst=False,
        start="",
        end="",
        proof=proof,
    )


def datetime_candidate(column: str, series: pd.Series) -> DateCandidate:
    """A column pandas already read as datetimes, typical of xlsx exports."""
    stamps = pd.to_datetime(series, errors="coerce")
    has_time = bool(
        ((stamps.dt.hour != 0) | (stamps.dt.minute != 0) | (stamps.dt.second != 0)).any()
    )
    start, end = range_labels(stamps, series.astype("string"))
    return DateCandidate(
        column=column,
        matched=len(series),
        total=len(series),
        kind="datetime",
        format_label="datetime64 (already parsed)",
        verdict="ISO",
        dayfirst=False,
        start=start,
        end=end,
        proof="workbook dates arrive as datetimes, format them as YYYY-MM-DD",
        has_time=has_time,
    )


def date_candidates(frame: pd.DataFrame) -> list[DateCandidate]:
    """Date range candidates: every column whose values, or name, say date."""
    out: list[DateCandidate] = []
    for column in frame.columns:
        series = frame[column].dropna()
        if len(series) == 0:
            continue
        if pd.api.types.is_datetime64_any_dtype(series):
            out.append(datetime_candidate(str(column), series))
            continue
        texts = series.astype("string").str.strip()
        name_hint = any(
            hint in canonical_column(str(column)) for hint in DATE_NAME_HINTS
        )
        if float(texts.str.match(ISO_DATE_RE).mean()) >= MIN_DATE_MATCH_SHARE:
            out.append(iso_candidate(str(column), texts))
        elif float(texts.str.match(NUMERIC_DATE_RE).mean()) >= MIN_DATE_MATCH_SHARE:
            out.append(numeric_date_candidate(str(column), texts))
        elif float(texts.str.match(COMPACT_DATE_RE).mean()) >= MIN_DATE_MATCH_SHARE:
            out.append(compact_date_candidate(str(column), texts))
        elif name_hint:
            out.append(name_only_candidate(str(column), texts))
    return out


def date_verdict_text(candidate: DateCandidate) -> str:
    """One line verdict: the format plus the order proof."""
    if candidate.verdict == "ISO":
        return "ISO YYYY-MM-DD, unambiguous"
    if candidate.verdict in {"DD/MM", "MM/DD"}:
        return f"{candidate.verdict}, {candidate.proof}"
    if candidate.verdict == "ambiguous":
        return f"ambiguous ({candidate.proof})"
    if candidate.verdict == "compact":
        return f"compact {candidate.format_label} ({candidate.proof})"
    return f"unparsed ({candidate.proof})"


def has_hint(column: str, hints: Sequence[str]) -> bool:
    """Whether the canonical column name contains a hint on token boundaries.

    Token matching keeps "amount_paid" from satisfying the "id" hint: the
    hint must start the name or sit between underscores, never inside a word.
    """
    canonical = canonical_column(column)
    for hint in hints:
        token = canonical_column(hint)
        if (
            canonical == token
            or canonical.startswith(f"{token}_")
            or f"_{token}_" in canonical
        ):
            return True
    return False


def find_target_column(columns: Sequence[str], hints: Sequence[str]) -> str:
    """Best source column for a target: exact canonical match first, then hint."""
    exact = {canonical_column(str(column)): str(column) for column in columns}
    for hint in hints:
        token = canonical_column(hint)
        if token in exact:
            return exact[token]
    for column in columns:
        if has_hint(str(column), hints):
            return str(column)
    return ""


@dataclass
class SignVerdict:
    """How debits and credits are encoded, and what the adapter must do."""

    verdict: str
    explanation: str
    amount_column: str = ""
    debit_column: str = ""
    credit_column: str = ""
    type_column: str = ""


def find_type_column(frame: pd.DataFrame) -> str:
    """Find a column carrying debit or credit meaning, by name first, then values."""
    for column in frame.columns:
        if has_hint(str(column), TYPE_NAME_HINTS):
            return str(column)
    for column in frame.columns:
        series = frame[column].dropna()
        if len(series) == 0:
            continue
        if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
            continue
        if int(series.nunique()) > MAX_TYPE_DISTINCT:
            continue
        lowered = {str(value).strip().lower() for value in series.unique()}
        if lowered & TYPE_VALUE_HINTS:
            return str(column)
    return ""


def sign_verdict(frame: pd.DataFrame, numeric: Sequence[NumericCandidate]) -> SignVerdict:
    """Classify the sign convention the adapter must reproduce.

    Order matters: a debit/credit column pair is detected by name before the
    signed scan, because debit_amount and credit_amount each hold only
    positive values and would otherwise read as "positive with type".
    """
    by_name = {entry.column: entry for entry in numeric}
    debit_columns = [name for name in by_name if has_hint(name, DEBIT_NAME_HINTS)]
    credit_columns = [name for name in by_name if has_hint(name, CREDIT_NAME_HINTS)]
    if debit_columns and credit_columns:
        debit_column, credit_column = debit_columns[0], credit_columns[0]
        return SignVerdict(
            verdict="separate debit/credit columns",
            explanation=(
                f"{debit_column} holds debits and {credit_column} holds credits, "
                "so the adapter must fold the pair into one signed amount"
            ),
            debit_column=debit_column,
            credit_column=credit_column,
        )

    amount_columns = [name for name in by_name if has_hint(name, AMOUNT_NAME_HINTS)]
    if not amount_columns:
        amount_columns = [
            name
            for name, entry in by_name.items()
            if not has_hint(name, BALANCE_NAME_HINTS)
            and entry.negatives > 0
            and entry.positives > 0
        ]
    signed = [
        name
        for name in amount_columns
        if by_name[name].negatives > 0 and by_name[name].positives > 0
    ]
    if signed:
        entry = by_name[signed[0]]
        return SignVerdict(
            verdict="single signed amount",
            explanation=(
                f"{entry.column} holds {entry.negatives} negative and "
                f"{entry.positives} positive values, so debits are already negative"
            ),
            amount_column=entry.column,
        )

    non_negative = [
        name
        for name in amount_columns
        if by_name[name].negatives == 0 and by_name[name].positives > 0
    ]
    if non_negative:
        type_column = find_type_column(frame)
        if type_column:
            return SignVerdict(
                verdict="positive amount with type column",
                explanation=(
                    f"{non_negative[0]} is all non negative and {type_column} "
                    "carries the debit or credit meaning"
                ),
                amount_column=non_negative[0],
                type_column=type_column,
            )

    return SignVerdict(
        verdict="no sign convention detected",
        explanation=(
            "no amount column mixes signs and no debit or credit type column "
            "was found"
        ),
    )


@dataclass
class CategoryCandidate:
    """A low cardinality text column: a merchant_category stand-in."""

    column: str
    distinct: int
    top_values: list[tuple[str, int]] = field(default_factory=list)


def category_candidates(
    frame: pd.DataFrame, skip: set[str]
) -> list[CategoryCandidate]:
    """Low cardinality text columns with their top value counts.

    Identifier columns (every value unique) and the date candidates are
    excluded, and at most MAX_CATEGORY_COLUMNS are reported so a wide file
    cannot flood the report.
    """
    out: list[CategoryCandidate] = []
    for column in frame.columns:
        if str(column) in skip:
            continue
        series = frame[column]
        if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
            continue
        if pd.api.types.is_datetime64_any_dtype(series):
            continue
        non_null = series.dropna()
        if len(non_null) == 0:
            continue
        distinct = int(non_null.nunique())
        if distinct < 2 or distinct > MAX_CATEGORY_DISTINCT:
            continue
        if distinct == len(non_null):
            continue  # every value unique: an identifier, not a category
        counts = non_null.astype("string").value_counts().head(TOP_CATEGORY_VALUES)
        top = [
            (str(value)[:MAX_CELL_WIDTH], int(count)) for value, count in counts.items()
        ]
        out.append(CategoryCandidate(str(column), distinct, top))
        if len(out) >= MAX_CATEGORY_COLUMNS:
            break
    return out


def cell_text(value: object) -> str:
    """Render one sample cell: truncated, with missing values left blank."""
    if value is None or (not isinstance(value, str) and bool(pd.isna(value))):
        return ""
    text = str(value)
    if len(text) > MAX_CELL_WIDTH:
        return text[: MAX_CELL_WIDTH - 3] + "..."
    return text


def date_target_detail(candidate: DateCandidate) -> str:
    """What the adapter must do with the chosen date column."""
    span = f"{candidate.start} to {candidate.end}" if candidate.start else "range unknown"
    if candidate.verdict == "ISO":
        return f"ISO YYYY-MM-DD, {span}, keep as-is"
    if candidate.verdict == "DD/MM":
        return f"parse as DD/MM/YYYY, emit YYYY-MM-DD, {span}"
    if candidate.verdict == "MM/DD":
        return f"parse as MM/DD/YYYY, emit YYYY-MM-DD, {span}"
    if candidate.verdict == "ambiguous":
        return f"order ambiguous, confirm then emit YYYY-MM-DD, {span}"
    if candidate.verdict == "compact":
        return f"parse as YYYYMMDD, emit YYYY-MM-DD, {span}"
    return candidate.proof


def verdict_notes(
    table: ProbeTable, date_pick: DateCandidate | None, sign: SignVerdict
) -> list[str]:
    """The adapter notes column of the VERDICT block, one bullet per rule."""
    notes: list[str] = []
    if date_pick is not None:
        if date_pick.verdict == "DD/MM":
            notes.append(
                f"parse {date_pick.column} as DD/MM/YYYY, then emit YYYY-MM-DD "
                "for the builder"
            )
        elif date_pick.verdict == "MM/DD":
            notes.append(
                f"parse {date_pick.column} as MM/DD/YYYY, then emit YYYY-MM-DD "
                "for the builder"
            )
        elif date_pick.verdict == "ambiguous":
            notes.append(
                f"{date_pick.column} date order is ambiguous: confirm it against "
                "a known date (the Canada default is DD/MM) before trusting "
                "the range"
            )
        elif date_pick.verdict == "compact":
            notes.append(
                f"parse {date_pick.column} as YYYYMMDD, then emit YYYY-MM-DD "
                "for the builder"
            )
        elif date_pick.verdict == "unparsed":
            notes.append(
                f"{date_pick.column} did not parse as a date: {date_pick.proof}"
            )
    if sign.verdict == "separate debit/credit columns":
        notes.append(
            f"amount = {sign.credit_column} minus {sign.debit_column}, then drop "
            "the pair so debits end up negative"
        )
    elif sign.verdict == "positive amount with type column":
        notes.append(
            f"pass the {sign.type_column} column through (the builder lets "
            "transaction_type win) or negate debit rows"
        )
    elif sign.verdict == "no sign convention detected":
        notes.append(
            "run the balance continuity check (docs/research.md step 8) before "
            "trusting any sign"
        )
    if table.encoding == "latin-1":
        notes.append("re-encode the file to UTF-8 in the adapter before committing it")
    if table.delimiter and table.delimiter != ",":
        notes.append(
            f"the source delimiter is {DELIMITERS[table.delimiter]}: pass it "
            "explicitly when reading"
        )
    if table.row_sampled:
        cap_mb = MAX_INPUT_CSV_BYTES // (1024 * 1024)
        notes.append(
            f"input exceeds the {cap_mb} MB builder cap: the probe shows the "
            f"first {PROBE_ROW_SAMPLE} rows, so aggregate to daily category rows "
            "or raise the cap deliberately"
        )
    notes.append(
        "remap the real category labels onto the pipeline set (Dining, "
        "Groceries, Retail, Subscriptions, Transit, Travel, Utilities, Income); "
        "unknown labels become Other"
    )
    return notes


def verdict_lines(
    table: ProbeTable,
    numeric: Sequence[NumericCandidate],
    dates: Sequence[DateCandidate],
    sign: SignVerdict,
    categories: Sequence[CategoryCandidate],
) -> list[str]:
    """The VERDICT block: one line per canonical target, then the notes."""
    frame = table.frame
    rows = len(frame)
    columns = [str(column) for column in frame.columns]
    numeric_columns = [entry.column for entry in numeric]
    used: set[str] = set()
    lines: list[str] = []

    id_column = find_target_column(columns, ID_TARGET_HINTS)
    if id_column:
        distinct = int(frame[id_column].nunique(dropna=True))
        if distinct == rows:
            detail = f"{distinct} distinct values"
        else:
            detail = f"only {distinct} of {rows} rows distinct, deduplicate or synthesize ids"
        lines.append(f"  {'transaction_id':<17} -> {id_column} ({detail})")
        used.add(id_column)
    else:
        lines.append(
            f"  {'transaction_id':<17} -> MISSING, synthesize TAN style row ids "
            "in the adapter (the builder requires it)"
        )

    parsed_dates = [entry for entry in dates if entry.verdict != "unparsed"]
    pool = list(parsed_dates) if parsed_dates else list(dates)
    date_pick = pool[0] if pool else None
    if date_pick is not None:
        lines.append(
            f"  {'date':<17} -> {date_pick.column} ({date_target_detail(date_pick)})"
        )
        used.add(date_pick.column)
    else:
        lines.append(
            f"  {'date':<17} -> MISSING, no column parses as a date "
            "(the builder requires YYYY-MM-DD)"
        )

    hour_column = find_target_column(columns, HOUR_TARGET_HINTS)
    if hour_column:
        lines.append(f"  {'hour':<17} -> {hour_column} (integer hour column, 0 to 23)")
        used.add(hour_column)
    else:
        timed = [entry.column for entry in dates if entry.has_time]
        if timed:
            lines.append(
                f"  {'hour':<17} -> derive from {timed[0]} (the builder reads the "
                "hour from a timestamp column)"
            )
            used.add(timed[0])
        else:
            lines.append(
                f"  {'hour':<17} -> absent, the builder assumes 12 for every row"
            )

    if sign.verdict == "separate debit/credit columns":
        lines.append(
            f"  {'amount':<17} -> fold {sign.debit_column} and {sign.credit_column} "
            "into one signed amount column"
        )
        used.update({sign.debit_column, sign.credit_column})
    else:
        amount_column = sign.amount_column or find_target_column(
            numeric_columns, AMOUNT_TARGET_HINTS
        )
        if amount_column:
            lines.append(
                f"  {'amount':<17} -> {amount_column} ({sign.verdict})"
            )
            used.add(amount_column)
        else:
            lines.append(
                f"  {'amount':<17} -> MISSING, no numeric amount column "
                "(the builder requires it)"
            )

    category_pool = [entry.column for entry in categories] or columns
    category_column = find_target_column(category_pool, CATEGORY_TARGET_HINTS)
    if category_column:
        distinct = int(frame[category_column].nunique(dropna=True))
        lines.append(
            f"  {'merchant_category':<17} -> {category_column} ({distinct} distinct labels)"
        )
        used.add(category_column)
    else:
        lines.append(
            f"  {'merchant_category':<17} -> MISSING, pick a low cardinality text "
            "column from the category list above"
        )

    balance_column = find_target_column(numeric_columns, BALANCE_TARGET_HINTS)
    if balance_column:
        entry = next(
            (item for item in numeric if item.column == balance_column), None
        )
        detail = f"{entry.minimum:,.2f} to {entry.maximum:,.2f}" if entry else "numeric"
        lines.append(f"  {'account_balance':<17} -> {balance_column} ({detail})")
        used.add(balance_column)
    else:
        lines.append(
            f"  {'account_balance':<17} -> MISSING, the builder needs it for the "
            "balance series and debt horizon"
        )

    unused = [column for column in columns if column not in used]
    lines.append(
        f"  {'not mapped':<17} -> {', '.join(unused) if unused else 'none'}"
    )
    lines.append(f"  {'adapter notes':<17} ->")
    for note in verdict_notes(table, date_pick, sign):
        lines.append(f"    - {note}")
    return lines


def render_report(table: ProbeTable) -> str:
    """Format the whole probe report as one printable string."""
    numeric = numeric_candidates(table.frame)
    dates = date_candidates(table.frame)
    sign = sign_verdict(table.frame, numeric)
    date_columns = {entry.column for entry in dates}
    categories = category_candidates(table.frame, date_columns)

    rows, column_count = table.frame.shape
    lines: list[str] = ["probe_schema report"]
    lines.append(f"  file: {rel_to_root(table.path)}")
    lines.append(f"  sha256: {table.checksum}")
    lines.append(
        f"  size: {table.size_bytes:,} bytes ({table.size_bytes / 1024:.1f} kB)"
    )
    lines.append(f"  encoding: {table.encoding or 'not applicable (binary workbook)'}")
    if table.delimiter:
        glyph = "TAB" if table.delimiter == "\t" else table.delimiter
        lines.append(f"  delimiter: {DELIMITERS[table.delimiter]} ({glyph})")
    else:
        lines.append("  delimiter: not applicable (workbook sheet)")
    sampled = ""
    if table.row_sampled:
        cap_mb = MAX_INPUT_CSV_BYTES // (1024 * 1024)
        sampled = (
            f" (first {PROBE_ROW_SAMPLE} rows only, input exceeds the "
            f"{cap_mb} MB builder cap)"
        )
    lines.append(f"  rows: {rows}  columns: {column_count}{sampled}")

    lines.append("")
    lines.append("columns (dtype, nulls)")
    shown = [str(column) for column in table.frame.columns][:MAX_REPORTED_COLUMNS]
    for column in shown:
        series = table.frame[column]
        nulls = int(series.isna().sum())
        lines.append(
            f"  {column:<24} {str(series.dtype):<16} nulls {nulls} "
            f"({nulls / rows:.1%})"
        )
    hidden = column_count - len(shown)
    if hidden > 0:
        lines.append(f"  ... and {hidden} more columns (probe shows the first {len(shown)})")

    lines.append("")
    lines.append(f"sample rows ({min(SAMPLE_ROWS, rows)} of {rows})")
    display = table.frame.head(SAMPLE_ROWS).map(cell_text)
    for row_line in display.to_string(index=False).splitlines():
        lines.append(f"  {row_line}")

    lines.append("")
    lines.append("date range candidates")
    if not dates:
        lines.append("  none: no column parses as a date")
        lines.append(
            "  date format verdict: no date column found, the adapter must "
            "build or decode one"
        )
    else:
        for candidate in dates:
            span = (
                f"range {candidate.start} to {candidate.end}"
                if candidate.start
                else "range unknown"
            )
            lines.append(
                f"  {candidate.column}: {candidate.matched}/{candidate.total} values "
                f"match {candidate.format_label}, {span}"
            )
            lines.append(
                f"    date format verdict: {date_verdict_text(candidate)}"
            )

    lines.append("")
    lines.append(f"sign convention verdict: {sign.verdict} ({sign.explanation})")

    lines.append("")
    lines.append("numeric candidates for amount/balance")
    if not numeric:
        lines.append("  none: no column parses as numbers or money")
    for entry in numeric[:MAX_REPORTED_COLUMNS]:
        lines.append(
            f"  {entry.column:<24} {entry.minimum:,.2f} to {entry.maximum:,.2f} "
            f"({entry.negatives} negative, {entry.positives} positive)"
        )
    if len(numeric) > MAX_REPORTED_COLUMNS:
        lines.append(f"  ... and {len(numeric) - MAX_REPORTED_COLUMNS} more numeric columns")

    lines.append("")
    lines.append(f"category-like columns (top {TOP_CATEGORY_VALUES} values)")
    if not categories:
        lines.append("  none: no low cardinality text column found")
    for entry in categories:
        pairs = ", ".join(f"{value} {count}" for value, count in entry.top_values)
        lines.append(f"  {entry.column} ({entry.distinct} distinct): {pairs}")
    if len(categories) >= MAX_CATEGORY_COLUMNS:
        lines.append(f"  ... (category list capped at {MAX_CATEGORY_COLUMNS} columns)")

    lines.append("")
    lines.append("VERDICT (what the tomorrow adapter should map)")
    lines.extend(
        verdict_lines(table, numeric, dates, sign, categories)
    )
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    """Probe the input file and print the full report."""
    parser = argparse.ArgumentParser(
        description="Probe a tabular file and print its schema verdict"
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="source csv, tsv, or xlsx file (read only, any location)",
    )
    args = parser.parse_args(argv)
    table = read_table(args.input)
    print(render_report(table), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
