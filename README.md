# Storm Fund: A resilience weather station for bank customers

![Storm Fund logo](public/logo.svg)

See your money move like weather.

Storm Fund is a resilience financial engine that visualizes a bank account as a real-time weather forecast. Anonymized bank data maps runway and buffer to a pixel sky. Inject a shock and watch the forecast change.

## Screenshot

*[Placeholder: screenshot of the title page showing the pixel sky and UI]*

## Primary Features

1. **Account Runway Analysis**: Income, fixed costs, spending, savings buffer, household bills, loan payment, and months of runway for any account_id.
2. **Shock Simulator**: Apply a job loss with EI, a furnace repair, a bills increase, or any mix, and recompute runway live.
3. **Make a plan**: Build an emergency fund goal plan and a shock backup plan based on the account's numbers.

## Demo video

*[Placeholder: link to the 2 minute demo video]*

## Full Feature breakdown

### Know the customer: account profile

Search any of the 4,500 `account_ids` in the dataset and the console loads a precomputed baseline profile: income (I), fixed costs (F), spending (S), savings buffer (B), household bills (H), and loan payment (P), each computed with the exact definitions from the challenge brief (median of money_in, median of money_out, mean of avg_daily_balance over the last 6 months, and so on). Every number carries a provenance stamp naming its source file and rows, and the profile loader refuses schema drift instead of guessing.

Everything is precomputed offline into `public/data/engine/profiles.json`, so any account answers instantly with zero network calls.

### Take a shock: shock simulator

Three one-click twist cards reproduce the brief's example shocks: job loss with EI at 55 percent, a furnace repair costing one full month of typical spending, and the combined job loss plus household bills up 15 percent. Sliders let you change the size of any shock (EI replacement rate, bills increase, one-off cost).

The runway formula runs in integer cents with the exact branch order from the brief: buffer left after one-off costs, monthly gap between shocked spending and shocked income, runway of 0 when the buffer is gone, "no shortfall (120+)" as its own state when income covers spending, otherwise months capped at 120 and rounded to one decimal. The TypeScript implementation is validated against the Python pipeline's golden fixtures and a cross-check of all 4,500 profiles, so the number on screen and the number a judge computes by hand agree.

A verdict band (clear to storm warning) summarizes the result, and the mode badge always shows where the input came from: preset cards or a typed sentence.

### Make a plan

Two plans derived from the customer's own numbers: an emergency fund goal plan (target, monthly contribution, months to goal) and a shock backup plan (whether they make it through the shock horizon, with fixed costs and the loan payment named as the cut floor). The plan formulas are our own declared definitions, permitted by the brief, and are stated on screen rather than hidden.

### Weather station visualization

A pure `verdictBand` function maps the judge metrics onto five verdict bands (critical, storm warning, watch, fair skies, clear) at thresholds in tenths of a month, with each band carrying its color, glyph, and label together, so the skin stays honest: every visual element has a declared data rule behind it. The forecast strip shows the 12 month outlook with a storm front and a landfall pin, an EI-cliff overlay marking when benefits run out, and a band key that prints all five bands with their thresholds, lowest runway first. Colors are colorblind safe (Okabe-Ito base), severity is carried by color plus icon plus text label together, and every animation respects prefers-reduced-motion.

### Typed shock input

Instead of preset buttons, type the shock in plain language ("they lose their job, EI covers half, and the furnace dies next month"). The input maps to the same structured shock parameters the presets use, shows them as confirmation chips you can correct with one click, and displays the dollar arithmetic in a formula strip so you can hand verify it before anything applies. The runway never changes until you confirm. Full details in the next section.

### Storm Atlas

Where the station shows one account, the Storm Atlas shows the whole population. It summarizes all 4,500 profiles into counts and percentages and renders them as a grid in severity order, each cell showing how many accounts sit in that condition right now. The headline above the grid names the condition the pitch quotes (by default, storm warning) with the count behind it, and a scenario label makes clear whether you are looking at baseline conditions or after a specific shock, so the same grid answers "how many accounts are already in trouble" and "how many does this twist put in trouble".

Clicking a state drills down to the accounts behind the count (planned as a strip plot of runway within the selected state), which is how the demo moves from one judge-picked account to the population story: the atlas is fed by the same `profiles.json` and aggregates as everything else, so the headline number and the account cards can never disagree. The summary math lives in a pure module (`summarizeStormAtlas`, `accountsInState`) with unit tests, and the grid component is presentational: it reads counts, never recomputes them.

### Judge mode

*[Placeholder: keyboard shortcuts, edge case guards, and rehearsal aids for the live judging window]*

### Solana receipt badge

A small badge rendered from bundled evidence JSON only: when the devnet memo transaction confirmed and the build-time read-back verified, it reads "Anchored on Solana devnet, verified"; otherwise it falls back to "anchored at build time, signature: ...". It shows an explicit "no evidence yet" state before the anchor is sent. The badge never makes a network call, so it renders in the offline booth demo the same as online. Full rationale in the Use of Solana section below.

## Use of Solana

Solana provides the provenance layer for the findings: a tamper-evident, independently checkable record that the exact analysis we presented is the analysis we ran. The integration is deliberately small (memo transactions only, locked scope in `docs/decisions.md`), and it runs entirely on devnet.

How it works:

- **What goes on chain is digests, never data.** A memo transaction carries the SHA256 hash of the frozen `findings.json` (and the model card hash, plus an aggregate fingerprint over the published F1 table with the note "aggregates only, no raw rows"). No account id, no balance, no row of customer data ever appears in a transaction. The chain pins the identity of the artifact; the artifact itself stays in the repo.
- **The send path is audited, not improvised.** `scripts/solana/send_memo.py` refuses to sign until it has confirmed the endpoint is genuine Solana devnet (genesis hash assertion), sends the memo, confirms the transaction, reads the text back from the chain, verifies it matches byte for byte, and writes an evidence file with the signature and explorer URL. A known test string with a recorded digest lets us self-test the whole path before touching the real file.
- **The site never touches the network.** Evidence JSONs are bundled into `public/data/` at build time and rendered by a static receipt badge ("Anchored on Solana devnet, verified" when the read-back confirmed, "anchored at build time, signature: ..." otherwise). Zero runtime RPC calls, so the demo works with the booth wifi off and there is no wallet, no Anchor program, and no tokens anywhere in the project.
- **Why it earns the track claim.** The findings freeze and the chain anchor happen at the same moment: the number you show a judge and the hash on chain are the same bytes. Anyone can re-run `shasum -a 256 public/data/findings.json` in our repo, compare it to the explorer transaction, and verify we did not quietly recompute after judging.

The receipt badge component and evidence bundling are scaffolded; the anchor transaction is sent against the frozen artifacts during the competition-day sequence described in `docs/solana.md`.

## Use of Gemini API

The Gemini API powers the typed shock input. One structured request maps a free-form sentence to the exact shock parameters the calculator uses, with a strict JSON response schema so the output shape is guaranteed: intent (job loss, bills up, one-off cost, mixed, or no shock), income factor, bills percentage, one-off cost in months of spending, and duration.

The integration is built to be honest and safe rather than impressive-looking:

- **The model is a parser, not an oracle.** It never computes runway. Its output is clamped, percent-corrected, and type-checked in TypeScript, then shown as confirmation chips. The rules engine does all math, and the runway does not move until a human clicks apply.
- **The formula strip shows the dollars.** Before confirming, you see income and spending arithmetic in plain numbers, so a misparse is visible and correctable in one click, which matters when a judge may be computing the same number by hand.
- **Graceful failure is designed in.** Three second timeout, no retry on rate limits, and preset twist cards stay clickable at all times. If the key or the network is missing, the console says so and falls back without breaking the demo.
- **Privacy boundary.** The prompt carries the sentence, the account id, and six aggregate baseline figures as plain numbers. No raw rows, no transaction history, no customer data beyond that ever leaves the browser.

## Use of Entire

Entire was in place before this repo's first commit. The Friday dress rehearsal in `docs/entire-rehearsal.md` proved the toolchain end to end in a sandbox repo in 10 minutes, and `entire enable -y --agent opencode` ran before commit `1300799 chore: initial repo with Entire enable files and Tangerine dataset manifest`. The enable files (`.entire/settings.json`, `.entire/.gitignore`, `.opencode/plugin/entire.ts`) and the Graph agent guide (`.entire/agent-guide.md`) ship in the repo.

- **Every session starts with a Graph query.** `.entire/agent-guide.md` is injected into AGENTS.md, so every agent session auto-loads the rule that the first action on a code task must be a Graph query. `entire graph query` finds code for a description, `entire graph def` shows a symbol, `entire graph neighbors` lists callers and callees (`--direction in` or `out`), and `entire graph impact` gives the blast radius before a symbol changes; the guide also covers Graph diff, commit, and checkpoint for semantic comparisons of revisions. The `--head` flag queries the committed tree while the default reads uncommitted edits, so parallel sessions could tell committed code from work in flight.
- **The index reports what it skipped.** `entire graph health` reports index state (the rehearsal measured 71 source files indexed in 1204 ms), and query-time Coverage lines name the files the indexer skipped, typically minified or generated data, rather than leaving a silent gap.
- **Every commit names its session.** Commits made during agent sessions carry an `Entire-Checkpoint` trailer naming the session checkpoint, checkpoint snapshots are stored as commits under `refs/entire/checkpoints/`, and `entire checkpoint explain HEAD` reconstructs a commit's intent and transcript.
- **Token cost stays visible.** `entire session tokens` reports per-session input, cache read, output, and API calls, and `entire tokens profile --json` aggregates usage across checkpoints, which keeps a multi-agent workflow's cost visible. `entire trail create` offers title-branched trails for review; this project stayed on `main`.

## Project architecture

A vectorized Python pipeline (pandas, numpy, integer cents, no per-account loops) reads the raw CSVs, verifies them against a committed SHA256SUMS manifest, computes the six judge metrics for every account into `public/data/engine/profiles.json`, and an independent verifier recomputes a seeded sample straight from the raw files to catch drift. The React app reads only those published numbers: a pure `verdictBand` function maps metrics to one of five verdict bands, the forecast strip and bands are hand-rolled SVG, and everything is bundled as JSON so the booth demo needs no network. A gated Gemini add-on lets a judge type a shock in their own words; the model is a parser only, a human confirms the parsed chips, and the rules engine does the math.

Project map:

- `scripts/engine/` Python pipeline: load, metrics, shocks, plans, build, verify, with golden tests
- `src/` React app: weather station components, pure state functions, provenance stack
- `public/data/engine/` bundled JSON artifacts (profiles, aggregates)
- `data/tangerine/` ingest runbook and checksum manifest (raw CSVs ignored)
- `docs/` architecture, decisions, research, reviews, tests, Devpost draft, competition day runbook

## Made for Sheridan Datathon 2026

Built for the Sheridan Datathon 2026 (November 7 to 8) on the Tangerine track, "Resilience Rewired": a financial resilience engine that knows the customer, takes a shock, and makes a plan, demonstrated live against real anonymized bank data.

Data: the PKDD'99 Discovery Challenge Financial dataset (real anonymized bank data, 4,500 accounts and 1.06 million transactions) from the CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial. Statistics Canada and Government of Canada sources were used where cited. Raw sponsor CSVs are never committed; `data/tangerine/SHA256SUMS` records the exact bytes analyzed.
