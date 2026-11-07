# Sheridan Datathon 2026 Research

Last updated: Nov 06 2026

Entries are appended under dated topic headings. This file feeds
docs/decisions.md and docs/architecture.md.

## 2026-11-04: True 3D orbital gameplay feasibility (Phase 0)

### Verdict

True 3D gameplay (inclined orbits, vis-viva delta-v that matters to strategy)
is FEASIBLE for solo + 24h IF scoped as on-rails transfers with closed-form
delta-v, not free flight. Full patched-conic free flight is not feasible.

### Complexity tiers with time estimates (solo dev, after approved pre-build week)

| Tier | Scope | Est. build time | Risk | Verdict |
|------|-------|-----------------|------|---------|
| T0 | 3D presentation only: orbit rings, click a planet, ship tweens, no dv mechanics | 3 to 5 h | Low | Fallback floor, not a game |
| T1 | On-rails inclined transfers: Hohmann + combined plane-change closed forms, dv budget from savings, ghost transfer arcs, AN/DN markers, time warp, option card per target | 8 to 14 h (total project 16 to 24 h with data + UI) | Medium | COMMIT THIS. Inclination and vis-viva genuinely matter here |
| T2 | T1 plus live Lambert/Gauss solve (port from zenith-web), phase-angle windows, bi-elliptic comparison, burn-at-apogee optimization | +8 to 16 h (total 24 to 40 h) | High unless ported during pre-build week | Stretch goal only |
| T3 | Patched conic with SOI transitions, RK4 burns, rendezvous, landing | 3 to 6 weeks | Very high | Infeasible in window |
| T4 | n-body, Lagrange points, gravity assists as physics | months | Black hole | Explicitly excluded |

Evidence behind estimates:

| Source | What it shows | Reading for us |
|--------|---------------|----------------|
| metaphox/orbit-game "Limited Propellant" (DESIGN.md) | Godot level-based 3D orbital game shipped 7 levels: on-rails Kepler bodies, RK4 only during burns, keyboard maneuver-node editing, inclination-gated plane-change level | T1/T2 mechanics are a known, documented recipe; also proof that node UI should be keyboard + buttons, not mouse drag |
| dgreenheck/moonshot (GitHub) | Full KSP-like browser game: patched conics, SOI transitions, RK4, tests vs brute force, autopilot mission test | T3 scale project, mature repo, weeks+ of work; borrow test strategy (analytic vs RK4 cross-check), not scope |
| Perilune (Devpost) | Browser orbital game in TypeScript + three.js WebGL2, maneuver nodes, guided scenarios | Feasible with heavy AI assistance, but it is a long-horizon project, not a 24h one |
| gianlucatruda/orbital (DevLog) | Started as a game jam, months of part time work, physics bugs kept arriving, never got gameplay shipped | Cautionary: physics eats time; gameplay must sit on top of precomputed/conic math, not integration |
| Slingshotter (three.js showcase) | Plan a flight on a timeline, see the full trajectory instantly, no real-time flying | Direct precedent for our on-rails decision: planning UI gives strategy without flight sim |
| Conquer Space dev diary | Hohmann transfer took a solo dev significant time to get equations working despite unit tests | Equations must be copied from working code (zenith-web), not derived live at the event |
| Orbital Dawn dev blog (2D Patched Conics) | Patched conics in 2D: pivot-node drawing, Kepler time of flight, SOI smoothing is an open problem | Confirms SOI boundary artifacts are a known trap; avoid SOI entirely at T1 |
| zenith-web (local repo) | WASM/TS engine already has Hohmann, plane change, phasing, bi-elliptic comparison, Lambert solver, Gauss IOD, vis-viva theory page; Gauss IOD 0.3 ms | Largest de-risking asset: copy maneuver math and fixtures from this repo during pre-build |

### Making inclination strategically meaningful without n-body

Design mapping (finance meaning in parentheses):

- Each category planet gets inclination i and ascending node Omega, seeded
  deterministically from its data row (inclination = how far this category
  sits from your baseline plan; Omega = when in the month it hits).
- Plane change cost is real and brutal: dv = 2 v sin(deltai/2), so a 60 degree
  change at LEO costs nearly a full orbital speed (about 7.8 km/s). Cheap
  version: burn combined with circularization: dv = sqrt(v1^2 + v2^2 - 2 v1 v2 cos deltai).
- Three strategic levers, all honest physics, all finance metaphors:
  1. Pay now: combined plane-change burn at the node (visible dv hit to savings).
  2. Pay later: shape the transfer ellipse so the plane change happens at
     apoapsis where v is low (cheaper dv, longer trip, more months of debt).
  3. Pay never: wait for node alignment (time cost; waiting accrues interest
     or missed income, so time is money, literally).
- Route optimization emerges for free: visit same-plane clusters first
  (batching errands), leave high-inclination splurge planets for when the
  dv budget allows. No n-body needed, no numeric integration needed.
- Time versus delta-v is the core tension. It maps to the judge story:
  every dv number traces to transaction rows (fuel = savings).

### Input scheme for booth (click plus two keys)

| Scheme | Source precedent | Fit |
|--------|------------------|-----|
| Click planet, option card with 3 choices (burn now / burn at apoapsis / wait for window) each showing dv and time cost, Tab cycles targets, Space engages | Slingshotter instant trajectory preview; existing architecture.md controls | BEST: zero attitude flying, satisfies booth constraint, reads as a strategy game |
| Keyboard maneuver node editing: arrows adjust prograde/normal dv, brackets adjust time, buttons mirror keys through one semantic action path | Limited Propellant shipped this instead of mouse drag; unit testable headless | Good stretch for T2, one code path for keyboard and click |
| KSP style: click orbit to place node, drag prograde/normal/radial handles, snap to Ap/Pe/AN/DN | KSP + Maneuver Node Evolved mod | Too fiddly for a 2 minute judge session, skip |
| WASDQE attitude plus throttle (free flight) | WebGL-Orbiter, KSP | Reject: attitude control is the time sink that kills 24h scope |

Camera note: slow auto-orbit plus drag to inspect. Inclination must read at a
glance: tilted orbit rings, violet AN/DN dots (Limited Propellant convention),
and a visible wedge between your plane and the target plane.

### Recommended commitment

Tier T1 as committed scope, T2 as stretch only if Lambert port lands in the
pre-build week. This delivers "true 3D gameplay" in the user's sense:
inclined transfers and vis-viva delta-v drive decisions, while staying inside
the pure reducer (all math is closed form, fully unit testable).

## 2026-11-04: 2D aesthetic options (Phase 0, fallback)

Ranked for beauty ceiling, solo 24h build cost, space finance fit, and
precedent. All candidates work on Canvas 2D except where noted.

| Rank | Option | Beauty ceiling | Solo build cost | Space finance fit | Precedent | Notes |
|------|--------|----------------|-----------------|-------------------|-----------|-------|
| 1 | Vector CRT / phosphor oscilloscope | High | 1 to 2 d | Excellent (mission computer, glowing chart lines, ticker energy) | Tempest 4000, Asteroids, Lunar Lander, Vectronom, Polybius, oscilloscope music | Glow via pre-rendered sprites or WebGL bloom, not per-frame shadowBlur (too slow with many objects). Scanlines, phosphor decay trails, barrel curve. Same visual language as the 3D orbit lines, so fallback stays on brand |
| 2 | Blueprint / technical drawing | High | 0.5 to 1.5 d | Excellent (provenance annotations, orbital diagrams, engineering a budget) | NASA technical plates, KSP blueprint art, Limited Propellant mission computer UI | Cheapest path to a datathon data-viz award look: cyanotype blue, white line work, dimension arrows, mono type (IBM Plex Mono or Space Mono). Risk: few game precedents, so typography carries it |
| 3 | Generative flow field / Chladni (data bound) | High (as a layer) | 0.5 to 1 d | Strong (transactions as particles, category frequencies as modes) | Nervous System generative products, Tyler Hobbs flow fields, Processing Chladni tutorials | Best as a background layer under either rank 1 or 2. Must be driven by the data or it reads as a screensaver |
| 4 | Paper cutout / layered ledger parallax | High | 1 to 2 d | Strong (receipts, sticky notes, stacked balance sheets) | Tearaway, Paper Mario, South Park stick of truth, a paper-craft money-making engine game devlog (GDKO 2024) | Drop shadows plus 4 to 6 parallax layers sell it. Cozy, unusual for space, good contrast to competitors |
| 5 | Risograph limited spot ink | High | 1 to 2 d | Medium (zine/editorial ledger print) | Print culture (True Grit RizzCraft), sparse game precedents | Grain plus deliberate misregistration plus 2 spot inks (fluorescent pink and blue) via noise texture and multiply blend. Unique on a Devpost wall, but art direction risk |
| 6 | Stained glass | Very high | 2 to 3 d | Medium (celestial medallions, rose windows) | Gleamlight, Glass Masquerade, Saga of Sins, Little Briar Rose | Gorgeous ceiling, but pane geometry plus glow plus animation is a multi-day art job |
| 7 | Pixel art with modern lighting | High | 2 to 3 d | Medium (retro terminal vibe) | Hyper Light Drifter, Dead Cells, SpriteIlluminator showcase scenes | Blocker: normal-map lighting needs WebGL, it does not work on pure Canvas 2D (CodeAndWeb SpriteIlluminator docs). Conflicts with the Canvas 2D fallback ethos. Procedural pixel art only per approval |
| 8 | Ink wash sumi-e | Very high | 2 to 3 d | Medium (ink of the ledger, brush orbit trails) | Okami, Sumioni, Kotaku ink-wash gallery | Procedural brush rendering is deceptive; beautiful when done, muddy when rushed |

Technical constraints worth remembering:

- Normal-map 2D lighting requires a GL pipeline (WebGL/OpenGL); pure Canvas 2D
  cannot do it. Pixel plus lighting only makes the list if the renderer is
  WebGL from the start.
- Two-canvas hybrid pattern is available: a WebGL2 fragment-shader canvas
  (starfield, noise, glow) layered under a Canvas 2D game canvas. Keeps a
  shader background without giving up the Canvas fallback.
- Canvas glow via shadowBlur is expensive at scale. Pre-render glowing
  sprites to an offscreen canvas once, then drawImage.

### Recommended 2D direction

Rank 1 as primary (vector CRT phosphor), with rank 2 (blueprint) as the
treatment for HUD, inspector, and provenance panels. The combination is
literally the judge story: glowing trajectory chart plus annotated technical
dossier, and it reuses the orbit-line visual language of the 3D build.

## 2026-11-04: Short session design (2 minute judge play)

### Principles

| Principle | Source | Application |
|-----------|--------|-------------|
| Core loop must be fun in 30 seconds; judges play hundreds of games; no tutorial needed | StraySpark Game Jam Survival Guide | One screen, one decision (which target, which burn strategy), one visible outcome |
| One decision at a time, first win fast, front-load reward not rules | Game onboarding UX (punchev) | Show dv and time costs on the option card before any explanation |
| Evaluation windows are 5 minutes including loading; menus and tutorials count against you | Sandbox Studio game jam judging rules | Auto-demo running at idle (already in architecture) is the attract mode |
| Open on the game running, show the best 90 seconds, finished small beats ambitious broken | UnityNYC Summer Jam demo guidance | Demo video script: 90 s of transfers plus one plane-change decision |
| Management games can be short: Mini Metro sessions run 10 to 20 minutes, reactive loop instead of build-first, minimal UI, procedural audio, daily challenge | Mini Metro (Wikipedia, Gamasutra/Hey Gamer design talk) | Scaled to 2 minutes: react to incoming targets, no build phase, skip menus |
| Systems judged on coherence and emergence, fidelity to reality is explicitly not a criterion | Game Gauntlet SIM Jam judging criteria | Legitimizes tuned constants: plausible, not pedantic (Limited Propellant pillar 2) |
| Failure is information: instant free retries, deterministic physics, readable feedback | Limited Propellant design pillars | Wrong burn shows the missed arc immediately, retry costs nothing |
| Polish is noticed disproportionately: sound on every action, screen shake, particles | StraySpark hours 16 to 20 pass | Budget 2 h for juice: burn flash, dv counter tick, node ping |
| Live demo scoring weights: fun 25, theme 20, craft 20, technical 20, scope 15 | UnityNYC Summer Jam rubric | Our weighting target: craft (aesthetic) plus technical (physics honesty) must carry 40 of 100 |

### Judge-friendly session shape (design target)

- 0 to 10 s: auto-demo already flying, glowing orbits, one caption line.
- 10 to 40 s: judge clicks a planet, reads a card with dv and time costs.
- 40 to 90 s: engages a transfer, watches arc, sees savings (fuel) drop and
  debt horizon shift.
- 90 to 120 s: a plane-change tradeoff appears (pay dv now or wait), which is
  the sentence the judge repeats to the other judges.

## 2026-11-04: Datathon and hackathon winners worth studying

| Project / event | What to study | Source |
|-----------------|---------------|--------|
| Sheridan Datathon 2025 (Devpost gallery, EduViz AI best Gemini winner) | Same room, same judges culture: animated, visual, story-first submissions won attention | sheridandatathon2025.devpost.com (403 to fetch), Instagram @sheridandatathon |
| Google Cloud x MLB Hackathon, MLB Pitcher Mechanics Scorecard (overall winner) | Interactive visual artifact that demos on stage to a keynote audience; visual plus narrative beat raw model accuracy | info.devpost.com customer story |
| DataOrbit 2025 (UCSB) | Has an explicit Data Visualization and Insights Award, so datathons reward the viz half separately | dataorbit-2025.devpost.com |
| Midwest Big Data Hackathon | Leepfrog Award for Data Visualization as a standalone prize | bigdata.devpost.com |
| Game Gauntlet SIM Jam | Judging rubric for simulation games: systems, engagement, creativity, theme, presentation; live demo to panel; browser builds preferred to avoid launch failures | jams.team |
| UnityNYC Summer Jam 2026 | Rubric weights and live demo tactics (open running, best 90 s) | itch.io jam page |
| Tiny Demo Jam | 30 second demo constraint as a forcing function for loop clarity | itch.io |

Caution: datathons rarely crown games. The safe play is to make the
visualization award grade on its own merits (provenance inspector, charts)
while the game wrapper supplies novelty. Ledger Odyssey is deliberately
positioned on that seam.

## Key equations

| Equation | Description | Variables |
|----------|-------------|-----------|
| v = sqrt(mu (2/r - 1/a)) | Vis-viva: speed on any conic | v speed, mu gravitational parameter, r radius, a semi-major axis |
| dv1 = sqrt(mu/r1)(sqrt(2 r2/(r1+r2)) - 1), dv2 = sqrt(mu/r2)(1 - sqrt(2 r1/(r1+r2))) | Hohmann two-impulse delta-v | r1 inner radius, r2 outer radius |
| T/2 = pi sqrt((r1+r2)^3/(8 mu)) | Hohmann transfer time | same as above |
| dv = 2 v sin(deltai/2) | Pure plane change cost | v speed at burn point, deltai inclination change |
| dv = sqrt(v1^2 + v2^2 - 2 v1 v2 cos deltai) | Combined plane change and circularization | v1, v2 speeds of the two orbits |
| dv = Isp g0 ln(m0/m1) | Tsiolkovsky rocket equation, fuel cost of a burn | Isp, g0, initial and final mass |
| n = sqrt(mu/a^3) | Mean motion, drives phase-angle windows for transfer timing | a semi-major axis |

All of the above are implemented or documented in zenith-web
(TheoryPage.tsx vis-viva and Lambert sections, ManeuverPanel with Hohmann,
Plane Change, Phasing, Comparison tabs). Copy, do not rederive.

## Validation data

| Benchmark | Value | Source | Uncertainty |
|-----------|-------|--------|-------------|
| Kerbin to Duna from low Kerbin orbit, single burn | about 1080 m/s (KSP wiki 1060 m/s) | space.stackexchange.com patched conics question | 20 to 40 m/s from inefficiencies (burn duration, phasing) |
| Same transfer, delta-v at SOI exit | about 919 m/s (optimistic) | same | Optimistic estimate by construction |
| 60 degree plane change at LEO | dv nearly equal to orbital speed, about 7.8 km/s | Grokipedia orbital inclination change | Order-of-magnitude correct, community source |
| Earth rotation inheritance at equator | up to about 465 m/s | orbitalradar.com inclination glossary | Textbook value |
| Minmus transfer plane change | up to about 340 m/s | r/KerbalSpaceProgram thread | KSP tuned constants |
| Plane change cheapest at apoapsis | cost proportional to v at burn point | Selenian Boondocks AAS paper review, spacerl.com Chapter 20 | Standard astrodynamics |
| Solver cost for live Lambert/Gauss | Gauss IOD 0.3 ms native, batch LSQ 14 ms | zenith-web AGENTS.md benchmarks | Perf on Apple M5, irrelevant to booth (we are not OD) |
| LEO period at 1/100 scale tuning | 5 to 7 real minutes at 1x warp | Limited Propellant DESIGN.md | Game tuning example, not physics |

Use these as unit test fixtures (golden-master pattern from zenith-web
fixtures/od) so the dv numbers on screen are provably right.

## Practical Implications

- Commit to Tier T1 true 3D now: closed-form inclined transfers in the pure
  reducer. This satisfies the user's true 3D requirement without flight sim
  scope creep.
- Port vis-viva, Hohmann, and plane-change helpers from zenith-web during the
  pre-build week, with fixtures. Do not derive equations during the event.
- Give every category planet a seeded inclination and node. Expose the plane
  wedge and AN/DN markers in the scene so the 3D is strategically legible.
- Design the option card around the time versus dv trade: pay dv now, pay
  time at apoapsis, or wait for the window. That triple is the whole game.
- Controls stay click plus Tab plus Space. No attitude flying, no drag nodes
  at v1. Toolbar buttons dispatch the same semantic actions as keys
  (Limited Propellant pattern), which keeps the auto-demo and tests honest.
- If 2D is chosen, vector CRT phosphor with blueprint HUD panels wins on
  beauty per hour and keeps the orbit-line visual language.
- Either way, the provenance inspector must look like an award-grade
  data-viz artifact on its own, because datathons award visualization
  separately from games.
- For the tester: fixtures above give numeric acceptance criteria for the
  transfer calculator; zenith-web fixture layout gives the pattern.

## Citations

1. metaphox/orbit-game, "Limited Propellant" DESIGN.md: https://github.com/metaphox/orbit-game/blob/main/DESIGN.md
2. dgreenheck/moonshot, KSP-like browser game with patched conics: https://github.com/dgreenheck/moonshot
3. msakuta/WebGL-Orbiter, three.js orbit simulator: https://github.com/msakuta/WebGL-Orbiter
4. Perilune, browser orbital engineering game (Devpost): https://devpost.com/software/perilune
5. gianluca Truda, "DevLog: orbital mechanics game in your browser": https://gianluca.ai/orbital-devlog/ and https://github.com/gianlucatruda/orbital
6. Slingshotter, three.js showcase (timeline flight planning): https://discourse.threejs.org/t/slingshotter-a-space-program-in-your-browser/92598
7. Orbital Dawn, "2D Patched Conics with Optional SOI Smoothing": https://www.orbitaldawn.com/posts/2026-1-31-patched-conics/
8. Conquer Space dev diary, orbital maneuvers: https://cqsp.ehwhoami.com/dev-diary/2023/11/13/ORBITAL-MANEUVERS.html
9. Orbital Mechanics and Astrodynamics, patched conics chapter: https://orbital-mechanics.space/interplanetary-maneuvers/introduction.html
10. space.stackexchange.com, delta-v with patched conics (Kerbin to Duna numbers): https://space.stackexchange.com/questions/24689/
11. Grokipedia, orbital inclination change: https://grokipedia.com/page/Orbital_inclination_change
12. Selenian Boondocks, low delta-v plane change departure paper review: https://selenianboondocks.com/2018/02/aas-paper-review-practical-methodologies-for-low-delta-v-penalty-on-time-departures-to-arbitrary-interplanetary-destinations-from-a-medium-inclination-low-earth-orbit-depot/
13. spacerl.com, Chapter 20 Plan Change Maneuvers: https://www.spacerl.com/wp-content/uploads/2019/01/Plan-Change-Maneuvers.pdf
14. orbitalradar.com, orbital inclination glossary: https://orbitalradar.com/glossary/inclination
15. KSP forum and r/KerbalAcadress threads on node matching and Minmus plane change: https://forum.kerbalspaceprogram.com/topic/129327/ and https://www.reddit.com/r/KerbalSpaceProgram/comments/1jpy1ie/
16. StraySpark, Game Jam Survival Guide: https://www.strayspark.studio/blog/game-jam-survival-guide-tools-templates
17. Sandbox Studio, Game Jam Judging Rules (5 minute window): https://studio-docs.sandbox.game/game-jams/game-jam-judging-rules
18. UnityNYC Summer Jam 2026, live demo rubric: https://itch.io/jam/unitynyc-summer-jam-2026
19. Game Gauntlet SIM Jam judging criteria: https://jams.team/jams/game-gauntlet-sim-jam
20. Mini Metro design coverage (session length, minimalism): https://en.wikipedia.org/wiki/Mini_Metro_(video_game) and https://www.gamedeveloper.com/design/let-s-talk-about-mini-metro
21. punchev, Game Onboarding UX first 60 seconds: https://punchev.com/blog/game-onboarding-ux-best-practices
22. Davide Aversa, Game Design Essentials: Single Button Controls: https://www.davideaversa.it/blog/game-design-essentials-single-button-controls
23. Game Wisdom, complexity of simplified control scheme design: https://game-wisdom.com/critical/the-complexity-of-control-scheme-design
24. CodeAndWeb SpriteIlluminator (normal maps need GL, not Canvas 2D): https://www.codeandweb.com/spriteilluminator
25. The Gamer, best games with stained glass art styles: https://www.thegamer.com/best-games-stained-glass
26. Kotaku, traditional Japanese art and ink wash games: https://kotaku.com/traditional-japanese-art-makes-for-beautiful-games-5913838
27. Tempest 4000 and vector arcade coverage (neon vector precedent): https://www.theyoungfolks.com/video-games/123572/tempest-4000-video-game-review
28. Chladni plate generative art (Eurographics paper): https://research.uca.ac.uk/5836/1/Chladni_Plate_Visualisation_September_2022.pdf
29. Google Cloud x MLB Hackathon recap (winner demo): https://info.devpost.com/customer-stories/google-cloud-x-mlb-hackathon-recap
30. Sheridan Datathon 2025 Devpost: https://sheridandatathon2025.devpost.com (fetch blocked 403, see Instagram @sheridandatathon for EduViz AI win)
31. DataOrbit 2025 Devpost: https://dataorbit-2025.devpost.com
32. Midwest Big Data Hackathon Devpost: https://bigdata.devpost.com
33. Tiny Demo Jam: https://itch.io/jam/tiny-demo-jam2

Local sources: zenith-web and Talon repos (AGENTS.md, TheoryPage.tsx,
ManeuverPanel.tsx, FlightScene.tsx), docs/architecture.md, docs/decisions.md.

## Verification checklist

- [x] Findings are from reputable sources (GitHub repos, dev blogs, astrodynamics references, jam judging docs)
- [x] Equations are correctly transcribed and cross-checked against zenith-web theory page
- [x] Validation data includes uncertainty (KSP wiki 1060 vs computed 1080, 20 to 40 m/s spread)
- [x] Practical implications are actionable (tier commitment, port list, control scheme, aesthetic pick)
- [x] All sources cited (33 items)
- [x] Research supports phase architecture decisions (Tier T1 stays inside the pure reducer; renderer choice documented for decisions.md)
- [ ] Sheridandatathon2025.devpost.com gallery could not be fetched (403); winner details came from official Instagram. Low impact, flagged for follow up if a full winner list is needed.

## Datathon winner patterns and judging criteria

Research date: 2026-11-04. Purpose: decide keep, adapt, or pivot for the
game-based submission, by comparing it against what actually wins this event
and comparable data competitions. Citations 34 to 63 for this section are
listed at the end of the section.

### Sheridan Datathon winners

#### Edition history: 2024 not found, first edition was 2025

| Question | Answer | Evidence |
|----------|--------|----------|
| Was there a 2024 edition? | No evidence found. Organizer Connor Uhrig calls Nov 2025 "our first Sheridan Datathon" (LinkedIn, 2025-11-28) | Sources tried: Devpost search for sheridandatathon2024, GDG Sheridan gallery (photos start Nov 2025), LinkedIn company page (posts start Dec 2025), gdgsheridan.com events page, web searches for 2024 winners |
| 2025 scale | 138 Devpost registrations, organizer recap says 200+ attendees and 37 projects, teams of 5, theme "Data Science For Social Good" (17 UN SDGs) | sheridandatathon2025.devpost.com, Taimoor Aleem LinkedIn recap 2025-11-25 |

#### 2025 winners (Nov 22 to 23, 2025, full list of awarded projects)

| Award | Project | What they built | Problem statement |
|-------|---------|-----------------|-------------------|
| 1st Place + Best Solo Hack (CAD 1,250) | Sourced (Jacob Mobin, solo) | AI pipeline: photo of a device to interactive 3D exploded view plus global supply chain map, SAM 3D + Gemini 2.5 Pro | UN SDG 12, responsible consumption, supply chain transparency |
| 2nd Place (CAD 750) | SafeSteps AI (Luis Hoi, Honiya M., Hira Ahmad, Saksham Jain, Amy Zhang) | Street by street Toronto safety map and safest route choice, decade of crime data plus lighting plus live incidents | Urban safety, SDG 11 |
| 3rd Place (CAD 500) | Aegis (Gioia de Leonardis, Sebastian Vega, Nabil Aldihni Garcia, Ahmed Ibrahim, Anya Popova) | Scans email signups, LLM summaries of 9,000+ company ToS and privacy policies, ratings, Chrome extension | Digital privacy, big tech consent |
| Best UI/UX (CAD 300) | Chestify (Atinder Singh Hari, Chahatbir Singh) | Short form content to structured verified learning library | SDG 4 quality education |
| Best Gemini API (CAD 300) | EduViz AI | Animated curriculum assistant, no coding required | Education |
| Best Google Cloud (CAD 300) | Avocado (Aman Purohit, Vidhi Kalal, Prabal Manchanda) | AvoScore city affordability, weighted ML model, 6 KPIs, Gemini chatbot, live GCP pipeline | Relocation and budgeting |
| People's Choice (CAD 150) | Not identified in searches (Devpost gallery fetch returns 403; LinkedIn announcements cover podium plus side awards only) | | |
| Best Solo Hack (CAD 200) | Sourced (same project) | | |

One participant (Aman Purohit) states there were "8 awarded projects" total.
Judge panel was industry data professionals (Scotiabank, SSENSE, Gore Mutual,
DiceCape, plus Sheridan faculty).

What the 2025 winners share: every podium project is a working app or tool
with a named real world user problem, a data pipeline, and a polished UI.
Only the 1st place project led with an interactive 3D artifact, and its
write up names the "magic factor" (photo to exploded view) plus hybrid AI
pipeline plus real world impact as its three accomplishments. No game among
the winners.

#### 2025 vs 2026 judging criteria (the rules changed in our favor and against us)

| Element | 2025 (Devpost rules) | 2026 (Devpost, fetched 2026-11-04) |
|---------|----------------------|-------------------------------------|
| Gate | Theme pass/fail: must meaningfully incorporate data science | Not stated as pass/fail, but "This isn't a build-an-app hackathon" |
| Weight 1 | Execution 40% (functional, polished, technically impressive) | Discovery 35% (non-obvious, meaningful finding, clear and evidenced) |
| Weight 2 | Impact 20% | Data Use 25% (sound analysis, clean and questioned data, honest about limits) |
| Weight 3 | Creativity and Originality 20% | Communication 25% (story clear in first minute, charts and demo support the finding) |
| Weight 4 | Presentation 20% | Impact 15% (real user, decision or community, realistic next step) |
| Submission | Public GitHub, deployment links, 1 to 3 min video (optional), live demo also evaluated | GitHub repo OR notebook OR dashboard OR written analysis, mandatory 2 min demo video, write up "the question you asked, what you did, what you found" |
| Side awards | Best UI/UX, Best Gemini, Best GCP, People's Choice (community vote), Best Solo Hack | Tangerine, IBM, ElevenLabs Best Data Project, Best Data Visualization and Storytelling, Best Hardware, Best Beginner, MLH tracks (7 winners, TBA). No Best UI/UX and no People's Choice in the published 2026 prize list |
| Teams, window | Up to 5, 24 h, evaluated on Devpost plus GitHub plus live demo | Up to 4, noon to noon, draft plus track selection due Sat Nov 7 8:00 PM, final submission Sun Nov 8 12:00 PM, demos 12:30 PM |

Headline shift: Execution went from 40% to not being a named criterion, and
Discovery plus Data Use now carry 60%. Organizer messaging repeats "judged on
what you found rather than what you shipped" (Devpost, LinkedIn, event site).
Prize pool is about CAD 10K cash (Devpost header), CAD 12,000+ listed on the
prizes block, CAD 30K+ including perks. 2026 judges are industry data
professionals (OpenAI, Meta, IBM, Microsoft, Scotiabank, RBC, CIBC, Snowflake,
Dataiku, plus Sheridan faculty).

### Comparable datathon and hackathon winners

| Project, event | Result | Format | Why it won, per sources |
|----------------|--------|--------|-------------------------|
| Sourced, Sheridan Datathon 2025 | 1st place overall plus Best Solo Hack | Interactive 3D exploded view (not a game) | "Magic" photo to 3D moment, hybrid AI pipeline, real world impact framing, SDG 12 alignment |
| GEOdle, Atlantis Datathon 2024 | People's Choice plus Best Use of Melissa API (not overall) | Wordle plus Geoguessr hybrid game over geospatial data | Fun, colorful gamification of the sponsor data, hints generated from data extraction; won category and vote, not the podium |
| EcoQuest, Cheesehacks | 1st place overall | Gamified sustainability app (quests, leaderboards, points) | General hackathon (not a datathon), full gamified loop, polished multi screen UI, Blender 3D asset |
| Parable Rhythm, AWS PartyRock Hackathon 2024 | Overall 1st place plus track 1st plus blog bonus | Interactive crime thriller game on PartyRock widgets | Game format inside a generative AI app contest, narrative plus interactive widgets |
| Carades, cmd-f 2026 | 1st place (worth up to CAD 3,388) | Multiplayer coding charades game | Non data hackathon; social fun plus finished multiplayer UX |
| Password Quest, HackSussex 2025 | 3 category wins (BCS internet safety game prize, MLH Auth0, MLH Vultr) | 2D phaser.js game | Won a game category with a published 5x10 point rubric (intuitive design, thematic impact, innovation, technical excellence, ethics); MLH wins were sponsor API tracks, not "best project" |
| Moonray and AmongUs Midnight, MLH x Midnight July 2026 | 2 of 7 winners were games | Puzzle and social deduction games with zero knowledge crypto | Judge commentary: "won because it was a game people genuinely wanted to play, proving that a great user experience can be a strong differentiator", plus build completeness (Moonray had tests, finished UI, deployed) |
| SOLPower, DataOrbit 2025 (UCSB) | Best Overall | Interactive US solar map dashboard plus chatbot | Dashboard plus ML plus actionable framing, 5 min recorded presentation required |
| RoutesITrust, DataOrbit 2025 | Data Visualization and Insights Award | Flask app, Folium heatmaps, route risk scores | The viz award goes to a conventional heatmap tool, not a game |
| Virion, DataOrbit 2025 | Best Use of Groq | SEIR pandemic sim with 3D extrusion map | Category win for a visual, interactive simulation, not overall |
| Plan-et Rendezvous (3D date ideas) and FlySafe (3D visuals), DataOrbit 2025 | Submitted, no award | Interactive 3D experiences | Negative data point: 3D interactive projects did not place at a comparable datathon |
| Voices of the Vaccine, Hacklytics 2021 (Georgia Tech) | Overall winner | Interactive Plotly dashboard on vaccine tweets | Clean public data, simple UI, deployed demo; ML complexity was explicitly not a differentiator |
| OECD Pension Explorer, Plotly Analytics Vibe-a-Thon 2025 | 1st of 200+ submissions | Data app with "So What" cards and methodology notes | Judge: "Apps that told stories performed better than apps that dumped data", "the dashboard with the clearest information wins, not the one with the most charts" |

Frequency read: in data focused events, games and 3D toys win category
prizes, People's Choice style votes, and sponsor tracks far more often than
the podium. Interactive, visual, story led data artifacts (dashboards, maps,
simulations) take the podium. MLH itself runs a "Data Game" prize category at
Global Hack Week Data, which shows games are welcome as a category, not as
the default winner. The strongest direct precedent for us is Sourced: an
interactive 3D artifact won Sheridan overall, but it was framed as an AI
pipeline with an SDG impact story, not as a game.

### Published judging criteria for data hackathons

| Event, source | Weights or points | Notes |
|---------------|-------------------|-------|
| Sheridan Datathon 2026 | Discovery 35, Data Use 25, Communication 25, Impact 15 | The rubric we are actually scored against |
| Sheridan Datathon 2025 | Theme gate, Execution 40, Impact 20, Creativity 20, Presentation 20 | Last year rewarded the working app |
| VizQuest Data Hackathon | Storytelling and Insight 40, Visual Design 30, Technical Skill 20, Relevance 10 | "So what?" test made explicit |
| Wharton Data Competition (semifinals) | Methodologically Robust 30, Style and Data Visualization 30, Clarity 20, Creativity 20 | Insight and visuals tied at 60 combined |
| DataJam (DSSS) | Insight and Storytelling 3, Analytical Depth 2, Creativity 2, Presentation 2, Data Understanding 1 (10 total) | Storytelling is the single largest line |
| DataAnalyzer Pro | Clarity and Depth of Insight 25, Real world Applicability 25, Creativity in Storytelling 20, Presentation 20, Simplicity 10 | |
| K State DataFest 2025 rubric | Insights, Visualizations, Creativity, Technical Skill, each 1 to 5 | Four categories only, no weights published |
| Carolina Across 100 civic hacking | Creativity, Clarity, Usefulness, each 1 to 10 | Data viz specific |
| Georgia Tech Hacklytics 2021 (partial, from judge write up) | Design and Visualization 20, Technical Complexity 20, Innovation 10, Completeness 10, Presentation 10 (remainder not published in the article text) | |
| Plotly Analytics Vibe-a-Thon | Five equally weighted criteria: Technical Implementation, Data Exploration and Storytelling, Data Visualization, App Design, Quality of the Idea; stage one is a viability pass/fail | |
| DataOrbit 2025 | Relevance, Completeness, Applicability, Presentation, Creativity (no published weights) | |
| Organizer guide (Converve, citing a Virginia guide) | Suggested: Answer to the question 30, Method and validity 25, Use of data and its limits 20, Usefulness 15, Communication 10 | "Judge the insight, not only the score" |

Common core across all of these: a non-obvious finding or story (25 to 40%),
sound data work with stated limits (15 to 30%), communication and visuals (10
to 30%), and a smaller creativity or impact line. Raw engineering effort is
seldom a line item outside general hackathons.

### What separates a fun demo from an award winning data project

| Source | What judges said | Reading for us |
|--------|------------------|----------------|
| Devpost, 5 seasoned judges | "Presentation and storytelling matters and it can be a huge part of your success"; projects that clearly balance across all criteria win; the demo video is the first signal of effort; sound and storytelling in a game "totally deserves to be recognized" | The game format is not penalized, but a shoehorned idea that ignores criteria loses |
| Eugene Yan (judge, Hacklytics 2021) | Winning teams used clean ready data, simple UIs, and deployed demos; training bespoke ML was not a differentiator | Effort belongs in the finding and the demo surface, not model complexity |
| Plotly Vibe-a-Thon judges | Stories beat data dumps; embedded chart explanations helped; clearest dashboard beats most charts | Every chart needs a "so what" caption |
| Latent Digest analysis of Hacklytics | Top teams spent early hours on exploration and hypothesis generation, then narrative; simple robust baselines won | Discovery first, then story, then polish |
| Chris Frew, SBB P+Rail datathon retrospective | The winning team had a gamified points feature and a great UI but a fixed location and a fixed forecast; his deeper functional team lost; his verdict: "presentation is key" and shiny judged-facing output wins even when substance is thin | Gamification plus UI can carry a win, but the loss still stung; we should not rely on polish alone against insight judges |
| Carlson School (Good Acre) judge | Winner "took a complex question and made it very easy and digestible through data visualization" and was usable "tomorrow" | Impact line reward: deliverable, not demo |
| Relativity hackathon judges | Four criteria: business value, coolness, realistic capability, innovation; coolness is the "wow" gestalt of the demo | Wow counts, but it is one of four |
| Oakland Group, Project:Hack 6 | 2nd place with a Power BI plus ML build; winner had a seamless presentation; "you can have the most amazing solution but if it doesn't look good... you will struggle" | Presentation is necessary, not sufficient |
| DoraHacks submission guide | "Show the work, not the hype"; lead with the core insight in the first two paragraphs; judges remember specifics | Maps directly onto the required write up structure |

### Assessment: where a 3D data driven game ranks against the typical winner

Score projection against the actual 2026 rubric:

| Criterion | Weight | Game as it stands today | Game plus finding package |
|-----------|--------|-------------------------|---------------------------|
| Discovery | 35% | Low. Gameplay decisions (which orbit to burn next) are not a data finding, and the rubric asks for non-obvious and evidenced | High, if one named headline finding from the sponsor dataset drives the whole game |
| Data Use | 25% | Low to medium. Clean, questioned data and honesty about limits are invisible in play | High, if the provenance inspector shows raw rows to planet mapping, cleaning decisions, checksums, and a limitations note |
| Communication | 25% | High. Auto demo, charts, and a 2 minute video are native strengths; risk is a story that is clear but not a finding | High |
| Impact | 15% | Medium. Finance as space is charming but reads as metaphor unless tied to a decision | High, if the write up names a real user and a realistic next step |

Ranking verdict:

1. Versus the 2025 winner profile (working app, real user problem, AI
   pipeline): a bare game ranks below the typical podium project, because
   2025 Execution at 40% rewarded shipping and we would spend our budget on
   gameplay instead of features.
2. Versus the 2026 rubric: the situation inverts. Execution is gone from the
   rubric, so a game is no longer penalized for being a game, but 60% of the
   score (Discovery plus Data Use) is exactly the part a game does not
   automatically produce. The typical 2026 winner is likely an
   insight-first notebook, dashboard, or tool with a crisp narrative, exactly
   what the organizer text describes ("models, analyses, dashboards, or
   research").
3. Best realistic outcomes, in order: (a) Best Data Visualization and
   Storytelling, which is the award our format is built for and which has no
   Best UI/UX competitor track in 2026; (b) podium if the finding package
   above exists; (c) People's Choice style popularity, but note the 2026
   prize list does not publish a People's Choice award, so do not plan for it.
4. Keep or pivot: keep, with adaptation. The Sourced precedent proves an
   interactive 3D artifact can win Sheridan outright, and the 2026 rubric
   explicitly rewards Communication where the game is strong. Pivoting to a
   plain dashboard would trade away our only differentiated strength for a
   format in which we would be one of many.

What the project must add to win, mapped to rubric lines:

1. One headline finding, one sentence, non-obvious and evidenced (Discovery,
   35%). Example shape: "Category X looks cheap but costs 2.3x the delta-v
   because of timing, not amount." It must appear in the first 30 seconds of
   the 2 minute video, first paragraph of the write up, and as a caption
   inside the game HUD.
2. Two conventional charts (bar or scatter) alongside the 3D view, each with
   a "so what" caption (Communication asks for charts that support the
   finding; Plotly and VizQuest judges reward exactly this).
3. A visible data rigor panel: cleaning steps, source, row counts,
   checksums, and an honest limitations note (Data Use, 25%). The existing
   provenance inspector and checksum module are the skeleton; make them a
   judged artifact, not a debug view.
4. Write up structured literally as question, what you did, what you found
   (this is the required format on Devpost 2026).
5. Impact sentence naming a real user or decision plus a realistic next step
   (Impact, 15%).
6. Select tracks at draft time, Saturday Nov 7 8:00 PM (hard deadline), and
   submit to Best Data Visualization and Storytelling. Consider an MLH or
   Gemini sponsor track only if the API is actually used (Gemini is in the
   2026 MLH track list; 2025 Best Gemini went to an education animation
   project).
7. Keep the 2 minute demo video front loaded with the finding, then the game,
   then the charts. The video is mandatory in 2026, unlike 2025.

For the tester: the video structure, write up structure, and Saturday draft
deadline are acceptance criteria outside the code, worth tracking alongside
the transfer calculator fixtures.

### Citations for this section (34 to 63)

34. Sheridan Datathon 2026 Devpost (judging criteria Discovery 35, Data Use 25, Communication 25, Impact 15; prizes; requirements): https://sheridandatathon2026.devpost.com/
35. Sheridan Datathon 2025 Devpost rules (2025 judging criteria, Execution 40): https://sheridandatathon2025.devpost.com/rules
36. Connor Uhrig (GDG Sheridan), "our first Sheridan Datathon" LinkedIn post: https://www.linkedin.com/posts/connoruhrig_last-weekend-we-ran-not-one-but-two-events-activity-7400291518282108928-KRc0
37. Sheridan Datathon LinkedIn, 1st place Sourced announcement: https://www.linkedin.com/posts/sheridandatathon_sheridandatathon-sourced-supplychaintransparency-activity-7405440924320747520-A9mc
38. Sheridan Datathon LinkedIn, 2nd place SafeSteps AI announcement: https://www.linkedin.com/posts/sheridandatathon_sheridandatathon-safestepsai-urbansafety-activity-7404861234547683328-F9oR
39. Sheridan Datathon LinkedIn, 3rd place Aegis announcement: https://www.linkedin.com/posts/sheridandatathon_meet-the-3rd-place-winner-at-sheridan-datathon-activity-7404043990720880640-dckT
40. Sheridan Datathon LinkedIn, Best UI/UX Chestify announcement: https://www.linkedin.com/posts/sheridandatathon_meet-the-winner-of-best-uiux-design-at-sheridan-activity-7402678407093805056-2wSJ
41. Sheridan Datathon LinkedIn, Best Gemini EduViz AI announcement: https://www.linkedin.com/posts/sheridandatathon_meet-the-winner-of-best-use-of-google-gemini-activity-7403645415239073792-rfRT
42. Sheridan Datathon LinkedIn, Best Google Cloud Avocado announcement: https://www.linkedin.com/posts/sheridandatathon_meet-the-winner-of-best-use-of-google-cloud-activity-7403232468352360448-pEtz
43. Sourced project page (3D exploded view, magic factor, SDG 12): https://devpost.com/software/sourced
44. Aegis project page (9,000+ ToS dataset, third place badge): https://devpost.com/software/aegis-h0z5tv
45. Taimoor Aleem, Sheridan Datathon 2025 recap (200+ participants, 37 projects, SDG theme, judging difficulty): https://www.linkedin.com/posts/taimooraleem_sheridan-datathon-2025-recap-200-participants-activity-7399008502486290432-qDXa
46. DataOrbit 2025 Devpost (judging criteria Relevance, Completeness, Applicability, Presentation, Creativity; prize tracks): https://dataorbit-2025.devpost.com/
47. RoutesITrust, DataOrbit 2025 Data Visualization and Insights Award winner: https://devpost.com/software/routesitrust
48. GEOdle, Atlantis Datathon 2024 (People's Choice plus sponsor data award, gamified Wordle and Geoguessr): https://devpost.com/software/geodle-39krd8
49. EcoQuest, Cheesehacks 1st place (gamified sustainability platform): https://devpost.com/software/ecoquest-7ej3ku
50. Devpost customer stories, biggest AI hackathons of 2024 (Parable Rhythm overall 1st at PartyRock): https://info.devpost.com/customer-stories/ai-hackathons-on-devpost-2024
51. Midnight blog, MLH x Midnight July hack winners (2 of 7 winners games, judge quotes on UX): https://midnight.network/blog/celebrating-seven-winners-from-mlh-x-midnight-july-hack
52. Eugene Yan, "How to Win a Data Hackathon (Hacklytics 2021)": https://eugeneyan.com/writing/how-to-win-data-hackathon/
53. Devpost, "How to win a hackathon: advice from 5 seasoned judges": https://info.devpost.com/blog/hackathon-judging-tips
54. Plotly, "Three data apps that won the Analytics Vibe-a-Thon" (judge feedback): https://plotly.com/blog/three-data-apps-that-won-the-plotly-analytics-vibe-a-thon/
55. VizQuest Data Hackathon judging criteria (40/30/20/10): https://vizquest.devpost.com/
56. Wharton Data Competition deliverables and judging criteria: https://wsb.wharton.upenn.edu/wharton-data-competition/deliverables-and-judging-criteria/
57. DataJam 2025 judging criteria (point totals): https://datajam.devpost.com/
58. K State DataFest 2025 judging rubric PDF: https://www.k-state.edu/datafest/images/DataFest_2025_JudgingRubric.pdf
59. Chris Frew, SBB P+Rail datathon retrospective (gamified UI beat deeper forecast, judge critique): https://chrisfrew.in/blog/analyzing-park-and-rail-availabilities-across-switzerland/
60. Converve, "How to Organise a Datathon" (suggested rubric weights, judge the insight not the score): https://www.converve.com/event-networking-blog/how-to-organise-a-datathon
61. MLH Global Hack Week Data (Data Game prize category in a data event): https://ghw-data-week.devpost.com/
62. Canada Hackathons listing for Sheridan Datathon 2026 (FAQ judging summary): https://canadahackathons.com/events/devfest-sheridan-datathon-2026
63. sheridandatathon.com 2026 event site (tracks, schedule, demo window): https://www.sheridandatathon.com/

### Verification checklist (this section)

- [x] Sheridan 2025 winners cross checked between Devpost gallery badges, official LinkedIn announcements, and winner LinkedIn posts
- [x] 2024 edition explicitly not found, with the sources tried listed and an organizer quote dating the first edition to Nov 2025
- [x] 2026 judging criteria fetched directly from sheridandatathon2026.devpost.com (403 to direct fetch, retrieved via text mirror) and matched against search snippets
- [x] Weighted rubrics transcribed from event pages (Sheridan 2025 and 2026, VizQuest, Wharton, DataJam, Plotly)
- [x] At least 5 concrete gamified or highly visual winner examples, with 2 negative placements (Plan-et Rendezvous, FlySafe)
- [x] Judge commentary sourced to named judges or published retrospective posts
- [ ] People's Choice winner for Sheridan 2025 not identified (Devpost 403); low impact because 2026 publishes no People's Choice track
- [ ] MLH prize track list for 2026 is TBA, so any Gemini or MLH track strategy must be rechecked on Devpost at draft time (Saturday Nov 7, 8:00 PM)

## Pivot research: award-grade 2D and formal viz formats

Research date: 2026-11-06. Phase context: the 3D game direction was cancelled
one day before the Devpost draft deadline. Target: Best Data Visualization and
Storytelling. Constraints: solo, draft plus track selection Sat Nov 7 8:00 PM,
final submission Sun Nov 8 12:00 PM, live demo 12:30 PM. Assets kept: the
findings report UI (hand rolled SVG, provenance stamps) and the F1 to F5
pipeline on the mock ledger. Citations 64 to 113 for this section are listed at
the end. This section does not repeat the 63 citations above.

### Key findings, ranked by wow to hours cost for our exact situation

| Rank | Technique or format | Est. solo hours | Wow ceiling | Precedent strength | Verdict |
|------|---------------------|-----------------|-------------|--------------------|---------|
| 1 | Sticky graphic plus step scrollytelling wrapping the existing SVG charts (vanilla IntersectionObserver, no deps) | 3 to 5 | High | Very high: Pudding, Bloomberg (IIB 2015 bronze), Framing Luxembourg (IIB 2022), Closeread Prize, TartanHacks 2026 winner | DO FIRST |
| 2 | Ledger almanac block: 365 day calendar heat matrix plus F4 slopegraph plus receipt typography | 4 to 6 | High | High: calendar heatmaps are established, slopegraphs rare at student hackathons, bank transaction calendar research exists | DO |
| 3 | Static print quality poster export (same SVG at print dpi) for booth plus web hero | 3 to 5 | High at the booth | High: IIB poster category winners, plus the Archie Tse rule that artifacts must survive as screenshots | DO |
| 4 | Data bound generative layer (transaction flow field or Chladni) strictly as background | 2 to 4 | High | Medium: honest data art exists, and the decorative failure mode is documented | DO ONLY WITH A MAPPING LEGEND |
| 5 | Pixel or Terraria skin over conventional charts (chrome, fonts, tile borders, day night band) | 2 to 4 | Medium | Medium: github-farm mapping table, BetterFly pixel wellness | DO AS SKIN ONLY |
| 6 | Motion accents: ticker marquee of category deltas, counter tick, receipt print on | 1 to 2 | Medium | Medium (finance vernacular) | DO IF TIME |
| 7 | Horizon chart strip for 7 category daily spend | 2 to 3 | Medium | Medium, with a documented training cost | CONDITIONAL |
| 8 | Ridgeline of monthly spend distributions per category | 2 to 4 | Medium | Low at hackathons, tuning risk | CONDITIONAL |
| 9 | Sonification (hover tone or one audio walkthrough) | 2 to 4 | Medium | Low for viz awards, wins creative or sponsor awards instead | SKIP UNLESS 3 HOURS LEFT OVER |
| 10 | Full playable 2D tile world (Terraria or Stardew with gameplay) | 8 to 14 | High as a game | Low for this track: GEOdle won votes and a sponsor award, not a podium | DO NOT |

### Craft techniques, per rank, implementable in plain React plus hand rolled SVG or Canvas

#### Rank 1: scrollytelling (the highest value pattern per hour)

- DOM shape: one `.scroll` container holding a `.scroll__graphic` with
  `position: sticky; top: 0; height: 100vh` and a column of `.step` blocks, each
  carrying `data-step`. This is the Pudding scrollama layout, and scrollama v3
  deprecated its own JS pinning in favor of CSS sticky, so plain CSS plus one
  observer reproduces the library.
- Step detection trick in six lines: one IntersectionObserver over all steps
  with `rootMargin: '-45% 0px -45% 0px'`, collapsing detection to a 10 percent
  band at viewport center. Exactly one step can occupy the band, the step fires
  when its text is where the reader is looking, and scrolling up re-fires
  earlier steps, so the story is bidirectional.
- Build the chart once, restyle per step: bars or paths are created from the
  first data row, and a step change only rewrites heights, labels, and an
  `is-lead` highlight class. Adding a step then means adding a data row, not
  markup. This is what makes the morph read as one chart changing instead of
  charts being swapped.
- `font-variant-numeric: tabular-nums` on value labels so digits do not jitter
  during morphs.
- Never scrolljack. Scrollama and the Pudding both frame scrollytelling as
  monitoring scroll, not altering it; scrolljacking is called out as bad
  practice.
- Mobile trap: step heights as a percentage of viewport jump when the mobile
  address bar hides. Fix step heights in pixels on small screens.
- Reuse, do not redraw: our F1 to F5 SVG charts become the graphic states, one
  step per finding, first step is the headline finding (Communication asks for
  a story clear in the first minute).
- Effort honesty: the data.europa guide lists the real costs (storyline sketch,
  per step graphics, animation code, framework), and the Closeread judges say
  top entries took many hundreds of hours. Those are journalism grade pieces.
  Our 3 to 5 hour estimate assumes the charts already exist and only step
  states plus observer code are new.

#### Rank 2: ledger almanac block (rare forms, two minute legibility)

- Calendar heat matrix: 7 rows (day of week) by 53 columns (week of year), one
  cell per day, fill = daily spend. Familiar to anyone who has seen the GitHub
  contribution calendar, which is the legibility argument for using it with
  students. Month block layout is available if the question is month shaped.
- The honesty dial that must be printed on the chart: aggregation (sum, count,
  average, min, max each answer a different question about the same Tuesday)
  and color scale (linear is truthful about magnitude but flattens quiet days,
  quantile is rank based and outlier proof but hides magnitude). Also declare
  shared scale versus per facet scale: shared answers "who is actually bigger",
  per facet answers "what is each one's rhythm", and mixing them is how
  dashboards mislead.
- Slopegraph for F4: two columns (observed ledger versus aligned scenario) with
  one labeled line per category, values printed at both ends, no legend needed.
  Tufte's form and the PolicyViz "five charts you have never used" piece both
  argue this is the cheapest way to show paired change per category.
- Small multiples of the daily balance path, one panel per category, shared y
  axis. The perception literature (Heer and others, multiline study) found
  split space techniques like small multiples and horizon graphs beat shared
  line plots for comparison across series with a large visual span, and shared
  scales are required for honest cross panel comparison.
- Receipt and ledger typography: mono font, right aligned tabular numerals,
  negatives in parentheses (balance sheet convention, sign convention for
  traders), dashed rules, and the existing SHA256 provenance stamps printed
  like a receipt footer. Finance readers treat these as proof of work.
- Uniqueness read: calendar matrix, slopegraph, and horizon strips are rare at
  student hackathons; bar and line charts are everywhere. All three of the
  chosen forms are legible in two minutes because the calendar and paired
  comparison structures are pre learned.

#### Rank 3: print quality poster (static export for the booth plus web)

- One static SVG, exported at 300 dpi (A2 or A1) for the booth, and reused as
  the web hero above the fold. Same file, two media, zero extra chart code.
- Precedent in the poster category of the Information is Beautiful Awards:
  From Data to Viz (bronze 2018, a printed decision tree poster plus site),
  Weather Radials (silver 2014), Explore the Ocean interactive scientific
  poster (gold 2019), Botanical Primes wall poster (2016). Poster format is a
  recognized award category, not a downgrade from interactive work.
- The Archie Tse rule (via Toph Tucker's finance viz notes): the artifact a
  reader takes away cannot depend on interactivity, because it ends up as a
  screengrab in a message. A poster is exactly that artifact, and judges at a
  booth can photograph it.
- Poster content, all already computed: headline finding (F5 floor lift of
  2,366.72 dollars), question, what we did, what we found, four to six charts,
  provenance stamp, limitations note. This doubles as the Devpost write up.
- Reuters precedent for visual storytelling awards: the WAN-IFRA Best Data
  Visualisation winners and the ONA visual digital storytelling winners are
  narrative packages (3D reconstruction, illustration plus data plus text),
  judged on decisive design choices and data integrity, not on interactivity.

#### Rank 4: data bound generative layer (honest or nothing)

- Flow field math: particles advect as v(t) = F(p(t)) where F is a vector
  field; Renewable Rhythms documents explicit mappings (energy source =
  particle group, daily output = speed and size, date = position) and uses
  Perlin noise for field smoothness. The same pattern binds transactions:
  category = lane or hue, amount = speed or size, day = x position.
- Documented failure mode: Darren Shaw's Net A Porter flow vis admits extreme
  forces trapped the flow, that normalizing to percentiles plus adding momentum
  fixed it, and that his priority was "something based on data that looked
  pretty rather than being insightful" and "it is ok that this visualisation is
  ultimately meaningless". That is exactly the honesty failure Discovery 35
  would punish, so our layer must invert it: visible mapping legend, declared
  normalization, deterministic seed, and no number on screen that the legend
  does not define.
- The standard to hold: the Bank of America market data mirrors team said "it
  was really important to us that we weren't making anything up", and every
  position and animation was data driven. Same rule for us.
- Chladni option: category frequencies as mode excitation, background only
  (prior research citation 28 covers the technique).
- Placement: behind charts at reduced opacity, never over a number, excluded
  from hover claims, one legend line stating what the particles encode.

#### Rank 5: pixel or Terraria skin (skin, not game)

- The mapping table pattern to copy: github-farm converts GitHub data to a
  Stardew farm with a published table (weekly contributions = crop growth
  stage with 5 declared stages, top languages = trees, merged PRs = 1 animal
  per 8 PRs, issues = decorations, 30 day streak = scarecrow). Every visual
  element has a documented data rule, which is what keeps it honest.
- BetterFly (Stardew inspired pixel wellness) keeps conventional 7 day activity
  charts and mood trend lines inside the pixel chrome, renders all sprites in
  code with runtime palette swap, and adds reduced motion and contrast support.
  The charts stay charts.
- Usability warning from a Stardew themed dashboard study: participants
  struggled with unclear axis labels and terminology, missed that charts were
  interactive, and expected immediate results. Fixes that worked: a fixed side
  column with key facts, fewer scrolling surprises, and explicit labels. Also
  the authors' own reflection: they could not decide how much game art to
  include and thought they should have leaned in further or done something
  more creative with the charts.
- What the skin buys us: uniqueness on a Devpost wall (pixel game chrome is
  rare at datathons) at 2 to 4 hours, versus 8 to 14 hours for a playable tile
  world with collision, growth simulation, and input handling.

#### Ranks 7 and 8: horizon and ridgeline (conditional)

- Horizon construction steps (from the CHI 2013 interactive horizon study,
  after Heer and Javed): fill under the line with diverging color by sign,
  split value range into B bands, mirror negatives above the baseline, wrap by
  virtual resolution. Optimal B is about 2 for small vertical allocations.
- Legibility risk: horizon graphs need training, work best with declared
  baselines (per series baselines aid reading but hurt cross series
  comparison), and lab studies used synthetic data with clear landmarks. In a
  two minute judge session that is a real cost. Use only if vertical space
  forces it, and then label the band thresholds on the strip.
- Ridgeline: monthly spend density per category, overlap 30 to 50 percent,
  one shared x scale. Requires density estimation tuning, so it is a
  conditional, not a commitment.

#### Rank 9: sonification (skip unless time is left)

- Precedents and what they actually won: SoniData (HackMIT 2020) won Most
  Creative Use of Nasdaq Quandl Datasets, a sponsor award; On a High Note used
  WebChucK to sonify invasive species data and reports no award; Algaeia won
  1st place at the DODO hackathon for a VR sonification museum; EchoDepict won
  nothing specific for its audio visualizer. A dedicated Data Sonification
  Awards program exists with analysis, arts, and communication categories.
- Read: sonification wins creative, accessibility, and sponsor awards. It has
  no track record of winning Best Data Visualization, and the marginal hours
  go to the video and write up instead. At most: one hover tone mapped to F1
  classification, 1 hour, no mixer, no sequencing.

### What NOT to attempt in the time left

| Attempt | Cost | Why not |
|---------|------|---------|
| Full playable Terraria or Stardew tile world (collision, growth sim, input) | 8 to 14 h | Eats the Discovery and video budget; GEOdle precedent shows game entries win votes and sponsor tracks, not viz podiums |
| WebGL pipeline, shader glow, normal map pixel lighting | 3 to 6 h plus risk | Prior research: normal maps need GL, Canvas 2D cannot do them; contradicts the no heavy deps constraint |
| Scroll jacking, video scrub sequences, GSAP scroll scenes | 3 to 6 h | Explicitly bad practice per the Pudding, and it breaks the reader controlled pace judges expect |
| Sonification suite (multi track, synthesis, mixing) | 4 to 8 h | Wins creative or sponsor awards, not this track |
| Chladni or flow field as the primary evidence surface | 2 to 4 h plus credibility risk | Decorative failure mode documented (Darren Shaw); Discovery 35 punishes it |
| Horizon charts as the only time series form | 2 to 3 h | Training cost defeats the two minute legibility test |
| Ridgeline over too many series | 4 to 6 h | Overlap and density tuning is a rabbit hole |
| New exotic chart forms (Sankey layout, D3 force graphs) | 3 to 6 h | Tuning cost with low marginal insight; the GE Sankey was praised for being less used, but it took a professional a long design loop |
| Any rework of the F1 to F5 pipeline | unknown | verify_findings already recomputes every number; it is done |

### Recommendation: how a 2D pixel or Terraria format stays data honest if chosen

The format must be a mapping system, not a costume. Rules:

1. Declared mapping table, printed in the UI and quoted in the write up, in the
   github-farm style: one visible element equals one documented data rule
   (for example tile brightness equals that day's spend bin, crop stage equals
   the F1 structural or discretionary class, tree count equals category count).
2. Every data bound tile keeps the existing provenance stamp on hover (row
   ids, filter, aggregation, SHA256), so the pixel layer inherits Data Use 25
   for free.
3. Decorations are labeled: one legend line stating sky, clouds, and ambient
   particles are non data. Declared decoration is honest decoration; undeclared
   decoration is chartjunk.
4. Bins are printed with dollar ranges in the legend (growth stage 1 equals
   0 to 50 dollars, and so on), so the metaphor never hides the scale.
5. Shared color scale across category facets, with the aggregation mode and
   scale type (quantile or linear) printed on the chart, per the calendar
   heatmap honesty dial.
6. Two conventional charts with so what captions stay in the first screen:
   Communication asks for charts that support the finding, and judges reward
   embedded chart explanations.
7. The headline finding (F5: capping the top surge category lifts the floor by
   2,366.72 dollars, from minus 80.24 to plus 2,286.48) is a caption inside the
   pixel HUD, in the write up first paragraph, and in the first 30 seconds of
   the mandatory 2 minute video.
8. F1 stays the primary color key (structural versus discretionary) because it
   is the discovery, and the pixel world becomes a literal picture of it.

### Suggested honest time budget (solo, draft Sat 8:00 PM, final Sun 12:00 PM)

| Block | Hours | Output |
|-------|-------|--------|
| A. Scrollytelling wrapper over existing findings charts | 4 | Rank 1 done, story spine for video |
| B. Calendar matrix plus F4 slopegraph plus balance small multiples | 4 | Rank 2 done, two conventional charts included |
| C. Poster static export plus write up (question, what we did, what we found) | 3 | Rank 3 done, Devpost text ready |
| D. Choose one: pixel skin (2 h) or generative background (2 h) plus ticker (1 h) | 2 to 3 | Rank 4 or 5 done |
| E. Mandatory 2 minute video, front loaded with the finding | 2 | Required by 2026 rules |
| F. Track selection and draft submit, Sat 8:00 PM hard deadline | 1 | Best Data Visualization and Storytelling selected |
| G. Buffer: verify_findings rerun, screenshot pass, final submit Sun noon | 2 | Zero surprises |
| Total | 16 to 19 | Leaves slack for the demo at 12:30 PM |

### Relevant equations for this section

| Equation | Description | Variables |
|----------|-------------|-----------|
| v(t) = F(p(t)) | Particle advection for the data bound flow field layer | v velocity, p position, F field built from normalized transaction features |
| h_fold = h / (2 B) | Horizon chart height after folding B bands | h original chart height, B band count (B about 2 optimal) |
| cell(row, col) = (weekday(date), floor((date - yearStart) / 7)) | Calendar heat matrix layout (frame_calendar idea) | date one ledger day, yearStart 2025-11-01 |
| slope = (y2 - y1) / (x2 - x1) | Slopegraph line steepness per category between two scenarios | y1, y2 values at the two columns |

### Validation data and judging benchmarks

| Benchmark | Value | Source | Uncertainty |
|-----------|-------|--------|-------------|
| Closeread Prize effort level | 40 entries, judges estimate many hundreds of hours at the polished end | Posit Closeread winners (citation 71) | Self reported, journalism grade, not our target |
| Information is Beautiful scale | Nearly 1,000 submissions per year, expert panel judging | IIB 2024 and 2025 announcements (80, 86) | Marketing language, but consistent across years |
| DataFest Best Data Visualization presentation | Few minutes, maximum 2 slides per team | Rhodes and UMass DataFest news (110, 111) | Local rules vary, pattern is common |
| Iron Viz criteria | Analysis, design, storytelling, 100 points total (90 judges plus 10 audience vote) | Tableau Iron Viz 2017 (108) | Competition format, but the triad matches our rubric |
| Sheridan 2026 window | Draft and track selection Sat Nov 7 8:00 PM, final Sun Nov 8 12:00 PM, demo 12:30 PM | Event site (prior citation 63) | Fixed |
| Horizon band guidance | B = 2 optimal for small vertical space, shared baseline for cross series reading | Interactive Horizon Graphs CHI 2013 (91) | Lab studies on synthetic data |
| Calendar scale honesty | Quantile, linear, log, plus shared versus per facet scale each answer a different question | Calendar heatmap field guide (92) | Practitioner guide, consistent with viz theory |
| Two minute legibility set | Calendar matrix, slopegraph, small multiples, bar, scatter are pre learned forms | Calendar guide, Tufte, PolicyViz (92, 88, 89) | Judgment call, high confidence |

### Practical implications

- Commit to rank 1 plus rank 2 as the core: scrollytelling gives the
  Communication 25 story spine, and the almanac block gives the rare forms that
  differentiate us from dashboards.
- Rank 3 poster is the booth differentiator and the write up skeleton, built
  from the same SVG, so it costs 3 hours once.
- Pick exactly one of rank 4 (generative background) or rank 5 (pixel skin)
  for the identity layer. Doing both is the trap.
- Sonification, full tile world gameplay, and WebGL are out. Motion accents
  (ticker) are the only cheap extra.
- If the pixel or Terraria format is chosen, rules 1 to 8 above are the
  acceptance criteria: mapping table, provenance stamps on tiles, declared
   decoration, printed bins, shared scale, two conventional charts, headline
  finding in HUD, F1 as the color key.
- For the tester: new acceptance criteria are the mapping table entries (each
  visible element must cite a data rule), the printed aggregation and scale
  declarations on the calendar matrix, the poster export at print dpi, and the
  video containing the headline number in the first 30 seconds. The
  verify_findings rerun stays the numeric gate.

### Citations for this section (64 to 113)

64. The Pudding, "An Introduction to Scrollama.js": https://pudding.cool/process/introducing-scrollama/
65. The Pudding, "How to implement scrollytelling with six different libraries": https://pudding.cool/process/how-to-implement-scrollytelling/
66. russellsamora/scrollama (v3 sticky CSS pattern, no scrolljacking): https://github.com/russellsamora/scrollama/
67. webdevpuneet, scrollytelling chart snippet (vanilla observer, rootMargin -45 percent, build once restyle per step, tabular-nums): https://webdevpuneet.com/ui-snippets/scroll-story-chart/
68. Ed Riessen, scrollytelling with scrollama intro (fixed pixel step heights on mobile): https://www.edriessen.com/2023/04/24/an-introduction-to-scrollytelling-data-storytelling-using-scrollama-js-d3-js-and-html-css/
69. data.europa.eu, "Building scrollytelling articles" (production cost list): https://data.europa.eu/apps/data-visualisation-guide/building-scrollytelling-articles
70. Scrollytelling canon (Bloomberg "What's Really Warming the World", IIB 2015 bronze, pattern taxonomy): https://scrollytelling.ai/famous-scrollytelling-examples/
71. Posit, "Winners of the Closeread Prize" (judging criteria and effort): https://posit.co/blog/closeread-prize-winners
72. CAUSEweb, Student Data Scrollytelling Contest (student winners, cash prizes): https://www.causeweb.org/cause/contests/data-scrollytelling
73. Framing Luxembourg, IIB Awards 2022 scrollytelling experiment: https://www.informationisbeautifulawards.com/showcase/5696-framing-luxembourg-a-scrollytelling-experiment
74. arXivisual, TartanHacks 2026 winner (scrollytelling interface in winning package): https://www.armaan.world/arxivisual
75. WAN-IFRA Digital Media Awards Europe 2025, Best Data Visualisation (Reuters): https://wan-ifra.org/2025/04/wan-ifra-announces-the-winners-of-the-digital-media-awards-europe-2025/
76. WAN-IFRA Digital Media Awards Worldwide 2025 winners: https://wan-ifra.org/2025/05/global-news-media-innovators-shine-2025-digital-media-awards-worldwide/
77. Mariano Zafra, Reuters graphics portfolio (2026 DMA winner, 2024 IIB gold): https://marianozafra.github.io/
78. Online News Awards, "Scammed Into Scamming" (Excellence in Visual Digital Storytelling, 2026): https://awards.journalists.org/entries/scammed-into-scamming/
79. The Webby Awards 2026, Best Data Visualization nominee (Reuters quiz): https://winners.webbyawards.com/2026/websites-and-mobile-sites/features-design/best-data-visualization/362471/where-does-the-us-get-its-goods-take-our-quiz
80. Information is Beautiful Awards 2018 winners (From Data to Viz poster, bronze): https://www.informationisbeautifulawards.com/news/323-information-is-beautiful-awards-2018-the-winners
81. Information is Beautiful Awards 2019 winners (Explore the Ocean scientific poster, gold): https://www.informationisbeautifulawards.com/news/485-information-is-beautiful-awards-2019-the-winners
82. Information is Beautiful Awards 2014 winners (Weather Radials poster, silver): https://www.informationisbeautifulawards.com/news/49-information-is-beautiful-awards-2014-the-winners
83. Botanical Primes wall poster, IIB Awards 2016: https://www.informationisbeautifulawards.com/showcase/1276-botanical-primes
84. All of the World's Money and Markets in One Visualization, IIB 2016: https://www.informationisbeautifulawards.com/showcase/1682-all-of-the-world-s-money-and-markets-in-one-visualization
85. Euro withstands a quarter of a century (euro banknote inspired finance vernacular), IIB 2024: https://www.informationisbeautifulawards.com/showcase/7115-euro-withstands-a-quarter-of-a-century-amid-storms
86. Information is Beautiful Awards 2025 winners announcement (judge quotes): https://informationisbeautiful.net/2025/information-is-beautiful-awards-winners/
87. Complexity Science Hub, Yang wins Information is Beautiful Award (judge quotes on clarity, aesthetics, accuracy): https://csh.ac.at/news/yang-wins-information-is-beautiful-award/
88. Edward Tufte, "Slopegraphs for comparing gradients": https://www.edwardtufte.com/notebook/slopegraphs-for-comparing-gradients-slopegraph-theory-and-practice/
89. PolicyViz, "Five Charts You Have Never Used but Should" (slope chart): https://policyviz.com/2021/02/08/five-charts-youve-never-used-but-should/
90. Heer et al., "Graphical Perception of Multiple Time Series" (small multiples versus horizon): https://www.cs.au.dk/~elm/pdf/multilinevis.pdf
91. Interactive Horizon Graphs, CHI 2013 (band construction, B about 2): https://openaccess.city.ac.uk/id/eprint/16704/1/2013_CHI_IHG-2.pdf
92. Zentrix Studio, Calendar Heatmap Field Guide (aggregation, honesty dial, shared versus per facet scale): https://zentrixstudio.in/visuals/calendar-heatmap/guide
93. Hyndman and others, "Calendar-based graphics for visualizing people's daily schedules": https://robjhyndman.com/papers/calendar-vis.pdf
94. iBankEx thesis, bank transaction visualization with calendar glyphs: https://people.cs.nott.ac.uk/blaramee/teaching/msc/thesis/mao23thesis.pdf
95. Toph Tucker, "Doing enterprise financial data visualization after data journalism" (Archie Tse screenshot rule, tabular numerals, parenthesized negatives): https://tophtucker.medium.com/doing-enterprise-financial-data-visualization-after-data-journalism-3c68861b7f4c
96. Shelly Cheng, GE money flow Sankey (Junk Charts praise for the less used form): https://shellyscheng.github.io/project/ge/index.html
97. Print Magazine, Second Story Bank of America Market Data Mirrors ("weren't making anything up", avoided ticker tape mimicry): https://www.printmag.com/featured/second-place-second-story-interactive-studios/
98. Darren Shaw, flow-vis for Net A Porter (documented decorative failure and honest admission): https://www.darrenshaw.org/blog/2023/04/09/nap-flowvis.html
99. Renewable Rhythms data painting (explicit particle mappings, advection equations): https://github.com/thewhatifproject/renewablerhythms
100. Shuijie data-driven generative artwork (measurement to form mapping table): https://liuhao-art.com/works/shuijie
101. github-farm (Stardew style farm with published data mapping table): https://github.com/YeatsLiao/github-farm
102. BetterFly (Stardew inspired pixel wellness with conventional charts, code rendered sprites): https://github.com/ishaankothari/Hack-Cupertino-26
103. Stardew Valley Dashboard (usability findings: label confusion, fixed fact column, lean into the aesthetic): https://amarah.work/project/stardew-valley-dashboard
104. SoniData, HackMIT 2020 (Most Creative Use of Nasdaq Quandl Datasets): https://www.patrickkao.net/sonidata
105. On a High Note, ecology sonification Devpost entry (WebChucK): https://devpost.com/software/on-a-high-note-ecology-and-sonification
106. Algaeia, DODO Deepwaters hackathon 1st place (sonification museum): https://nathanyaqueby.framer.website/portfolio/algaeia
107. Data Sonification Awards (categories analysis, arts, communication): https://sonificationawards.org/
108. Tableau, "Explore the viz that reigned supreme at Iron Viz 2017" (analysis, design, storytelling criteria): https://www.tableau.com/blog/explore-viz-reigned-supreme-iron-viz-2017-77497
109. Storytelling with Data, "What I look for in effective data viz" (sensible display, no clutter, affordance, clear story): https://www.storytellingwithdata.com/blog/2013/11/what-i-look-for-in-effective-data-viz
110. UMass Dartmouth, Big Data Club wins Best Data Visualization at DataFest 2023: https://www.umassd.edu/news/2023/datafest-2023.html
111. Rhodes College, Data Analytics team wins Best Data Visualization award (two slide limit): https://news.rhodes.edu/stories/rhodes-data-analytics-team-wins-best-data-visualization-award
112. Alibaba Cloud, Quick BI Global Data Visualization Hackathon 1st prize (Squid Game themed dashboard): https://www.alibabacloud.com/blog/from-%E2%80%9Csquid-game%E2%80%9D-to-data-storytelling-the-winning-dashboard-of-the-quick-bi-visualization-hackathon_602644
113. HackSheffield10, Grafana Best Data Visualization prize text (creative and insightful dashboards turning raw data into stories): https://hacksheffield10.devpost.com/

### Verification checklist (this section)

- [x] Findings are from reputable sources (Pudding, Tufte, IIB awards, WAN-IFRA, peer reviewed CHI and perception papers, Devpost pages)
- [x] Equations are correctly transcribed (flow advection from Renewable Rhythms, horizon folding from CHI 2013, calendar layout from frame_calendar)
- [x] Validation data includes uncertainty (effort and award scale claims flagged as self reported or marketing)
- [x] Practical implications are actionable (ranked list, time budget, honesty rules 1 to 8, tester acceptance criteria)
- [x] All sources cited (64 to 113, no duplicates of citations 1 to 63)
- [x] Research supports the pivot decision (rank 1 plus rank 2 core, one identity layer, full tile world rejected with the GEOdle precedent)
- [ ] No direct Sheridan 2025 winner used a scrollytelling essay, so the pattern is inferred from professional and student award precedent, not from this event's history. Low impact, flagged.
- [ ] Poster print access at the venue is unconfirmed, so the poster export doubles as the web hero regardless of printing.

## Entire git forge research

Research date: 2026-11-06. Phase context: pre-hackathon decision on adopting
Entire from day one of the new repo created Saturday Nov 7 morning, for the
MLH "Best Use of Entire" track (draft plus track selection Sat 8:00 PM, final
Sun noon). Citations 114 to 136 are listed at the end of this section and do
not repeat citations 1 to 113.

### What Entire is (verified facts)

| Fact | Detail | Source | Confidence |
|------|--------|--------|------------|
| Real product, publicly launched | Entire launched Oct 26 2026 by Thomas Dohmke (former GitHub CEO), after a Feb 2026 seed of 60M USD led by Felicis at a 300M USD valuation | Dohmke launch blog (128), Zenn summary of coverage (131), The Tech Signal (132) | High |
| Product category | A Git forge (code host) built for agent-human collaboration, plus a local CLI that captures agent sessions into your repo | homepage (114), docs intro (115) | High |
| Pricing at signup | Code hosting, Trails, Session Storage, Continuous Memory, Agentic Search, and the Entire CLI are free during early access; a one-time credit (reported as 100 USD) covers tokens consumed by Trails review agents, then pay as you go, no card required | pricing page (125), secondary reports (130, 131) | High for "free features", Medium for the exact 100 USD figure (secondary sources) |
| Supported platforms | Web app (entire.com), CLI (brew or curl install, open source MIT), stdio MCP server (`entire mcp`), skills for agents | quickstart (115), agents overview (119), CLI README (136) | High |
| OpenCode support | First class, via a repository plugin at `.opencode/plugins/entire.ts`, installed by `entire enable -y --agent opencode`; captures session, file changes, tool calls, and token usage; status is Preview, no subagent capture, cannot import pre-existing OpenCode sessions | OpenCode integration doc (120), agent hooks (134) | High |
| GitHub relationship | Overlay plus optional mirror, not a forced migration: GitHub stays the upstream, Entire serves a regional mirror, pushes through the mirror still trigger your GitHub Actions and branch protection still applies; native Entire hosting supports only private repos at launch, public repos are on the roadmap | quickstart (115), CLI README (136), Trails note (118), CellCog (130) | High |
| Session capture without account | `entire enable` and session capture work in any Git repository with no account; login is needed for the web app and mirroring | CLI README (136), quickstart (115) | High |
| Trails availability | Docs say Trails is on by default in repository settings with preset review agents; an older hack guide (EHL Munich) says Trails was behind a feature flag, so verify on Saturday at setup time | Trails overview (118) vs hack guide (133) | Medium (docs suggest GA now, older page disagrees) |
| Track availability at Sheridan | MLH prizes page for Sheridan Datathon 2026 lists 7 categories: Gemini, Entire, Solana, Tiger Data, Vultr, Snowflake, GoDaddy; Entire prize is a Mini Portable Projector, track window Q4 2026 to Q3 2027, "Log In To Claim Code" | MLH Sheridan prizes (127), MLH track page (126) | High (updates research note that MLH list was TBA) |

### The four core capabilities and how a solo dev uses them

| Capability | What it actually is | Practical workflow for us (OpenCode, one person) |
|------------|--------------------|--------------------------------------------------|
| Sessions (checkpoints) | Git hooks plus agent hooks capture prompts, transcript, tool calls, files, token usage; on each commit Entire links the session context as a checkpoint stored in git refs (`refs/entire/checkpoints/...`) inside your own repo, with an `Entire-Checkpoint` trailer on the commit | `entire enable -y --agent opencode`, answer "always" at the commit prompt, then work normally; later run `entire checkpoint explain HEAD` or `entire session resume BRANCH` to restore a session in OpenCode |
| Graph (entire-graph) | Open source MIT plugin, tree-sitter based local analysis (no network, no model calls), gives agents ranked code search, definitions, callers, impact analysis; claim of up to 71 percent token savings vs blind file search | Install plugin, run `entire graph init-agents` so the agent guide lands in the repo, then ask the agent "where does X live, what would this change affect" instead of letting it grep the fresh Saturday repo |
| Brain (entire-brain) | Indexes sessions on top of the graph so past decisions are queryable via CLI or MCP (`entire mcp`); marked optional in Entire's own hackathon guide | Optional for us; sessions plus graph cover the sprint, Brain is the first thing to skip if time is short |
| Trails (code review) | PR replacement: `entire trail create --title ...` links a branch, every push triggers configured review agents (presets: code review, security, slop, drift) that score the change (Risk, Intent drift, Slop, Test coverage) and file findings; merge when gates pass | Create one trail per major block (report UI, pipeline, game), let the preset review agent score pushes, ask the coding agent to triage findings via `entire agent-help`; note: mirrored repos use a linked GitHub PR for actual CI and merging, Entire review is separate (118) |

### Evidence requirements for "measurable token efficiency"

The track text (126) asks to leverage as many of Sessions, Graph, and/or
Brain as possible, plus show "measurable token efficiency". Entire ships the
measurement tools:

| Tool | What it measures | Output |
|------|-----------------|--------|
| `entire tokens profile` (experimental, under labs) | Aggregate token usage and recommendations across committed checkpoint history | Table or `--json`; reads checkpoint metadata only, deterministic, zero token cost (121) |
| `entire session tokens` / `entire checkpoint tokens` | Token usage for one session or checkpoint (input, output, cache reads) | Per-session breakdown (121) |
| `entire graph stats` | Compares entire-graph usage with grep and file reads in local coding-agent transcripts, including an estimated token saving | Human-facing report, runs on local transcripts (122, glossary 135) |
| Search benchmark pattern | Entire's own searchmark harness: 9 engineering questions, 10 runs each, agent with Search answered 81 of 90 vs 70 of 90 from full history plus gh CLI, using more than twice the tokens and twice the steps | Open source, rerunnable at entireio/searchmark (124) |

Minimum viable evidence package (fits in about 30 minutes spread over the day):

1. `entire tokens profile --json` committed to `evidence/` at two points
   (Saturday night and Sunday morning) showing per-checkpoint token totals.
2. `entire graph stats` output showing estimated tokens saved versus grep
   in the OpenCode transcripts.
3. Screenshots: one Trail page with the four eval monitors, one
   `entire checkpoint explain` linking a real commit (for example the F4
   counterfactual bridge) to the prompt that produced it.
4. One honest A/B: answer the same codebase question once with
   `entire graph search` and once with blind grep, compare
   `entire session tokens` for both sessions. This is the number that
   answers "measurable token efficiency".
5. One write up paragraph plus 20 seconds of the 2 minute video naming the
   capability and the number.

### Benefits mapped to this project's actual sprint pain points

| Sprint pain point (from AGENTS.md, decisions.md, architecture.md) | Entire capability that helps | Value | Notes |
|------------------------------------------------------------------|------------------------------|-------|-------|
| New repo built Saturday from imported plumbing: every new agent session must re-learn an unfamiliar layout, burning tokens and wall clock | Graph | High | Fresh repo is exactly the use case; the agent guide is committed to the repo so every session starts with a map |
| Many short agent sessions across a 24h sprint (research, backend, code review, tester subagents), context repeatedly lost between them | Sessions plus resume | High for main sessions, low for subagents | OpenCode integration cannot capture subagent lifecycles (120), so the value lands on top level sessions; docs/research.md and decisions.md currently do this job manually, Entire automates and makes it agent searchable |
| "Why did we change this" archaeology during the Sunday morning polish pass | Sessions plus checkpoint explain | Medium | Commit to session linkage replaces guesswork; the repo already keeps decision records, so this is redundancy, not rescue |
| Code review before the Sunday noon deadline (project already uses a code-reviewer pattern) | Trails preset review agents | Medium | Genuinely useful as a second pair of eyes on each push, but the existing subagent review already covers the core need |
| Decision memory across the weekend | Brain | Low for us | Ceremony for a solo 24h sprint; docs/decisions.md is the human memory, Brain is the automated version, skip if time is short |
| Multi-repo trails, gates, team handoff, CI partners (Buildkite, Depot) | Trails advanced, CI integrations | None | Built for teams; we push straight to GitHub with GitHub Actions already working; explicitly skip |

Where it is ceremony: anything requiring team workflow (trail assignment,
gates configuration beyond defaults), Brain indexing, CI partner setup, and
moving hosting off GitHub.

### Honest hour cost of adopting it Saturday morning

| Step | Estimated time | Notes |
|------|---------------|-------|
| Rehearse Friday night in a throwaway folder (install, enable, first checkpoint) | 30 min | De-risks Saturday; the whole flow is 6 quickstart steps |
| Saturday: `brew install entire` plus `entire login` | 5 to 10 min | |
| Saturday: `entire enable -y --agent opencode` in the new repo | 5 min | Writes `.opencode/plugins/entire.ts` and `.entire/` |
| Saturday: GitHub App authorize, `entire repo mirror add`, `entire repo remote add entire` | 10 to 15 min | Requires GitHub App access to the repo |
| Saturday: entire-graph install plus `entire graph init-agents` | 10 to 15 min | |
| Saturday: one trail plus preset review agent enabled | 10 to 15 min | Verify Trails is not feature flagged (133) |
| Evidence capture across the day (3 commands plus 2 screenshots) | 30 min total | Run opportunistically at commit points |
| Learning/reading cost (quickstart, sessions, trails docs) | 30 min Friday | One time |
| Total cold | 1.5 to 2.0 h | Setup plus learning plus evidence |
| Total after Friday rehearsal | 45 to 60 min Saturday, plus 30 min spread evidence | |

What to cut to pay for it, in order: motion accents and ticker (rank 6 in
the time budget, "DO IF TIME"), then trim the Sunday buffer from 2 h to 1.5 h.
Do not cut scrollytelling (block A), almanac charts (block B), poster/write up
(block C), or the video (block E).

### Risks and costs

| Risk | Severity | Mitigation |
|------|----------|------------|
| Setup eats Saturday morning build hours | High if unbounded | Hard timebox of 45 min; abort and drop the track if enable or mirror fails |
| Session transcripts pushed into the repo: if the submission repo is public, redacted transcripts are public too (checkpoints live in git refs and are pushed with the repo) | Medium | Data is mock ledger, low sensitivity; review the first checkpoint before first push; or set `strategy_options.push_sessions` false to keep checkpoints local (CLI screenshots still work as evidence); or use a separate private checkpoint repo (117) |
| OpenCode integration is Preview: no subagent capture, no import of past OpenCode sessions, token counts depend on the agent writing them | Medium | Capture matters most for top level sessions; enable at repo creation so nothing is missed; verify `entire session tokens` returns numbers on day one, this gates the evidence package |
| Redaction is best effort, not a guarantee; API keys in transcripts could leak if pattern misses | Medium | Never paste keys into agent prompts (ElevenLabs key is on this project's radar); redaction layers 1 to 8 run on every write (117) |
| Lock-in | Low | CLI is MIT open source, checkpoints are plain git refs, GitHub remains upstream; removing the `entire` remote and hooks reverts everything (136) |
| Switching mid-hackathon jeopardizes the Sunday noon deadline | Medium | Adopt at repo creation Saturday morning only, never mid-sprint; the whole plan fails closed at the 45 min timebox |
| Trails behind feature flag (older guide) | Low | Docs say on by default; if gated, the track still qualifies on Sessions plus Graph, which the track text explicitly allows ("Sessions, Graph, and/or Brain") |
| Pay as you go after credit | Low | Review agent runs cost about 0.41 USD per run at published rates (125); one person's weekend stays inside the free credit |
| Telemetry (PostHog) default on | Low | Opt out with `ENTIRE_TELEMETRY_OPTOUT=1` or settings key (117) |

### Recommendation: conditional GO

GO only if all of these hold:

1. Friday rehearsal completes in 30 minutes (install, enable, first
   checkpoint in a scratch repo).
2. Saturday setup is timeboxed to 45 minutes; on timeout, continue without
   Entire and do not select the track.
3. GitHub stays the submission host: Entire is added as a mirror remote
   only, never as a replacement; GitHub Actions and the Pages deploy keep
   running untouched.
4. Evidence capture is capped at 30 minutes total, spread across the day.
5. Scope is exactly: Sessions plus Graph plus one Trail with a preset review
   agent. Brain, CI partners, multi-repo trails, and hosting migration are
   explicitly out.
6. The primary target stays Best Data Visualization and Storytelling; the
   Entire track is a secondary submission (MLH standard rules allow
   submitting to multiple challenges), so no Entire work may displace a
   block A to E deliverable.

NO-GO if: Friday rehearsal fails, the mirror cannot be created, session
token capture returns no numbers for OpenCode, or the user's primary goal
becomes winning the Entire track at the expense of the findings report.

### Citations for this section (114 to 136)

114. Entire homepage, features and problem statement: https://entire.com/
115. Entire Quickstart (install, enable, checkpoint, mirror, trail, agent): https://docs.entire.io/quickstart
116. Entire Sessions overview (checkpoints, storage in git refs): https://docs.entire.io/guides/sessions/overview
117. Entire Security and Privacy (data locations, redaction layers, telemetry): https://docs.entire.io/security
118. Entire Trails overview (evals on push, gates, mirrored repo GitHub PR note): https://docs.entire.io/guides/trails/overview
119. Entire Agent Integrations (support matrix, OpenCode Preview): https://docs.entire.io/agents/overview
120. Entire OpenCode integration (plugin, token usage capture, limitations): https://docs.entire.io/agents/opencode
121. Entire CLI reference, tokens commands (profile, session, checkpoint): https://docs.entire.io/cli-reference/tokens
122. Entire entire-graph overview (71 percent claim, benefits): https://docs.entire.io/guides/graph/overview
123. entire-graph repository README (LoCoMo 94.74 percent, 36 languages, tree-sitter, no network): https://entire.io/gh/entireio/entire-graph
124. Entire Search overview (searchmark benchmark 81 of 90 vs 70 of 90, 2x tokens): https://docs.entire.io/guides/search/overview
125. Entire pricing (free features, pay as you go, review agent run cost example): https://entire.io/pricing
126. MLH, Best Use of Entire track text (core capabilities, measurable token efficiency): https://www.mlh.com/events/since-ai-hackathon
127. MLH, Sheridan Datathon 2026 prizes (7 categories incl. Best Use of Entire, projector prize): https://www.mlh.com/events/sheridan-datathon-2026/prizes
128. Thomas Dohmke, "The Git Forge for Agent-Human Collaboration" (launch post, Oct 26 2026): https://entire.com/blog/the-git-forge-for-agent-human-collaboration
129. Dagger, "Dagger for Entire" (Nov 4 2026, Trails and CI context): https://dagger.io/blog/dagger-for-entire/
130. CellCog explainer (100 USD starter credit per The New Stack, private repos only at launch, public on roadmap): https://cellcog.ai/blog/entire-git-forge-for-agents/
131. Zenn summary of Japanese coverage (funding, pricing, GitHub coexistence, MIT licensed CLI): https://zenn.dev/dyoshikawa/scraps/d7e7b524772e37
132. The Tech Signal launch coverage (graph token claim, open source plugins): https://thetechsignal.co/2026/10/26/entire-git-forge-ai-agents-dohmke/
133. Entire at EHL Munich 2026 hackathon guide (onboarding steps, Trails access form note): https://hack.entire.io/ehl-munich-2026
134. Entire Agent Hooks reference (hook locations including `.opencode/plugins/entire.ts`): https://docs.entire.io/guides/configuration/agent-hooks
135. Entire Glossary (token usage, session, mirror, trail definitions): https://docs.entire.io/glossary
136. entireio/cli GitHub README (install, mirror, GitHub Actions coexistence, session capture without account): https://entire.io/gh/entireio/cli

### Verification checklist (this section)

- [x] Findings are from reputable sources (official docs, MLH track pages, launch blog, secondary press), marketing claims flagged as self reported
- [x] Equations correctly transcribed (token savings ratio defined from Entire's stated metric, no physics equations involved)
- [x] Validation data includes uncertainty (71 percent is Entire's own claim, 100 USD credit from secondary sources, setup times are estimates)
- [x] Practical implications are actionable (45 min timebox, evidence package, cut list, GO conditions)
- [x] All sources cited (114 to 136, no duplicates of 1 to 113)
- [x] Research supports the adoption decision (conditional GO with abort criteria tied to the Saturday 8:00 PM draft deadline)
- [ ] Trails general availability is ambiguous (docs say default on, older hack guide says feature flag); verify Saturday at setup, fallback is Sessions plus Graph which the track text explicitly allows
- [ ] OpenCode token usage capture could not be tested before Saturday; the evidence package depends on it, gate on `entire session tokens` returning numbers

## Tangerine dataset preparation research

Research date: 2026-11-06. Phase context: pre-hackathon readiness for the
unknown Tangerine dataset that lands Saturday Nov 7, targeting the
[Tangerine] Best Financial Resilience Challenge track inside the fresh repo
decision. Citations 137 to 157 are listed at the end of this section and do
not repeat citations 1 to 136.

### Sponsor context (verified)

| Fact | Detail | Source | Confidence |
|------|--------|--------|------------|
| Track name and prize | [Tangerine] Best Financial Resilience Challenge, 1 winner, prize listed as "To Be Announced" | Sheridan 2026 Devpost (141) | High |
| Dataset delivery | Event site says Tangerine is "sponsor-backed, own dataset and problem statement", so the schema is not published before the event | sheridandatathon.com (142) | High |
| Timing | Tangerine keynote at the opening ceremony plus a hands on workshop on Saturday; dataset most likely drops at or right after the opening (10:00 AM Saturday) | GDG Sheridan LinkedIn (143), event site (142) | Medium (exact drop time not published) |
| Judge | Matt Clements, CTO @ Tangerine, is listed as a judge; a Scotiabank data scientist (Emilia Zielinska) is also on the judge list | Sheridan 2026 Devpost (141), judge LinkedIn post | High |
| Brand context | Tangerine is a wholly owned Scotiabank subsidiary (ING Direct from 1997, acquired 2012), about 2 million clients, digital only bank | Tangerine llms.txt (145), FAQ page | High |
| Product vocabulary | Money Rules (Stash, Round Up, Tax My Habits, Pay Yourself First), Left to Spend budget tool, Goals, Spending Tracker, Orange Alerts, Credit Score Checker, no fee chequing and savings, cash back Mastercard, TFSA/RSP/RIF, HELOC | Money Rules page (144), llms.txt (145) | High |

Read for us: the track name "Financial Resilience" plus Tangerine's own tool
vocabulary (Left to Spend, Money Rules, Goals) means the dataset is likely to
be a personal spending or account level extract, and the problem statement
will likely ask about resilience (deficit days, buffer, spending regularity).
Our F1 to F5 pipeline (structural versus discretionary spend, deficit day
model, timing counterfactuals) already answers exactly that family of
question on the mock ledger.

### Prior Tangerine and Scotiabank hackathon datasets (what their data looked like before)

| Event | Data shape | Source | Reading for us |
|-------|-----------|--------|----------------|
| sHacks (Scotiabank x Tangerine student hackathon, since 2018, ran Aug 21 to 22 2026) | App building challenge, "real world challenge designed by individuals in the financial industry", no published dataset format; 2021 edition problem statement was accessibility of online financial services | Scotiabank sHacks page (137), UTM 2021 news (138) | Tangerine's own hackathon history is problem statement first, data second; do not expect a documented data dictionary |
| UTM BIGDataAIHUB x Scotiabank 2020 case competition | Real Scotiabank retail banking data, encrypted to protect client privacy, 8.6 million rows by 8 columns, question was money laundering engagement | UTM BIGDataAIHUB (139) | Precedent that Scotiabank ships large flat encrypted extracts with an AML or engagement angle, single wide CSV style |
| Ivey x Deloitte x SAS x Scotiabank "Hack the Case" 2017 | Masked real customer data from the SCENE loyalty program, business problem plus a late twist dataset change 8 hours before finals | Ivey news (140) | Precedent for masked loyalty or card style data and for a possible late data twist; keep ingest re-runnable |

No archived Tangerine specific dataset from a past Sheridan Datathon exists:
the 2025 event had no Tangerine track (see prior section, citations 34 to 63),
so 2026 is the first year. Treat the schema as genuinely unknown.

### Typical banking hackathon dataset shapes (what to expect)

| Shape | Example | Typical contents | Source |
|-------|---------|------------------|--------|
| Multi table pack | FinanceAI Telecom Paris fraud hackathon | transactions_train.csv, cards_data.csv, users_data.csv, mcc_codes.json, labels JSON, evaluation features | FinanceAI Devpost (146) |
| Joined flat file | Kaggle style credit card datasets | one row per transaction with transaction_id, date, card_id, amount, merchant city/state, MCC, use_chip, errors, is_fraud, plus joined demographics (age, income, credit_score) | teresamcgarry repo (147), Hugging Face Financial_Transactions (157) |
| Single account ledger | Most retail "personal finance" datasets | date, description, amount, balance, category; sometimes account, type, currency columns | Same sources, matches our mock schema |

Known messiness to expect, drawn from those schemas:

- Numeric columns stored as strings with currency symbols (for example
  "$23,679" in per_capita_income) (147).
- Missing values as null strings, empty merchant city for online
  transactions, an errors column holding free text (157).
- Dates as strings in several formats (YYYY-MM-DD, MM/DD/YYYY, Excel serial).
- Amount sign conventions vary: negative means debit in some sets, separate
  transaction_type column in others (146, 157).
- Card datasets can contain quasi identifiers (age, birth year, gender,
  lat/long, income, credit score) even after names are removed (147).

### Canadian format realities (encoding, French, Excel)

| Reality | What it looks like | Source |
|---------|-------------------|--------|
| French extended characters break naive reads | Government of Canada guide shows CSVs with French accents parsed wrong under UTF-8 when the file is ISO-8859-1 (Latin 1), and the reverse | Open Canada structured data guide (148) |
| BOM surprises | UTF-8 BOM at file start makes Excel show garbage or hides the first header unless utf-8-sig is used | Same guide (148), B.C. DevHub BOM note |
| Bilingual delivery | StatCan style portals ship paired fra and eng CSV zips (15100010-fra.zip and 15100010-eng.zip), so a "French version" of the same table may be the one you get | StatCan dataset example (149) |
| French column names | Likely aliases: montant (amount), solde (balance), categorie (category), date, description, no_compte (account), type_transaction | Inferred from Canadian bilingual convention (149) |
| Excel exports | XLSX with merged title rows, date serials, and decimal commas are common when a bank ships "a quick export" | Practitioner knowledge, medium confidence |
| Semicolon delimiters | French locale CSV exports often use semicolon instead of comma | Common convention, medium confidence |

### Schema inference checklist (pre-build today, ingest in under an hour)

The builder contract is already documented in scripts/build_world.py lines 14
to 35. Required columns: transaction_id, date (YYYY-MM-DD), amount (CAD,
debits negative), merchant_category, account_balance. Optional: hour,
timestamp, merchant_name, transaction_type (debit or credit), minute.
Header normalization already handles case, camelCase, and punctuation, and
comment lines starting with # are skipped. Input CSVs above 50 MB are
rejected before parsing.

Pre-build an ingest adapter script today with these steps, in order:

| Step | Check | Failure action |
|------|-------|----------------|
| 1 | Sniff encoding: try utf-8-sig, then latin-1, detect with BOM or chardet | Re-read with detected encoding, never trust the default |
| 2 | Sniff delimiter: comma, semicolon, tab | Pass delimiter to pandas |
| 3 | Skip junk rows: title rows above the header, comment lines, trailing totals | Locate header row by presence of known keywords |
| 4 | Normalize headers via the existing canonical_column rule, then alias map: montant to amount, solde to account_balance, categorie to merchant_category, description or merchant to merchant_name, transaction_id or id to transaction_id | Fail loudly listing unmapped columns |
| 5 | Confirm required columns exist after mapping | Fail with the missing list (builder already does this) |
| 6 | Parse dates: ISO, then dd/mm/yyyy, then Excel serial | Fail on unparseable rows with row ids |
| 7 | Parse money: strip currency symbols and thousands separators, handle decimal comma, convert to cents with the existing dollars_to_cents checks | Fail on non finite or overflow |
| 8 | Sign convention audit: print the debit and credit sums, compare against a balance continuity check balance[t] equals balance[t-1] plus amount[t] on sorted rows | If signs are flipped, flip once in ingest and record the decision |
| 9 | transaction_type cross check: if present, must agree with the sign rule | Log disagreements, do not silently override |
| 10 | Duplicate and null audit on transaction_id, null share per column | Deduplicate only with a logged rule |
| 11 | Coverage audit: date min, max, row count, distinct categories, income rows (positive deposits) | Report whether a full 12 months exist (pipeline expects one year) |
| 12 | Category vocabulary map: remap the real labels onto the pipeline's expected set (Dining, Groceries, Retail, Subscriptions, Transit, Travel, Utilities, Income) as a declared table in the write up | Unknown categories become Other with a printed list |
| 13 | PII scan: regex for emails, phone numbers, SIN patterns, card number patterns, street addresses, personal names in merchant free text | Strip or hash before anything is committed to the repo |
| 14 | Size guard: if the file is above 50 MB, aggregate to daily category level in ingest (or raise MAX_INPUT_CSV_BYTES deliberately) and log it | Never edit the cap silently |
| 15 | Checksum: record SHA256 of the raw file in the provenance block exactly as build_world already does | Reproducibility for Data Use 25 |

Honest time estimate: 1 to 1.5 hours to write and test this adapter against
the mock CSV plus two synthetic "ugly" variants (Latin 1 with accents,
semicolon with French headers) tonight. That converts Saturday's dataset drop
into a run, not an investigation.

### Privacy and ethics: what can and cannot be published (Data Use 25 honesty)

| Rule | Basis | Source |
|------|-------|--------|
| Removing names is not anonymization: 4 spatiotemporal points (date, place) reidentify 90 percent of people in a 1.1 million person credit card dataset; knowing prices drops it to 3 points | de Montjoye et al., Science 2015 | Science (150), MIT News (151) |
| Coarsening helps only somewhat: even binned to week level and 150 store clusters, 4 points still identify over 70 percent | Same study | MIT News (151) |
| Banks are federally regulated, so PIPEDA applies; "personal information" is information about an identifiable individual, with a "serious possibility" test that does not require certainty | PIPEDA | OPC brief (153), PIPEDA text (152) |
| A narrow research use exception exists (s. 7(2)(c)) but it requires confidentiality safeguards and notice to the Privacy Commissioner; it is not a free pass for publication | PIPEDA s. 7(2)(c) | PIPEDA text (152) |
| De-identified means "no serious risk of re-identification given context", covering direct identifiers (name, address, ID numbers) and indirect identifiers (age, income, geography, occupation) | Canadian Anonymization Network | CANON FAQ (154) |
| Ontario IPC 2025 guidelines: classify direct and quasi identifiers, pick a release model (private beats public), set a re-identification risk threshold (5 to 9 percent per ISO/IEC 27559), measure attack context, confirm risk below threshold | IPC Ontario via BLG summary | BLG (155) |
| k-anonymity: no record should be unique on quasi identifiers among fewer than k individuals; risk about 1/k; not foolproof but the standard floor | UBC research data guide | UBC (156) |

Concrete publish rules for our repo and video:

1. Do not commit the raw Tangerine file if the sponsor license or the data
   distribution terms say it is event private. Commit only aggregates,
   row counts, category sums, and the SHA256 checksum.
2. Never show raw rows on screen (video, poster, screenshots) when a row
   carries date plus amount plus merchant: that combination is exactly the
   re-identification recipe from (150).
3. Suppress small cells: category or month buckets with fewer than about 10
   transactions become "suppressed (k less than 10)" in any published table.
   This is standard statistical disclosure control and reads as rigor to
   Data Use judges.
4. Aggregate the Money River or ledger art to daily or weekly bins; no
   individual transaction becomes a visible particle without aggregation.
5. State the limits in the write up: sponsor data license, no raw release,
   k threshold used, and that methods transfer from the synthetic mock. That
   sentence is the Data Use 25 honesty line the rubric asks for.
6. If the dataset arrives already anonymized with a client id, do not try to
   link it to anything else. Correlation attacks are the documented failure
   mode (150, 151).

### Prior Sheridan sponsor winners read-across

2025 had no Tangerine track. The sponsor awards that year were Best Google
Cloud (Avocado, affordability dashboard) and Best Gemini (EduViz AI,
education animation), both conventional app or tool entries, and Best UI UX
(Chestify). Full list is in the earlier section (citations 34 to 63). The
2026 Tangerine prize is new and unannounced, so there is no historical bar
to copy: the safest read is that a sponsor track here rewards a clear
answer to the sponsor's problem statement plus honest data work, which is
what the shared rubric (Discovery 35, Data Use 25, Communication 25,
Impact 15) already scores.

### Practical implications

- Build the ingest adapter tonight (13 steps above) and test it on two ugly
  synthetic variants so Saturday is a single command.
- Assume the Tangerine problem statement will be about financial resilience:
  keep F1 (structural versus discretionary) and F5 (floor lifting
  interventions) as the headline candidates, because both map directly onto
  resilience language.
- Keep the mock ledger path as the always-working fallback: if the real
  dataset is late, mislicensed, or too messy, the findings report still
  runs and the write up says methods transfer (this is already stated in
  findings.md).
- Treat every published surface (video, poster, world.json, particles) as
  subject to the publish rules above; the provenance stamps already carry
  row ids, so audit them for raw row leakage before the final submit.
- The 50 MB input guard is a real risk for an 8.6 million row style extract
  (139); decide today whether ingest aggregates to daily category level.

### Citations for this section (137 to 157)

137. Scotiabank sHacks (Scotiabank x Tangerine student hackathon): https://www.scotiabank.com/careers/en/careers/s-hacks.html
138. UTM MCS news, 1st place at S:/Hacks 2021 (problem statement example): https://www.utm.utoronto.ca/math-cs-stats/news/mcs-students-win-1st-place-scotiabanks-shacks-hackathon
139. UTM BIGDataAIHUB, 2020 Scotiabank case competition (8.6M rows, 8 columns, encrypted retail data): https://www.utm.utoronto.ca/bigdataaihub/news/results-are-2020-big-data-ai-case-competition
140. Ivey, "Hack the Case" 2017 (masked SCENE loyalty data, late data twist): https://www.ivey.uwo.ca/news/news-ivey/2017/5/ivey-msc-business-analytics-students-learn-about-future-careers/
141. Sheridan Datathon 2026 Devpost (Tangerine track name, TBA prize, judge Matt Clements, rubric): https://sheridandatathon2026.devpost.com/
142. Sheridan Datathon 2026 event site (Tangerine title sponsor, own dataset and problem statement, keynote and workshop): https://www.sheridandatathon.com/
143. GDG Sheridan LinkedIn, Tangerine title sponsor announcement: https://www.linkedin.com/posts/gdg-sheridan-college_sheridandatathon-tangerine-gdgsheridan-activity-7520985879461470208-yGqp
144. Tangerine Money Rules product page: https://www.tangerine.ca/en/personal/spend/money-rules-tool
145. Tangerine llms.txt (product list, brand facts): https://www.tangerine.ca/llms.txt
146. FinanceAI Telecom Paris Hackathon (multi file banking dataset pack): https://financeai-hackathon.devpost.com/
147. teresamcgarry/financial-transactions-analysis (users, cards, transactions schema with currency strings): https://github.com/teresamcgarry/financial-transactions-analysis
148. Government of Canada Open Data, structured data guide (encoding, ISO-8859-1, BOM, French characters): https://open.canada.ca/en/working-data-api/structured-data
149. Statistics Canada style bilingual fra and eng CSV delivery example: https://open.canada.ca/data/en/dataset/e3543f24-4366-477c-8afb-0b5b6552617e
150. de Montjoye et al., "Unique in the shopping mall: On the reidentifiability of credit card metadata", Science 2015: https://www.science.org/doi/10.1126/science.1256297
151. MIT News, 4 points reidentify 90 percent coverage: https://news.mit.edu/2015/identify-from-credit-card-metadata-0129
152. PIPEDA full text (s. 7(2)(c) research exception): https://laws-lois.justice.gc.ca/eng/acts/p-8.6/FullText.html
153. Office of the Privacy Commissioner of Canada, PIPEDA requirements in brief: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/
154. CANON (Canadian Anonymization Network) FAQ (de-identification definition, direct and indirect identifiers): https://deidentify.ca/faq/
155. BLG summary of the IPC Ontario 2025 De-Identification Guidelines for Structured Data: https://www.blg.com/en/insights/2025/10/deidentification-of-personal-information-and-the-new-ipc-ontario-guidelines
156. UBC Research Data Management, de-identification and k-anonymity: https://researchdata.library.ubc.ca/deposit/anonymize-and-de-identify/
157. Hugging Face Financial_Transactions dataset (flat joined banking schema): https://huggingface.co/datasets/thiru1711/Financial_Transactions

### TODAY checklist (section A)

- [ ] Write and test `scripts/ingest_real.py` (or extend build_world input handling) with the 15 step table above, tested on the mock plus one Latin 1 plus one semicolon French header variant
- [ ] Decide the 50 MB policy: aggregate to daily category level, or raise the cap deliberately with a logged decision
- [ ] Draft the category remap table (real labels to the 8 pipeline labels) as a placeholder so Saturday only fills values
- [ ] Draft the one paragraph privacy note for the write up (no raw rows, k at 10, checksum only, methods transfer) so it is paste ready
- [ ] Confirm at the opening ceremony: dataset file format, license or publication terms, and whether raw rows may appear in the repo or video; if unclear, default to aggregates only
- [ ] Keep the mock pipeline green (`uv run pytest`) as the fallback path

## Solana award preparation research

Research date: 2026-11-06. Phase context: prep for the MLH "Best Use of
Solana" track at Sheridan Datathon 2026 (prize: Unruggable Hardware
Wallets per team member), demo and devnet only, no real money, solo dev who
has never used Solana. Citations 158 to 194 are listed at the end of this
section and do not repeat citations 1 to 136.

### Track text and judging (verified)

| Element | Detail | Source | Confidence |
|---------|--------|--------|------------|
| Sheridan track text | "Use Solana's fast, low cost transactions to build a game, social app, trading or lending tool, or a payments, identity or supply chain prototype." Prize: Unruggable Hardware Wallets per member | MLH Sheridan prizes (159), Devpost (141) | High |
| Generic MLH Solana challenge text | Three bullets: interactive app using onchain state, ownership, or transactions; community, gaming, creator, payments, or finance experience; connect a web or mobile app to Solana as a fast backend | MLH challenge page (158) | High |
| Published judging criteria at Sheridan | Not published. The event rubric (Discovery 35, Data Use 25, Communication 25, Impact 15) applies to the submission overall; MLH tracks are typically judged by MLH's own criteria at the event | Devpost (141), prior section | High that the event rubric applies, Medium on how MLH scores its track separately |
| Criteria used at comparable events carrying the same Solana prize | Vandyhacks XII: Technical Ability, Creativity, Utility, Presentation, Wow Factor. MasseyHacks XII: Technical Merit, Creativity, Refinement, Utility, Theme | Vandyhacks (161), MasseyHacks (162) | Medium (events vary, but the pattern is stable) |
| Track window | Solana prize category runs Q4 2025 to Q4 2026 per the MLH logo, so the track is live this weekend | MLH Sheridan prizes (159) | High |

Read for us: nobody can fail us for "not enough chain" if the track text's
bullet one is satisfied, an app that uses onchain state, ownership, or
transactions. The winning pattern across events is a product whose core
claim needs the chain, not a wallet button bolted onto a dashboard.

### What winners of past Solana chain tracks actually shipped

| Project, event | What it shipped | Why it won (per sources) | Read for us |
|----------------|-----------------|--------------------------|-------------|
| InstaRelief, HackNYU 2025 | MLH Best Use of Solana winner | Relief payments angle on chain | Sponsor track wins favor a real world payments or identity story (163) |
| HackProof, HackUMass XIII | Decentralized voting for hackathon projects, MLH Best Use of Solana | Onchain vote tally as the product itself | A ledger that is literally the point of the app reads as load bearing (164) |
| Sentinel AI, SolHacks 2026 (also MLH Best Use of Solana) | VS Code governance layer writing immutable audit logs to Solana devnet via the SPL Memo program, plus a dashboard visualizing on chain data | Every prompt and decision is a memo transaction | This is the closest template for us: memo receipts as the product's proof layer, no custom program (165) |
| Argus, nwHacks 2026 | "Git for Quants", versioning and verification of models and datasets on Solana, terminal UI | Making trust and reproducibility visible | Verification and provenance on chain matches our provenance inspector story (166) |
| VoxSol, Hacks for Hackers 2026 | Voice wallet copilot, real devnet swaps, Gemini plus ElevenLabs | Multi sponsor stack plus real devnet txs | Stacking two MLH tracks in one app is an accepted pattern (167) |
| mediQuack, (Devpost, multi track winner) | Anchors a cryptographic summary of vitals to Solana devnet with the Memo program as an "immutable vital sign certificate" | Memo anchoring described as the trust layer | Explicitly proves a memo only build can win a Solana track (168) |
| NO SUS Canary (live devnet product) | Seal and open receipts as single memo transactions, relayer pays fees, readers need no wallet | "No program to audit, no wallet to install", receipts verifiable on Explorer | The no program, no wallet pattern is production credible, not a shortcut (169) |
| AfterShow, Solana Graveyard Hack winner | Fan experience layer, wallet adapter, Solana Pay tips, plus a mock mode that runs the whole flow offline | Demo mode by default for presenters | Mock mode plus one real devnet tip is the booth pattern (170) |

Load-bearing versus decorative, synthesized:

| Load bearing (defensible) | Decorative (risky) |
|---------------------------|--------------------|
| The product's core claim is immutability, verification, receipts, voting, or ownership, and each user action produces a transaction (Sentinel AI, HackProof, mediQuack) | A Connect Wallet button and one transfer that the app would work fine without |
| Onchain state is read back and shown as evidence (dashboard charts from chain data) | A static screenshot of a wallet |
| The write up can name the exact instruction and program used (Memo program, System transfer, SPL token) | "We used Solana" with no signature to show |

### Fastest credible devnet demo paths for a solo first timer

| Rank | Path | Est. hours (first timer) | Credibility | Precedent |
|------|------|--------------------------|-------------|-----------|
| 1 | Memo receipt: one SPL Memo instruction carrying a hash or summary of the finding (for example the headline F5 number or a row checksum), sent from a browser wallet on devnet, shown on Explorer | 2 to 4 | High: winners shipped exactly this (165, 168, 169) | Sentinel AI, mediQuack, NO SUS |
| 2 | Wallet adapter plus devnet SOL transfer or SPL transfer in the React site (Phantom or Solflare, Wallet Standard discovery) | 3 to 5 | High: standard MLH curriculum path (172) | MLH 100 Days of Solana template, LATAM 4 hour event baseline (171) |
| 3 | Own SPL token as the "river currency" (create mint on devnet, mint to self, show balance) | +2 to 3 on top of 2 | Medium to high, reads as product thinking | LATAM tier 3 victory condition (171) |
| 4 | Money River Live: second river fed by real onchain data (see next table) | 3 to 5 | High if labeled, it is the wow layer | Our design, using Helius free tier |
| 5 | Anchor program (counter or receipt account) | 6 to 14 including first build | Highest ceiling, highest risk: first `anchor build` compiles the whole SDK and can take much longer than expected (173, 174) | Only if Friday rehearsal completes |
| 6 | cNFT mint (proof of attendance style) | 4 to 8 plus tree setup | Medium: needs a DAS capable RPC and a Merkle tree (16k capacity costs about 0.34 devnet SOL, non refundable) (186, 187) | Skip for this weekend |

No-program is a legitimate architecture: the Memo program is a deployed Solana
program (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr) and several shipping
products use only it plus System transfers, with fees of 5,000 lamports
(0.000005 SOL) per transaction (169, 192, 185).

### Money River Live: cost and hours for a river fed by onchain data

| Option | Free capacity | Limitations | Est. hours |
|--------|---------------|-------------|------------|
| Helius free tier | 1M credits per month, 10 requests per second, 1 sendTransaction per second, DAS at 2 per second, 5 webhooks, Wallet API included, archival data included | No mainnet gRPC below Business; credits run out with heavy getProgramAccounts scans (183, 194) | 3 to 5 for a poller that reads recent signatures for a small address set and parses transfers (Enhanced transfer calls cost 10 credits each, so 100k credits buys 10k parsed transfers, 10 percent of the monthly free allowance) |
| Public Solana RPC (no key) | 100 requests per 10 seconds per IP, 40 per 10 seconds for a single method, 40 concurrent connections, 100 MB per 30 seconds | Not for production, 429 responses with Retry-After, some free endpoints silently return null for old history (181, 182) | Same code path, tighter caching, add a second endpoint for failover |
| Baked fixture snapshot | Zero cost, zero network | Must be labeled "cached at HH:MM UTC" and never presented as live (189, 190, 191) | 1 to 2 (fetch once Saturday, save JSON, render) |

Recommended minimal design: poll `getSignaturesForAddress` (limit up to 1000
per call) on a short address list such as the USDC mint and two known large
holders, fetch and parse a capped batch, cache to JSON, and render the
existing flow field as the second river with a visible mapping legend and a
"last updated" stamp. Ship with a fixture file so the river still flows with
no network. Total honest cost: 0 USD, about 4 hours including the fixture.

### Toolkit terms (practical glossary)

| Term | What it means for us | Key fact |
|------|---------------------|----------|
| Devnet vs mainnet | Devnet is the free test network, chain state can reset, tokens worthless; mainnet is real money | Develop on devnet, never touch mainnet (176) |
| SPL token | Solana's fungible token standard (USDC is one) | Own mint on devnet is trivial to create (171) |
| USDC on Solana | Mainnet mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v; devnet mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU; 6 decimals | Circle runs the official devnet faucet (179, 180) |
| Memo program | Writes arbitrary text as an onchain transaction, no accounts needed for the memo | The workhorse for receipts (185) |
| Wallet adapter / Wallet Standard | One React wrapper discovers Phantom, Solflare, Backpack automatically | `@solana/wallet-adapter-react` with devnet endpoint (172) |
| cNFT (compressed NFT) | NFT data hashed into a Merkle tree, needs a DAS RPC to read | Cheap at scale, overkill here (186, 187) |
| Program vs no program | Writing your own Rust program needs Anchor or cargo build-sbf and a deploy; no program means calling existing programs | No program wins this weekend (171, 192) |
| Fees | Base fee 5,000 lamports per transaction on devnet, paid in free devnet SOL | Faucet gives 2 SOL per request (178) |

### Offline booth reality (chain calls need network)

| Strategy | How | Source |
|----------|-----|--------|
| Fixture mode with a visible label | A mode flag that loads a saved JSON of signatures and transfers, printed as "Sample data: rehearsed result" or "Cached at 14:32 UTC"; never silently swap live for fixture | Stavleak rehearsal guide (189), MacMyths fallback table (190) |
| Downloaded backup video | One 60 to 90 second screen recording of the perfect run, stored locally (not streamed), played if the live call stalls; label it as a recording | Batch0 demo guide pattern, Rise In backup video requirement (188) |
| Phone hotspot | Venue Wi-Fi is the most common single point of failure; bring your own uplink | MacMyths (190) |
| Pre computed verifiable proofs | Record the devnet signature, slot, and block time, link `https://explorer.solana.com/tx/<signature>?cluster=devnet` in the write up and on the poster; judges can verify after the event | Pattern from NO SUS and palm-remit (169, 191) |
| State change honesty | If a transaction cannot be confirmed, say so; never show a success state from a fallback for a state changing action | MacMyths (190) |

### Pre-verification: toolchain to install and test TODAY (Friday Nov 6)

Honest setup times for a first timer who has never touched Solana:

| Step | Command or action | Est. time | Verification |
|------|-------------------|-----------|--------------|
| 1 | One command installer: `curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev \| bash` (installs Rust, Solana CLI, Anchor CLI, Node, Yarn) | 10 to 20 min download, plus first compile | `rustc --version`, `solana --version`, `anchor --version`, `node --version` all print (174, 175) |
| 2 | Wallet: install Phantom or Solflare browser extension, create a wallet, switch network to Devnet in settings | 10 min | Extension shows Devnet |
| 3 | CLI wallet: `solana-keygen new --no-bip39-passphrase --outfile ~/.config/solana/id.json`, `solana config set --url devnet` | 5 min | `solana address` prints a key |
| 4 | Fund: `solana airdrop 2` and keep faucet.solana.com as backup (official page allows 2 requests per 8 hours, GitHub sign in raises limits; 429 means wait) | 5 to 15 min, faucet throttles under load | `solana balance` shows 2 SOL (177, 178) |
| 5 | Scratch wallet adapter app: Vite React TS template, install `@solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets`, connect wallet, show balance | 30 to 60 min | Address and balance render |
| 6 | First transaction: send a devnet SOL transfer to yourself, then a Memo instruction with a test string | 30 to 45 min | Signature confirms, open in Explorer with `?cluster=devnet` |
| 7 | Helius free key: sign up at dashboard.helius.dev (no card), one `getSignaturesForAddress` call from the app or a script | 15 min | JSON returns signatures within limits (183, 194) |
| 8 | Optional Anchor: `avm install latest`, `anchor init counter`, `anchor build` | 30 to 90 min, first build compiles the SDK and is the long pole | `.so` file in target/deploy (173, 174) |
| Total cold (steps 1 to 7) | | 2 to 3 hours | |
| Total after a Friday rehearsal | | 45 min re-verify Saturday morning | |

Do NOT start Anchor on Saturday. Decision rule: if steps 1 to 6 are not all
green by Friday night, the Solana element this weekend is memo receipts plus
fixture river only, and the track submission still stands on those.

### Verifiable devnet transaction for the demo and video

1. Send the memo from the demo wallet on devnet, wait for `finalized`.
2. Capture signature, slot, block time, and the memo text.
3. Put the Explorer link (`https://explorer.solana.com/tx/<sig>?cluster=devnet`)
   in the write up, the poster, and as a QR or caption in the video.
4. Screenshot the Explorer page as the offline backup proof.
5. Judges re-verify after the event without trusting our server, which is
   exactly what the winning projects shipped (165, 168, 169).

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Faucet rate limit (2 per 8 hours official, CLI throttled) | Medium | Fund Friday, keep 2 SOL in the wallet, use faucet.circle.com for devnet USDC (179, 180) |
| Wallet network mismatch (wallet on mainnet, app on devnet) is the number one "balance is zero" bug | High for first timers | Checklist item 2 above, verify at every session start (172) |
| Venue Wi Fi blocks RPC or wallet popups | High | Hotspot, fixture mode, downloaded backup video (188 to 190) |
| Public RPC 429s under demo load | Medium | Cache everything, Helius free key as primary, public endpoint as fallback (181, 182) |
| Devnet reset wipes balances and deployed programs | Low this weekend | No program deployed, so only balances matter; re-airdrop if needed |
| Scope creep into an Anchor program | High | Hard rule: no Anchor after Friday night |
| Mainnet mistake (real money) | High impact, low likelihood | Hardcode `https://api.devnet.solana.com` in one place and assert cluster in a test; track text and our decision both say demo devnet only |

### Practical implications

- The Solana element is: a memo receipt that stamps the headline finding
  onchain, plus a second Money River fed by cached then live USDC or SOL
  transfers. That satisfies the track bullet (onchain state and
  transactions) at 4 to 6 hours total, inside the weekend budget.
- Friday's 2 to 3 hour toolchain session is non negotiable; without it
  Saturday becomes debugging installs instead of building.
- Evidence to capture for the write up: one signature with Explorer link,
  the mapping legend for the river, and a one line statement that all
  transactions are devnet and no real money is involved.
- Everything chain related is secondary to the findings report: if time
  runs short, the river fixture and the memo are the cut line, in that
  order the memo stays and the live polling goes first.

### Citations for this section (158 to 194)

158. MLH, Best Use of Solana challenge page (track text): https://www.mlh.com/challenges/01a0227c-2b7b-2bf3-d20d-af16b752d955
159. MLH, prizes at Sheridan Datathon 2026 (Solana prize, track window): https://www.mlh.com/events/sheridan-datathon-2026/prizes
160. MLH, Sheridan Datathon 2026 event page (full Solana track text): https://www.mlh.com/events/sheridan-datathon-2026
161. Vandyhacks XII Devpost (Solana judging criteria: Technical Ability, Creativity, Utility, Presentation, Wow Factor): https://vandyhacks-xii.devpost.com/
162. MasseyHacks XII Devpost (Solana judging criteria: Technical Merit, Creativity, Refinement, Utility, Theme): https://masseyhacks12.devpost.com/
163. Subin Bista LinkedIn, InstaRelief wins MLH Best Use of Solana at HackNYU 2025: https://www.linkedin.com/posts/subin-bista-_hacknyu-mlh-solana-activity-7396404538842337280-PEGU
164. Leon Long LinkedIn, HackProof wins MLH Best Use of Solana at HackUMass XIII: https://www.linkedin.com/posts/leon-long-89a595317_web3-solana-activity-7394968783053963264-kYHs
165. RameezMilk/sentinel-ai (Memo program audit logs, SolHacks 2026 and MLH winner): https://github.com/RameezMilk/sentinel-ai
166. Iris Cheung LinkedIn, Argus wins Best Use of Solana at nwHacks 2026: https://www.linkedin.com/posts/icheung_nwhacks2026-hackathon-hackathonwinner-activity-7422089466854440960-53Mp
167. KaranSinghBisht/VoxSol (Best Use of Solana, Hacks for Hackers): https://github.com/KaranSinghBisht/VoxSol
168. mediQuack Devpost (Memo program vital sign certificate, multi track winner): https://devpost.com/software/mediquack-igxky7
169. shubhamsahu/nosus-canary (memo receipts, no program, no wallet): https://github.com/shubhamsahu/nosus-canary
170. jsigwart/aftershow (Solana Graveyard winner, mock mode demo): https://github.com/jsigwart/aftershow
171. gartox/solana-hackathon-latam (nine devs, zero Solana experience, four hours, tiered victory conditions): https://github.com/gartox/solana-hackathon-latam
172. MLH 100 Days of Solana, wallet connect challenge (Wallet Standard, devnet endpoint, faucet): https://www.mlh.com/events/100-days-of-solana/challenges/019f6a18-63e3-12b3-7641-4e363cc15430
173. MLH 100 Days of Solana, Anchor scaffold challenge (10 to 15 min first cargo install): https://www.mlh.com/events/100-days-of-solana/challenges/019ecbff-efdb-8cee-beac-ee5b63da7d40
174. Solana docs, one command installation (Rust, Solana CLI, Anchor, Node, Yarn): https://solana.com/docs/intro/installation
175. Solana docs, dependencies and manual CLI install: https://solana.com/docs/intro/installation/dependencies
176. BoltTx, getting started with Solana development (devnet, faucets, toolchain order): https://bolttx.io/en/blog/getting-started-with-solana-development
177. Markaicode, Solana CLI setup guide (20 to 30 min walkthrough, airdrop rate limits): https://markaicode.com/howto/solana-setup-and-configuration-guide/
178. Nownodes, Solana faucet guide 2026 (official page 2 requests per 8 hours, CLI 2 SOL): https://nownodes.io/blog/solana-faucet-how-to-get-free-devnet-and-testnet-sol/
179. Circle, USDC contract addresses (Solana mainnet and devnet mints): https://developers.circle.com/stablecoins/usdc-contract-addresses
180. Circle, quickstart transfer USDC on Solana devnet (faucet.circle.com, 6 decimals): https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana
181. Solana docs, cluster endpoints and public RPC rate limits (100 requests per 10 seconds per IP): https://solana.com/docs/references/clusters
182. RPC Fast, free Solana RPC endpoints compared 2026 (public endpoint exact numbers): https://rpcfast.com/blog/free-solana-rpc-endpoints
183. Helius pricing (free tier 1M credits, 10 requests per second, 1 sendTransaction per second): https://www.helius.dev/pricing
184. Helius FAQ (devnet endpoint, devnet faucet on paid plans): https://www.helius.dev/docs/faqs
185. Solana Program Library, Memo program docs: https://www.solana-program.com/docs/memo
186. Metaplex, Bubblegum V2 compressed NFTs (tree costs, DAS requirement): https://www.metaplex.com/docs/smart-contracts/bubblegum-v2
187. Solana Foundation developer content, state compression course (cNFT costs and DAS): https://github.com/solana-foundation/developer-content/blob/main/content/courses/state-compression/compressed-nfts.md
188. Rise In, Web3 Hackathon Demo Day guide (backup videos, rehearsal checklist including wallet connections): https://www.risein.com/guide/hackathon-demo-day
189. Stavleak, how to rehearse a hackathon demo without internet access (labeled fixture mode): https://stavleak.hashnode.dev/how-to-rehearse-a-hackathon-demo-without-internet-access
190. MacMyths, reliable hackathon demos when Wi-Fi or API fails (fallback table, state change honesty): https://macmyths.com/how-to-make-a-hackathon-demo-reliable-when-the-wi-fi-or-api-fails/
191. thesithunyein/palm-remit (no custom program, judge reproducible in one click, on-chain proof surfaced): https://github.com/thesithunyein/palm-remit
192. heliograf crate (memo plus 0 lamport transfer protocol, no program, measured fees): https://crates.io/crates/heliograf
193. payrail.dev, co-signing a transaction (memo in program allow list, devnet confirmation example): https://payrail.dev/blog/co-signing-a-transaction-you-did-not-write
194. Helius docs, plans and rate limits (free tier detail, webhooks, DAS): https://www.helius.dev/docs/billing/plans

### TODAY checklist (section B)

- [ ] Run the one command Solana installer and verify all five version prints
- [ ] Install Phantom or Solflare, create a wallet, switch to Devnet
- [ ] Generate the CLI keypair, set cluster to devnet, airdrop 2 SOL, keep faucet.solana.com bookmarked
- [ ] Build a scratch Vite React app with wallet adapter, connect, show balance
- [ ] Send one self transfer and one Memo transaction, open both on Explorer with cluster=devnet
- [ ] Create a Helius free account (no card) and make one getSignaturesForAddress call
- [ ] Decide tonight: memo receipts plus fixture river is the committed scope; Anchor is explicitly out unless all of the above is green by 10 PM
- [ ] Prepare the offline kit: downloaded 60 to 90 second backup recording plan, phone hotspot confirmed, fixture JSON path in the app with a visible label

## Domain and branding research

Research date: 2026-11-06. Phase context: the MLH "Best Domain Name from
GoDaddy Registry" track at Sheridan Datathon 2026 (prize: Digital Gift Card
per Devpost), plus a name for the Money River landscape art hero. Citations
195 to 205 are listed at the end of this section and do not repeat citations
1 to 136.

### Track mechanics (verified and observed)

| Element | Detail | Source | Confidence |
|---------|--------|--------|------------|
| Sheridan track text | "Register your project's domain name with GoDaddy Registry for a chance to win." Prize: Digital Gift Card (each member) | Devpost (141), MLH Sheridan prizes (159) | High |
| How entry works at MLH events generally | A claim page at hackp.ac/GoDaddyRegistry (or mlh.link/GoDaddyRegistry) issues a free domain with an event specific promo code, then you register the domain and build the site on it | Execute Devpost mechanics (195), GHW Beginners (196), GHW Games (197) | High for the pattern, Medium that Sheridan has a code published before check in |
| Observed promo codes | MLHXCT (Execute), MLHGHWBNG, MLHGHWGAME, MLHGHWAPI, MLHGHWPCT21 (Global Hack Week editions) | Same sources | High that codes are per event |
| Observed free TLD sets | .courses, .study, .co, .biz, .us (Execute, 195); .site, .xyz and a few others at World's Largest Hackathon (199); .dev, .app, .page as winner perks (LaunchHacks, 198); tech.study is an MLH plus GoDaddy free domain microsite (200) | As cited | High that the free set varies by campaign |
| Claim page | tech.study currently hosts a "Major League Hacking plus GoDaddy Registry FREE Domain Name" page | tech.study (200) | High |

Ambiguity to resolve today: whether the Sheridan claim page has its own
promo code or a fixed free TLD list. Check mlh.link/GoDaddyRegistry and the
Devpost track description on Friday; if no code appears, ask at check in
Saturday morning. Entry does not require winning: registering and using the
domain on the project is the entry.

### DNS propagation to GitHub Pages (do we need it by Sunday noon?)

| Fact | Value | Source |
|------|-------|--------|
| GitHub's own statement | DNS changes can take up to 24 hours to propagate | GitHub Pages docs (201) |
| What actually bounds a record change | The record TTL, not folklore: a fresh A or CNAME change is visible within the TTL (minutes for new records); the 48 hour folklore comes from nameserver delegation TTLs at the registry, which only apply when you change nameservers | MarinaDNS explainer (203), Vercel DNS doc (204) |
| HTTPS certificate | Can take up to an hour after DNS resolves; the Enforce HTTPS checkbox can take up to 24 hours to become available | GitHub Pages troubleshooting (202) |
| Record shapes | Apex needs four A records (185.199.108.153 to 111.153) or an ALIAS; a subdomain (www or app) needs one CNAME to username.github.io | GitHub Pages docs (201) |
| Verification | `dig <domain> +noall +answer -t A` or `dig www.<domain>` must match before you trust it | GitHub Pages docs (201) |

Practical plan: register today (Friday), set a subdomain CNAME (simplest,
one record, no apex A record games), verify with dig tonight, and let
Saturday absorb any hiccup. A fresh registration plus fresh records
typically resolves in minutes to a few hours. Do not leave this to Sunday
morning: the binding risk is the HTTPS certificate window, not the record
itself. Domain does not block submission (the site can stay on
username.github.io), but the track entry and the hero link both want it live
by the Saturday 8:00 PM draft if possible, and certainly before Sunday noon.

### Name candidates (registrability conventions only, availability not checked)

Theme: Money River landscape art, Ledger Odyssey, Tangerine orange accent.

| Candidate | Rationale | Notes |
|-----------|-----------|-------|
| ledgerriver.site | Combines the ledger and river metaphors in two words, .site is in the observed free sets | Short, sayable at the booth |
| moneyriver.xyz | Direct match to the hero art name, .xyz is in observed free sets | Strong for the art tie in |
| ledgerodyssey.site or ledgerodyssey.xyz | Keeps the project name intact if the river branding is secondary | Longer, 14 characters |
| orangeledger.xyz | Nods to the Tangerine orange palette without using the bank's trademark | Good sponsor respectful option |
| riverledger.online | Reversed compound, .online is a common cheap TLD | Second tier option |
| odysseyriver.com | Cleanest if the .com happens to be free or cheap | .com rarely free at these events |
| ledgerodyssey.app | .app is in observed free sets and is HTTPS only (HSTS preloaded), which GitHub Pages satisfies | Premium feel, must confirm HTTPS first |

Naming cautions:

- Do not put "tangerine" in the domain: it is a bank trademark (Tangerine
  Bank, a Scotiabank subsidiary), and an unrelated domain could read as
  impersonation to the sponsor. Use orange as a color nod instead.
- Avoid hyphens and digits, keep it under about 15 characters so judges can
  type or say it once.
- Avoid .io as a target: it is not in any observed free set and is priced
  as a premium TLD.
- One domain only: GitHub Pages CNAME files hold a single domain, and
  multiple domains need redirects (202).
- Claim the name in the write up and video verbally even if DNS is still
  settling, so the branding lands regardless.

### Practical implications

- Tonight: open mlh.link/GoDaddyRegistry, note the promo code and free TLD
  list, and register the first available candidate from the table (priority
  order: ledgerriver.site, moneyriver.xyz, ledgerodyssey.xyz).
- Point a subdomain CNAME at the GitHub Pages host, verify with dig, enable
  Enforce HTTPS, and screenshot the working HTTPS URL for the submission.
- Use the domain in three places: the Devpost "try it out" link, the first
  frame of the video, and the poster footer, which satisfies the track
  ("register your domain name") and gives the hero art a home.
- If registration fails or no free TLD fits, the fallback is a cheap first
  year registration (observed promo pricing puts .site around 1 dollar and
  .xyz around 1 cent first year, .dev around 20 dollars, treat coupon
  aggregator numbers as indicative only) or skip the track and keep
  username.github.io. The track is a Digital Gift Card, so do not spend
  more than about 15 CAD on it.

### Citations for this section (195 to 205)

195. Execute Devpost, GoDaddy Registry track mechanics (hackp.ac/GoDaddyRegistry, code MLHXCT, free .courses .study .co .biz .us): https://execute.devpost.com/
196. Global Hack Week Beginners Devpost (promo code MLHGHWBNG): https://global-hack-week-beginners.devpost.com/
197. Global Hack Week Games Devpost (promo code MLHGHWGAME): https://global-hack-week-games-20296.devpost.com/
198. LaunchHacks III Devpost (2 free .dev .app .page domains for winners): https://launchhacks-iii.devpost.com/
199. World's Largest Hackathon forum thread (free .site .xyz and a few others during claim): https://worldslargesthackathon.devpost.com/forum_topics/41020-can-we-only-claim-specific-tlds
200. tech.study, MLH plus GoDaddy Registry free domain page: https://www.tech.study/
201. GitHub Pages docs, managing a custom domain (A records, CNAME, dig check, 24 hour note): https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
202. GitHub Pages docs, troubleshooting custom domains (HTTPS up to an hour, CNAME single domain rule): https://docs.github.com/en/enterprise-cloud@latest/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
203. MarinaDNS, DNS propagation explained (TTL bound, 48 hour delegation folklore): https://marinadns.io/guides/dns-propagation-explained
204. Vercel docs, working with DNS (24 to 48 hour folklore, TTL planning): https://vercel.com/docs/domains/working-with-dns
205. PennApps XXIV Devpost, Best Domain Name from GoDaddy Registry (Hack from Home Kit era mechanics): https://pennapps-xxiv.devpost.com/

### TODAY checklist (section C)

- [ ] Open mlh.link/GoDaddyRegistry (and the Devpost track text) and record the promo code and free TLD list for Sheridan
- [ ] Register ledgerriver.site, moneyriver.xyz, or ledgerodyssey.xyz (first free match in priority order) tonight
- [ ] Add a CNAME record (subdomain such as www or app) to the GitHub Pages host, then verify with `dig`
- [ ] Add the domain in repository Pages settings (creates the CNAME file), enable Enforce HTTPS, confirm the HTTPS URL loads
- [ ] Screenshot the live HTTPS page for the submission and note the domain in the write up
- [ ] Decide the spoken name for the hero art (Money River) and use the same string in the video, poster, and domain
- [ ] If no free claim exists by Saturday check in, ask an organizer, and fall back to username.github.io rather than spending weekend hours on DNS

## 2026-11-06: Domain options for The Grand Line and Log Pose

Research date: 2026-11-06. Phase context: Best Domain Name from GoDaddy
Registry is award target 5 of 5 (decisions.md, Nov 06 synthesis). The user
added two product name candidates (The Grand Line, Log Pose) and asked the
existing variants (Grand Ledger, NamiFlow, Belly River) to be assessed too.
Citations 206 to 229 do not repeat citations 1 to 205.

### Method: live availability checks via RDAP

Every domain below was queried against its registry RDAP server through the
rdap.org bootstrap service (206). An HTTP 200 with a domain object means
registered (taken); an HTTP 404 means unregistered (available). Checked
2026-11-06 to 2026-11-07 UTC. Results are point in time: recheck the exact
string at registration. .co could not be verified (rdap.org failed to
bootstrap .co and the .co registry endpoint was unreachable from this
environment), so every .co cell reads unverified.

### Availability matrix (RDAP verified)

| String | .com | .xyz | .site | .app | .dev | .page | .biz | .study | .co |
|--------|------|------|-------|------|------|-------|------|--------|-----|
| grandline | taken (2000, 207) | taken (2021, 208) | taken (2022, 209) | taken (2021) | taken (2023) | AVAILABLE | taken (2005, 211) | AVAILABLE | unverified |
| thegrandline | taken (2003) | AVAILABLE | AVAILABLE | AVAILABLE | not checked | AVAILABLE | not checked | not checked | unverified |
| logpose | taken (2018) | taken (2025) | taken (2026) | taken (2024, client hold) | taken (2024, 210) | AVAILABLE | AVAILABLE | AVAILABLE (212) | unverified |
| thelogpose | taken (2026) | AVAILABLE | AVAILABLE | AVAILABLE | not checked | AVAILABLE | not checked | not checked | unverified |
| grandledger | taken (2019, Afternic parked) | AVAILABLE | not checked | not checked | not checked | not checked | not checked | not checked | unverified |
| namiflow | taken (2008) | AVAILABLE | not checked | not checked | not checked | not checked | not checked | not checked | unverified |
| bellyriver | taken (1999) | AVAILABLE | not checked | not checked | not checked | not checked | not checked | not checked | unverified |

Pattern read: base two word .com strings are all gone (expected, the 10 to
25 character .com space has been picked over for 25 years). The free and
cheap zone that matters for this track is .xyz, .site, .page, .app, .biz,
.observed in MLH free sets (citations 195 to 199), and in that zone both
candidates survive on the "the" prefix plus .page, .biz, and .study.

### Strongest domain string per candidate

| Candidate | Strongest string | Free TLD options verified | Second choice | Verdict |
|-----------|------------------|---------------------------|---------------|---------|
| The Grand Line | grandline.page (12 chars) | grandline.page, grandline.study, thegrandline.xyz, thegrandline.site, thegrandline.app, thegrandline.page | thegrandline.xyz if the promo list has no .page | Best availability of all candidates, name maps cleanly, finance legible without anime knowledge |
| Log Pose | logpose.page (10 chars) | logpose.page, logpose.biz, logpose.study, thelogpose.xyz, thelogpose.site, thelogpose.app, thelogpose.page | thelogpose.xyz (prefix drifts from the spoken name) | Shortest exact match, best metaphor, but the base namespace is crowded and logpose.com lands on someone else |
| Grand Ledger | grandledger.xyz | grandledger.xyz | ledgerriver.site (prior research) | Safest generic finance name, no IP overhang, loses the navigation story |
| NamiFlow | none | namiflow.xyz free but unusable | none | REJECT: namiflow.ai is a live paid product (219), founder states the name was inspired by One Piece Nami (220), namiflow.com taken since 2008 |
| Belly River | bellyriver.xyz | bellyriver.xyz | ledgerriver.site | Free and Canadian (Alberta river, 221), but belly reads oddly in a finance pitch and bellyriver.com has been parked since 1999 |

### Collision risks

#### One Piece intellectual property (applies to both main candidates)

- The Grand Line (the sea route) and Log Pose (the island to island
  compass) are both canonical One Piece terms (213).
- Shueisha, Toei, and Bandai register franchise trademarks actively
  (documented example: the One Piece Odyssey filing, 229).
- No evidence found that GRAND LINE or LOG POSE alone is registered as a
  trademark in a class covering a student data project. Fan projects run
  domains in both strings with explicit non affiliation disclaimers
  (grandlinehub.fr terms, 214; grandlinespin.com; logposetcg.com).
- Risk: low for this weekend (non commercial, name only, no anime art, no
  merchandise), medium only if the project is commercialized later. Do not
  use One Piece imagery, fonts, or character names anywhere in the site.

#### Grand Line existing uses (finance overlap, the relevant read for our judges)

- Grand Line, a Brussels accounting, tax, and HR fiduciary (grandline.be, 222).
- Grand Line Lending LLC, a Michigan mortgage lender founded 2025 (223).
- Grand Line Logistics (Kazakhstan), Grand Line Logistics LLC (Georgia
  trucking), Grand Line digital agency (Peru, 224).
- Read: a judge who googles the name finds accountants and a lender. That
  dilutes originality slightly, but none of them use our exact domain
  strings, and a nautical route reading (and grand total plus line of
  credit double meaning) still lands on our side.

#### Log Pose existing uses (crowded namespace, not finance)

- Companies: Log Pose SASU in Nantes, France, PR and communication, 2023
  (217); Log Pose SARL in Guadelaupe, autism support, 2022; Kabushiki
  gaisha Log Pose in Nagasaki, Japan, incorporated 2026-07 (218).
- Apps and stores: Log Pose for One Piece TCG on iOS (215), LogPose Trial
  on Android since 2016, explicitly One Piece inspired (216), logposetcg.com.
- Six base domains are taken (matrix above), logpose.com since 2018.
- Read: the name is popular in exactly the anime niche we would be borrowing
  from, plus three real companies. None are in finance, so no finance judge
  confusion, but a judge who types logpose.com reaches a foreign site.

### What the domain track actually rewards (mechanics read)

- Entry is a working website on a custom domain: MLH wording elsewhere is
  literally "Set up a website with a custom GoDaddy Registry domain name"
  (225), and Sheridan's text is "Register your project's domain name with
  GoDaddy Registry for a chance to win" (prior citations 141, 159).
- No dedicated rubric is published anywhere we found. HackDavis 2026 says
  "Judged by MLH" (226); other events fold the track into their general
  criteria (WHACK 2025, 227; All In, 228).
- Practical read: the winnable edge is an exact name to domain match that a
  judge can repeat after hearing it once, live HTTPS, and the URL shown in
  three places (Devpost try it out link, first video frame, poster footer),
  per the prior domain research section.
- Promo mechanics are unchanged: check mlh.link/GoDaddyRegistry for the
  Sheridan code and free TLD list before choosing the TLD (prior checklist C).

### TLD recommendation

| Priority | The Grand Line | Log Pose | Why |
|----------|----------------|----------|-----|
| 1 | grandline.page | logpose.page | .page is HTTPS only (HSTS preloaded, GitHub Pages satisfies), was a winner perk TLD at LaunchHacks (198), reads premium, both exact strings free |
| 2 | thegrandline.xyz | logpose.study or logpose.biz | .xyz and .site and .biz and .study appear in observed free sets (195, 199) |
| 3 | thegrandline.site or thegrandline.app | thelogpose.xyz or thelogpose.site | .app is HTTPS only and was in LaunchHacks perks (198); prefix drifts from the spoken name |
| Avoid | .io (premium, never in free sets, prior research), .co (unverified, rarely free) | same | |

### Ranking for the Best Domain Name prize

1. The Grand Line on grandline.page (fallback thegrandline.xyz).
   Reasons: most free options of any candidate, 12 characters, spellable
   without instruction, works with or without One Piece knowledge (route,
   grand total, line of credit readings all fit a ledger project), and it
   names the Money River journey the hero art depicts.
2. Log Pose on logpose.page (fallback thelogpose.xyz). Reasons: shortest
   exact match and the strongest single line metaphor (an instrument that
   points to your next destination is literally what the findings report
   does), but penalized for the crowded namespace and the logpose.com
   redirect trap when spoken aloud.
3. Grand Ledger on grandledger.xyz. Safe, generic, zero IP overhang, but a
   judge has heard it before and it carries no story.
4. Belly River on bellyriver.xyz. Available and Canadian, but belly is a
   hard word to sell in a Tangerine finance pitch.
5. NamiFlow: rejected outright, live commercial name collision (219, 220).

Tie break between rank 1 and 2: the domain prize is judged on the name, not
the game. The Grand Line degrades more gracefully for judges who do not know
One Piece, which matters because 2026 judges are industry data
professionals from banks and tech, not an anime audience.

### Practical implications

- Tonight, before any registration: open mlh.link/GoDaddyRegistry and note
  the promo code and free TLD list, then take the rank 1 string that the
  list supports (grandline.page if .page is free, else thegrandline.xyz).
- Register only one domain (GitHub Pages CNAME holds a single domain, prior
  research 202). The name decision and the TLD decision must land together.
- Speak the full URL with TLD in the video and poster, because the base .com
  strings belong to unrelated parties and a judge who guesses .com lands
  elsewhere.
- Recheck the chosen string via rdap.org at registration time; availability
  above is a point in time snapshot from 2026-11-06.
- Whatever name is chosen, use the identical string in the Devpost title,
  video, poster footer, and hero caption so the domain track entry and the
  branding reinforce each other.

### Citations for this section (206 to 229)

206. rdap.org domain lookup bootstrap (availability method): https://rdap.org/domain/example.com
207. Verisign .com RDAP, grandline.com registered 2000: https://rdap.verisign.com/com/v1/domain/grandline.com
208. CentralNic .xyz RDAP, grandline.xyz registered 2021: https://rdap.centralnic.com/xyz/domain/grandline.xyz
209. Radix .site RDAP, grandline.site registered 2022: https://rdap.radix.host/rdap/domain/grandline.site
210. Google registry RDAP (.app .dev .page), logpose.dev registered 2024: https://pubapi.registry.google/rdap/domain/logpose.dev
211. GoDaddy Registry .biz RDAP, grandline.biz registered 2005: https://rdap.nic.biz/domain/grandline.biz
212. .study registry RDAP, logpose.study returned 404 (available): https://rdap.nic.study/domain/logpose.study
213. One Piece Fandom wiki, Log Pose and Grand Line canon: https://onepiece.fandom.com/wiki/Log_Pose
214. Grand Line Hub fan site terms (non affiliation disclaimer pattern): https://www.grandlinehub.fr/terms
215. Log Pose for One Piece TCG, iOS App Store listing: https://apps.apple.com/us/app/log-pose-for-one-piece-tcg/id6720759559
216. LogPose Trial Android app, One Piece inspired navigation: https://logpose-trial.en.uptodown.com/android
217. Pappers, Log Pose SASU Nantes company record: https://www.pappers.fr/entreprise/log-pose-981722713
218. Presspage, Kabushiki gaisha Log Pose, Nagasaki, incorporated 2026-07: https://presspage.biz/corporation/7310001020174/
219. NamiFlow official site (live product, namiflow.ai): https://www.namiflow.ai/
220. SaaSHub, NamiFlow profile with founder name origin (One Piece Nami): https://www.saashub.com/namiflow
221. Wikipedia, Belly River (Alberta and Montana river): https://en.wikipedia.org/wiki/Belly_River
222. Grand Line, accounting and tax fiduciary, Brussels: https://www.grandline.be/en/
223. LinkedIn, Grand Line Lending LLC (mortgage lender, Michigan): https://linkedin.com/company/grand-line-lending-llc
224. LinkedIn, Grand Line digital agency, Peru: https://linkedin.com/company/grandline-peru
225. Global Hack Week Open Source Devpost, GoDaddy Registry entry text: https://ghw-open-source.devpost.com/
226. HackDavis 2026, Best Domain Name judged by MLH: https://hackdavis.io/
227. WHACK 2025 Devpost, domain track inside general event criteria: https://whack2025.devpost.com/
228. MLH, All In Hackathon prize category page: https://www.mlh.com/events/all-in-hackathon-april/prizes
229. Cogconnected, Shueisha and Bandai Namco trademark registration example: https://cogconnected.com/2021/07/shuiesha-bandai-namco-register-new-one-piece-trademark/

### Verification checklist (this section)

- [x] Availability checked against registry RDAP (200 taken, 404 available),
      not a registrar marketing page, on 2026-11-06
- [x] Findings from reputable sources (ICANN bootstrap, registries, Devpost
      and MLH pages, official company registries, product sites)
- [x] One Piece IP risk stated with the fan project evidence actually found
      (no evidence that GRAND LINE or LOG POSE alone is a registered mark)
- [x] Validation data includes uncertainty (.co unverified, availability is
      point in time, free TLD list for Sheridan still unpublished)
- [x] Practical implications are actionable (TLD priority, single domain
      rule, three placement rule, recheck before registering)
- [x] All sources cited (206 to 229, no duplicates of 1 to 205)
- [ ] .co availability unverified (registry RDAP unreachable), low impact
      because .co was not in the recommended priority anyway
- [ ] Sheridan GoDaddy promo code and free TLD list still unknown; the TLD
      pick must be confirmed against mlh.link/GoDaddyRegistry at check in

## 2026-11-07: Resilience weather station visualization research

Research date: 2026-11-07. Scope: visualization research only for the
"resilience weather station" re-skin (financial health as weather over the
same judge numbers). Out of scope: scripts/engine, pipeline planning, judge
metrics. This section continues the pivot research rank 5 verdict (pixel or
Terraria skin, DO AS SKIN ONLY): the weather station becomes the chosen
identity layer, and the honesty rules 1 to 8 from that section apply to it
unchanged. Citations 230 to 250 do not repeat 1 to 229.

### Key findings

| Finding | Source | Confidence | Application |
|---------|--------|------------|-------------|
| Meteograms (multi-panel time series over a shared time axis) are the canonical station plot; any weather variable graphed against time counts | Wikipedia meteogram (230), meteoblue (231) | High | Meteogram strip for the 12 month balance_series plus income and spending bars |
| Canada moved to colour coded alerts (yellow, orange, red) on Nov 26 2025, with impact based wording | Environment Canada (232) | High | Warning banner uses the local, Canadian severity ladder judges will recognise |
| NWS publishes an exact hazard hex table (tornado FF0000, severe thunderstorm FFA500, flash flood 8B0000) | weather.gov help map (233) | High | Anchor for red and orange storm fills; cite in the legend |
| Okabe-Ito 8 color palette is the default colorblind safe categorical set (E69F00, 56B4E9, 009E73, F0E442, 0072B2, D55E00, CC79A7, 000000) | figcanvas (234), arXiv accessible sequences (235), thenode CUD summary | High | Sky blue, vermillion, reddish purple pulled from it; the rest of the palette reuses existing tokens so report and station stay one system |
| Severity ladders must be read by luminance plus icon shape plus label, never hue alone, under red green CVD | Okabe-Ito CUD, arXiv 2107.02270 (235) | High | Every weather state ships redundant coding: icon silhouette, text label, luminance step |
| SVG degrades with object count (exponential on Safari per Smus); comfortable under about 1,000 to 2,000 nodes; canvas is flat cost and degrades with pixel area | Smus (246), yWorks (245), Lawrentz (244), ApexCharts benchmark (247) | High | Station chrome stays SVG (one badge, gauge, strip all under 400 nodes); only rain particles go Canvas 2D |
| Canvas particle guidance: 100 to 200 particles enough for effects, JS holds about 1,700 before fps drops, constant fillStyle with globalAlpha changes about 25x faster, rAF plus viewport pause | desarrollolibre (249), Source True (248), canvasparticles (250) | Medium (lab numbers) | Rain layer budget of 150 drops, one fillStyle, pause on hidden tab and reduced motion |
| Stardew themed dashboard study: players missed interactivity and struggled with labels; fixes were a fixed key facts column and explicit labels; authors wished they leaned further into the aesthetic | amarah.work (prior citation 103) | Medium (single study) | Station gets a fixed left facts column, explicit axis labels, and full commitment to the weather skin |
| github-farm proves a game skin stays honest with a published mapping table; BetterFly keeps conventional charts inside pixel chrome | prior citations 101, 102 | High | Mapping legend printed in the UI is mandatory, charts remain charts |
| CARROT Weather won an Apple Design Award by leading with color for condition and a few key numbers | Apple behind the design (236) | High | State color reads first, exact runway number second, everything else on demand |
| CSS animated SVG weather icons need no JavaScript (amCharts CC-BY pack as reference) | amCharts (237) | High | Sun rays and cloud drift as CSS keyframes on transform only |

### Weather idiom inventory with fit ratings

| Idiom | Real world example | Financial data fit | Rating | Verdict |
|-------|--------------------|--------------------|--------|---------|
| Current conditions icon state machine | WMO symbols, every weather app | runway state plus flags as one badge | 5/5 | P0 build |
| Meteogram multi panel time strip | meteoblue, Wikipedia (230, 231) | 12 month balance_series plus money in and out | 5/5 | P1 build |
| Warning banner alert tape | NWS hex table, Canada yellow orange red (232, 233) | shock recompute crossing a threshold | 5/5 | P0 build |
| Forecast outlook card row | 7 day forecast rows | baseline versus each twist, before and after | 5/5 | P0 build (shock strip) |
| Analog gauge dial (barometer style) | station barometers | runway months with severity arc | 3.5/5 | P0 build with printed number always |
| Seasonal almanac calendar grid | farmer almanac, Stardew calendar | per month weather state from that month numbers | 4.5/5 | P1, reuses calendar heatmap work |
| Trend arrow (pressure tendency) | rising or falling pressure | runway delta versus prior month | 4.5/5 | cheap add next to badge |
| Thermometer column | min max thermometer | buffer fill level | 4/5 | alternate to gauge, not both |
| Fog as data quality | visibility reports | thin_history flag as fog, low confidence chip | 5/5 | P0 honesty layer |
| Severity heat grid for many accounts | drought monitor mosaic, radar mosaic | portfolio or district overview | 4/5 | P2 conditional |
| Storm cone of uncertainty | hurricane track cone | months until buffer depletion band on timeline | 3.5/5 | P2 optional |
| Day night sky gradient | game skyboxes | sky hue as severity, declared decoration | 4/5 | ambience layer with legend line |
| Radar sweep map | Doppler radar | only with geographic framing | 3/5 | skip, districts are not a radar |
| Wind rose | met stations | no directional variable exists | 1/5 | skip |

### Metric to weather mapping table

Primary axis: judge runway (parity number from profiles.json, never
recomputed in the UI). Secondary axis: gap and buffer. Flags are honesty
modifiers.

| Metric value | Weather state | Palette color | Icon | Motion |
|--------------|---------------|---------------|------|--------|
| runway_state = no_shortfall, or runway >= 12 months, gap <= 0 | Clear | sky #56B4E9, sun #F4B740 | pixel sun | rays rotate 60 s, no precipitation |
| runway 8 to 12 | Fair | sky blue plus parchment cloud | sun behind cloud | cloud drift 40 s |
| runway 4 to 8 | Cloudy | slate #46617c | stacked cloud | slower drift, grayer sky gradient |
| runway 2 to 4, or buffer under 3 months of spending | Drought watch | amber #F4B740 with drought #d97b3f | cracked sun, heat rays | subtle heat shimmer |
| runway 1 to 2 | Storm watch (yellow orange advisory) | orange #e69f00 | dark cloud | sparse rain streaks |
| runway under 1 month, or buffer_depleted with gap > 0 | Storm warning | stamp red #ff6a4d, deep #d55e00 | thunderhead with bolt | 60 to 150 rain drops, lightning flash every 4 to 8 s |
| gap > 0 while buffer stays above 8 months of spending | Flood risk (water rising) | water lit #2f7f7c over deep #10333f | rising water line | water level animates to flood line |
| one off shock cost above 20 percent of buffer | Flood watch chip | water teal | burst pipe drop | ripple on impact |
| flag thin_history | Fog overlay, low confidence chip | fog #cc79a7 at 35 percent over slate | fog bank | slow drift, no data claim |
| flag zero_income | Eclipse modifier, permanent storm risk | deep red | blocked sun | sun never fully out |
| flag negative_buffer | Red alert, below zero, matches rv-drought | drought #d97b3f | cracked ground | existing drought line reused |
| flag defaulted_loan | Hail warning chip | vermillion | ice pellets | short burst on shock only |

Severity ladder follows the Canadian colour coded order (yellow advisory,
orange watch, red warning) so the banner vocabulary matches what Canadian
judges see in real life. Red and green are never the sole distinction: each
state also carries a unique icon silhouette and a printed label.

### Palette (all on existing dark grounds)

| Role | Hex | Origin |
|------|-----|--------|
| Sky clear | #56B4E9 | Okabe-Ito sky blue |
| Fair teal | #35d0ae | existing --rp-verified |
| Sun and watch amber | #f4b740 | existing --rp-money |
| Drought orange | #d97b3f | existing --rv-drought |
| Storm vermillion | #ff6a4d | existing --rp-stamp |
| Deep storm red | #d55e00 | Okabe-Ito vermillion |
| Advisory yellow text | #f0e442 | Okabe-Ito yellow |
| Cloud slate | #46617c | existing --rv-ridge |
| Grounds | #070c18, #0a1220 | existing --rp-void, --rv-sky-ink |
| Water | #2f7f7c, #10333f | existing --rv-water-lit, --rv-water-deep |
| Text on dark fills | #e9e0c9 | existing --rv-parchment |
| Fog | #cc79a7 at 35 percent | Okabe-Ito reddish purple |

New tokens live in a --wx- namespace next to --rp and --rv so the report
and Money River files never change.

### Terraria and Stardew translation table

| Game element | What it does in the game | Translates to the station | How |
|--------------|--------------------------|---------------------------|-----|
| Day night cycle skybox | passage of time and mood | Yes, data bound | sky hue band equals current severity state; declared in legend |
| Weather particle systems | immersion | Yes if data bound | drop count equals gap magnitude, lightning rate equals shock delta |
| Stardew TV forecast dialogue box | tomorrow forecast in a bordered box with a portrait | Yes, best single idiom | shock strip styled as forecast box: state icon as portrait, post shock runway as the forecast line |
| Stardew calendar | month grid with festivals marked | Yes | 12 month almanac grid, each cell a month weather state, shock months marked like festivals |
| HUD hearts and stamina | discrete pooled health | Partial | buffer pips as secondary, exact dollar and month numbers always printed |
| Crop health icons | status of each planted thing at a glance | Yes | per account or per metric status icons |
| Terraria inventory slots with tooltips | item grid, hover detail | Yes | account grid slots; hover shows provenance stamp (existing pattern) |
| Floating damage numbers | immediate loss feedback | Yes, brief | runway delta tick on shock recompute, tabular numerals, auto fade |
| Date counter chip | time context | Yes | date range chip from history first and last month |
| Crafting list and category tabs | filter many recipes | Partial | account picker filter by state, only if the picker is ours |
| Parallax background layers | depth | No | pure decoration, cost without data |
| Minimap frame | orientation | No | no geography unless the district map ships |
| Full tile world with gameplay | play | No | prior research rank 10, DO NOT, 8 to 14 h |
| Stacking damage and boss bars | threat over time | Yes | shock severity bar over the gauge |

### Required plots with implementation complexity

| Plot | Data it reads | Complexity | 120 s video fit | Offline fit | Verdict |
|------|---------------|------------|-----------------|-------------|---------|
| (a) Current conditions state badge | profiles.json runway_state, runway_deci_months, flags via a pure state function | CSS plus SVG, 2 to 3 h including 7 icons and tests | instant read, animates in 1 s | fully bundled | P0 |
| (b) Meteogram timeline strip | balance_series (12 rows) plus monthly rows through existing loaders | SVG reusing derivedAxis and the charts.tsx kit, 3 to 4 h | 5 s pan B-roll | bundled JSON | P1 |
| (c) Runway gauge dial | runway_deci_months, buffer_cents | SVG arc, piecewise scale, 2 to 3 h | 2 s needle sweep | bundled | P0 |
| (d) Shock scenario strip | baseline profile plus per twist post shock values (see Q2) | SVG plus CSS forecast cards, 3 to 5 h | this IS the 3 minute live twist | bundled | P0 |
| (e) Portfolio weather grid | all profiles in profiles.json | 4,500 SVG nodes is over the comfortable range, so Canvas 2D at 3 to 5 h, or 77 district aggregation in SVG at 2 h | B roll only | bundled | P2 skip by default |
| (f) Animated weather effects | severity derived from runway and gap | CSS loops 1 to 2 h, Canvas rain 1 to 2 h | background for every shot | zero network | P1 |
| (g) Warning banner tape | state function output | CSS plus text, 1 h | flashes on shock | bundled | P0 |
| (h) Printed mapping legend | static text plus bins from the mapping table | 1 to 2 h | reads on screenshot | bundled | P0, mandatory per honesty rules |

### Stack recommendation

Option a: SVG plus CSS plus Tailwind with CSS animations. Option b: Canvas
2D particle layer for weather effects under SVG UI chrome. Option c: full
Three.js scene.

Recommendation: option a as the base, adding option b only for the rain
layer if CSS proves insufficient. Option c is rejected.

Rationale:
- The design system is hand rolled SVG with CSS tokens (--rp, --rv),
  monospace display, dark navy ground. SVG inherits tokens, the provenance
  hover pattern, and the charts.test.ts contract test pattern with zero new
  dependencies.
- Station node counts (badge, gauge, strip, cards) stay under about 400,
  far inside the comfortable SVG range (244, 245, 246, 247). Canvas enters
  only at 100 plus simultaneously moving rain drops, where per frame SVG
  DOM writes would thrash (246).
- CSS animations limited to transform and opacity run on the compositor;
  sun rays and cloud drift cost nothing measurable on a demo laptop.
- Three.js is rejected: the Tier T1 3D decision predates the Nov 6 pivot
  that cancelled the game, WebGL adds a context risk on the projector and
  booth machine, and prior research already priced a WebGL pipeline at 3 to
  6 h plus risk with no data viz benefit. Charts must stay DOM and SVG for
  accessibility, printing, and the screenshot rule.
- Responsiveness: SVG viewBox scales from a 1366 laptop to a 1080p
  projector; bump chart label font sizes at large viewports because 8.5 px
  labels read too small from projector distance; keep the existing
  horizontal scroll container pattern for narrow screens.
- Performance budget: 60 fps on integrated GPU (architecture) holds; a 150
  drop canvas loop is under 1 ms per frame with constant fillStyle (248,
  249, 250).
- Offline: zero network, inline SVG icons, ui-monospace stack already
  declared, all data from public/data JSON.
- Design system fit: additive --wx tokens only; report and Money River
  untouched; state function is pure TypeScript with unit tests so the
  tester gets numeric acceptance criteria.

### MVP scope and hour budget (solo, draft Sat 8:00 PM, final Sun noon)

| Block | Contents | Hours | Priority |
|-------|----------|-------|----------|
| A | Pure weather state function, palette tokens, unit tests | 2 | P0 |
| B | State badge plus warning banner tape | 3 | P0 |
| C | Shock scenario strip (forecast box styling) | 4 | P0 |
| D | Printed mapping legend plus provenance hover | 2 | P0 |
| E | Account picker for judge chosen account_id | 2 | P0, may be shared with engine UI |
| F | Gauge dial with piecewise severity arc | 3 | P1 |
| G | Meteogram strip | 4 | P1 |
| H | Canvas rain plus CSS sky loops | 3 | P1 |
| I | Portfolio or district grid | 3 to 5 | P2 skip |
| Total P0 | | 13 | |
| Total P0 plus P1 | | 23 | |

Cut order if time runs short: I, then G, then H. Never cut D: the printed
mapping table is what keeps the skin honest under Discovery 35 and Data
Use 25.

### Relevant equations for this section

| Equation | Description | Variables |
|----------|-------------|-----------|
| state = W(r, gapRatio, flags) piecewise | pure weather state function, unit tested | r runway months, gapRatio = (S minus I) over max(I, 1), flags from profiles |
| r = deci_months / 10, capped at 120 | judge runway read, never recomputed | deci_months from profiles.json |
| bufferMonths = B / S | secondary gauge scale when S > 0 | B buffer cents, S spending cents |
| severity = clamp(1 minus r / 12, 0, 1) | drives all motion intensity | r runway months |
| dropRate = 20 + 180 * severity per second | rain particle spawn rate | severity |
| flashInterval = 8 minus 6 * severity seconds | lightning cadence | severity |
| gaugeAngle = piecewise(r; breaks at 3, 8, 24) | needle position so the 0 to 12 month region is not squashed by the 120 cap | r |

### Validation data for this section

| Benchmark | Value | Source | Uncertainty |
|-----------|-------|--------|-------------|
| SVG comfortable element count | under about 1,000 to 2,000 nodes | Lawrentz, yWorks, Smus (244, 245, 246) | device dependent |
| Canvas particle budget | about 1,700 JS particles before fps drop; 100 to 200 enough for effects | Source True, desarrollolibre (248, 249) | lab conditions |
| fillStyle constant, vary globalAlpha | about 25x faster than reassigning fillStyle | canvasparticles (250) | micro benchmark |
| Okabe-Ito hex set | 8 values listed above | figcanvas, arXiv, thenode (234, 235) | verified across 3 independent pages |
| Canadian alert ladder | yellow, orange, red since Nov 26 2025 | Environment Canada (232) | official |
| WCAG contrast | 4.5 to 1 text, 3 to 1 large text and graphics | AudioEye summary (243) | standard thresholds |
| Engine runway states | finite, no_shortfall, buffer_depleted, cap 1200 deci | scripts/engine/shocks.py | exact |
| balance_series length | 12 rows | scripts/engine/build.py BALANCE_SERIES_ROWS | exact |
| Stardew dashboard usability | label confusion and missed interactivity; fix was fixed fact column | amarah.work (103) | single student study |

### Practical implications

- Mount the station in the EXPLORE nav slot (PlayView placeholder) or as a
  new section; the findings report and Money River stay untouched either
  way.
- The state function is the contract: one pure TypeScript function from
  profile fields to state, with unit tests as tester acceptance criteria.
- Read profiles.json values only; the UI never recomputes judge numbers,
  so formula parity is preserved by construction.
- Print the mapping legend with month and dollar bins on first render; it
  is both a Communication asset and the honesty requirement from the
  pivot research.
- Gate every animation behind prefers-reduced-motion (pattern already in
  index.css) and pause the canvas loop on document visibilitychange.
- Seed any jitter with the existing hash01 pattern so the still frame is
  deterministic for screenshots and the poster.
- The live twist demo maps directly: judge reads a twist card, strip
  recomputes, badge downgrades with a lightning flash, banner flips to red,
  gauge needle sweeps down. That sequence is the 120 second video spine.

### Citations for this section (230 to 250)

230. Wikipedia, Meteogram: https://en.wikipedia.org/wiki/Meteogram
231. meteoblue, Meteograms help page: https://content.meteoblue.com/en/private-customers/website-help/forecast/meteograms
232. Environment Canada, colour coded weather alerts (yellow, orange, red): https://www.canada.ca/en/environment-climate-change/news/2025/11/colour-coded-weather-alerts.html
233. NOAA National Weather Service, hazards map color table: https://www.weather.gov/help-map
234. Okabe and Ito palette hex reference (figcanvas): https://figcanvas.com/blog/okabe-ito-palette-hex-rgb-wong-prism
235. Niederer and others, Accessible Color Sequences for Data Visualization, arXiv: https://arxiv.org/pdf/2107.02270
236. Apple Developer, Behind the Design: Carrot Weather: https://developer.apple.com/news?id=kf623ldf
237. amCharts, free animated SVG weather icons (CC BY, CSS only): https://www.amcharts.com/free-animated-svg-weather-icons
238. Meteopolis pixel art weather app guide: https://meteopolis.app/guides/pixel-art-weather-app
239. Interface in Game, Stardew Valley interface screenshots: https://interfaceingame.com/games/stardew-valley
240. Medium, Elevating the gaming experience, a fresh take on Stardew Valley UI: https://medium.com/@n01578837/elevating-the-gaming-experience-a-fresh-take-on-stardewvalleys-ui-ux-91502b82215d
241. Design Delve, The Anatomy of Stardew Valley (calendar drip feeds goals): https://www.youtube.com/watch?v=A_gvgYCE7DY
242. Terraria Wiki, Crafting 101 (HUD slots and tooltips): https://terraria.wiki.gg/wiki/Guide:Crafting_101
243. AudioEye, colorblind friendly palettes (Okabe-Ito, contrast guidance): https://www.audioeye.com/post/colorblind-friendly-palettes
244. Samuel Lawrentz, Rendering millions of points in the browser: https://samuellawrentz.com/blog/rendering-millions-of-points-in-the-browser
245. yWorks, SVG, Canvas, WebGL visualization options: https://www.yworks.com/blog/svg-canvas-webgl
246. Boris Smus, Performance of canvas versus SVG: https://smus.com/canvas-vs-svg-performance
247. ApexCharts, SVG vs Canvas charts comparison and benchmark: https://apexcharts.com/blog/svg-vs-canvas-charts
248. Source True, JavaScript vs WebAssembly performance for Canvas particle system: https://medium.com/source-true/javascript-vs-webassembly-performance-for-canvas-particle-system-4c4a526145d8
249. Desarrollolibre, Creating particles with JavaScript and Canvas: https://www.desarrollolibre.net/blog/javascript/creating-particles-with-javascript-and-canvas
250. Canvas Particles homepage, renderer optimization notes: https://canvasparticleshomepage.onrender.com

Reused prior citations: 101 github-farm, 102 BetterFly, 103 Stardew Valley
Dashboard usability study.

### Verification checklist (this section)

- [x] Findings from reputable sources (Wikipedia, Environment Canada, NOAA,
      Apple Developer, peer reviewed arXiv, established perf writeups)
- [x] Equations correctly transcribed (runway read from shocks.py, motion
      formulas are declared design tunables, not claims)
- [x] Validation data includes uncertainty (particle and SVG thresholds
      flagged as device or lab dependent; usability study is one sample)
- [x] Practical implications actionable (MVP hour budget, cut order, mount
      point, parity rule)
- [x] All sources cited (230 to 250, no duplicates of 1 to 229)
- [x] Research supports architecture decisions (SVG plus optional Canvas,
      Three.js rejected, station as identity layer under pivot rules)
- [ ] Effort estimates are solo developer guesses without a prototype;
      flagged, reestimate after the state function and badge land
- [ ] Shock data path depends on what the engine emits per scenario; open
      question raised to the orchestrator with a precomputed JSON default

## 2026-11-07: Gemini API natural language shock input (feasibility)

Research date: 2026-11-07. Scope: whether a judge typed sentence can be
mapped to structured shock parameters that feed the E3 shock engine and the
judge runway formula, called live from the static site. Runtime network calls
are allowed for this one feature (user decision, Nov 07), preset twist cards
stay as the fallback. Citations 251 to 268 do not repeat 1 to 250.

### Key findings

| Finding | Source | Confidence | Application |
|---------|--------|------------|-------------|
| Best Use of Gemini API is a live prize category on the Sheridan Datathon 2026 MLH event page (25 categories), prize MLH Swag Kits, description names the Gemini API | MLH event page 255, 256 | High (fetched today) | Fifth prize lane is real; the track text says Gemini API, so a Google AI claim without the Gemini API is risky |
| Free tier on 2026-11-07 covers gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite (input and output free of charge); gemini-4-argon and gemini-3.1-pro-preview are paid only | Google pricing docs 251 | High (official page) | Pick a Flash or Flash-Lite model; Pro and Argon are off the table on free |
| gemini-2.5-flash is deprecated and routes to gemini-3.5-flash-lite from 2026-12-01; gemini-2.0-flash is shut down | Google models docs 253 | High | Do not use 2.5 or 2.0 strings in old snippets |
| Google no longer publishes per-model RPM and RPD tables; limits are per project, RPD resets midnight Pacific, view them in the AI Studio rate limit page | Google rate limits docs 252 | High (official) | Quota must be read Saturday morning in AI Studio, not from a blog |
| Aggregators report about 10 RPM and 1,500 RPD for Flash models on free; a forum thread reports Flash cut to 20 RPD in January 2026 | 264 (aggregators), 265 (forum) | Low to medium (conflicting) | Budget under 60 calls for the whole weekend and add a client side request counter |
| Structured outputs: responseMimeType application/json plus responseSchema guarantees syntactically valid JSON matching a supported JSON Schema subset; supported on 3.5-flash-lite, 3.6-flash, 3.8-flash | Google structured output docs 254, Firebase docs 267 | High (official) | One strict object per parse, no free text parsing |
| minimum and maximum are supported for number and integer (constrained decoding) but grow the grammar state space; minLength, maxLength, minProperties, maxProperties, uniqueItems, contains are stripped and ignored; minItems and maxItems are enforced | Google structured output docs 254 | High (official) | Bound numeric fields in schema, still clamp in app code (Google's own best practice says validate values) |
| Google's documented best practice: output is syntactically correct JSON but values still need application validation and error handling for semantically wrong answers | Google structured output docs 254 | High | Confirmation chips and clamping are mandatory, not optional polish |
| Raw fetch to generativelanguage.googleapis.com works from a browser; the newer Interactions API JS client sends an Api-Revision header that fails the CORS preflight with 403 and no Access-Control-Allow-Origin | GitHub issue 259 (closed 2026-07-28), forum 260 | Medium to high (two independent reports) | Use plain fetch to v1beta/models/...:generateContent, no SDK dependency |
| Since 2026-06-19 the Gemini API rejects unrestricted API keys; keys made in AI Studio are restricted to the Gemini API by default; HTTP referrer application restrictions exist | Reddit 257, forum 258 | Medium to high | Throwaway key, API restricted, referrer restricted, delete after Sunday |
| Referrer restrictions are spoofable (a client can omit or forge Referer) and a free tier key carries no billing, so worst case is quota burn and prompt exposure, not money | 258 plus Google key docs | Medium | Honest write-up wording: mitigation, not a guarantee; no customer data in the prompt |
| Measured latency: gemini-3.5-flash-lite median time to first text 0.625 s and full completion 0.683 s with store false, versus 3.34 s and 4.99 s with store true (2026-10-06, 20 prompts) | Forum 261 | Medium (single measured sample) | Set store false, expect about 1 s, hard timeout 3 s |
| gemini-3.8 Flash time to first token reported at 10 to 25 s at high thinking effort (2026-10-10); gemini-3 Flash first token 0.5 to 0.91 s | 262, 263 | Medium (third party trackers) | Prefer gemini-3.5-flash-lite or gemini-3.6-flash with minimal thinking for extraction |
| Free tier terms allow Google to use content to improve products; paid tier does not | Google pricing docs 251 | High | Send only the twist sentence plus unit free numbers, never account ids or dollar values |
| The E3 shock engine (presets, sliders, twist card mode) does not exist in src yet; scripts/engine/shocks.py is the only runway implementation today | repo scan | High (code) | Gemini input must land in one shared ShockSpec type that E3 defines |

### Relevant equations for this section

| Equation | Description | Variables |
|----------|-------------|-----------|
| income_after = incomeFactor x I | parsed EI or job loss maps to the challenge rule income = 0.55 x I | incomeFactor in 0..1 from the model, I from profiles.json |
| spending_after = S + billsPct x H | parsed bills or rent shock, exactly the challenge rule for a 15 percent bills rise | billsPct in 0..1, H household bills cents |
| one_off_costs = oneOffMonths x S | parsed one off cost expressed in months of typical spending, matches the furnace example | oneOffMonths in 0..12, S spending cents |
| buffer_left = B - one_off_costs; gap = spending_after - income_after | unchanged judge branch order from scripts/engine/shocks.py | B, S, H, I from profiles.json |
| deci = min(1200, (20 x buffer_left + gap) // (2 x gap)) | integer tenths, must be produced by the single TS twin, never by the model | all integer cents |
| clamp(x, lo, hi) applied after schema parse | percent detection: if 1 < x <= 100 divide by 100 and flag auto corrected | every numeric field |

### Validation data for this section

| Benchmark | Value | Source | Uncertainty |
|-----------|-------|--------|-------------|
| Structured output syntactic guarantee | valid JSON matching the schema subset | Google docs 254 | semantic values still wrong sometimes, validate in app |
| Free tier Flash quota | about 10 RPM and 1,500 RPD, one report of 20 RPD | 264, 265 | conflicting, read AI Studio |
| 3.5 Flash-Lite round trip | 0.683 s full completion, store false | forum 261 | single measured sample, 10 requests |
| 3.5 Flash-Lite with store true | 4.99 s full completion | forum 261 | same sample |
| 3.8 Flash TTFT at high effort | 10 to 25 s | 262 | third party, effort dependent |
| Gemini 3 Flash first token | 0.5 to 0.91 s | 263, 268 | tracker dependent |
| MLH category for this event | Best Use of Gemini API, MLH Swag Kits | 255, 256 | category badge window reads Q1 2025 to Q1 2026, recheck Devpost at draft |
| CORS behavior | raw fetch works, SDK Api-Revision preflight 403 | 259, 260 | two independent reports, smoke test on the Pages origin |

### Practical implications

- Build one ShockSpec type in src/lib owned by E3, and let both preset cards
  and the Gemini parser produce it. The model never touches the runway math.
- Use plain fetch, no SDK, no new dependency: keeps the lockfile, CI, and
  CORS behavior identical to today.
- Confirm before apply: show parsed chips with steppers, show the formula
  strip (income and spending arithmetic) before the runway number.
- Timeout 3 s then automatic preset fallback with a visible mode badge.
- Free tier quota check Saturday morning in AI Studio, plus a client side
  counter and a text hash cache so repeated twists cost zero requests.
- Claim the Gemini track only if a live call works on the deployed Pages
  origin before the Devpost draft; otherwise uncheck the track.

### Citations for this section (251 to 268)

251. Google AI for Developers, Gemini Developer API pricing: https://ai.google.dev/gemini-api/docs/pricing (fetched 2026-11-07)
252. Google AI for Developers, Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits (fetched 2026-11-07)
253. Google AI for Developers, Models: https://ai.google.dev/gemini-api/docs/models (fetched 2026-11-07)
254. Google AI for Developers, Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output (fetched 2026-11-07)
255. MLH, Sheridan Datathon 2026 prize categories: https://www.mlh.com/events/sheridan-datathon-2026 (fetched 2026-11-07)
256. MLH, Best Use of Gemini API category: https://www.mlh.com/events/sheridan-datathon-2026/challenges/01953de4-ee8b-0807-88b1-86bb6abbf410 (fetched 2026-11-07)
257. r/googlecloud, Gemini API stops accepting unrestricted keys from 2026-06-19: https://www.reddit.com/r/googlecloud/comments/1ucq5tv/
258. Google AI Developers Forum, securing your Gemini API key (referrer and API restrictions): https://discuss.ai.google.dev/t/securing-your-gemini-api-key-is-crucial/106912
259. GitHub allenhutchison/obsidian-gemini issue 1023, Api-Revision header fails browser CORS preflight: https://github.com/allenhutchison/obsidian-gemini/issues/1023 (closed 2026-07-28)
260. Google AI Developers Forum, Interactions API browser 403 while raw fetch works: https://discuss.ai.google.dev/t/interactions-api-javascript-sdk-403-error-when-running-in-browser-but-raw-fetch-request-works/ (2026-07-11)
261. Google AI Developers Forum, latency increase with store true (measured 2026-10-06): https://discuss.ai.google.dev/t/gemini-api-latency-has-recently-increased-significantly-especially-with-store-true/187106
262. IntuitionLabs, Gemini 3.8 Flash accuracy and latency review (2026-10-10): https://intuitionlabs.ai/articles/gemini-3-8-flash-research-tasks-review
263. benchlm.ai, Gemini 3 Flash speed (first token 0.91 s): https://benchlm.ai/models/gemini-3-flash
264. Aggregator free tier guides (pecollective, cometapi, metacto): about 10 RPM and 1,500 RPD for Flash models, Pro free tier removed 2026-04-01
265. Google AI Developers Forum, free tier Flash cut to 20 RPD (2026-01): https://discuss.ai.google.dev/t/do-they-really-think-we-wouldnt-notice-a-92-free-tier-quota/111262
266. Truffle Security research on exposed Google API keys gaining Gemini access (2026-02-25), reported at https://nhimg.org/google-api-keys-exposure-gemini-ai-turns-public-keys-into-data-leak-risk
267. Firebase AI Logic, generate structured output (supported model list): https://firebase.google.com/docs/ai-logic/generate-structured-output
268. Google blog, introducing Gemini 3 Flash: https://blog.google/products-and-platforms/products/gemini/gemini-3-flash

### Verification checklist (this section)

- [x] Findings from reputable sources (Google AI docs fetched today, MLH event page fetched today)
- [x] Equations correctly transcribed (runway branches copied from scripts/engine/shocks.py)
- [x] Validation data includes uncertainty (quota figures conflict and are flagged low confidence)
- [x] Practical implications actionable (schema, timeout, fallback, quota check, track gate)
- [x] All sources cited (251 to 268)
- [x] Research supports architecture decisions (raw fetch, ShockSpec boundary, confirm before apply)
- [ ] Free tier quota for the exact model must be read in AI Studio on Saturday morning
- [ ] Browser CORS smoke test on the deployed Pages origin still to be run by the implementer
- [ ] Effort estimate is a solo developer guess; reestimate once E3 ShockSpec exists
