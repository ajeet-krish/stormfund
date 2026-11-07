# Solana devnet memo anchor runbook

Dated: Nov 06 2026 (proof run), commands below are for Saturday Nov 07 2026.

Scope (docs/decisions.md, Nov 06 LOCKED): memo anchor ONLY. The report footer
shows a Solana devnet receipt for the SHA256 of findings.json. No wallet UI,
no Anchor program, no tokens. Devnet only, no real funds, no financial data
on chain.

## Safety rails (always on)

- Agave CLI is not on PATH. Every shell command starts with:
  `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`
- Config is on devnet (RPC https://api.devnet.solana.com).
- Keypair lives at `~/.config/solana/id.json`, mode 600, outside the repo.
  Never overwrite it, never commit it. `.gitignore` covers `id.json`,
  `*-keypair.json`, and both patterns under `scripts/solana/`.
- `scripts/solana/send_memo.py` refuses to sign until the endpoint's genesis
  hash equals the known devnet genesis
  `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. Fail closed on mismatch.
- Memo program on devnet: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
  (verified executable via getAccountInfo on Nov 06 2026). The id
  `MemoSq4gqAb8HMh44ZoPwitaqoWkYTh6F5kUbVdUpFwG` that circulated in planning
  notes fails base58 decode (WrongSize) and is wrong.

## Faucet rule

AI agents must not use web faucets (faucet.solana.com needs a human sign in).
Funding order for agents:

1. `solana airdrop 2 "$(solana address)" --url devnet` (the user-authoritative
   CLI faucet).
2. Proof of Work fallback:
   `cargo install devnet-pow` once, then
   `devnet-pow mine -d 3 --reward 0.02 --no-infer -t 5000000000`.
   Note: devnet-pow's claim path also calls requestAirdrop, so it fails with
   the same error while the faucet is closed, and it needs 5000 lamports of
   fee already in the wallet when the faucet is open.
3. `solana-test-validator` plus a local airdrop only proves the send path
   locally (see `scripts/solana/localnet_selftest.py`). Local SOL never
   reaches devnet.
4. If all agent paths fail, a human operator may fund the wallet once at
   https://faucet.solana.com. Reference:
   https://solana.com/developers/cookbook/development/airdrops-and-faucets

Observed Nov 06 2026, 21:00 EDT (both agent paths closed):

| Route | Result |
|-------|--------|
| `solana airdrop 2 ... --url devnet` | `Error: airdrop request failed. This can happen when the rate limit is reached.` exit 1 |
| Raw `requestAirdrop` RPC | HTTP 410, `{"code":410,"message":"The RPC faucet is closed on this cluster. Request test SOL at https://faucet.solana.com"}` |
| `devnet-pow mine -d 3 --reward 0.02 --no-infer -t 5000000000` | `Error: airdrop request failed.` exit 1 (same closed faucet) |
| `solana airdrop 1 ... --url devnet` retry | same error, balance stayed 0 SOL |

## Saturday Nov 07 exact commands

Step 1, toolchain and funding:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version            # expect solana-cli 4.3.2
solana address              # expect FhJ4obmShVhs5WV4RFoSzAXYuCK2XGfoDEygyvQwb67g
solana airdrop 2 "$(solana address)" --url devnet
solana balance              # must be > 0 before the send
```

If the airdrop still fails with error 410, run the PoW fallback from the
faucet rule section, then check the balance again. If both fail, ask the human
operator to fund once at faucet.solana.com. Do not proceed without a balance
above 5000 lamports.

Step 2, hash the frozen findings file and send one memo transaction:

```bash
cd "/Users/ajeet/Projects/Hackathons/Sheridan Datathon 2026"
shasum -a 256 public/data/findings.json   # record this digest in the notes
uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
    --file public/data/findings.json \
    --prefix "Sheridan Datathon 2026 findings.json" \
    --evidence scripts/solana/evidence/memo-devnet.json
```

The script prints the signature, confirms it, reads the memo back from chain,
verifies the on chain text matches, and writes the evidence file. For a smoke
test before the real file, the payload is the SHA256 of the string
`Ledger Odyssey test`:

```bash
uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
    --text "Ledger Odyssey test" \
    --evidence scripts/solana/evidence/memo-devnet.json
```

Known digest of that test string (verified Nov 06 2026):
`bac6b28265843eb4a276198eb3ab9337de1d27e33a4a2e872b142196865473c5`

Step 3, confirm independently and capture the explorer link:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana confirm <SIG> --url devnet
# Explorer URL (also written into the evidence file):
# https://explorer.solana.com/tx/<SIG>?cluster=devnet
```

Step 4, copy the committable evidence next to the other public fixtures:

```bash
cp scripts/solana/evidence/memo-devnet.json public/data/memo-devnet.json
```

Evidence file schema (committable, contains no secrets):
`signature`, `slot`, `payload_sha256`, `cluster` ("devnet"), `program_id`,
`rpc`, `confirmed_at`, `explorer_url`, plus supporting fields
(`confirmation_status`, `block_time`, `signer_pubkey`, `payload`,
`memo_text_on_chain`, `matches_local`).

## Report footer wording

Verified case (RPC read-back succeeded at build time):

> Anchored on Solana devnet, verified

Offline fallback (RPC unreachable, or read-back skipped):

> anchored at build time, signature: &lt;sig&gt;

with `<sig>` replaced by the transaction signature from the bundled evidence
file.

Build-time-bundled-evidence recommendation: copy
`scripts/solana/evidence/memo-devnet.json` to `public/data/memo-devnet.json`
before `npm run build` and have the footer read signature, digest, and
explorer link from that bundled file. Do not fetch the devnet RPC from the
browser at runtime in production: the public endpoint is rate limited per IP
(100 requests per 10 seconds documented, plus per method and per second
headers) and an offline judge would see a broken footer. The bundled file is
the source of truth; a live read-back is a verification step, not a runtime
dependency.

## RPC read-back and limits

Read-back against https://api.devnet.solana.com (verified Nov 06 2026 with a
live memo transaction):

| Method | Result |
|--------|--------|
| `getTransaction` (encoding jsonParsed) | works, returns the `spl-memo` instruction with parsed text and program id |
| `getParsedTransaction` | disabled, error `-32601 Method not found` |
| `getSignatureStatuses` | works, returns `confirmationStatus`, `err`, `slot` |
| `sendTransaction` | used by the script with base64 encoding |

CORS check with `Origin: http://localhost:5173`:

- Preflight `OPTIONS` returns `access-control-allow-origin:
  http://localhost:5173`, `access-control-allow-methods: OPTIONS, POST, GET`,
  `access-control-allow-headers: authorization, content-type`.
- Actual `POST` also returns `access-control-allow-origin:
  http://localhost:5173` (the header is reflected for allowed origins).
- So browser read-back from the Vite dev server works today. Production
  still uses the bundled evidence file, for the rate limit reasons above.

Limits: the public devnet endpoint documents 100 requests per 10 seconds per
IP. Observed response headers on the free tier also advertise per method and
per second caps (`x-ratelimit-rps-limit: 250`, `x-ratelimit-method-limit:
150` on `getVersion`). Treat the endpoint as scarce: one read-back per build,
no polling loops from the page.

## Hard stop and drop track

Saturday Nov 07 5:30 PM local is the hard stop for the Solana item
(docs/decisions.md). If the memo transaction is not confirmed with an
explorer link by then, drop the Solana track claim from the submission and
ship the report without the anchor footer. Do not spend time past the stop
on faucet retries; the drop-track rule wins.

## Verification status of the Nov 06 proof run

| Step | Status |
|------|--------|
| CLI 4.3.2, devnet config, keypair mode 600 | done |
| Airdrop (CLI, then PoW) | blocked, faucet closed (error 410), balance 0 SOL |
| Memo program id check on devnet | done, executable, script id confirmed |
| send_memo.py devnet mode | verified up to the funding gate (genesis assertion, signer, digest all pass) |
| Confirm, evidence file, read-back of our own tx | pending funding, first task Saturday |
| Localnet selftest | available as offline proof of the send path |
| Key material grep over scripts/solana/ | clean, no base58 secrets, no key arrays, no id.json tracked |
