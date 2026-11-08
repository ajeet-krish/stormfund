# Ledger Odyssey Decision Records

Last updated: Sat Nov 07 2026

## Nov 04 2026: Phase 0: Stack and gameplay architecture

**Context**: 48-hour solo hackathon with a 24-hour execution budget, static
GitHub Pages deliverable, live booth play and a 2-minute demo video, and a
"serious analysis wearing a game" judge story demanding non-dashboard viz.

**Decision**: React 19 + R3F 9 + drei + Zustand 5 + Vite 6 (exact versions from
the zenith-web and Talon reference repos), offline Python/uv data pipeline to
world.json, game logic in a pure TS command bus and reducer, on-rails transfers
(no free flight), auto-demo as deterministic command replay, 2.5D Canvas
fallback pre-committed at event hour 6.

**Rationale**: Declarative 3D gives the highest wow per hour when scaffolding is
copied from two working repos; a pure reducer makes gameplay testable and the
auto-demo deterministic; on-rails avoids the physics tuning black hole.

**Trade-offs**: No free-flight feel, no postprocessing on weak GPUs, no deep
links, and world.json must be regenerated when the CSV schema shifts. All are
acceptable for a 24-hour static deliverable.

## Nov 04 2026: Phase 0: User approvals and open items

**Approved**: shortlist B-1 Delta-V Budget (primary) + C-2 Attrition FC
(backup), with G-1 Ledger Valley and G-3 Colony Glass as data-insurance
fallbacks. P0 pre-build list approved. Judges play live, so click or two-key
controls plus a visible auto-demo are mandatory. Procedural pixel art only.
IBM skin flavor is employees as people (Colony Glass), not infrastructure.

**User modifications to the plan**:
1. True 3D gameplay wanted (inclined orbits, vis-viva delta-v that matters),
   with research required to confirm feasibility. 2D is acceptable if it can
   carry a unique and beautiful aesthetic.
2. Booth machine is self-provided, so WebGL2 risk is ours to control and the
   2D fallback renderer drops from P0 to P1 insurance.
3. ElevenLabs API key and credits not yet confirmed, so live narration is P1
   until verified. Pre-generated narration files are the interim plan.

**Open (closed Nov 04 2026)**: renderer decision resolved by research output;
Tier T1 on-rails true 3D with a 2D CRT phosphor fallback, see docs/research.md.

## Nov 04 2026: Phase 0: Findings-first hybrid (SUPERSEDES game-primary ordering)

**Context**: User challenged whether a game can count as a data finding under
the 2026 rubric. Research confirmed the actual weights: Discovery 35, Data Use
25, Communication 25, Impact 15. Execution weight was removed for 2026 and the
organizer message is "judged on what you found rather than what you shipped".
60 percent of the score is Discovery plus Data Use, which a game does not
automatically produce. Prior winners: Sheridan 2025 first place was Sourced
(interactive 3D artifact); games at data events tend to win category prizes,
not podiums.

**Decision**: Findings-first hybrid. The site leads with a findings report
(question, methods, numbered findings F1 to F5 with chart twins, model card,
limitations); the game is the exploration layer one click below. Tier 0
analysis is built BEFORE any further game work. Hard condition: if Tier 0
findings are not computed and rendered by Saturday 2:00 PM, the game drops to
presentation-only and the entry ships as a professional analysis with a 3D
interactive appendix.

**Primary target**: Best Data Visualization and Storytelling track (native
format award, no Best UI/UX competitor in 2026). Podium is secondary.

**Write-up**: single source of truth; the site findings report is copied into
the Devpost description.

**Dataset fallback**: if the real Tangerine dataset never lands or is unusable,
ship findings computed on the mock ledger, loudly labeled as synthetic. Do not
pivot to a public dataset.

**Rationale**: every game mechanic must pass four tests (falsifiable finding,
novel object that charts show worse, conventional chart twin, row-level
provenance). F4, the plane-change cost metric (counterfactual cash-flow timing
friction), is the load-bearing finding the game exists to make legible.

**Tier 0 (mandatory before the Saturday 8:00 PM draft)**: EDA section,
recurrence and seasonality analysis (F1, F2), deficit-day logistic regression
with model card (F3), findings report page (F4, F5 counterfactual module
shared between report and game reducer).

**Trade-offs**: less game polish in the window; findings work starts first,
game polish is Sunday morning only. The uniqueness advantage is kept rather
than traded away for a plain dashboard.

## Nov 05 2026 - Phase 1: Report UI and shared counterfactual module deferred to next phase

**Context**: The code review cycle required a landing page that is not an
empty promise while the full report UI was not yet built.

**Decision**: The FindingsView ships a stopgap: a data-driven summary of the
five findings (titles, one headline number each, synthetic-data badge) loaded
from findings.json, with tests. The FULL report UI (SVG chart twins, honesty
badges, explore-in-game deep link) and the shared F4/F5 counterfactual module
that both the report and the game reducer consume are moved to the next
approved phase (Phase 1, currently in progress per AGENTS.md status).

**Rationale**: the stopgap keeps the findings-first landing honest without
blocking the review cycle; the chart twins need the renderer decision and the
shared module needs the game option card designed first.

**Status**: stopgap implemented and tested. SUPERSEDED later the same day:
the full report UI (SVG chart twins, provenance stamps, explore-in-game deep
link) shipped in Phase 1 and is now live; see the Phase 1 review trail in
docs/reviews.md. Only the shared F4/F5 counterfactual module stayed deferred
until Phase 2 (shipped, see below).

## Nov 05 2026 - Phase 2: Counterfactual bridge shipped

**Context**: The findings-first story requires the report and the game to read
the same counterfactual numbers so the figure a judge reads in finding F4 is
the identical figure they see in the game.

**Decision**: The bridge is src/lib/friction.ts, one pure typed lookup
(lookupFriction) that both surfaces call: the transfer option card in the game
and the F4 section of the report. It reads only findings.json data, never
recomputes. The card tag is text ("simulated counterfactual, see F4") rather
than a link because the app has no router. PlayView reuses the memoized
loadSharedFindingsReport so findings.json stays a single fetch with two
consumers. Category matching is case-insensitive name plus entity id tail;
income targets and unknown categories render no line rather than a guess.

**Rationale**: one shared lookup makes drift between surfaces impossible by
construction, which is the point of the bridge.

## Nov 06 2026 - Phase 3: Comprehensive award plan synthesis (LOCKED)

**Context**: Friday before the hackathon. User set five award targets:
podium, Tangerine (preferred sponsor), Best Use of Entire, Best Use of Solana,
Best Domain Name (GoDaddy). Money River landscape art is the artistic spine.
Real Tangerine data drops Saturday. Fresh repo Saturday with Entire from day
one, plumbing imported from this sandbox.

**Decisions (user confirmed Nov 06)**:
1. Solana scope: memo anchor ONLY (devnet receipt anchoring the findings.json
   SHA256 checksum plus footer read-back). No wallet UI, no Anchor, no on-chain
   river, no tokens. Hard stop Saturday 5:30 PM, drop track if not green.
   Rationale: past MLH Solana winners shipped memo proof layers; track text
   only requires on-chain state or transactions.
2. Award priority and cut order: podium (via viz craft) first, Tangerine
   second, Solana third, Entire fourth, GoDaddy fifth.
3. Fresh repo: user creates it Saturday and names it as the work proceeds.
   Import is a whitelisted copy (scripts/, src/, docs/, configs, workflows);
   base path must be fixed in the same commit as the import; migration fails
   closed until CI and Pages are green.
4. Real data privacy: decide by data type on Saturday. Sponsor competition
   data may be committed raw; personal statement data publishes aggregates,
   checksums, and k=10 suppressed cells only, never raw rows.
5. Best Beginner track skipped (not eligible). Entire is a serious secondary
   target: Friday rehearsal here gates GO; 45 minute Saturday setup timebox;
   evidence = tokens profile x2, graph stats, one Trail, token A/B.
6. IBM and ElevenLabs tracks not selected (Tangerine is the sponsor play).
   Gemini/Tiger/Snowflake/Vultr not selected (prior assessment).

**Story**: "One year of a Tangerine ledger painted as a river landscape, then
the same brush pointed at an open ledger on Solana." Site: hero Money River
landscape art (water = daily balance, drought stones = deficit days, payday
bridges, ghost line = F4, high-water mark = F5), findings first, Solana
section E (memo anchor), Entire build-log paragraph, links.

**Hard stops**: Entire setup 45 min (Sat) with abort; Solana Sat 5:30 PM;
findings freeze Sat 6:00 PM; Devpost draft Sat 8:00 PM (hard); code freeze
Sun 9:00 AM; submit Sun 12:00 PM; demos 12:30 PM.

**Friday foundation (tonight)**: Entire rehearsal here (60 min, GATE on
`entire session tokens` returning numbers), export/import dry run, Tangerine
ingest adapter (15-step schema inference, tested on mock), Solana toolchain
pre-verify (CLI, faucet, memo send from scratch), Money River art skeleton on
mock data, decision doc committed.

## Nov 07 2026 - Gated Solana provenance set approved

**Context**: a concept assessment round (planner plus product manager)
adjudicated external Tangerine x Solana bridge ideas (behavioral credit
scoring, yield streaming, dual-layer dashboards, risk-shield particles) and
the planner additions against the locked Nov 06 plan. Full record with the
verdict table: docs/ideas-tangerine-solana.md.

**Decision**: approve a gated micro-addition to the memo anchor: a three
receipt provenance set (findings.json root memo, model_card.json hash, F1
aggregate fingerprint memo), a static chain-receipt panel in section E
reading bundled evidence, and one explicitly labeled not-built future-work
paragraph in the write-up. Gate conditions: root memo confirmed by the
4:30 PM decision line (5:30 PM death line), findings re-run verified green
first, 60 minute cap, paid from cut-order items (devnet stone, motion
accents); gate failure ships the single memo and skips silently. Every
other assessed concept is rejected (SolCash credit line, yield streamer,
live dual-layer dashboard, risk-shield particles, fake-oracle framing,
payday commitment, memo escrow, resilience reputation, streaks/duels);
evidence filenames and commands: docs/competition-day-runbook.md Phase 6.

**Rationale**: the proof-layer pattern matches Solana track winners; the
package passes the single-story and deception tests; it is paid from the
cut order rather than new budget, so the findings-first primary and the
video are untouched.

## Nov 07 2026 - Phase E1: Profile precompute contract for the resilience engine

**Context**: live judging needs every judge number for any account_id
computed before the booth opens, with the exact branch rules of
docs/tangerine-challenge.md, and the E1 build was resumed from an
interrupted session. Reviewing the on-disk modules against the checklist
surfaced two places where the checklist could not hold against the real
data: the thin_history flag was defined as fewer than 6 monthly rows
while the shortest real account history is 12 rows (so the flag would
never fire), and the requested fixture "pensioner with running loan
status C" cannot exist because all 740 accounts with pension_in above
zero have no row in loans.csv at all.

**Decision**: ship public/data/engine/profiles.json as the E1 contract:
compact deterministic JSON (no timestamps, no floats, accounts in
numeric key order) with a meta block (schema_version, sources with
sha256 and rows, account_count, date_range, units, rounding, judge
definitions, checksum recipe, edge flag counts) and one 18 key profile
per account carrying the judge metrics in integer cents, the baseline
runway, history, the loan record, the five flags, the last 12 balances,
and a provenance check_sum. P reads loans.csv status only (C or D pays,
otherwise 0) and the build report logs the status versus schedule
disagreement count (448 running by status, 448 by schedule, 0
disagreements). thin_history is redefined as row_count below 18, a
quarter of the 72 month dataset span, which fires on 377 accounts and
makes the flag meaningful for the E2 caveat UI; the B window stays
min(6, n) rows regardless. Five golden fixture accounts (68257, 23838,
49900, 98952, 42988) are frozen in scripts/engine/golden_fixtures.json
with visible workings (sorted cents arrays, median steps, runway long
division), covering odd and even medians, the half cent tie, thin
history with zero income, a running loan C, a defaulted loan D, every
flag, and all three runway branches; the pensioner fixture has no loan
and the impossibility is recorded in the fixture notes. verify.py
recomputes all 4500 accounts with the naive csv module (no pandas, no
numpy, no import of metrics), diffs field by field, scans for dash
violations, and prints the artifact SHA256; tests pin the fixtures to
both metrics() and the shipped artifact, recompute check_sum for every
account, validate the schema, and prove two consecutive builds are byte
identical.

**Rationale**: judges calculate with these exact definitions, so a
precomputed artifact is only useful if its numbers are reproducible by
an independent implementation; the flag threshold change is the smallest
edit that makes a checklist requirement true on real data instead of
documenting a flag that never fires; frozen hand computed fixtures make
any future rule drift fail a test rather than pass review.

**Trade-offs**: the 4.7 MB artifact lives in the repo and must be
regenerated whenever a source checksum changes (fixtures freeze five
account ids, so a data refresh means re-deriving them); the thin_history
threshold is tied to this dataset's 72 month span and must be revisited
if the span changes; status C or D for P can diverge from the amortization
schedule on future data (the disagreement counter is the tripwire);
plans.py stays a dormant draft until E4, keeping E1 to the precompute
contract only.

## Nov 07 2026, Phase E2: Console shock contract and verdict bands

**Context**: the console must reproduce the judge's shocked numbers
exactly, and a brief shorthand (one-off cost in spending_after)
conflicts with the challenge doc formula.

**Decision**: follow docs/tangerine-challenge.md exactly: billsDeltaPct
adds scaleCents(H, pct) to spending (line 71), one-off costs subtract
from the buffer only (line 64), extraMonthlyCost is recurring spending;
income_after is the EI replacement fraction of I (line 71). Shock
scalings round half up via an integer scaleCents twin of
metrics.round_half_up. Verdict bands read integer deci months (10, 30,
60, 120), so Clear means 12.0 months and up (user confirmed). Duration
is display only in E2 (steady state formula, labeled on screen). Runway
and twist math live in src/lib/shocks.ts, validated by vitest against
scripts/engine/golden_fixtures.json, the same fixtures pytest asserts,
plus a 4500 profile baseline cross-check. State is a Zustand store
(src/state/consoleStore.ts) with atomic actions and a reserved E6 key
map (R reset, 1 to 4 presets) but no listeners yet. cp- visual tokens
extend the existing rp- palette; one hue per verdict band with
redundant encoding (glyph, label, color, number).

**Rationale**: the judge answer key is the challenge doc; integer
rounding pinned to fixtures makes cross-language drift a failing test
instead of a booth argument.

**Trade-offs**: E2 plan text is honest template text only (E4 owns goal
math and levers); FindingsView and PlayView are unmounted but kept for
machinery reuse; zustand re-added to package.json; provenance stamp
says recorded, never verified, because the browser cannot recompute a
check_sum without row data.

## Nov 07 2026 - Gemini shock input: typed path with mandatory confirm

**Context**: a misparse shown in front of a judge who is computing by
hand is the worst failure mode of this console, and the network must
never be a dependency of the demo (docs/architecture.md, Gemini shock
input).

**Decision**: shockParse owns the parse boundary (envelope, shape
validation, percent detection, clamping, rounding, reject reasons,
hash cache), and pendingShock is the only state the typed path writes:
confirmTypedShock is the single gate into twist. Every failure degrades
to the preset cards with an inline note per reject reason. The prompt
carries the sentence plus account_id plus the six baseline metrics as
integer cents, with user approval on Nov 07 2026.

**Rationale**: the confirm gate makes a misparse structurally unable to
reach state, and integer cents keep the mapped amounts exact against
the judge formula.

**Trade-offs**: the sentence cache is namespaced by account id, so the
same sentence on a different account refetches; percent detection is
scoped to incomeFactor and billsPct only, because oneOffMonths and
durationMonths legitimately exceed 1; mic input via the Web Speech API
is not built.

## Nov 07 2026, Phase E4: Lever ladder, goal definitions, and the Python twin restored

**Context**: the plan engine needs +N months lever effects honest
enough for a judge hand check; plans.py is a dormant draft with a
broken scale_cents import; E2 review required printed definition lines
for the 6 month horizon and F+P cut floor.

**Decision**: levers are an ordered cumulative ladder (shop_insurance,
trim_discretionary, defer_loan), each an explicit integer-cents effect
sized from profile numbers, each +N months computed only by re-running
shocks.runway. Order is free moves first: insurance, then discretionary
trim, then loan deferral (user confirmed). Standing-orders and
secondary-buffer levers are rejected (not derivable from profiles.json;
no schema change in E4). Goal keeps 3x S from-zero months (E2
invariant) with 6x stretch chips and a printed definition strip; the
buffer on hand is a separate disclosure line (user confirmed). The
insurance lever uses the full median insurance cost, labeled simulated
counterfactual upper bound (user confirmed). scripts/engine/plans.py is
restored as a test-side twin (scale_cents added to shocks.py),
asserting a new frozen scripts/engine/golden_plans.json that
src/lib/planMath.golden.test.ts also asserts; no build/verify coupling
(user confirmed).

**Rationale**: re-running the judge formula makes every lever number
hand-checkable and drift-proof; the shared golden file is the
established cross-language drift guard and is judge-facing evidence for
the Data Use rubric.

**Trade-offs**: the F+P floor can double count loan cost (judge F
includes median loan_payments) and is explainable rather than exact;
depleted-buffer accounts show +0.0 for every lever (honest, surfaced as
copy); every plan rule change now needs a TS and a Python edit, with a
missed edit failing pytest.
