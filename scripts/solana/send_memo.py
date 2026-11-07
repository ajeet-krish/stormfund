"""Anchor a SHA256 checksum in a Solana devnet Memo program transaction.

Ledger Odyssey (Sheridan Datathon 2026): the report footer shows this
receipt so judges can verify the exact findings.json bytes that were on
chain at build time.

Devnet only, the only accepted cluster mode. The RPC endpoint is hardcoded
to https://api.devnet.solana.com, the genesis hash is checked against the
known devnet genesis before anything is signed, and the script refuses to
run against any other cluster. No real funds are ever involved; devnet SOL
has no value. Localnet runs live in localnet_selftest.py instead.

Usage:
    uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
        --text "Ledger Odyssey test"
    uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
        --file public/data/findings.json \
        --prefix "Sheridan Datathon 2026 findings.json"
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

DEVNET_RPC = "https://api.devnet.solana.com"
DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
MEMO_PROGRAM_ID = Pubkey.from_string(
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
)
DEFAULT_KEYPAIR = Path.home() / ".config" / "solana" / "id.json"
EVIDENCE_DIR = Path(__file__).resolve().parent / "evidence"
CONFIRM_TIMEOUT_S = 90.0
POLL_INTERVAL_S = 1.5
DIGEST_RE = re.compile(r"sha256:([0-9a-f]{64})")


def rpc_call(method: str, params: list, rpc_url: str = DEVNET_RPC) -> object:
    """POST one JSON-RPC request and return the result field.

    Defaults to devnet. Only the localnet self test passes another URL; the
    devnet default is what keeps every real run on the test cluster.
    """
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode("utf-8")
    request = urllib.request.Request(
        rpc_url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.load(response)
    if "error" in body:
        raise RuntimeError(f"RPC error for {method}: {body['error']}")
    return body["result"]


def assert_devnet_cluster(rpc_url: str = DEVNET_RPC) -> str:
    """Refuse to continue unless the endpoint really is devnet.

    The genesis hash is checked before any transaction is built, so a
    mistyped endpoint can never reach mainnet or testnet. Fail closed:
    an unexpected genesis hash stops the run with a clear message.
    """
    genesis = str(rpc_call("getGenesisHash", [], rpc_url))
    if genesis != DEVNET_GENESIS_HASH:
        raise RuntimeError(
            "Cluster guard failed: genesis hash "
            f"{genesis} does not match devnet {DEVNET_GENESIS_HASH}. "
            "Refusing to send. Devnet only, no real funds."
        )
    return genesis


def load_keypair(path: Path) -> Keypair:
    """Load a Solana CLI JSON keypair (64 byte array) from disk."""
    if not path.exists():
        raise FileNotFoundError(
            f"No keypair at {path}. Create one with: "
            f"solana-keygen new --no-bip39-passphrase --outfile {path}"
        )
    secret_bytes = json.loads(path.read_text(encoding="utf-8"))
    return Keypair.from_bytes(bytes(secret_bytes))


def sha256_hex(data: bytes) -> str:
    """Return the lowercase hex SHA256 digest of data."""
    return hashlib.sha256(data).hexdigest()


def build_memo_text(prefix: str, data: bytes) -> str:
    """Compose the on chain memo: prefix, then 'sha256:' plus the digest.

    The digest goes last so a reader can verify the exact hashed bytes
    against the file named in the prefix.
    """
    memo_text = f"{prefix} sha256:{sha256_hex(data)}"
    if DIGEST_RE.search(memo_text) is None:
        raise RuntimeError("Memo text does not carry a 64 hex character digest")
    return memo_text


def build_memo_transaction(payer: Keypair, memo_text: str, blockhash: Hash) -> bytes:
    """Build and sign a single instruction Memo transaction, return wire bytes."""
    instruction = Instruction(MEMO_PROGRAM_ID, memo_text.encode("utf-8"), [])
    transaction = Transaction.new_with_payer([instruction], payer.pubkey())
    transaction.sign([payer], blockhash)
    return bytes(transaction)


def wait_for_confirmation(
    signature: str, timeout_s: float, rpc_url: str = DEVNET_RPC
) -> dict:
    """Poll getSignatureStatuses until confirmed or finalized, or raise."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        result = rpc_call(
            "getSignatureStatuses",
            [[signature], {"searchTransactionHistory": False}],
            rpc_url,
        )
        statuses = result.get("value") or [None]
        status = statuses[0]
        if status is not None:
            if status.get("err") is not None:
                raise RuntimeError(
                    f"Transaction {signature} failed on chain: {status['err']}"
                )
            if status.get("confirmationStatus") in ("confirmed", "finalized"):
                return status
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(
        f"Transaction {signature} not confirmed within {timeout_s:.0f}s"
    )


def read_memo_from_chain(
    signature: str, rpc_url: str = DEVNET_RPC
) -> tuple[int, int | None, str]:
    """Fetch the confirmed transaction and read its Memo instruction.

    Returns (slot, block_time, memo_text) from getTransaction with encoding
    jsonParsed, so the read back comes from chain data rather than our local
    copy of the memo. The separate getParsedTransaction method is disabled on
    the public devnet endpoint (error -32601), while getTransaction works in
    jsonParsed, base64, and json encodings and answers browser CORS preflight.
    """
    result = rpc_call(
        "getTransaction",
        [
            signature,
            {
                "encoding": "jsonParsed",
                "commitment": "confirmed",
                "maxSupportedTransactionVersion": 0,
            },
        ],
        rpc_url,
    )
    if result is None:
        raise RuntimeError(f"getTransaction returned null for {signature}")
    slot = result["slot"]
    block_time = result.get("blockTime")
    for compiled in result["transaction"]["message"]["instructions"]:
        if (
            compiled.get("program") == "spl-memo"
            and compiled.get("programId") == str(MEMO_PROGRAM_ID)
        ):
            return slot, block_time, str(compiled["parsed"])
    raise RuntimeError(f"No Memo instruction found in transaction {signature}")


def next_evidence_path(date_stamp: str) -> Path:
    """Return evidence/memo-<date>.json, adding a counter on collision."""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    candidate = EVIDENCE_DIR / f"memo-{date_stamp}.json"
    counter = 1
    while candidate.exists():
        candidate = EVIDENCE_DIR / f"memo-{date_stamp}-{counter}.json"
        counter += 1
    return candidate


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Anchor a SHA256 digest in a Solana devnet Memo transaction."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--text",
        help="Plain text to hash (default: 'Ledger Odyssey test')",
    )
    source.add_argument(
        "--file",
        type=Path,
        help="File whose bytes are hashed (for example public/data/findings.json)",
    )
    parser.add_argument(
        "--prefix",
        help="Label placed in front of the digest inside the memo. "
        "Defaults to the file path or the hashed text.",
    )
    parser.add_argument(
        "--cluster",
        choices=["devnet"],
        default="devnet",
        help="Target cluster mode. Only devnet is accepted; localnet lives "
        "in localnet_selftest.py and mainnet is never used (no real funds).",
    )
    parser.add_argument(
        "--keypair",
        type=Path,
        default=DEFAULT_KEYPAIR,
        help=f"Keypair JSON path (default: {DEFAULT_KEYPAIR})",
    )
    parser.add_argument(
        "--evidence",
        type=Path,
        default=None,
        help="Evidence JSON output path (default: scripts/solana/evidence/memo-<date>.json)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=CONFIRM_TIMEOUT_S,
        help=f"Confirmation timeout in seconds (default: {CONFIRM_TIMEOUT_S:.0f})",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.cluster != "devnet":
        raise RuntimeError(
            f"Cluster mode {args.cluster!r} is not allowed. Devnet only: "
            "no real funds, no financial data on chain."
        )

    if args.file is not None:
        data = args.file.read_bytes()
        source = f"file:{args.file.as_posix()}"
        default_prefix = args.file.as_posix()
    else:
        text = args.text if args.text is not None else "Ledger Odyssey test"
        data = text.encode("utf-8")
        source = f"text:{text}"
        default_prefix = text

    prefix = args.prefix if args.prefix is not None else default_prefix
    memo_text = build_memo_text(prefix, data)
    digest = sha256_hex(data)

    genesis = assert_devnet_cluster()
    print(f"Cluster:  devnet (genesis {genesis})")

    payer = load_keypair(args.keypair)
    print(f"Signer: {payer.pubkey()}")
    print(f"Source: {source}")
    print(f"SHA256: {digest}")

    balance = rpc_call("getBalance", [str(payer.pubkey())])
    lamports = int(balance["value"])
    if lamports < 5_000:
        raise RuntimeError(
            f"Devnet balance is {lamports} lamports, a transaction needs "
            "5000 lamports of fee. Funding order, AI agents must not use web "
            "faucets: (a) solana airdrop 2 "
            f"{payer.pubkey()} --url devnet (observed 2026-11-06: RPC error "
            "410, 'The RPC faucet is closed on this cluster'); "
            "(b) devnet-pow mine -d 3 --reward 0.02 --no-infer "
            "-t 5000000000, which itself needs 5000 lamports already in the "
            "wallet to pay the claim fee; (c) solana-test-validator plus "
            "solana airdrop 100 for offline testing only, local SOL never "
            "reaches devnet. A human operator may fund "
            f"{payer.pubkey()} once at https://faucet.solana.com."
        )
    print(f"Balance: {lamports} lamports (devnet)")

    latest = rpc_call(
        "getLatestBlockhash", [{"commitment": "finalized"}]
    )
    blockhash = Hash.from_string(latest["value"]["blockhash"])
    wire_bytes = build_memo_transaction(payer, memo_text, blockhash)

    signature = rpc_call(
        "sendTransaction",
        [
            base64.b64encode(wire_bytes).decode("ascii"),
            {"encoding": "base64", "skipPreflight": False, "commitment": "confirmed"},
        ],
    )
    print(f"Signature: {signature}")

    status = wait_for_confirmation(str(signature), args.timeout)
    slot, block_time, memo_on_chain = read_memo_from_chain(str(signature))

    if memo_on_chain != memo_text:
        raise RuntimeError(
            "On chain memo does not match what we sent: "
            f"{memo_on_chain!r} != {memo_text!r}"
        )

    local_date = datetime.now().astimezone().date().isoformat()
    evidence_path = (
        args.evidence if args.evidence is not None else next_evidence_path(local_date)
    )
    evidence = {
        "signature": str(signature),
        "slot": slot,
        "payload_sha256": digest,
        "cluster": "devnet",
        "program_id": str(MEMO_PROGRAM_ID),
        "rpc": DEVNET_RPC,
        "rpc_url": DEVNET_RPC,
        "confirmed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "confirmation_status": status["confirmationStatus"],
        "block_time": block_time,
        "explorer_url": (
            f"https://explorer.solana.com/tx/{signature}?cluster=devnet"
        ),
        "signer_pubkey": str(payer.pubkey()),
        "payload": {
            "algorithm": "sha256",
            "digest_hex": digest,
            "source": source,
            "memo_text": memo_text,
            "memo_program": str(MEMO_PROGRAM_ID),
        },
        "memo_text_on_chain": memo_on_chain,
        "matches_local": memo_on_chain == memo_text,
    }
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Confirmed: {status['confirmationStatus']} at slot {slot}")
    print(f"Explorer:  {evidence['explorer_url']}")
    print(f"Evidence:  {evidence_path}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:  # surface a clear failure for build gates
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
