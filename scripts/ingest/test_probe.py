"""Unit tests for the schema agnostic ingest probe.

The Saturday dataset has an unknown schema, so the probe is the only piece
of ingest that must work on every shape. These tests pin the axes the
adapter cannot assume:

* encoding: utf-8, utf-8 with BOM, latin-1, and a multi byte character
  split by the detection prefix cut;
* delimiter: comma, semicolon, and tab;
* date order: DD/MM proved by a first position value above 12, MM/DD proved
  by a second position value above 12, and the ambiguous case;
* sign convention: single signed amount, separate debit/credit columns,
  positive amount with a type column (by name and by value), and no signal;
* friendly failure: binary garbage, prose without delimiters, zero byte
  files, comment only files, header only files, and missing files all exit
  1 through fail() with one stderr line and never a traceback.

    uv run pytest scripts/ingest/test_probe.py
"""

from __future__ import annotations

import codecs
from pathlib import Path
from typing import Callable

import pandas as pd
import pytest

from scripts.ingest import probe_schema
from scripts.pipeline_lib import REPO_ROOT, sha256_file

MOCK_LEDGER: Path = REPO_ROOT / "data" / "mock" / "tangerine_transactions.csv"


def write_text(
    tmp_path: Path, name: str, text: str, encoding: str = "utf-8"
) -> Path:
    """Write one probe fixture with the requested text encoding."""
    path = tmp_path / name
    path.write_text(text, encoding=encoding)
    return path


def expect_friendly_failure(
    action: Callable[[], object], capsys: pytest.CaptureFixture[str], needle: str
) -> None:
    """Assert fail(): exit code 1, one error line on stderr, no traceback."""
    with pytest.raises(SystemExit) as excinfo:
        action()
    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "Traceback" not in captured.err
    assert captured.err.startswith("error: ")
    assert needle in captured.err


# Money parsing (feeds the numeric candidates)

@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("$23,679", 23679.0),
        ("1234,56", 1234.56),
        ("-15.44", -15.44),
        ("CAD 1,234.56", 1234.56),
        ("1,234", 1234.0),
        ("12,345,678", 12345678.0),
        ("(150.00)", -150.0),
        ("12,3", 12.3),
        ("TAN-000001", None),
        ("Dining", None),
        ("2025-11-01", None),
        ("hello, world", None),
    ],
)
def test_parse_money_handles_currency_variants(text: str, expected: float | None) -> None:
    """Currency noise parses; identifiers, dates, and prose stay None."""
    got = probe_schema.parse_money(text)
    if expected is None:
        assert got is None
    else:
        assert got == pytest.approx(expected)


def test_numeric_candidates_accept_money_strings_and_skip_ids() -> None:
    """A currency string column becomes a candidate, an id column never does."""
    frame = pd.DataFrame(
        {"ref": ["TAN-1", "TAN-2"], "salary": ["$23,679", "1234,56"]}
    )
    candidates = probe_schema.numeric_candidates(frame)
    assert [entry.column for entry in candidates] == ["salary"]
    assert candidates[0].minimum == pytest.approx(1234.56)
    assert candidates[0].maximum == pytest.approx(23679.0)


# Encoding detection

def test_detect_encoding_strips_a_utf8_bom() -> None:
    """A BOM selects utf-8-sig so the first header survives intact."""
    raw = "date,amount\n2025-12-05,-4.50\n".encode("utf-8-sig")
    assert raw.startswith(codecs.BOM_UTF8)
    assert probe_schema.detect_encoding(raw, truncated=False) == "utf-8-sig"


def test_detect_encoding_accepts_plain_utf8() -> None:
    """Valid UTF-8 without a BOM is reported as utf-8."""
    assert probe_schema.detect_encoding("café,1\n".encode("utf-8"), truncated=False) == "utf-8"


def test_detect_encoding_falls_back_to_latin1() -> None:
    """A whole file that does not decode as UTF-8 becomes latin-1."""
    raw = "Café au lait".encode("latin-1")
    assert probe_schema.detect_encoding(raw, truncated=False) == "latin-1"
    # Far from the prefix cut, a latin-1 byte in a long file stays latin-1.
    far = b"a" * 100 + "\xe9".encode("latin-1") + b"b" * 100
    assert probe_schema.detect_encoding(far, truncated=True) == "latin-1"


def test_detect_encoding_backs_off_a_split_multibyte_char() -> None:
    """A UTF-8 sequence split by the prefix cut still reports utf-8."""
    whole = "é" * 10
    cut = whole.encode("utf-8")[:-1]
    assert probe_schema.detect_encoding(cut, truncated=True) == "utf-8"
    # The same bytes as a complete file are invalid UTF-8, so latin-1 wins.
    assert probe_schema.detect_encoding(cut, truncated=False) == "latin-1"


# Delimiter detection and full reads

@pytest.mark.parametrize(
    ("delimiter", "label"),
    [(",", "comma"), (";", "semicolon"), ("\t", "tab")],
)
def test_detect_delimiter_variants(delimiter: str, label: str) -> None:
    """Comma, semicolon, and tab tables each resolve to their own character."""
    text = delimiter.join(["date", "amount", "balance"])
    text += "\n" + delimiter.join(["2025-12-05", "-4.50", "100.00"]) + "\n"
    text += delimiter.join(["2025-12-06", "1200.00", "1300.00"]) + "\n"
    assert probe_schema.detect_delimiter(text) == delimiter
    assert probe_schema.DELIMITERS[delimiter] == label


def test_read_table_reads_a_utf8_file(tmp_path: Path) -> None:
    """Happy path: utf-8, comma, both reported and parsed correctly."""
    path = write_text(
        tmp_path,
        "ledger.csv",
        "date,description,amount\n"
        "2025-12-05,Café Mono,-4.50\n"
        "2025-12-06,Loblaws,-82.13\n",
    )
    table = probe_schema.read_table(path)
    assert table.encoding == "utf-8"
    assert table.delimiter == ","
    assert "Café Mono" in set(table.frame["description"])
    assert table.checksum == sha256_file(path)


def test_read_table_reads_a_latin1_file(tmp_path: Path) -> None:
    """French accents in ISO-8859-1 are detected and read back intact."""
    path = write_text(
        tmp_path,
        "accented.csv",
        "date,description,amount\n2025-12-05,Boîte à pain,-4.50\n",
        encoding="latin-1",
    )
    table = probe_schema.read_table(path)
    assert table.encoding == "latin-1"
    assert "Boîte à pain" in set(table.frame["description"])
    assert table.delimiter == ","


def test_read_table_reads_a_bom_file_without_leaking_the_bom(tmp_path: Path) -> None:
    """utf-8-sig keeps the BOM off the first header name."""
    path = write_text(
        tmp_path,
        "bom.csv",
        "transaction_id,amount\nTAN-1,-4.50\n",
        encoding="utf-8-sig",
    )
    table = probe_schema.read_table(path)
    assert table.encoding == "utf-8-sig"
    assert list(table.frame.columns) == ["transaction_id", "amount"]


@pytest.mark.parametrize(
    ("name", "delimiter"),
    [("comma.csv", ","), ("semicolon.csv", ";"), ("tab.tsv", "\t")],
)
def test_read_table_reads_every_delimiter(tmp_path: Path, name: str, delimiter: str) -> None:
    """All three delimiters survive the full sniff and read path."""
    rows = [
        ["date", "amount", "balance"],
        ["2025-12-05", "-4.50", "100.00"],
        ["2025-12-06", "-82.13", "17.87"],
        ["2025-12-07", "1200.00", "1217.87"],
    ]
    path = write_text(tmp_path, name, "\n".join(delimiter.join(row) for row in rows) + "\n")
    table = probe_schema.read_table(path)
    assert table.delimiter == delimiter
    assert list(table.frame.columns) == ["date", "amount", "balance"]
    assert len(table.frame) == 3


# Date format verdicts

def test_date_verdict_dd_mm_when_a_first_position_value_exceeds_12() -> None:
    """13/05/2025 proves day first, and the range is parsed day first."""
    frame = pd.DataFrame(
        {"date": ["13/05/2025", "01/06/2025", "31/12/2025", "28/02/2026"]}
    )
    [candidate] = probe_schema.date_candidates(frame)
    assert candidate.verdict == "DD/MM"
    assert candidate.dayfirst is True
    assert "first position value 31 proves day first" in candidate.proof
    assert candidate.start == "2025-05-13"
    assert candidate.end == "2026-02-28"


def test_date_verdict_mm_dd_when_a_second_position_value_exceeds_12() -> None:
    """05/13/2025 proves month first, and the range is parsed month first."""
    frame = pd.DataFrame(
        {"date": ["05/13/2025", "12/01/2025", "06/30/2025"]}
    )
    [candidate] = probe_schema.date_candidates(frame)
    assert candidate.verdict == "MM/DD"
    assert candidate.dayfirst is False
    assert "second position value 30 proves month first" in candidate.proof
    assert candidate.start == "2025-05-13"
    assert candidate.end == "2025-12-01"


def test_date_verdict_is_ambiguous_when_both_positions_stay_small() -> None:
    """Every value at most 12 in both positions: the probe must not guess."""
    frame = pd.DataFrame(
        {"date": ["05/12/2025", "01/02/2025", "11/03/2025"]}
    )
    [candidate] = probe_schema.date_candidates(frame)
    assert candidate.verdict == "ambiguous"
    assert candidate.dayfirst is True  # Canada default, stated as a preference
    assert "at most 12 in both positions" in candidate.proof


def test_date_range_and_verdict_for_iso_values() -> None:
    """ISO values report ISO, unambiguous, with the exact min and max."""
    frame = pd.DataFrame({"date": ["2026-10-31", "2025-11-01"]})
    [candidate] = probe_schema.date_candidates(frame)
    assert candidate.verdict == "ISO"
    assert candidate.format_label == "YYYY-MM-DD"
    assert candidate.start == "2025-11-01"
    assert candidate.end == "2026-10-31"


# Sign convention verdicts

def test_sign_single_signed_amount() -> None:
    """Mixed signs in the amount column is the mock ledger's convention."""
    frame = pd.DataFrame(
        {"amount": [-5.0, 12.0, -3.5], "balance": [100.0, 112.0, 108.5]}
    )
    verdict = probe_schema.sign_verdict(frame, probe_schema.numeric_candidates(frame))
    assert verdict.verdict == "single signed amount"
    assert verdict.amount_column == "amount"
    assert "debits are already negative" in verdict.explanation


def test_sign_separate_debit_and_credit_columns() -> None:
    """A debit/credit name pair wins before the signed scan, by design."""
    frame = pd.DataFrame(
        {
            "debit_amount": [5.0, 3.0, 0.0],
            "credit_amount": [0.0, 0.0, 10.0],
            "balance": [95.0, 92.0, 102.0],
        }
    )
    verdict = probe_schema.sign_verdict(frame, probe_schema.numeric_candidates(frame))
    assert verdict.verdict == "separate debit/credit columns"
    assert verdict.debit_column == "debit_amount"
    assert verdict.credit_column == "credit_amount"


def test_sign_positive_amount_with_a_type_column() -> None:
    """All non negative amounts plus a transaction_type column: pass it through."""
    frame = pd.DataFrame(
        {
            "amount": [5.0, 3.0, 10.0],
            "transaction_type": ["debit", "debit", "credit"],
        }
    )
    verdict = probe_schema.sign_verdict(frame, probe_schema.numeric_candidates(frame))
    assert verdict.verdict == "positive amount with type column"
    assert verdict.amount_column == "amount"
    assert verdict.type_column == "transaction_type"


def test_sign_positive_amount_with_a_value_based_type_column() -> None:
    """A type column with no type like name still counts, detected by values."""
    frame = pd.DataFrame(
        {"amount": [5.0, 3.0, 10.0], "flag": ["withdrawal", "withdrawal", "deposit"]}
    )
    verdict = probe_schema.sign_verdict(frame, probe_schema.numeric_candidates(frame))
    assert verdict.verdict == "positive amount with type column"
    assert verdict.type_column == "flag"


def test_sign_without_any_signal_says_so() -> None:
    """No mixed signs and no type column: the probe must not invent a rule."""
    frame = pd.DataFrame({"memo": ["a", "b"], "count": [1.0, 2.0]})
    verdict = probe_schema.sign_verdict(frame, probe_schema.numeric_candidates(frame))
    assert verdict.verdict == "no sign convention detected"
    assert verdict.amount_column == ""


# Report and CLI

def test_report_states_the_verdict_block_for_debit_credit_input(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A semicolon DD/MM debit/credit file maps fully in the VERDICT block."""
    path = write_text(
        tmp_path,
        "ugly.csv",
        "Transaction ID;Date;Debit Amount;Credit Amount;Balance;Category\n"
        "T-1;13/05/2025;12.50;;100.00;Groceries\n"
        "T-2;14/05/2025;;2500.00;2600.00;Income\n"
        "T-3;20/05/2025;60.00;;2540.00;Dining\n"
        "T-4;01/06/2025;45.00;;2495.00;Transit\n",
    )
    assert probe_schema.main(["--input", str(path)]) == 0
    out = capsys.readouterr().out
    assert "VERDICT (what the tomorrow adapter should map)" in out
    assert "separate debit/credit columns" in out
    assert (
        "fold Debit Amount and Credit Amount into one signed amount column" in out
    )
    assert "parse as DD/MM/YYYY" in out
    assert "delimiter: semicolon" in out
    assert "the builder assumes 12 for every row" in out
    assert "not mapped        -> Category" not in out  # Category is mapped
    assert "merchant_category -> Category" in out


def test_probe_runs_on_the_mock_ledger(capsys: pytest.CaptureFixture[str]) -> None:
    """The committed mock must probe green: checksum, ISO dates, signed amount."""
    assert probe_schema.main(["--input", str(MOCK_LEDGER)]) == 0
    out = capsys.readouterr().out
    assert sha256_file(MOCK_LEDGER) in out
    assert "encoding: utf-8" in out
    assert "delimiter: comma (,)" in out
    assert "date format verdict: ISO YYYY-MM-DD, unambiguous" in out
    assert "sign convention verdict: single signed amount" in out
    assert "VERDICT (what the tomorrow adapter should map)" in out
    assert "merchant_category -> merchant_category" in out


# Friendly failures

def test_zero_byte_file_fails_friendly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """An empty file exits 1 with the same one liner as the builders."""
    path = tmp_path / "empty.csv"
    path.write_bytes(b"")
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]), capsys, "zero bytes"
    )


def test_missing_input_file_fails_friendly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """A wrong path names the path instead of raising FileNotFoundError."""
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(tmp_path / "nope.csv")]),
        capsys,
        "input file not found",
    )


def test_binary_garbage_fails_friendly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """NUL bytes mark a binary file: friendly error, never a parser traceback."""
    path = tmp_path / "blob.csv"
    path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x01\x02payload\x00")
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]), capsys, "NUL bytes"
    )


def test_prose_without_delimiters_fails_friendly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """A text file with no comma, semicolon, or tab is not a table."""
    path = write_text(
        tmp_path, "notes.txt", "this file is just prose\nno separators anywhere\n"
    )
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]),
        capsys,
        "does not look like a delimited table",
    )


def test_comment_only_file_fails_friendly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """Comment lines are skipped by the builders, so there is nothing to sniff."""
    path = write_text(tmp_path, "comment.csv", "# generated by something\n# more notes\n")
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]),
        capsys,
        "no non comment lines",
    )


def test_header_only_csv_fails_without_data_rows(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """A header with no rows below it fails the same way build_players does."""
    path = write_text(tmp_path, "header.csv", "transaction_id,date\n")
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]),
        capsys,
        "no data rows below the header",
    )


def test_xlsx_without_an_engine_says_so(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """xlsx without openpyxl names the missing engine instead of crashing."""
    path = tmp_path / "book.xlsx"
    path.write_bytes(b"not really a workbook")
    monkeypatch.setattr(probe_schema, "engine_installed", lambda _name: False)
    expect_friendly_failure(
        lambda: probe_schema.main(["--input", str(path)]), capsys, "openpyxl"
    )


def test_excel_engine_resolves_per_suffix(monkeypatch: pytest.MonkeyPatch) -> None:
    """xlsx and xlsm need openpyxl, xls needs xlrd, and other suffixes fail."""
    monkeypatch.setattr(probe_schema, "engine_installed", lambda _name: True)
    assert probe_schema.excel_engine(".xlsx") == "openpyxl"
    assert probe_schema.excel_engine(".xlsm") == "openpyxl"
    assert probe_schema.excel_engine(".xls") == "xlrd"
