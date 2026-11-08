# Devpost submission draft: Storm Fund (Sheridan Datathon 2026)

Created: Sat Nov 07 2026 (replaces the obsolete Ledger Odyssey draft after the pivot to the Resilience Weather Station). Source of truth for every number:
`public/data/engine/aggregates.json` once frozen (findings freeze Sat 6:00 PM).
Paste map:

| Section below | Goes into |
|---------------|-----------|
| 1. Track selection | Devpost "Track selection" checkboxes at draft time |
| 2. Project name | Devpost "Project name" field |
| 3. Elevator pitch | Devpost short pitch field (max 200 characters) |
| 4. About the project | Devpost "Description" field (the required short write-up) |
| 4b. Generative AI question | Devpost "Did you implement a generative AI model or API..." answer field |
| 5. Video description | YouTube upload (unlisted), link pasted into Devpost by final deadline |
| 6. Checklist | Your own runbook, not pasted into Devpost |

Deadlines: draft plus track selection Sat Nov 7 8:00 PM (hard), final submission Sun Nov 8 12:00 PM, live demos 12:30 PM.

## 1. Track selection

**Recommendation: select Best Data Visualization and Storytelling as primary, plus Tangerine (the real dataset is in and used), plus any MLH row whose condition has cleared.**

| Track | Select? | One sentence rationale |
|-------|---------|------------------------|
| Best Data Visualization and Storytelling | Yes, primary | The weather station is a findings visualization with a printed mapping legend, chart twins, and row level provenance, which is exactly what this award grades. |
| Podium (1st, 2nd, 3rd) | No track to select, judged automatically | Judges score every submission against Discovery 35, Data Use 25, Communication 25, Impact 15, and the station is built for that rubric. |
| Tangerine | Yes, conditional cleared | The real Tangerine dataset (4,500 accounts, 1.06M transactions) landed Sat Nov 7 and every engine number runs on it. Select only if it is actually used by 8:00 PM. |
| Best Use of Gemini API | Conditional | Select only if the typed shock path is live on the deployed origin before the draft (gated add-on, hard abort 00:30 Sat). Prize: MLH Swag Kit. |
| Best Use of Entire | Conditional | Select only if the Phase 7 evidence set lands (session tokens, profiles, graph stats, trail or abort note). |
| Best Use of Solana | Conditional | Select only if the memo anchor confirms with an explorer link before 5:30 PM Sat. |
| Best Domain Name from GoDaddy Registry | Conditional | Select only if the domain is registered and resolving (budget about 15 CAD, fallback is github.io plus verbal claim). |
| ElevenLabs Best Data Project | No | Narration via ElevenLabs is unconfirmed; not a data project built on their platform. |
| IBM, Best Hardware, Best Beginner | No | We use none of that hardware or infrastructure. |
| MLH other rows | Recheck Saturday | Confirm each checkbox against the published MLH list at draft time. |

## Project Details

##### Project Title:
Storm Fund: A resilience weather station for bank customers

##### Elevator Pitch:
See your money move like weather. Storm Fund visualizes a bank account as a weather forecast. Anonymized bank data maps runway and buffer to a pixel sky. Inject a shock and watch the forecast change.

## 4. About the project

Paste everything from "What inspired us" through the Links block into the
Devpost Description field. Devpost markdown supports headings, lists, bold,
links, and LaTeX math between dollar signs.

### What inspired us

The Tangerine track, Resilience Rewired, asks for a financial resilience
engine for real bank customers: know the customer, take a shock, make a
plan, demonstrated live against real anonymized bank data. We read that as
building a weather forecasting system for personal finance. The judging
ritual set the design: a judge picks a random account id, reads a surprise
twist card you have never seen, and you answer live in about three
minutes. So the ask we designed around was plain: can a bank customer see
whether they survive a shock, and what saves them? Everyone knows what a
rainy day fund is; nobody has seen the rainy day coming. Bank numbers are
honest but unreadable, and a sky over the verdict band makes a shock
something you feel before it is something you calculate.

### The question we asked

**The question.** How resilient are real account holders actually? We
asked a version a judge can check by hand: what share of accounts would
survive a month without income, and what does one surprise twist do to
that share?

**What we did.** We precomputed the judge's exact answer key metrics for
all 4,500 accounts (income, fixed costs, spending, buffer, household
bills, loan payment, plus gap and runway), built a live stress test
console with preset twist cards and custom shocks, and attached
prescriptive plans: an emergency fund goal plan and an ordered backup
lever ladder, every lever priced by re-running the same runway formula.

**What we found.** At baseline, 1 percent (60 of 4,500) of accounts sit
under 3 months of runway. Run the same 4,500 accounts through the laid
off twist (EI at 55 percent) and the share jumps to 10 percent (435 of
4,500), so the storm zone share (critical plus storm warning, under 3
months) grows 10 times from one surprise card. The per account stories
keep the headline honest. Account 42988 already has a negative buffer and
a defaulted loan, so its baseline reads 0.0 months before any shock
lands. Account 98952 is a pensioner, so the layoff card is a stress test,
not a fact: there is no wage to lose. And 377 thin history accounts carry
medians that rest on fewer than 18 monthly rows, so the console says out
loud that the window is short.

### What we learned

- **Judge parity is a design constraint, not an afterthought.** Our
  runway formula matches the answer key to the decimal, in integer cents,
  with the exact branch order (buffer left wins, then the no shortfall
  state, then the capped quotient). Every visual reads those numbers;
  none of them recompute them.

  $$\text{buffer}_{\text{left}} = B-C_{\text{one-off}}, \qquad
    \text{gap} = S'-I'$$

  $$\text{runway} =
    \begin{cases}
    0 & \text{if } \text{buffer}_{\text{left}} \le 0 \\
    \text{no shortfall (120+)} & \text{if } \text{gap} \le 0 \\
    \min\!\left(\frac{\text{buffer}_{\text{left}}}{\text{gap}},\ 120\right)
      & \text{otherwise, rounded to 1 decimal}
    \end{cases}$$

- **A weather skin stays honest only with a printed mapping legend.** Rain
  is income, evaporation is spending, water level is buffer. Say it on
  screen or the skin becomes decoration.
- **AI is a parser, not an oracle.** Gemini maps a typed shock sentence
  into the same typed fields the preset cards fill; a human confirms the
  chips before anything moves. The rules engine does the math. The model
  never touches the runway.
- **Accessibility and drama are the same problem.** Severity is carried by
  color and icon and text label, so the storm reads on a projector, on a
  laptop, and to a colorblind judge.

### How we built it

- **Data:** the real anonymized bank dataset (4,500 accounts, 1.06M
  transactions, 185K monthly summaries, 682 loans), credited to the
  PKDD'99 Financial dataset via the CTU Prague Relational Dataset
  Repository.
- **Pipeline:** Python with pandas and numpy, fully vectorized (groupby,
  no per-account loops), integer cents throughout, `uv` for pinned
  dependencies. One pass produces `profiles.json` with the six judge
  metrics (I, F, S, B, H, P) plus a provenance check_sum for every
  number, and two consecutive builds are byte identical. An independent
  verifier recomputes all 4,500 accounts from the raw CSVs with the naive
  csv module (no pandas, no numpy) and diffs field by field, so drift
  fails the build, not the demo.
- **One formula, two languages, frozen fixtures:** the TypeScript twins of
  the Python formulas are pinned by shared golden fixtures asserted in
  both pytest and vitest, plus a cross check over all 4,500 profiles, so
  cross language drift becomes a failing test in either suite. Plans ride
  the same guard: `scripts/engine/golden_plans.json` is asserted from
  both sides.
- **Plans are re-runs, not new math:** each backup lever's "+N months"
  is a difference of two evaluations of the same runway function,
  $$\Delta m = m_{\text{runway}}(\text{after})\,-\,m_{\text{runway}}(\text{before})$$
  so every lever number is hand checkable against the printed formula.
- **Frontend:** React, Vite, TypeScript, Tailwind. One derivation pass in
  the console view (inline money math in a component is a review
  failure), a pure `verdictBand` function maps runway to five verdict
  bands, and the forecast strip, bands, and EI cliff overlay are hand
  rolled SVG. All data bundled as JSON: zero runtime network calls, so
  the booth demo survives bad wifi.
- **Provenance and content rules:** every claim traces back through a
  check_sum over the account's own rows, and a dash scan keeps em dashes,
  en dashes, minus signs, double hyphens, and spaced hyphens out of the
  artifact and the site copy.
- **Entire:** a graph first workflow for concurrent multi agent
  development. Every session starts with `entire graph query`, commits
  carry an `Entire-Checkpoint` trailer, and `entire session tokens` keeps
  the cost visible.
- **Gemini (gated add-on):** a judge can type the shock in their own
  words ("EI covers half and the furnace dies"). One structured request
  with a strict JSON schema returns typed fields, clamped and percent
  corrected in TypeScript, shown as confirmation chips with a formula
  strip. One click applies. A 3 second timeout falls back to preset
  cards, and the mode badge always shows where the input came from.

### Challenges we faced

- **Answer key exactness.** Rounding rules a judge can hand check:
  medians over all rows (an even count averages the two middle cents half
  up), means and runway tenths with ties away from zero, and runway kept
  in integer tenths of a month. No float decides a branch.
- **Hostile random accounts.** A judge picks an id you have never seen
  and reads a twist card you cannot rehearse. Edge flags (thin history,
  negative buffer, zero income, defaulted loan, pension income, no loan,
  zero bills) inform the operator as chips and never gate an account: a
  property test walks every flagged id (over 500 of them) to prove
  selection still works.
- **The dataset was nine relational tables, not the single CSV the
  pipeline assumed.** We rebuilt the ingest around `monthly_summary.csv`
  (the judges' actual source) and kept `transactions.csv` (about 100 MB)
  out of the critical path.
- **Two vocabularies for one sky.** A parallel seven state ladder lived
  beside the five verdict bands. We resolved the conflict by deleting the
  ladder from code, artifacts, and docs so every surface speaks one
  vocabulary.
- **A stalled agent session.** An interrupted build session was cured
  with staged disk checkpoints: the work resumed from the modules already
  on disk, each checked against the checklist, which caught two rules
  that could never fire on real data (a thin history flag set below the
  shortest real history, and a fixture that cannot exist in this
  dataset).
- **Offline booth discipline.** Everything is bundled; the network is
  only a bonus. The Gemini path is the single exception and it aborts
  after 3 seconds into preset cards that stay clickable.
- **Honest deception discipline.** Provenance stamps say recorded, never
  verified, because the browser cannot recompute a check_sum without row
  data. Overlays beyond the answer key (the EI cliff) are labeled as
  ours. Solana receipts read bundled evidence only, with zero runtime
  RPC.
- **Scope under a 48 hour clock.** Weather particles are data driven or
  they do not ship. The cut order is written down, and the video and the
  write-up are never on it.

### Limits we declare up front

Runway uses the answer key's definitions, including flat 55% EI (no weekly maximum, no taxes). Plans are our own declared formulas (goal = 3x spending), permitted by the brief and stated on screen. Correlation, not causation, everywhere. No customer rows leave the browser; the Gemini prompt carries a sentence and aggregate numbers only.

future work: a behavioral score attested on chain could gate a credit line or automate surplus sweeps; not implemented, and the underlying model (F3, AUC 0.590) is not strong enough to gate credit

### Links

- Code and reproduction steps: [GITHUB REPO URL PLACEHOLDER]
- Live site: https://www.stormfund.work/
- 2 minute demo video: [YOUTUBE LINK PLACEHOLDER, unlisted]
- Reproduce: `uv sync`, then `uv run python -m scripts.engine.build`,
  `uv run python -m scripts.engine.verify`, then `uv run pytest`

## 4b. Generative AI question

Question on the form: Did you implement a generative AI model or API in
your hack this weekend? If so, how and why did you use it? If not, mark
your response as N/A.

**Answer: yes. One generative AI integration, the Gemini API for typed
shock input.**

**How.** A judge types the shock as a sentence ("laid off and rent up
15%"). One POST to the v1beta generateContent endpoint of the Gemini API
(`generativelanguage.googleapis.com`, pinned model
`gemini-3.5-flash-lite`) sends the sentence plus the account id and the
six baseline metrics as integer cents, at temperature 0, with a strict
JSON responseSchema (`additionalProperties: false`, seven required keys:
intent, confidence, incomeFactor, billsPct, oneOffMonths, durationMonths,
summary), so the typed twist struct the app expects is the guaranteed
output shape. TypeScript then shape checks, percent corrects, clamps, and
rounds every field, shows the result as confirmation chips with a formula
strip of the dollar arithmetic, and a mandatory confirm gate
(`confirmTypedShock`, the single gate into twist state) applies it. The
runway never moves until a human clicks apply. A 3 second AbortSignal
timeout falls back to the preset twist cards, which stay rendered and
clickable, and a rate limit never retries. The key comes from
`VITE_GEMINI_KEY` and travels only as the request header; it is never
printed or logged. The mode badge always shows whether the input came
from preset cards or a typed sentence.

**Why.** The twist card is spoken language, not sliders. Letting a judge
speak the shock removes UI friction in the 3 minute live twist, while the
engine's math never touches the model: the model only fills the same
typed twist struct the presets fill (`shockSpecToTwist` produces the same
`Twist` the preset cards produce), so every number still comes from the
deterministic integer cents engine. Privacy boundary: the prompt carries
the sentence, the account id, and six aggregate baseline figures as plain
numbers; no raw rows or transaction history leave the browser.

## 5. YouTube video description (public unlisted)

Visibility: **Unlisted** (anyone with the link can watch). Do not use Private judges cannot open it.

Title draft:

```text
Storm Fund: your rainy day fund, as weather | Sheridan Datathon 2026
```

Description draft (paste and fill the bracketed fields):

```text
A 2 minute demo of Storm Fund, a resilience weather station, for the Sheridan Datathon 2026.

The question we asked: can a bank account's financial health be read as weather, so that a judge feels a shock coming instead of just reading a number?

How it works: the real anonymized bank dataset (4,500 accounts, 1.06M transactions) feeds a vectorized Python pipeline that computes the exact judge metrics (income, fixed costs, spending, buffer, household bills, loan payment) in integer cents, then a React weather station maps runway and buffer to five verdict bands with a printed mapping legend. Pick an account, apply a shock, watch the forecast change.

Built with: Python, pandas, numpy, React, TypeScript, Tailwind, and the Gemini API for typed shock input (parser only, human confirms before apply).

Live site: [LIVE SITE URL]
Repo: [REPO URL]
Devpost submission: [DEVPOST SUBMISSION URL]
Data credit: PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository.
```

Upload extras from `docs/video/plan.md`: thumbnail is the closing frame
(headline at 10% with the baseline subline, readable at 168x94),
captions uploaded as an SRT (do not burn them; the local ffmpeg lacks
libass), and a logged out playback test in a private window at 1080p
with sound off before the link goes into Devpost.

## 6. Submission checklist

### Draft deadline: Sat Nov 7, 8:00 PM (hard)

- [ ] Interactive claims in the write-up confirmed live on the built site
      (weather station, preset twist cards, provenance), because the write-up
      must not promise what is not shipped
- [ ] Devpost draft created, project name set (section 2)
- [ ] Elevator pitch pasted (section 3, 168 of 200 characters)
- [ ] Write-up pasted into Description (section 4)
- [ ] Generative AI answer pasted (section 4b)
- [ ] Tracks selected: Best Data Visualization and Storytelling (primary),
      Tangerine (real dataset used), plus cleared MLH rows (Gemini only if the
      typed path is live, Entire only if evidence landed, Solana only if the
      memo confirmed, GoDaddy only if the domain resolves)
- [ ] Draft marked complete with tracks chosen (video link not required yet at
      draft time)

### Final deadline: Sun Nov 8, 12:00 PM

- [ ] Public GitHub repo pushed with code, findings, and reproduction steps:
      [GITHUB REPO URL PLACEHOLDER]
- [ ] Live site deployed and linked: https://www.stormfund.work/
- [ ] 2 minute demo video link pasted (at most 120.000s, YouTube unlisted):
      [YOUTUBE LINK PLACEHOLDER]
- [ ] Short write-up in the required structure: what inspired, what we
      learned, how we built it, challenges (section 4)
- [ ] All team members listed (solo entry, event allows up to 4):
      [YOUR NAME PLACEHOLDER]
- [ ] Chosen tracks confirmed on the submission
- [ ] One submission per team: confirm this is the team's only entry
- [ ] Devpost account ready and logged in: [DEVPOST USERNAME PLACEHOLDER]

### Event day reminders (outside the form)

- [ ] Live demo window Sun Nov 8 12:30 PM, booth machine set up:
      [BOOTH LOCATION PLACEHOLDER]
- [ ] Video spot check done: first frame is the money shot, dataset size said
      in the first 15 seconds, last frame holds the URL for 3 seconds
- [ ] Gemini key restrictions verified on the deployed origin (github.io,
      localhost, final domain), delete the key after submission

### Open placeholders to fill before paste

| Placeholder | Replace with |
|-------------|--------------|
| [GITHUB REPO URL PLACEHOLDER] | https://github.com/ajeet-krish/stormfund |
| [LIVE SITE URL PLACEHOLDER] | https://www.stormfund.work/ (fallback: https://ajeet-krish.github.io/stormfund/) |
| [YOUTUBE LINK PLACEHOLDER] | unlisted video URL |
| [DEVPOST SUBMISSION URL] | own submission URL after the draft is created |
| [YOUR NAME PLACEHOLDER] | solo team member name as it should appear on Devpost |
| [DEVPOST USERNAME PLACEHOLDER] | Devpost username |
| [BOOTH LOCATION PLACEHOLDER] | booth spot announced by organizers |
