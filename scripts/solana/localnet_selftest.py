"""Prove the memo send path end to end against a throwaway local validator.

Ledger Odyssey (Sheridan Datathon 2026): the devnet public RPC faucet is
closed (error 410) and the browser faucet needs a GitHub sign in, so this
self test runs the exact same build, sign, send, confirm, and read back code
from send_memo.py against solana-test-validator on 127.0.0.1. When this
prints PASS, only the devnet airdrop stands between us and a real devnet
receipt. No devnet or mainnet traffic ever happens here.

Usage:
    uv run --with solders==0.29.0 python scripts/solana/localnet_selftest.py
    uv run --with solders==0.29.0 python scripts/solana/localnet_selftest.py \
        --text "Ledger Odyssey test"

Devnet only rule still applies to the real send: run send_memo.py for that.
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from solders.hash import Hash

try:
    from send_memo import (
        DEVNET_RPC,
        EVIDENCE_DIR,
        MEMO_PROGRAM_ID,
        build_memo_text,
        build_memo_transaction,
        load_keypair,
        read_memo_from_chain,
        rpc_call,
        sha256_hex,
        wait_for_confirmation,
    )
except ImportError:  # running as python -m scripts.solana.localnet_selftest
    from scripts.solana.send_memo import (
        DEVNET_RPC,
        EVIDENCE_DIR,
        MEMO_PROGRAM_ID,
        build_memo_text,
        build_memo_transaction,
        load_keypair,
        read_memo_from_chain,
        rpc_call,
        sha256_hex,
        wait_for_confirmation,
    )

LOCAL_RPC = "http://127.0.0.1:8899"
RPC_PORT = 8899
AIRDROP_LAMPORTS = 2_000_000_000
STARTUP_TIMEOUT_S = 90.0
DEFAULT_KEYPAIR = Path.home() / ".config" / "solana" / "id.json"
PROGRAMS_DIR = Path(__file__).resolve().parent / "programs"
MEMO_SO = PROGRAMS_DIR / "memo_sq4.so"


def find_cli_binary(name: str) -> Path:
    """Locate an Agave CLI tool on PATH or in the install directory."""
    found = shutil.which(name)
    if found is not None:
        return Path(found)
    fallback = (
        Path.home()
        / ".local"
        / "share"
        / "solana"
        / "install"
        / "active_release"
        / "bin"
        / name
    )
    if fallback.exists():
        return fallback
    raise FileNotFoundError(
        f"{name} not found. Install the Agave CLI "
        "(docs/solana.md step 1) and re-run."
    )


def ensure_memo_program() -> Path:
    """Cache the Memo program binary by dumping it from devnet once.

    solana-test-validator ships without SPL programs, so the local run needs
    the real Memo program bytes. The dump is a read only RPC call against
    devnet and never moves funds. The .so is gitignored and regenerable.
    """
    if MEMO_SO.exists() and MEMO_SO.stat().st_size > 0:
        return MEMO_SO
    PROGRAMS_DIR.mkdir(parents=True, exist_ok=True)
    dumper = find_cli_binary("solana")
    result = subprocess.run(
        [
            str(dumper),
            "program",
            "dump",
            str(MEMO_PROGRAM_ID),
            str(MEMO_SO),
            "--url",
            DEVNET_RPC,
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"solana program dump failed: {result.stderr.strip() or result.stdout.strip()}"
        )
    return MEMO_SO


def port_is_free(port: int) -> bool:
    """Return True when nothing listens on 127.0.0.1:port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        return probe.connect_ex(("127.0.0.1", port)) != 0


def start_validator(
    binary: Path, ledger_dir: Path, log_path: Path, memo_so: Path
) -> tuple:
    """Spawn solana-test-validator with the Memo program at genesis."""
    log_handle = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            str(binary),
            "--quiet",
            "--ledger",
            str(ledger_dir),
            "--bpf-program",
            str(MEMO_PROGRAM_ID),
            str(memo_so),
        ],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
    )
    return process, log_handle


def stop_validator(process: subprocess.Popen, log_handle) -> None:
    """Terminate the validator and release its ports."""
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    log_handle.close()


def wait_for_validator(rpc_url: str, timeout_s: float) -> None:
    """Poll getHealth until the local validator answers ok, or raise."""
    deadline = time.monotonic() + timeout_s
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if rpc_call("getHealth", [], rpc_url) == "ok":
                return
        except Exception as exc:  # noqa: BLE001, connection is expected to flap
            last_error = exc
        time.sleep(0.5)
    raise TimeoutError(
        f"Local validator not healthy after {timeout_s:.0f}s: {last_error}"
    )


def fund_locally(rpc_url: str, pubkey: str, lamports: int) -> int:
    """Airdrop from the local faucet and wait until the balance lands."""
    rpc_call("requestAirdrop", [pubkey, lamports], rpc_url)
    deadline = time.monotonic() + 30.0
    while time.monotonic() < deadline:
        balance = rpc_call(
            "getBalance",
            [pubkey, {"commitment": "confirmed"}],
            rpc_url,
        )
        value = int(balance["value"])
        if value >= lamports:
            return value
        time.sleep(0.3)
    raise TimeoutError("Local airdrop did not land within 30s")


def next_local_evidence_path(date_stamp: str) -> Path:
    """Return evidence/memo-<date>-localnet.json, counter on collision."""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    candidate = EVIDENCE_DIR / f"memo-{date_stamp}-localnet.json"
    counter = 1
    while candidate.exists():
        candidate = EVIDENCE_DIR / f"memo-{date_stamp}-localnet-{counter}.json"
        counter += 1
    return candidate


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the memo send path against a local validator."
    )
    parser.add_argument(
        "--text",
        default="Ledger Odyssey test",
        help="Text to hash and anchor (default: 'Ledger Odyssey test')",
    )
    parser.add_argument(
        "--keypair",
        type=Path,
        default=DEFAULT_KEYPAIR,
        help=f"Keypair JSON path (default: {DEFAULT_KEYPAIR})",
    )
    return parser.parse_args(argv)


def run_selftest(text: str, keypair_path: Path) -> Path:
    """Execute the full send path locally and return the evidence path."""
    if not port_is_free(RPC_PORT):
        raise RuntimeError(
            f"Port {RPC_PORT} is in use, stop whatever holds it "
            "(usually another solana-test-validator) and re-run."
        )

    validator_binary = find_cli_binary("solana-test-validator")
    memo_so = ensure_memo_program()
    payer = load_keypair(keypair_path)
    memo_text = build_memo_text(text, text.encode("utf-8"))
    digest = sha256_hex(text.encode("utf-8"))

    work_dir = Path(tempfile.mkdtemp(prefix="solana-selftest-"))
    ledger_dir = work_dir / "ledger"
    log_path = work_dir / "validator.log"
    process, log_handle = start_validator(
        validator_binary, ledger_dir, log_path, memo_so
    )

    try:
        print(f"Validator: {validator_binary}")
        print(f"RPC:       {LOCAL_RPC}")
        wait_for_validator(LOCAL_RPC, STARTUP_TIMEOUT_S)
        print("Validator healthy")

        funded = fund_locally(LOCAL_RPC, str(payer.pubkey()), AIRDROP_LAMPORTS)
        print(f"Funded locally: {funded} lamports")

        latest = rpc_call(
            "getLatestBlockhash", [{"commitment": "finalized"}], LOCAL_RPC
        )
        blockhash = Hash.from_string(latest["value"]["blockhash"])
        wire_bytes = build_memo_transaction(payer, memo_text, blockhash)

        signature = rpc_call(
            "sendTransaction",
            [
                base64.b64encode(wire_bytes).decode("ascii"),
                {
                    "encoding": "base64",
                    "skipPreflight": False,
                    "commitment": "confirmed",
                },
            ],
            LOCAL_RPC,
        )
        print(f"Signature: {signature}")

        status = wait_for_confirmation(str(signature), 60.0, LOCAL_RPC)
        slot, block_time, memo_on_chain = read_memo_from_chain(
            str(signature), LOCAL_RPC
        )
        if memo_on_chain != memo_text:
            raise RuntimeError(
                "On chain memo does not match what we sent: "
                f"{memo_on_chain!r} != {memo_text!r}"
            )

        genesis_hash = rpc_call("getGenesisHash", [], LOCAL_RPC)
        version = rpc_call("getVersion", [], LOCAL_RPC)
        date_stamp = datetime.now().astimezone().date().isoformat()
        evidence_path = next_local_evidence_path(date_stamp)
        evidence = {
            "signature": str(signature),
            "slot": slot,
            "cluster": "localnet",
            "rpc_url": LOCAL_RPC,
            "confirmed_at": datetime.now(timezone.utc).isoformat(
                timespec="seconds"
            ),
            "confirmation_status": status["confirmationStatus"],
            "block_time": block_time,
            "explorer_url": None,
            "signer_pubkey": str(payer.pubkey()),
            "payload": {
                "algorithm": "sha256",
                "digest_hex": digest,
                "source": f"text:{text}",
                "memo_text": memo_text,
            },
            "memo_text_on_chain": memo_on_chain,
            "matches_local": memo_on_chain == memo_text,
            "genesis_hash": genesis_hash,
            "validator_version": version,
            "note": (
                "Local validator smoke test of the send path, not a devnet "
                "receipt. The devnet receipt comes from send_memo.py and "
                "writes evidence/memo-<date>.json without this suffix."
            ),
        }
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(
            json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
        )

        print(f"Confirmed: {status['confirmationStatus']} at slot {slot}")
        print(f"Memo read back matches: {memo_on_chain == memo_text}")
        print(f"Evidence:  {evidence_path}")
        shutil.rmtree(work_dir, ignore_errors=True)
        return evidence_path
    except Exception:
        print(f"Validator log kept at: {log_path}", file=sys.stderr)
        raise
    finally:
        stop_validator(process, log_handle)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    run_selftest(args.text, args.keypair)
    print("PASS: build, sign, send, confirm, and read back all work")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:  # surface a clear failure for build gates
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
