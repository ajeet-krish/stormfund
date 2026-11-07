# Devpost submission draft: Ledger Odyssey (Sheridan Datathon 2026)

Created: Thu Nov 05 2026. Source of truth for every number: `docs/findings.md`
(generated, do not edit). Paste map:

| Section below | Goes into |
|---------------|-----------|
| 1. Track selection | Devpost "Track selection" checkboxes at draft time |
| 2. Project name | Devpost "Project name" field |
| 3. Write-up | Devpost "Description" field (this is also the required short write-up) |
| 4. Video description | YouTube upload (unlisted), link pasted into Devpost by final deadline |
| 5. Checklist | Your own runbook, not pasted into Devpost |

Deadlines: draft plus track selection Sat Nov 7 8:00 PM (hard), final
submission Sun Nov 8 12:00 PM, live demos 12:30 PM.

## 1. Track selection

**Recommendation: select exactly one track, Best Data Visualization and
Storytelling.** Nothing else is selected unless a condition in the table below
clears.

| Track | Select? | One sentence rationale |
|-------|---------|------------------------|
| Best Data Visualization and Storytelling | Yes, primary | Our entry is a findings report with chart twins, row level provenance stamps, and a game that reads the identical numbers, which is exactly what this award grades, and it has no Best UI/UX competitor track in 2026. |
| Podium (1st, 2nd, 3rd) | No track to select, judged automatically | Judges score every submission against Discovery 35, Data Use 25, Communication 25, Impact 15, so the podium comes from the rubric and our findings first hybrid is built for that rubric. |
| Tangerine | No for now, conditional | Select it only if the real Tangerine dataset lands and is actually used, because today every number runs on a synthetic Tangerine style mock and we would not qualify. |
| ElevenLabs Best Data Project | No | Narration via ElevenLabs is unconfirmed and would be a tool credit, not a data project built on their platform, so we do not qualify as the track is written. |
| IBM, Best Hardware, Best Beginner | No | We use none of that hardware or infrastructure, so we do not select tracks we do not qualify for. |
| MLH tracks (list still TBA) | No, recheck Saturday | Research flags the 2026 MLH list as TBA; only reconsider if a listed track matches something we actually shipped, and Gemini only if the API is actually called, which it is not. |

## 2. Project name candidates

| Candidate | One line tagline | Where it comes from |
|-----------|------------------|---------------------|
| **Ledger Odyssey** (recommended) | One year of a Tangerine style ledger, flown as a solar system where every planet traces back to a transaction row. | Internal name used in `docs/decisions.md`, `docs/architecture.md`, and `docs/findings.md`. |
| Delta-V Budget | What timing costs: burn your spending schedule onto the payday cycle and watch the balance floor move. | Approved primary shortlist name B-1 in `docs/decisions.md`. |
| Ledger Valley | A findings first flight over the months where the balance runs out, with every number stamped to its source rows. | Data insurance fallback G-1 in `docs/decisions.md`. |

Recommendation: ship **Ledger Odyssey**, because the repo, the report, and the
video title draft all already use it, so judges see one name everywhere.

## 3. Write-up

Paste everything from "The question we asked" through the Links block into the
Devpost Description field. It uses headings, lists, bold, and links, all
supported by Devpost markdown.

### The question we asked

Of one year of Tangerine style transactions, how much spending is locked by
the calendar rather than by choice, when does the balance actually run out,
and what would it cost to move spending onto the payday cycle?

**Headline finding: only 5.08% of annual spend is calendar locked, so the
problem is behavioral, not structural, and timing alone cannot fix the balance
floor (capping the holiday surge category can: +$2,366.72).**

**Synthetic data notice:** every number below comes from a synthetic mock
ledger (seed `20261107`, 5,702 rows, 2025-11-01 to 2026-10-31, Tangerine style
schema). No real bank data appears anywhere in this repository. Every method
here transfers unchanged to the real Tangerine dataset: only the input CSV
path changes, because the pipeline already consumes either file.

### What we did

One offline, seeded, pinned Python pipeline over the ledger, five analyses
(F1 to F5), and a verification step that recomputes every published number:

| Step | What ran |
|------|----------|
| Build | `build_world.py` turns the CSV into a row table plus a game world, stamping per entity provenance (row ids, filter, aggregation, SHA256 checksum) |
| F1 structural share | Day of week and holiday deseasonalized lag autocorrelation at lags 28 to 35 per category, thresholded against a white noise band and control lags |
| F2 seasonality | Day of week, month, and holiday window decomposition with declared verdict thresholds |
| F3 risk model | L2 logistic regression on night before features (trailing windows end at t minus 1), time ordered split at 2026-02-01, model card emitted |
| F4 plane change cost | Counterfactual timing simulation of every category against the income phase, three scenarios each |
| F5 interventions | Four simulated counterfactuals ranked by floor lift then drawdown improvement |
| Verify | `verify_findings.py` recomputes every number and compares against the files, wrapped by `uv run pytest` (exit code 0) |

Seeds and versions: mock ledger seed `20261107`, scikit-learn
`random_state 20261107`, dependencies pinned in `pyproject.toml` with
`uv.lock`.

**Interactive elements, all reading the same `findings.json`:**

- **Findings report with row level provenance stamps:** every headline number
  ships with a conventional chart twin and a "so what" caption, and every
  entity carries row ids, filter, aggregation, and a checksum that resolve to
  raw rows.
- **Ledger Odyssey game:** category planets sized by annual spend over one
  year in orbit, where every planet, splurge, and income depot traces back to
  source transactions, and the Inspector shows rows, sum, and a live checksum
  verification.
- **Counterfactual bridge:** one shared pure lookup, so the F4 figure a judge
  reads in the report is the identical figure on the game's transfer option
  card, with no recomputation and no drift by construction.

### What we found

- **F1, structural share:** only **5.08%** of annual spend is structural
  (Subscriptions, Utilities). The recurrence test leaves $4,268.38 of
  $83,994.93, so the persona's problem is behavioral, not structural.
- **F2, seasonality:** **Retail holiday lift 1.80x**, the strongest calendar
  category; Travel is calendar driven too (2.94x, sparse rows), Groceries is
  behavioral, and Dining and Transit are mixed.
- **F3, deficit day model:** night before features reach **test AUC 0.590**
  (accuracy 62.6% against an 86.1% majority baseline, train AUC 0.957 flags
  drift) over 86 deficit days, reported with a model card covering intended
  use, drift, fairness caveats, and correlation not causation.
- **F4, plane change cost:** aligning Travel to the payday cycle buys
  **+$1,005.93 of drawdown** (4.6% of the $21,884.01 baseline) and lifts the
  2025-12-24 trough by the same $1,005.93, while the month end floor stays at
  -$80.24: timing buys the trough, not the floor.
- **F5, ranked interventions:** capping the top surge category at its baseline
  rate lifts the minimum month end balance by **+$2,366.72** (floor moves from
  -$80.24 to +$2,286.48); Dining realignment improves drawdown by +$932.20;
  the auto save row is the honest null, moving neither metric.

Impact and next step: the user is a person paid once a month on the 25th who
needs to know which dollars are locked and when the balance runs out; the
realistic next step is running this unchanged pipeline on the real Tangerine
dataset (only the CSV path changes) and reading the same report against real
statements.

### Limitations (summary, full list in the repo)

- Synthetic data (seed `20261107`) validated against known construction rather
  than a real statement; deltas will differ on the real dataset, though the
  methods are unchanged.
- One year of daily rows: uncertainty around AUC 0.590 is wide, no confidence
  interval is claimed, and concept drift between train and test is strong.
- Classification is per category, not per transaction, and the lag window
  tests monthly recurrence only; weekly locked behavior is measured separately
  in F2.
- Counterfactuals are simulations under fixed behavior, not causal estimates:
  they bound an opportunity rather than an achievable effect, and the surge cap
  changes amounts, not only timing.
- Verdict thresholds (1.25 holiday lift, 0.20 weekend deviation, 30 row floor)
  are declared design choices, not hypothesis tests; correlation, not
  causation, everywhere.

### Links

- Code and reproduction steps: [GITHUB REPO URL PLACEHOLDER]
- Live site: [LIVE SITE URL PLACEHOLDER]
- 2 minute demo video: [YOUTUBE LINK PLACEHOLDER, unlisted]
- Reproduce: `uv sync`, then `uv run python -m scripts.analysis.build_findings`,
  `uv run python -m scripts.analysis.verify_findings`, then `uv run pytest`

## 4. YouTube video description (public unlisted)

Visibility: **Unlisted** (anyone with the link can watch). Do not use Private,
judges cannot open it.

Title draft:

```text
Ledger Odyssey: what one year of a Tangerine style ledger actually says | Sheridan Datathon 2026
```

Description draft (paste and fill the bracketed fields):

```text
A 2 minute demo walking through our approach and findings for the Sheridan Datathon 2026.

The question we asked: of one year of Tangerine style transactions, how much spending is locked by the calendar rather than by choice, when does the balance actually run out, and what would it cost to move spending onto the payday cycle?

What we did: one offline pipeline (build_world, five analyses F1 to F5, verify_findings recomputes every published number) over a synthetic Tangerine style ledger (5,702 rows, 2025-11-01 to 2026-10-31, seed 20261107). Every method transfers unchanged to the real dataset.

What we found: only 5.08% of annual spend is calendar locked; Retail holiday lift is 1.80x; the night before deficit model reaches test AUC 0.590; aligning Travel to the payday cycle buys +$1,005.93 of drawdown; capping the holiday surge category lifts the floor by +$2,366.72.

Live site: [LIVE SITE URL]
Repo: [REPO URL]
Devpost submission: [DEVPOST SUBMISSION URL]
All numbers are synthetic. No real bank data appears in this repository.
```

Upload extras from `docs/video/script-template.md`: thumbnail is the F1 chart
frame with 5.08% readable at 168x94, captions uploaded if not burned in, and a
logged out playback test at 1080p with sound off before the link goes into
Devpost.

## 5. Submission checklist

### Draft deadline: Sat Nov 7, 8:00 PM (hard)

- [ ] Interactive claims in the write-up confirmed live on the built site
      (chart twins, Inspector provenance, counterfactual bridge), because
      `docs/decisions.md` deferred the full report UI and the write-up must
      not promise what is not shipped
- [ ] Devpost draft created, project name set (section 2)
- [ ] Write-up pasted into Description (section 3, question, what we did, what
      we found)
- [ ] Track selected: Best Data Visualization and Storytelling (section 1);
      no other track unless a condition cleared
- [ ] Draft marked complete with tracks chosen (video link not required yet at
      draft time)

### Final deadline: Sun Nov 8, 12:00 PM

- [ ] Public GitHub repo pushed with code, findings, and reproduction steps:
      [GITHUB REPO URL PLACEHOLDER]
- [ ] Live site deployed and linked: [LIVE SITE URL PLACEHOLDER]
- [ ] 2 minute demo video link pasted (at most 120.000s, YouTube unlisted):
      [YOUTUBE LINK PLACEHOLDER]
- [ ] Short write-up in the required structure: question asked, what you did,
      what you found (section 3)
- [ ] All team members listed (solo entry, event allows up to 4):
      [YOUR NAME PLACEHOLDER]
- [ ] Chosen tracks confirmed on the submission (Best Data Visualization and
      Storytelling; Tangerine only if the real dataset lands and is used)
- [ ] One submission per team: confirm this is the team's only entry
- [ ] Devpost account ready and logged in: [DEVPOST USERNAME PLACEHOLDER]

### Event day reminders (outside the form)

- [ ] Live demo window Sun Nov 8 12:30 PM, booth machine set up:
      [BOOTH LOCATION PLACEHOLDER]
- [ ] Video spot check done: first frame is the question card, synthetic data
      said in the first 15 seconds, last frame holds the URL for 3 seconds

### Open placeholders to fill before paste

| Placeholder | Replace with |
|-------------|--------------|
| [GITHUB REPO URL PLACEHOLDER] | public repo URL, set after the first push (no git remote configured yet) |
| [LIVE SITE URL PLACEHOLDER] | GitHub Pages URL (deploy workflow builds `/<repo>/`) |
| [YOUTUBE LINK PLACEHOLDER] | unlisted video URL |
| [DEVPOST SUBMISSION URL] | own submission URL after the draft is created |
| [YOUR NAME PLACEHOLDER] | solo team member name as it should appear on Devpost |
| [DEVPOST USERNAME PLACEHOLDER] | Devpost username |
| [BOOTH LOCATION PLACEHOLDER] | booth spot announced by organizers |
