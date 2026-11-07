# Competition Day Runbook: Sheridan Datathon 2026 (Nov 7 to 8)

Single entry point for Saturday Nov 7 and Sunday Nov 8, 2026. Point any agent at this file first. Each phase lists a goal, the owner (user does it, agent does it), exact commands, an acceptance criterion, and the sub-runbook that holds the detail. Read this file plus the named sub-runbook for the phase you are in; do not re-derive context from scratch.

Sandbox source of all plumbing: `/Users/ajeet/Projects/Hackathons/Sheridan Datathon 2026 draft` (git, clean at 6cce348). The fresh competition repo replaces it Saturday.

## 1. Header: deadlines, priority, freezes, golden rule

### Deadlines (docs/research.md, docs/devpost.md)

| When | What | Severity |
|------|------|----------|
| Sat Nov 7, 8:00 PM | Devpost draft plus track selection | HARD |
| Sun Nov 8, 12:00 PM | Final submission | HARD |
| Sun Nov 8, 12:30 PM | Live demos | fixed |

### Award priority (docs/decisions.md, Nov 06 LOCKED)

| Rank | Target | Notes |
|------|--------|-------|
| 1 | Podium, through viz craft | rubric is Discovery 35, Data Use 25, Communication 25, Impact 15 |
| 2 | Tangerine sponsor track | only if the real dataset lands and is used |
| 3 | Solana | memo anchor only, hard stop Sat 5:30 PM |
| 4 | Entire | 45 minute Saturday timebox with abort |
| 5 | GoDaddy domain | lowest rank, fallback is github.io |

### The three freeze points

| Freeze | When | What is locked |
|--------|------|----------------|
| Findings freeze | Sat 6:00 PM | `public/data/findings.json`, `docs/findings.md`, every published number |
| Code freeze | Sun 9:00 AM | `src/`, `scripts/`, configs (docs, links, and the video may still move) |
| Submission freeze | Sun 11:00 AM (runbook rule, one hour of buffer before the 12:00 PM deadline) | the Devpost form, video link, all URLs |

### Golden rule (findings first)

The findings report must be submission ready at every freeze: F1 to F5 recomputed, verified, and rendered. No dataset drop, track discovery, or demo idea ever changes the primary. Secondary tracks are built only from the slack between freezes, and any freeze overrun cuts the secondaries first (cut order in section 14).

## 2. Phase 0: before opening the laptop Saturday

**Goal**: remove every login and hardware surprise from the morning. **Owner**: user. **Sub-runbook**: none, this checklist only.

- [ ] Logged in on the laptop: GitHub, Devpost, MLH, GoDaddy claim page (`mlh.link/GoDaddyRegistry`, per docs/research.md).
- [ ] Laptop plus charger packed; booth machine if the venue expects it.
- [ ] Sandbox repo path written down (top of this file); it stays available all weekend as the source of plumbing and templates.
- [ ] Solana faucet note: devnet wallet `FhJ4obmShVhs5WV4RFoSzAXYuCK2XGfoDEygyvQwb67g` is already funded with about 2.5 SOL. If drained, re-fund with the CLI rule from docs/solana.md: `solana airdrop 2 "$(solana address)" --url devnet`, then the devnet-pow fallback, then a human at faucet.solana.com. Never proceed below 5000 lamports.
- [ ] Phone hotspot ready as booth network backup (docs/research.md offline booth table).

**Acceptance**: every account opens without a password prompt; wallet balance prints above 0 with `solana balance` (Phase 6 checks again).

## 3. Phase 1: fresh repo creation (user does this manually)

**Goal**: a new GitHub repo with Entire enabled before its first commit. **Owner**: user for repo creation and login, agent for the enable steps. **Sub-runbook**: docs/entire-rehearsal.md, "Saturday operator order (exact)", steps 1 to 5. Order matters; sessions cannot be imported retroactively.

| Step | Action | Owner |
|------|--------|-------|
| a | Create the new GitHub repo on github.com. Name decided in the moment. Private or public: note that GitHub Pages needs the repo public eventually, and the base path depends on the repo name (`/<repo>/`). | user |
| b | Before the first commit: `entire login` (browser redirect, `entire login --device` fallback, confirm with `entire auth status`), then `entire enable -y --agent opencode`, commit `.entire/settings.json`, `.entire/.gitignore`, `.opencode/plugin/entire.ts`, then `entire plugin install graph` and `entire graph setup` (writes the Graph guide into AGENTS.md, allowed in the new repo). | agent |
| c | Clone the new repo or repoint the working copy, and set `origin` to the new remote. Never reconfigure `origin` afterwards. | user |

**Acceptance**: `entire status` reports checkpoints syncing to origin, the enable files are in the first commit, `git remote -v` shows only `origin`. Steps 6 to 13 run later: step 6 in Phase 2, steps 8 to 13 in Phase 7.

## 4. Phase 2: plumbing import

**Goal**: move the working plumbing into the fresh repo with CI and Pages green before any feature work. **Owner**: agent. **Sub-runbooks**: docs/decisions.md (Nov 06, decision 3 whitelist), docs/entire-rehearsal.md (exclusion list and carry-over checklist).

### Whitelist (copy these)

| Path | Note |
|------|------|
| `scripts/` | pipeline, ingest probe, analysis, solana, video kit |
| `src/` | app code |
| `docs/` | includes this runbook and the Entire rehearsal doc |
| `data/mock/` | seeded mock CSVs and their README |
| `data/tangerine/README.md` | ingest runbook only; `data/tangerine/*.csv` is gitignored |
| `public/data/` | bundled JSON fixtures |
| `index.html` | required by Vite, without it `npm run build` fails |
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json` | config |
| `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js` | config |
| `pyproject.toml`, `uv.lock`, `.python-version` | Python pinning |
| `.github/workflows/` | ci.yml and deploy.yml |
| `AGENTS.md`, `.gitignore`, `README*` if present | meta (no root README exists in the sandbox today) |
| `evidence/` | Entire carry-over templates (carry-over checklist step 1) |

### Exclusion list (never copy)

`.entire/metadata/`, `.entire/logs/`, `.entire/tmp/`, `.entire/settings.local.json`, `.entire/redactors/local/` (session state, regenerated locally), `.git/hooks/*` (Entire hooks are recreated by `entire enable`), `node_modules/`, `.venv/`, `dist/`, `build/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.DS_Store`, and the sandbox `.git` history (the new repo starts fresh).

### Breakage table

| Symptom | Cause | Fix |
|---------|-------|-----|
| Assets 404 on the live site | `VITE_BASE` mismatch | `vite.config.ts` reads `VITE_BASE` (default `/`); `deploy.yml` derives `/<repo>/` from `GITHUB_REPOSITORY` (`base="/$repo/"`, or `/` for a `*.github.io` repo). Local `npm run build` intentionally uses `/`; CI is the source of truth. |
| Deploy fails at configure-pages | fresh repo Pages source defaults to "Deploy from a branch" | Settings, Pages, Source: GitHub Actions. `enablement: true` in deploy.yml can switch it when the token has `pages: write`. |
| Workflows never run | Actions disabled, or repo private on a free plan | enable Actions; make the repo public (needed for Pages anyway). |
| Docs point at the old world | old repo name and sandbox path baked in | run the greps below; `docs/solana.md` has `cd "/Users/ajeet/Projects/Hackathons/Sheridan Datathon 2026 draft"`, which must become the new repo path; `docs/entire-rehearsal.md` cites the old origin `gh/ajeet-krish/ledger-odyssey`. `package.json` name `ledger-odyssey` is cosmetic. |
| Devpost links empty | placeholders | fill every `PLACEHOLDER` row in docs/devpost.md after the first push. |
| Raw sponsor data committed by accident | gitignore is the guard | `data/tangerine/*.csv` and `ingest_report.json` stay ignored unless the Phase 3 privacy decision says otherwise. |

```bash
grep -rn "ledger-odyssey\|ajeet-krish\|Sheridan Datathon 2026 draft" docs/ AGENTS.md package.json
grep -rn "PLACEHOLDER" docs/devpost.md
```

### Acceptance test (the migration gate, all green before feature work)

```bash
npm install
npm run typecheck
npx vitest run
npm run build
uv sync
uv run pytest
uv run python -m scripts.analysis.verify_findings
```

Then the first push smoke test: `git push -u origin main`, watch Actions (ci.yml web plus python jobs, then deploy.yml Pages), and open `https://<owner>.github.io/<repo>/` to confirm assets load with the base prefix (deploy.yml greps `dist/index.html` for this in CI).

**Acceptance**: all seven commands exit 0, both workflows green on the first push, Pages URL renders. Migration fails closed until this passes. Sub-runbook for the gate: AGENTS.md Quick Commands.

## 5. Phase 3: dataset drop (keynote, time unknown)

**Goal**: ingest the real Tangerine dataset without re-architecting anything. **Owner**: user for the download and the privacy call, agent for probe, adapter, and pipeline. **Sub-runbooks**: data/tangerine/README.md (fixed command order and canonical contract), docs/research.md "Tangerine dataset preparation", docs/decisions.md (privacy rule, decision 4).

Command sequence (exact order from data/tangerine/README.md, run from the repo root):

```bash
# 1. probe first: prints filename, sha256, encoding, delimiter, dtypes,
#    sample rows, date and sign verdicts, category counts, VERDICT block
uv run python -m scripts.ingest.probe_schema --input data/tangerine/<real-file>.csv

# 2. write the adapter against the REAL headers from the VERDICT block,
#    emitting a CSV that satisfies the canonical contract (transaction_id,
#    date, amount, merchant_category, account_balance). Fail loudly on
#    unmapped columns; record the mapping table in the write-up.

# 3. build the world and transactions from the mapped CSV
uv run python -m scripts.build_world --input data/tangerine/<mapped-file>.csv

# 4 to 6 are Phase 4: build_findings, verify_findings, pytest
```

| Rule | Detail |
|------|--------|
| Privacy decision (decisions.md, decision 4) | decide by data type: sponsor competition data may be committed raw; personal statement data publishes aggregates, checksums, and k=10 suppressed cells only, never raw rows. Default to aggregates only if the license is unclear. |
| Problem statement | answer it in the write-up as a "What Tangerine asked" section. Do NOT re-architect the app for it. |
| Sponsor pivot cap | at most 4 hours on any sponsor driven change (runbook rule, bounded by the hard stops in docs/decisions.md). Past that, answer the question in prose and keep the pipeline. |
| Size guard | build_world rejects inputs above 50 MB (`MAX_INPUT_CSV_BYTES`): aggregate in the adapter or raise the cap with a logged decision, never silently. |
| Contingency if no dataset by 10:30 AM | treat the drop as late: run the mock path, move the Money River work block earlier in the day, shrink Solana scope first (its 5:30 PM stop already bounds it). The mock fallback never blocks the findings report (docs/decisions.md dataset fallback: no pivot to a public dataset). |

**Acceptance**: `verify_findings` and `uv run pytest` exit 0 on the real mapped CSV, the probe sha256 is recorded, the mapping table is written into the write-up notes.

## 6. Phase 4: findings re-run and freeze

**Goal**: every published number comes from the new run, then freeze at 6 PM. **Owner**: agent. **Sub-runbooks**: docs/findings.md (generated, do not hand edit), AGENTS.md Quick Commands.

```bash
uv run python -m scripts.build_world --input data/tangerine/<mapped-file>.csv   # if the world changed
uv run python -m scripts.analysis.build_findings      # regenerates findings.json, model_card.json, docs/findings.md
uv run python -m scripts.analysis.verify_findings     # recomputes every published number
uv run pytest                                          # the mock fallback must stay green
```

Rewrite pass, in this order, all from `public/data/findings.json` (the single source of every number):

1. `docs/findings.md` is regenerated by build_findings, never hand edited.
2. `docs/devpost.md` paste map: headline finding, F1 to F5 bullets, video description draft.
3. Rendered headline strings: re-read `src/data/findings.ts` (`headlineFor`) so on-screen video copy matches the new artifacts.
4. River legend and caption numbers (Phase 5).

**Scheduling note**: aim to finish this re-run by 5:00 PM so Phase 6 can anchor the same artifact before its 5:30 PM stop (see Phase 6).

**Acceptance**: verify_findings exit 0, pytest exit 0, no stale number left in docs/devpost.md. Freeze at 6:00 PM: after the freeze, findings.json and docs/findings.md are frozen state, and there is no re-pivot after 6:00 PM; the 8:00 PM draft reports the frozen numbers.

## 7. Phase 5: Money River on real data

**Goal**: the hero river renders from the real artifacts, with honest labels. **Owner**: agent. **Sub-runbooks**: docs/architecture.md (layering: data pipeline, report UI, river), src/lib/riverData.ts.

| Item | Action |
|------|--------|
| Re-render | `riverData` reads the rebuilt `public/data/world.json` and `public/data/findings.json`; re-run `npx vitest run src/lib/riverData.test.ts`. |
| Ghost line decision | the ghost line currently builds a documented approximation (`approximate: true`, `note` field). The exact export is named in code: `scripts.analysis.build_findings` exporting `f4.chartTwin.dailyAlignedSeries`. Decide then: add the roughly 20 line pipeline export, or keep the approximation with its visible caveat. |
| Legend and caption | verify every label against the new findings.json numbers before the freeze. |

**Acceptance**: river tests green, every on-river number matches findings.json, and the ghost line either carries the exact series or the caveat note.

## 8. Phase 6: Solana re-anchor

**Goal**: one devnet memo transaction anchoring the frozen findings.json, evidence bundled, footer worded, done by 5:30 PM. **Owner**: agent (user only if a faucet human is needed). **Sub-runbooks**: docs/solana.md (full command sequence, safety rails, faucet rule), docs/ideas-tangerine-solana.md (gated additions: conditions, receipt sequence, acceptance bar).

Timing note: the Solana hard stop (Sat 5:30 PM) precedes the findings freeze (6:00 PM), so run this against the Phase 4 output and finish by 5:30 PM. If the memo is not confirmed with an explorer link by then, drop the Solana track claim and ship without the anchor footer (drop-track rule wins, docs/solana.md).

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version            # expect solana-cli 4.3.2
solana address              # expect FhJ4obmShVhs5WV4RFoSzAXYuCK2XGfoDEygyvQwb67g
solana balance              # if 0: solana airdrop 2 "$(solana address)" --url devnet
shasum -a 256 public/data/findings.json    # record this digest in the notes
uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
    --file public/data/findings.json \
    --prefix "Sheridan Datathon 2026 findings.json" \
    --evidence scripts/solana/evidence/memo-devnet.json
solana confirm <SIG> --url devnet
cp scripts/solana/evidence/memo-devnet.json public/data/memo-devnet.json
```

Footer wording (docs/solana.md): verified case reads "Anchored on Solana devnet, verified"; offline fallback reads "anchored at build time, signature: `<sig>`". The bundled evidence file is the source of truth; never fetch devnet RPC from the browser at runtime. No Solana footer component exists in `src/` yet, so build it from the wording section during this phase.

### Gated additions (approved Nov 07 2026)

Assessment, verdict table, and the nine point acceptance bar: docs/ideas-tangerine-solana.md. The root memo above is the gate. The additions are a 60 minute micro-addition paid from cut order items 2 and 3 (devnet stone, motion accents).

Gate conditions (all required):

- Root memo confirmed by the 4:30 PM decision line (5:30 PM death line, unchanged).
- Findings re-run verified green first (Phase 4: verify_findings and pytest exit 0).
- 60 minute cap on the whole gated package.
- Paid from cut-order items: devnet stone (cut 2) and motion accents (cut 3), never from new budget.
- Gate failure at any point: ship the single memo, skip silently (no panel, no paragraph).

Three-receipt sequence (after the root memo confirms; same script, sibling evidence files):

```bash
# receipt 1 is the root memo above, evidence scripts/solana/evidence/memo-devnet.json

# receipt 2: model card hash
uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
    --file public/data/model_card.json \
    --prefix "Sheridan Datathon 2026 model_card.json" \
    --evidence scripts/solana/evidence/memo-devnet-modelcard.json
solana confirm <SIG2> --url devnet

# receipt 3: F1 aggregate fingerprint, SHA256 over the published F1 aggregate
# table (f1StructuralVsDiscretionary in findings.json); the memo prefix carries
# the "aggregates only, no raw rows" note
mkdir -p build
uv run python -c "import json; print(json.dumps(json.load(open('public/data/findings.json'))['f1StructuralVsDiscretionary'], sort_keys=True))" > build/f1-aggregate-table.json
uv run --with solders==0.29.0 python scripts/solana/send_memo.py \
    --file build/f1-aggregate-table.json \
    --prefix "Sheridan Datathon 2026 F1 aggregate fingerprint, aggregates only, no raw rows" \
    --evidence scripts/solana/evidence/memo-devnet-fingerprint.json
solana confirm <SIG3> --url devnet

# bundle all three receipts next to the other public fixtures
cp scripts/solana/evidence/memo-devnet.json public/data/memo-devnet.json
cp scripts/solana/evidence/memo-devnet-modelcard.json public/data/memo-devnet-modelcard.json
cp scripts/solana/evidence/memo-devnet-fingerprint.json public/data/memo-devnet-fingerprint.json
```

Static receipt panel: section E renders a chain receipt panel from the bundled files only (`public/data/memo-devnet.json`, `public/data/memo-devnet-modelcard.json`, `public/data/memo-devnet-fingerprint.json`). Zero runtime RPC, zero network calls; static markup over bundled JSON, no wallet UI.

**Gated acceptance**: three receipts confirmed with explorer links and bundled, panel renders from bundled files, every number matches findings.json, and all nine checks in docs/ideas-tangerine-solana.md pass (including ships by 4:30 PM and zero video budget impact).

**Acceptance**: confirmed signature plus explorer link, `public/data/memo-devnet.json` committed, footer renders from the bundled file, all before 5:30 PM. Scope lock: memo anchor only, no wallet UI, no Anchor, no tokens (decisions.md).

## 9. Phase 7: Entire evidence

**Goal**: land the Entire evidence set for the track claim. **Owner**: agent for commands, user for `entire login`. **Sub-runbook**: docs/entire-rehearsal.md, "Saturday operator order (exact)", authoritative for all 13 steps; this is a summary only.

| Done already | Where |
|--------------|-------|
| Steps 1 to 5 (login, repo and origin, enable before first commit, commit enable files, graph plugin plus setup) | Phase 1 |
| Step 6 (whitelist import) and step 7 (`entire doctor`, `entire status`) | Phase 2 |

| Step | Command | Note |
|------|---------|------|
| 8 | one tool-using turn, then `entire session tokens` | the GATE, expect nonzero numbers; if "No active session found", attach with `entire session attach <session-id> --agent opencode` (then `--force` after agreeing) |
| 9 | `entire tokens profile --json > evidence/tokens-profile-1.json` | repeat later for profile x2 |
| 10 | `entire graph stats` and `entire graph health` | graph evidence |
| 11 | `entire trail create --title "<honest trail title>"` | confirm `git remote -v` still shows only `origin`; if it demands a GitHub app install or a non-origin remote, stop and report |
| 12 | token A/B: same small task with and without Graph, capture both `entire session tokens` outputs | decision 5 evidence |
| 13 | `entire checkpoint explain HEAD` before any push | checkpoints carry agent transcripts and are pushed on `git push`; `entire configure --local --skip-push-sessions` if unwanted |

Evidence goes in `evidence/`. Timebox: 45 minutes of Entire setup on Saturday with abort (decisions.md); login plus Trail budget 5 minutes inside it. If Trail creation fails on login requirements, keep Sessions plus Graph and drop the Trail claim.

**Acceptance**: nonzero `entire session tokens`, two token profiles, graph stats, one Trail (or an explicit abort note), token A/B outputs, `entire checkpoint explain HEAD` rc 0.

## 10. Phase 8: domain

**Goal**: a registered custom domain live on GitHub Pages, or an explicit fallback. **Owner**: user for registration, agent for DNS and verification. **Sub-runbook**: docs/research.md, "Domain and branding research" plus "Domain options for The Grand Line and Log Pose".

| Item | Detail |
|------|--------|
| Claim mechanics | MLH issues a free domain through a claim page (`hackp.ac/GoDaddyRegistry` or `mlh.link/GoDaddyRegistry`) with an event specific promo code and a free TLD list. The Sheridan code is likely announced at check in Saturday morning. Entry is registering and using the domain, not winning. |
| Naming rules | never use "tangerine" in the name (bank trademark); orange is the color nod; avoid hyphens, digits, and .io; one domain only (the Pages CNAME holds a single domain); speak the full URL with TLD. |
| Candidates, in order | grandline.page (fallback thegrandline.xyz), logpose.page (fallback thelogpose.xyz), grandledger.xyz, then the earlier generic set ledgerriver.site and moneyriver.xyz. Reject NamiFlow (live product collision). Recheck the exact string at registration (RDAP snapshot is point in time). |
| Budget | the prize is a gift card: spend no more than about 15 CAD. |

```bash
# after registering: one CNAME (subdomain such as www or app) to <owner>.github.io
dig www.<domain> +noall +answer -t CNAME      # must match before you trust it
dig <domain> +noall +answer -t A              # apex needs four A records, use a subdomain instead
```

Then add the domain in repository Pages settings (creates the CNAME file) and enable Enforce HTTPS.

| Timing fact | Value |
|-------------|-------|
| DNS record change | minutes to a few hours for fresh records (TTL bound) |
| GitHub stated propagation | up to 24 hours |
| Enforce HTTPS checkbox | can take up to 24 hours to become available; certificate up to an hour after DNS resolves |

**Acceptance**: `dig` matches, the HTTPS URL loads, a screenshot is saved for the submission. Fallback if anything stalls: keep the `github.io` URL (it does not block submission) and still claim the name verbally in the write-up and video. Aim for the domain live by the Saturday 8:00 PM draft, certainly before Sunday noon.

## 11. Phase 9: Devpost draft by 8:00 PM (HARD)

**Goal**: draft created, tracks chosen, write-up pasted. **Owner**: user pastes, agent prepares the text. **Sub-runbooks**: docs/devpost.md (paste map, track table, checklist), docs/ideas-tangerine-solana.md (gated future-work paragraph and its exact sentence).

| Section in docs/devpost.md | Goes into |
|----------------------------|-----------|
| 1. Track selection | Devpost track checkboxes at draft time |
| 2. Project name | Devpost project name field |
| 3. Write-up | Devpost Description field |
| 4. Video description | YouTube upload later, link pasted by the final deadline |
| 5. Checklist | your own runbook, not pasted |

Conditional track rows (base table is docs/devpost.md section 1):

| Track | Select when |
|-------|-------------|
| Best Data Visualization and Storytelling | always, primary |
| Tangerine | only if the real dataset was analyzed and used by 8:00 PM |
| MLH rows (Best Use of Solana, Best Use of Entire, Best Domain Name) | only if the phase is green (Phase 6 green, Phase 7 evidence landed, domain registered) AND the track appears on the published MLH list, which is TBA: recheck Saturday |
| Podium | no track to select, judged on the rubric |
| Best Beginner, IBM, ElevenLabs | never (not eligible) |

Gated Solana future-work paragraph (only if the gated package shipped in Phase 6; conditions and full context in docs/ideas-tangerine-solana.md): paste this into the write-up, explicitly labeled as not built:

> future work: a behavioral score attested on chain could gate a credit line or automate surplus sweeps; not implemented, and the underlying model (F3, AUC 0.590) is not strong enough to gate credit

If the gate failed, the paragraph is skipped with the rest of the gated package (Phase 6 fallback: ship single memo, skip silently).

**Acceptance**: draft marked complete with tracks chosen, project name set, write-up pasted with the "What Tangerine asked" section and the frozen numbers, interactive claims confirmed live on the built site, one submission per team. Fill the placeholder table (repo URL, live site URL, YouTube link, Devpost submission URL, name, username, booth location) as they become real.

## 12. Phase 10: video

**Goal**: a 120 second max demo that works with sound off. **Owner**: agent preps, user records. **Sub-runbooks**: docs/video/script-template.md (beat by beat copy) and docs/video/shots.md (record commands, shooting order, preflight).

| Item | Detail |
|------|--------|
| Kit | `scripts/video/record.sh`, `scripts/video/assemble.sh` (120.000s hard guard, refuses over budget with exit 4 unless `--allow-trim`, banned on a recording day), `scripts/video/test_assemble.sh`, `scripts/video/README.md` |
| Preflight | `ffmpeg -version` (expect 9.0.2), `./scripts/video/record.sh --list-devices`, `./scripts/video/test_assemble.sh` (must print ALL TESTS PASSED), then `npm run typecheck`, `npx vitest run`, `npm run build`, `npm run preview` (localhost:4173) |
| Saturday evening | B-roll only if time remains after the 8:00 PM draft: title card, CSV flash, any surface that might change |
| Sunday morning | the full record in the dependency order from shots.md: clips 01 to 03, then 06, 04, 05, pending surfaces with fallbacks, then 08 |
| Budget | 112s of footage across 8 clips, 8s under the cap; fix short clips by re-recording, never by padding |

```bash
./scripts/video/record.sh -d 14 -o scripts/video/captures/clip_01_question.mp4
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 scripts/video/captures/clip_0*.mp4
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 scripts/video/final/demo.mp4
```

**Acceptance**: assembled MP4 at most 120.0s, h264, yuv420p (the script asserts all three), first frame is the question card, synthetic data said in the first 15 seconds, last frame holds the URL for 3 seconds, every on-screen number matches findings.json.

## 13. Sunday timeline

| Time | Item | Owner |
|------|------|-------|
| 9:00 AM | CODE FREEZE: no more changes to `src/`, `scripts/`, configs | agent |
| 9:00 to 9:45 | link sweep: public repo URL, live site URL, domain HTTPS, Devpost submission URL, YouTube link all open in a logged-out window | user |
| 9:45 to 10:45 | video upload: YouTube unlisted (never Private), title and description from docs/devpost.md, captions, thumbnail (F1 frame with 5.08% readable, update to the new number if it changed) | user |
| 10:45 | logged-out playback test: private window, 1080p, sound off, links in description clickable | user |
| 11:00 AM | SUBMISSION FREEZE: Devpost final filled and reviewed (repo, live site, video, write-up, tracks, one submission per team) | user |
| 11:00 to 11:50 | buffer for the 12:00 PM final deadline | user |
| 12:00 PM | FINAL SUBMISSION DEADLINE | user |
| 12:30 PM | demo: 90 second rehearsal script, question, headline number, river, provenance click, counterfactual, Solana anchor, next step | user |

## 14. Cut order (when behind)

Cut in this order, top first (docs/decisions.md priority plus the Solana rule in docs/research.md: live polling goes first, the memo stays).

| # | Cut | What survives |
|---|-----|---------------|
| 1 | runtime Solana refresh (live RPC polling) | the bundled evidence file and the memo |
| 2 | devnet stone (extra river decoration) | the static river scene |
| 3 | motion accents | the data driven animation |
| 4 | ghost line | F4 text and the waterfall chart |
| 5 | Entire token A/B | 2 screenshots plus the tokens profile |
| 6 | domain (fallback to github.io) | the github.io URL in every link |
| 7 | river annotation polish | the legend and caption numbers |

NEVER cut: the findings re-run plus verify, the hero river static scene, the Devpost write-up, the video.

## 15. Risk table (top 8)

| Risk | Trigger | Fallback |
|------|---------|----------|
| Unknown schema | probe verdict shows unrecognizable columns or formats | write the adapter against the VERDICT block only, fail loudly on unmapped columns, publish the mapping table; past 2 hours, use the mock path and say so |
| Late dataset | no file by 10:30 AM | mock path, Money River block moves earlier, Solana shrinks first, Tangerine track not selected at draft |
| Solana creep | scope pressure toward wallet UI or Anchor | hard scope lock (memo only); 5:30 PM stop, drop the track if not green |
| Entire login failure | `entire login` or Trail demands a GitHub app install or non-origin remote | abort Entire per decision 5, keep Sessions plus Graph, record the abort note |
| Pages deploy on fresh repo | configure-pages failure or 404 assets | Settings, Pages, Source: GitHub Actions; verify `VITE_BASE` equals `/<repo>/`; smoke test on the first push |
| Video overrun | clip list over 120.000s | re-record the long clip (shorter `-d`), never `--allow-trim`; drop B-roll first |
| Number drift | a number in docs, video, or Devpost disagrees with findings.json | findings.json wins; re-run verify_findings and fix every surface before the next freeze |
| Offline booth | venue Wi-Fi blocks RPC or the site | everything is bundled locally (no runtime network calls), hotspot as backup, Explorer screenshot as chain proof, fixture labels for any cached data |

## 16. Agent instructions

How any agent uses this file:

- Read this runbook first, then the sub-runbook it names for the phase you are in. Do not re-derive context from other files when a sub-runbook exists.
- Never hand edit `docs/findings.md`: it is generated by `uv run python -m scripts.analysis.build_findings`.
- `public/data/findings.json` is the single source of every number. If any surface disagrees with it, the surface is wrong.
- Ask the user with the QUESTIONS FOR USER format: a numbered list, one question per line, each with a recommended default so the user can answer with just the numbers.
- No em dashes, double hyphens, or dash equivalents in any file you write. Use commas, colons, parentheses, and full sentences.
- Commit only when the user tells you to; never push without being told. Conventional prefixes (chore, feat, docs, test). Entire checkpoints ride along on push (step 13 of the Entire order).
- Respect the freezes: findings Sat 6:00 PM, code Sun 9:00 AM, submission Sun 11:00 AM. When a freeze conflicts with a secondary track, the secondary loses (section 14).
