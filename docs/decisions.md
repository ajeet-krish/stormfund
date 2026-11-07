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
