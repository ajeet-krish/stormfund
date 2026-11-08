# Demo and pitch preparation (Sheridan Datathon 2026)

Created: Sun Nov 08 2026. For the 5 minute judging slot: 1 minute pitch, 3 minutes live twist, 1 minute questions. Every number below is verified against the frozen artifacts (atlas.json, profiles.json) and pinned by tests. Say the number as printed; if the screen disagrees with this doc, the screen wins and you correct yourself out loud.

## 1. The pitch (1 minute, verbatim spine)

Open on the atlas headline, already loaded:

> We built a resilience weather station for real bank customers. Take any of 4,500 accounts, see their financial weather, and watch what a shock does to it.
>
> Here is our biggest finding: at baseline, 1 percent of accounts, 60 of 4,500, are already in storm warning or critical, under three months of runway. Now press one key, the standard job loss twist: EI at 55 percent. The share goes to 10 percent, 435 of 4,500. Seven times as many households, from one common shock.
>
> Every number on this screen comes from the judge's own formulas: medians from monthly_summary, the buffer as the mean of the last six months, runway in integer cents, rounded to one decimal. Pick any account, we will run your twist live.

Timing: 0:00 hook (weather station), 0:20 the finding (1 percent to 10 percent), 0:40 the math claim (judge formulas), 0:50 hand to the judge. If you have 10 spare seconds, add one line from section 3 (the furnace asymmetry), never cut the finding.

## 2. Biggest findings (ranked, all verified against atlas.json)

### Finding 1: the headline (use in pitch)

Baseline: **60 of 4,500 (1%)** in critical or storm warning (under 3.0 months runway). Under the laid-off twist (EI 55%): **435 of 4,500 (10%)**. A 7x jump. Pinned: `AtlasSection.test.ts:96 to 99` (baseline) and `:132 to 136` (twist). The video script uses the same numbers.

### Finding 2: the furnace asymmetry (use if asked "what surprised you")

A one-off repair costing one month of spending is MORE concentrated damage than a layoff: it pushes **critical from 34 to 219 accounts** (one-off costs come straight off the buffer, so buffer-depleted fires), while the layoff spreads the pain wider but shallower (storm_warning 26 to 384). Layoff hits more households (435 vs 284 in danger bands); repair bankrupts more of them (219 vs 51 critical). Scenario totals from atlas.json: emergency_repair critical 219, storm_warning 65.

### Finding 3: bills alone barely move the needle (use against "is this fearmongering")

Household bills up 15% with no income change: danger bands go from 60 to 65 accounts, **+5 only**. The population can absorb a bills shock; it cannot absorb a jobs shock. That is why the combo twist (504 in danger, 11.2%) is dominated by the layoff component. Honesty note: these are correlations over the shipped year under fixed behavior, not predictions.

### Finding 4: the plan answers with numbers (for "so what")

Every shocked account gets two plans from its own numbers: an emergency fund goal (3x monthly spending, contribution from surplus) and a backup plan naming the cut floor (fixed costs F plus loan payment P). The verdict band tells you if the plan is reachable; the plan panel states the monthly number.

## 3. Live twist run (3 minutes)

Sequence (the E6 rehearsal dock walks this; keys 1 to 4 are the presets):

1. Judge picks an account_id. Type it in lookup (key `/` focuses it), Enter. **Read the baseline aloud**: band, runway months, buffer. (15s)
2. Judge reads the twist card. Press the matching preset key: `1` laid off, `2` bills up 15%, `3` furnace repair, `4` laid off and bills up. (10s)
3. **Explain the new numbers**: the formula strip shows income after and spending after in dollars before anything applies; the verdict band moves; point at the gauge or atlas if the population context helps. (60s)
4. **Read the plan**: goal plan line, backup plan line, the cut floor. (45s)
5. If the account has guard flags (thin history, no loan, zero bills, pensioner, zero income), the guard chips are on screen: say the flag and what it means, do not hide it. (30s)

Rehearsal accounts if the judge is shy or for the dry run: 68257 (clean, no flags), 23838 (no running loan), 98952 (pensioner, no wage to lose), 49900 (zero income plus thin history), 42988 (already buffer depleted). Key `n` draws a random safe account.

Preset sentences (exact, from shockPresets.ts):
- `1` They lose their job (EI at 55%).
- `2` Their household bills go up 15%.
- `3` The furnace dies, repair costs one full month of typical spending.
- `4` They lose their job (EI at 55%) and their household bills go up 15% in the same month.

## 4. Planned answers to judge questions

### Backend and architecture

**Q: Where does the data come from, and where does it run?**
The PKDD'99 Financial dataset: 4,500 accounts, 1.06 million transactions, 185K monthly summaries, 682 loans, credited in our write-up. Raw CSVs never leave the repo (gitignored, SHA256SUMS manifest pins the exact bytes). A Python pipeline (pandas, vectorized, integer cents) precomputes `profiles.json` and `atlas.json` at build time. The site is a static bundle: no server, no database, no runtime network calls, so it works with the booth wifi off.

**Q: What is the backend during the demo?**
Nothing runs during the demo except arithmetic in the browser on precomputed numbers. Any of 4,500 accounts answers instantly because the profile is a JSON lookup. That is deliberate: a judge picks an account we have never seen, and it must never load or compute slowly.

**Q: How do you know the numbers are not drifted or hand-edited?**
`scripts.engine.verify` independently recomputes from the raw CSVs and diffs against the shipped artifacts (exit 0 or fail). Two consecutive builds are byte identical. The Python and TypeScript implementations of the runway formula are pinned to the same golden fixtures, and a preset-drift test parses `shockPresets.ts` and fails if ids or fields change. Published numbers come from one artifact: `atlas.json` and `profiles.json`.

**Q: Why Python and TypeScript, two implementations of the same math?**
Python is the offline pipeline (verifiable, reproducible, runs in CI). TypeScript is the live recompute for sliders. They cannot silently disagree because both are pinned to hand-computed golden fixtures, including the half-cent tie cases and the 120 cap.

### Math model

**Q: Walk me through the runway calculation.**
Verbatim from the answer key: buffer left = B minus one-off costs. Gap = spending after shock minus income after shock. If buffer left is at or below zero, runway is 0. If the gap is at or below zero, runway is "no shortfall", 120 plus. Otherwise runway = min(buffer left divided by gap, 120), rounded to one decimal. B is the mean of avg_daily_balance over the account's last 6 monthly rows. I, S, H, F are medians from monthly_summary. P is the loan's monthly payment only if the loan is still running at the end of 2025 (status C or D).

**Q: Is there a model behind this? Any machine learning?**
No model gates any number you see. The runway is deterministic arithmetic on the judge's definitions. We did build one classifier during the project (night-before deficit prediction, test AUC 0.590) and we explicitly do NOT use it to gate anything: AUC 0.590 is too weak for credit decisions, and we say that in our write-up limits section. The plans use our own declared formulas (goal = 3x spending), permitted by the brief and stated on screen.

**Q: How do you handle the EI details, taxes, weekly maximums?**
We follow the answer key exactly: flat 55% replacement of I for the duration, no weekly maximum, no taxes. That is a declared limitation, printed in the write-up. If a judge's hand calculation differs, show the formula strip: the dollars on screen are I times 0.55 and S plus 0.15 times H, so the arithmetic is checkable in five seconds.

**Q: What about edge cases: negative buffers, accounts with no history, defaulted loans?**
Handled and tested: buffer at or below zero gives runway 0 (never the no-shortfall string), short history uses the mean of the rows that exist with a "based on N months" caveat, no loan means P is zero, defaulted loans still carry their payment if running. Edge guards appear as chips on the account card (thin history, zero bills, no loan, pensioner under layoff, zero income) and the judge sees them, we do not hide them.

**Q: Why weather? What does it add?**
The band IS the number: five verdict bands over the same runway thresholds (critical under 1 month, storm warning 1 to 2.9, watch 3 to 5.9, fair skies 6 to 11.9, clear 12 plus or no shortfall). The weather skin maps those bands to sky, gauge, and district shading with a printed legend, so a judge feels the severity before reading the digits, and the digits are always right there. Color is never the only channel: icon plus text label plus number.

## 5. If there is time: Solana and Entire (30 second versions)

**Solana**: "We anchored our frozen findings on Solana devnet: three memo transactions carrying SHA256 digests of the findings file, the model card, and an aggregate fingerprint. Aggregates only, no raw rows ever touch the chain. The receipt badge on screen renders from bundled evidence, zero runtime RPC, so it verifies offline. Anyone can re-run shasum on our repo and compare to the explorer link." (Evidence: `public/data/memo-devnet*.json`, all `matches_local: true`.)

**Entire**: "The whole build ran through Entire: session checkpoints in git, and the Graph index let every agent query the codebase semantically before editing instead of grepping. The agent guide ships in the repo, so any agent that opens this project starts with a graph query." (Evidence: `.entire/agent-guide.md`, checkpoint refs in commit messages.)

Order if both fit: Solana first (it is a prize category and pairs with the provenance story), Entire second. If only one fits, Solana.

## 6. Honesty rails (never say these)

- Never say "AI predicts" or "the model says" about any runway or verdict number. It is arithmetic.
- Never claim causation from the district or unemployment correlations; say association over the shipped year.
- Never say the site needs the internet. It does not. Gemini typed input is a bonus path with preset fallback, and if it was not demoed live, do not claim it was.
- Never present the weather as the data. The legend and the printed numbers are the data; the weather is the reading aid.
- If a number on screen disagrees with this doc, the screen is right (it reads the frozen artifact); correct yourself and move on.

## 7. One page cheat sheet (print for the booth)

```
FINDING: 1% (60/4500) baseline -> 10% (435/4500) under EI55 layoff. 7x.
SECOND:  furnace repair -> critical 34 to 219 (buffer hit direct)
         bills +15% alone -> only +5 accounts in danger bands
RUNWAY:  buffer_left = B - one_off; gap = S' - I';
         0 if buffer gone; "no shortfall" if gap <= 0;
         else min(buffer/gap, 120), 1 decimal.
B = mean last 6 avg_daily_balance. I,S,H,F = medians. P if loan runs past 2025-12-31.
KEYS: 1 laid off  2 bills+15%  3 furnace  4 combo  r reset twist  R reset all  / lookup  n random
ACCOUNTS: 68257 clean | 23838 no loan | 98952 pensioner | 49900 zero income | 42988 depleted
SOLANA: 3 devnet memos, digests only, matches_local true, offline badge.
LIMITS: flat 55% EI, no taxes, no weekly max; plans are our own declared formulas;
        the 0.590 AUC model exists and gates NOTHING.
```
