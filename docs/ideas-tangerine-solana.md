# Tangerine x Solana bridge concepts: assessment

Date: Nov 07 2026
Status: approved outcome at top; one gated micro-addition approved, every other concept rejected (verdict table below).

## Approved outcome (top)

Approved: one gated package attached to the existing Solana memo anchor. Three receipts (findings.json root memo, model_card.json hash, F1 aggregate fingerprint), a static chain-receipt panel in section E reading bundled evidence, and one explicitly labeled not-built future-work paragraph in the write-up. Gate conditions, acceptance bar, and the rejection rationale are in the sections below. Execution lives in docs/competition-day-runbook.md Phase 6 (receipts and panel) and Phase 9 (paragraph); the decision record is docs/decisions.md, Nov 07 2026.

Everything else from the concept round is rejected. No wallet UI, no Anchor, no tokens, no 3D, no runtime RPC.

## Context

External advice proposed bridging Tangerine banking data with Solana via behavioral credit scoring, yield streaming, dual-layer dashboards, and a risk-shield particle field. Two independent assessments (planner plus product manager) adjudicated them against the locked plan (docs/decisions.md, Nov 06 LOCKED: memo anchor only, hard stop Sat 5:30 PM).

## Concept verdict table

| Concept | Source | Verdict | Cost / scope | Reason |
|---------|--------|---------|--------------|--------|
| SolCash credit line | external | REJECTED | 8 to 14 hours, Anchor | violates the locked program, token, wallet, and oracle scopes; Data Use self-own since F3 AUC 0.590 contradicts credit gating; optics at bank sponsor event |
| Yield streamer | external | REJECTED | 6 to 12 hours, Anchor | runtime scheduler breaks offline booth; nonexistent yield |
| Dual-layer dashboard, live version | external | REJECTED | wallet UI plus runtime RPC | both are scope violations; runtime RPC dies offline |
| Dual-layer static receipt panel | external | ACCEPTED (micro-addition) | reads bundled JSON only | honest static proof surface, zero runtime calls |
| Risk-shield particle field | external | REJECTED | 3D cancelled; second hero viz | liquidation theater implies mechanisms that do not run |
| Fake-oracle framing | external | REJECTED | deceptive framing | the devnet-only half already shipped as the memo anchor |
| Per-finding attestation set G | planner addition | ACCEPTED (gated) | inside the 60 minute cap | receipts over new mechanisms |
| F1 fingerprint proof K | planner addition | ACCEPTED (gated) | inside the 60 minute cap | aggregates only, no raw rows |
| Payday schedule commitment H | planner addition | not accepted today | not part of the gated package | no gate conditions prepared |
| Escrow pledge I | planner addition | not accepted today (memo version); Anchor version = future work | Anchor is out of scope today | post-event weekend project, see Future work |
| Resilience reputation J | planner addition | REJECTED | identity and oracle implications | breaks the no identity, no oracle scope locks |
| Streaks/duels L | planner addition | REJECTED | game layer mechanic | rejected at assessment; not part of the gated package |

## Key insight

The instinct behind the concepts is already the shipped memo anchor: put a durable, checkable claim next to the analysis. The heavier versions are the same plan at 10x risk and hours. The gated package keeps the instinct and drops the weight.

## Approved gated package (exact conditions)

Conditions, all required, identical across docs/competition-day-runbook.md Phase 6 and docs/decisions.md:

1. Root memo confirmed by the 4:30 PM decision line (5:30 PM death line, unchanged).
2. Findings re-run verified green first (Phase 4: verify_findings and pytest exit 0).
3. 60 minute cap on the whole gated package.
4. Paid from cut-order items: devnet stone (cut 2) and motion accents (cut 3), never from new budget.
5. Gate failure at any point: ship the single memo, skip silently (no panel, no paragraph).

Deliverables, all inside the cap:

1. Three receipts, all sent with `scripts/solana/send_memo.py --file`, evidence as sibling files under `scripts/solana/evidence/` and bundled under `public/data/`:
   - findings.json root memo: `memo-devnet.json` (already run; this receipt is the gate).
   - model_card.json hash: `memo-devnet-modelcard.json`.
   - F1 aggregate fingerprint: SHA256 over the published F1 aggregate table (`f1StructuralVsDiscretionary` in findings.json), with the note "aggregates only, no raw rows" in the memo prefix: `memo-devnet-fingerprint.json`.
2. Static chain-receipt panel in section E reading the bundled `public/data/memo-devnet.json` plus the two new evidence files (`public/data/memo-devnet-modelcard.json`, `public/data/memo-devnet-fingerprint.json`). No runtime RPC, no network calls.
3. One explicitly-labeled-not-built future-work paragraph in the write-up (Phase 9), exact sentence:

   > future work: a behavioral score attested on chain could gate a credit line or automate surplus sweeps; not implemented, and the underlying model (F3, AUC 0.590) is not strong enough to gate credit

## Acceptance bar (nine checks, from the assessment)

- [ ] ships by 4:30 PM
- [ ] zero new runtime network calls
- [ ] zero scope violations (no wallet UI, no Anchor, no tokens, no 3D, no runtime RPC)
- [ ] consumes only bundled artifacts
- [ ] every number matches findings.json
- [ ] deception test (no product language for mechanisms that do not run, simulated labeled on surface)
- [ ] single-story test
- [ ] cut-first rule
- [ ] zero video budget impact

## Rejection rationale (booth Q&A one-liner)

> we anchored the findings themselves on chain because that is the claim that needed the chain; everything else stayed on the honest side of the line.

## Future work (post-event weekend projects)

- SolCash credit line: behavioral score gating a credit line (Anchor program, wallet UI). Blocked today by scope locks and by F3 (AUC 0.590) not being strong enough to gate credit.
- Yield streamer: needs a runtime scheduler and an on chain yield source; breaks the offline booth and there is no real yield to stream.
- Escrow pledge, Anchor version: the memo version was not accepted today; the program version is a weekend build after the event.
