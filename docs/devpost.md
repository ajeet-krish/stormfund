# Devpost submission draft: Storm Fund (Sheridan Datathon 2026)

Created: Sat Nov 07 2026 (replaces the obsolete Ledger Odyssey draft after the
pivot to the Resilience Weather Station). Source of truth for every number:
`public/data/engine/aggregates.json` once frozen (findings freeze Sat 6:00 PM).
Paste map:

| Section below | Goes into |
|---------------|-----------|
| 1. Track selection | Devpost "Track selection" checkboxes at draft time |
| 2. Project name | Devpost "Project name" field |
| 3. Elevator pitch | Devpost short pitch field (max 200 characters) |
| 4. About the project | Devpost "Description" field (the required short write-up) |
| 5. Video description | YouTube upload (unlisted), link pasted into Devpost by final deadline |
| 6. Checklist | Your own runbook, not pasted into Devpost |

Deadlines: draft plus track selection Sat Nov 7 8:00 PM (hard), final
submission Sun Nov 8 12:00 PM, live demos 12:30 PM.

## 1. Track selection

**Recommendation: select Best Data Visualization and Storytelling as primary,
plus Tangerine (the real dataset is in and used), plus any MLH row whose
condition has cleared.**

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

## 2. Project name

```text
Storm Fund: A resilience weather station for bank customers
```

Domain candidates (runbook rules: never "tangerine", no hyphens, no digits, no
.io, speakable in one breath, about 15 CAD): `stormfund.site` first choice,
then `rainyday.site`, `levee.fund`, `raincoat.site`. Recheck availability at
registration; RDAP is point in time.

## 3. Elevator pitch (168 characters, max 200)

```text
Your rainy day fund, as weather. Storm Fund turns any bank account into a pixel sky where runway, buffer, and shocks are visible at a glance.
```

## 4. About the project

Paste everything from "What inspired us" through the Links block into the
Devpost Description field. Devpost markdown supports headings, lists, bold,
links, and LaTeX math between dollar signs.

### What inspired us

Bank numbers are honest but unreadable. A judge can be told "runway 2.7
months" and nod, but they feel nothing until the sky goes dark. We took the
Tangerine challenge (know the customer, take a shock, make a plan) and asked:
what if financial health had weather? Your savings buffer is a reservoir. Your
income is rain. Your spending is evaporation. Job loss is a drought front
rolling in from the left. The name is the idiom itself: everyone knows what a
rainy day fund is, and finally you can see the rainy day coming.

The pixel art direction comes from Terraria and Stardew Valley: cozy,
legible, and strangely calming even when the forecast says storm.

### What we learned

- **Judge parity is a design constraint, not an afterthought.** Our runway
  formula matches the answer key to the decimal, in integer cents, with the
  exact branch order (buffer left wins, then the no-shortfall string state).
  Every visual reads those numbers; none of them recompute them.

  $$\text{buffer}_{\text{left}} = B - C_{\text{one-off}}, \quad
    \text{gap} = S' - I', \quad
    \text{runway} = \min\!\left(\frac{\text{buffer}_{\text{left}}}{\text{gap}},\ 120\right)$$

- **A weather skin stays honest only with a printed mapping legend.** Rain is
  income, evaporation is spending, water level is buffer. Say it on screen or
  the skin becomes decoration.
- **AI is a parser, not an oracle.** Gemini maps a typed shock sentence into
  three numbers; a human confirms the chips before anything moves. The rules
  engine does the math. The model never touches the runway.
- **Accessibility and drama are the same problem.** Severity is carried by
  color and icon and text label, so the storm reads on a projector, on a
  laptop, and to a colorblind judge.

### How we built it

- **Data:** the real anonymized bank dataset (4,500 accounts, 1.06M
  transactions, 185K monthly summaries, 682 loans), credited to the PKDD'99
  Financial dataset via the CTU Prague Relational Dataset Repository.
- **Pipeline:** Python with pandas and numpy, fully vectorized (groupby, no
  per-account loops), integer cents throughout, `uv` for pinned dependencies.
  One pass produces profiles.json with the six judge metrics (I, F, S, B, H, P)
  plus provenance for every number, then a verifier independently recomputes a
  seeded sample straight from the raw CSVs and diffs against the artifact.
- **Frontend:** React, Vite, TypeScript, Tailwind. A pure `weatherState`
  function maps metrics to seven weather states; the forecast strip, bands, and
  EI-cliff overlay are hand-rolled SVG. All data bundled as JSON: zero runtime
  network calls, so the booth demo survives bad wifi.
- **Gemini (gated add-on):** a judge can type the shock in their own words
  ("EI covers half and the furnace dies"). Structured JSON output with a strict
  schema, clamped and percent-corrected in TypeScript, shown as confirmation
  chips with a formula strip. One click applies. Three second timeout, then
  preset cards. The mode is always visible on screen.

### Challenges we faced

- **The dataset was nine relational tables, not the single CSV our pipeline
  assumed.** We rebuilt the ingest around `monthly_summary.csv` (the judges'
  actual source) and kept `transactions.csv` at 98MB out of the critical path
  with chunked reads.
- **Two implementations of one formula.** Python computes, TypeScript mirrors.
  Golden fixtures hand-computed in a spreadsheet keep them honest, and a
  verifier recomputes from raw data so drift fails the build, not the demo.
- **Live judging is unforgiving.** A judge picks an account_id you have never
  seen and reads a twist card you cannot rehearse. Edge guards flag thin
  history, negative buffer, zero bills, and missing loans before the judge
  finds them; preset cards are always one click away if the network hiccups.
- **Scope under a 48 hour clock.** Weather particles are data-driven or they
  do not ship. The cut order is written down, and the findings report, the
  video, and the write-up are never on it.

### Limits we declare up front

Runway uses the answer key's definitions, including flat 55% EI (no weekly
maximum, no taxes). Plans are our own declared formulas (goal = 3x spending),
permitted by the brief and stated on screen. Correlation, not causation,
everywhere. No customer rows leave the browser; the Gemini prompt carries a
sentence and aggregate numbers only.

### Links

- Code and reproduction steps: [GITHUB REPO URL PLACEHOLDER]
- Live site: [LIVE SITE URL PLACEHOLDER]
- 2 minute demo video: [YOUTUBE LINK PLACEHOLDER, unlisted]
- Reproduce: `uv sync`, then `uv run python -m scripts.engine.build`,
  `uv run python -m scripts.engine.verify`, then `uv run pytest`

## 5. YouTube video description (public unlisted)

Visibility: **Unlisted** (anyone with the link can watch). Do not use Private,
judges cannot open it.

Title draft:

```text
Storm Fund: your rainy day fund, as weather | Sheridan Datathon 2026
```

Description draft (paste and fill the bracketed fields):

```text
A 2 minute demo of Storm Fund, a resilience weather station, for the Sheridan Datathon 2026.

The question we asked: can a bank account's financial health be read as weather, so that a judge feels a shock coming instead of just reading a number?

How it works: the real anonymized bank dataset (4,500 accounts, 1.06M transactions) feeds a vectorized Python pipeline that computes the exact judge metrics (income, fixed costs, spending, buffer, household bills, loan payment) in integer cents, then a React weather station maps runway and buffer to seven weather states with a printed mapping legend. Pick an account, apply a shock, watch the forecast change.

Built with: Python, pandas, numpy, React, TypeScript, Tailwind, and the Gemini API for typed shock input (parser only, human confirms before apply).

Live site: [LIVE SITE URL]
Repo: [REPO URL]
Devpost submission: [DEVPOST SUBMISSION URL]
Data credit: PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository.
```

Upload extras from `docs/video/script-template.md`: thumbnail is the money
shot frame (storm boundary mid transition, signpost RUNWAY number legible),
captions uploaded if not burned in, and a logged out playback test at 1080p
with sound off before the link goes into Devpost.

## 6. Submission checklist

### Draft deadline: Sat Nov 7, 8:00 PM (hard)

- [ ] Interactive claims in the write-up confirmed live on the built site
      (weather station, preset twist cards, provenance), because the write-up
      must not promise what is not shipped
- [ ] Devpost draft created, project name set (section 2)
- [ ] Elevator pitch pasted (section 3, 168 of 200 characters)
- [ ] Write-up pasted into Description (section 4)
- [ ] Tracks selected: Best Data Visualization and Storytelling (primary),
      Tangerine (real dataset used), plus cleared MLH rows (Gemini only if the
      typed path is live, Entire only if evidence landed, Solana only if the
      memo confirmed, GoDaddy only if the domain resolves)
- [ ] Draft marked complete with tracks chosen (video link not required yet at
      draft time)

### Final deadline: Sun Nov 8, 12:00 PM

- [ ] Public GitHub repo pushed with code, findings, and reproduction steps:
      [GITHUB REPO URL PLACEHOLDER]
- [ ] Live site deployed and linked: [LIVE SITE URL PLACEHOLDER]
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
| [LIVE SITE URL PLACEHOLDER] | GitHub Pages URL (deploy workflow builds `/<repo>/`) or the registered domain |
| [YOUTUBE LINK PLACEHOLDER] | unlisted video URL |
| [DEVPOST SUBMISSION URL] | own submission URL after the draft is created |
| [YOUR NAME PLACEHOLDER] | solo team member name as it should appear on Devpost |
| [DEVPOST USERNAME PLACEHOLDER] | Devpost username |
| [BOOTH LOCATION PLACEHOLDER] | booth spot announced by organizers |
