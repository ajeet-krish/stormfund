# Entire Rehearsal: Friday Dress Rehearsal Notes

Date: Fri Nov 06 2026. Clock start 21:33:02 EST, clock end 21:43:23 EST.
Total elapsed: 10 minutes 21 seconds. Hard timebox: 60 minutes.

Purpose: prove the Entire toolchain end to end in this sandbox repo before
Saturday's fresh repo is created with Entire enabled before its first commit.
Sessions cannot be imported retroactively, so today only proves the toolchain
works and produces carry-over templates. Decision 5 in docs/decisions.md gates
GO on this rehearsal.

## Environment

| Item | Value |
|------|-------|
| Entire CLI | `Entire CLI 0.13.1` (go1.27.3, darwin/arm64), brew cask `entireio/tap/entire` |
| Graph plugin | `entire-graph v0.6.0` (installed during this rehearsal from github.com/entireio/entire-graph) |
| Repo detected by Entire | `gh/ajeet-krish/ledger-odyssey` (auto from origin) |
| Auth at start and at end | `entire auth status`: Not logged in |
| Docs access | `https://docs.entire.io/*` blocked in this sandbox (webfetch permission denied). Authoritative source used instead: `entire agent-help` and per-command `--help`. |
| Tree at start | clean at 808377b |
| Tree at end | one committed rehearsal commit `2e3671e` plus uncommitted `docs/entire-rehearsal.md` update and untracked `evidence/` (see Follow-up note) |

## Pass/Fail and Timings

| # | Step | Exact command | Result | Clock (EST) |
|---|------|---------------|--------|-------------|
| 1 | Learn command surface | `entire --version`; `entire --help`; `entire agent-help`; `entire session --help`; `entire trail --help`; `entire checkpoint --help`; `entire tokens --help` | PASS. Gate command is `entire session tokens`. `entire tokens profile --json` exists. `entire graph` requires `entire plugin install graph`. `entire login` supports browser redirect and `--device`. | 21:33:02 to 21:33:30 (28 s) |
| 2 | Enable in repo | `entire enable -y --agent opencode` | PASS, rc 0. No auth prompt. Created `.entire/settings.json`, `.entire/.gitignore`, `.opencode/plugin/entire.ts`, and 5 git hooks under `.git/hooks/`. | 21:33:43 to 21:33:44 (1 s) |
| 3 | Honest commit plus checkpoint | `git add docs/entire-rehearsal.md .entire/settings.json .entire/.gitignore .opencode/plugin/entire.ts`; `git commit -m "chore: entire rehearsal checkpoint"`; then `entire checkpoint explain HEAD` | PASS with remediation. Commit created `272e08f` at 21:36:29, no prompt shown. First `explain HEAD` FAILED: `no Entire-Checkpoint trailer / the commit exists but was not created during an Entire session`. Remediation used the documented recovery command `entire session attach ses_e4c2111d3ffem1Fh06rbUHwZSw --agent opencode --force`, which rewrote the unpushed commit (content unchanged, trailer added) to `2e3671e` and created checkpoint `01M6SXZZ5DV6Z1TTZB29QA2H6H` (1 turn, 31.2k tokens). Second `explain HEAD` rc 0, full output below. | 21:35:44 to 21:39:24 (3 m 40 s) |
| 4 | GATE token accounting | first: `entire session tokens`; retry: fresh tool-using turn `opencode run "Use a shell tool to count the files in the docs directory..."` then `entire session tokens` | PASS, rc 0. First attempt: `No active session found in this worktree.` (this session predates the plugin install). Fresh turn ran 8 s and produced session `ses_e4c2111d3ffem1Fh06rbUHwZSw`. Gate output: `Total: 31.2k tokens, Input 29.1k, Cache read 2k, Cache write 0, Output 31, API calls 2`. Nonzero, resolved by process ancestry. | 21:37:40 to 21:38:33 (53 s) |
| 5 | Graph agent guide | `entire graph init-agents` then `entire plugin install graph` then `entire graph agent-guide` | PASS with note. `init-agents` is folded away: `init-agents was folded into "setup"; run "entire graph setup" (same flags)`. `entire graph setup` was NOT run here because it writes AGENTS.md/CLAUDE.md and AGENTS.md is out of scope for this rehearsal. Read-only equivalent `entire graph agent-guide` captured 63 lines to `evidence/graph-agent-guide-template.md`, rc 0. Plugin install took 15 s. Bonus: `entire graph health` rc 0, `Graph health: ok`, 71 source files, index built in 1204 ms. | 21:39:34 to 21:40:20 (46 s) |
| 6 | Trail create | `entire trail create --title "rehearsal: verify trail creation"` | BLOCKED on interactive login, rc 1. Exact output: `Not logged in. Run 'entire login' to authenticate.` No branch was created, no push attempted, `git branch --show-current` still `main`, origin untouched. | 21:41:04 to 21:41:05 (1 s) |
| 7 | Tokens profile template | `entire tokens profile --json > evidence/tokens-profile-template.json` | PASS, rc 0, valid JSON. `checkpoints_analyzed: 1`, `checkpoints_with_token_data: 1`, `tokens.total: 31220`. | 21:40:20 to 21:40:35 (15 s) |

Note on order: step 7 was executed at 21:40:20, just before step 6 at
21:41:04, so the tool ran in the order 1, 2, 3, 4, 5, 7, 6. Every step's
clock above is the actual clock.

## Gate Result (step 4) detail

Command: `entire session tokens` (rc 0, 21:38:33)

```
Session tokens

Session: ses_e4c2111d3ffem1Fh06rbUHwZSw
Resolved: your own session, matched by process ancestry
Agent:   OpenCode
Model:   mimo-v2.6-flash
Status:  idle

Token usage
Total:  31.2k tokens
  Input: 29.1k | Cache read: 2k | Cache write: 0 | Output: 31 | API calls: 2
```

Verdict: GATE GREEN. Nonzero token numbers for an OpenCode session in this
repo. One retry was needed because this working session started before
`entire enable` ran, so its hooks were never loaded. Any OpenCode session
started after enable tracks normally.

## Checkpoint explain capture (step 3)

`entire checkpoint explain HEAD` (rc 0, after attach):

```
● Checkpoint 01M6SXZZ5DV6Z1TTZB29QA2H6H
  session  ses_e4c2111d3ffem1Fh06rbUHwZSw
  created  2026-11-07 02:39:24
  author   ajeet-krish <ajeetkrish@icloud.com>
  tokens   31.2k
  redacted 0 replacements in this session so far
  commits  2e3671e chore: entire rehearsal checkpoint
────────────────────────────────────────────────────────────
## Intent

"Use a shell tool to count the files in the docs directory of your current rep...

## Summary

*Not generated yet. Run 'entire checkpoint explain --generate 01M6SXZZ5DV6Z1TTZB29QA2H6H' to create an AI summary.*

── Transcript (checkpoint scope) ───────────────────────────
[User] "Use a shell tool to count the files in the docs directory of the current repo, then reply with only that number."

[Tool] bash: find docs -type f | wc -l

[Assistant] 11
```

## What Step 2 Created (inspect notes)

| Path | Size | Commit? | Purpose |
|------|------|---------|---------|
| `.entire/settings.json` | 94 B | yes | `enabled: true`, `checkpoints.primary.type: git-refs` |
| `.entire/.gitignore` | 58 B | yes | ignores `tmp/`, `settings.local.json`, `metadata/`, `logs/`, `redactors/local/` |
| `.opencode/plugin/entire.ts` | 51 KB | yes | OpenCode plugin, one file serving both OpenCode 1 and OpenCode 2 loaders |
| `.git/hooks/{commit-msg,post-commit,post-rewrite,pre-push,prepare-commit-msg}` | small | no, local only | installed by enable; never commit hook files by hand |
| `.entire/logs/` | runtime | no, gitignored | created at first command run |

Enable output summary: "Checkpoints will be uploaded when you push to
origin." Config knobs offered by the tool: `entire configure --local
--skip-push-sessions` (stop uploads), `entire configure --checkpoint-push-policy
manual` (cherry pick), `entire configure --local --checkpoint-remote
github:<owner>/<repo>` (separate private checkpoint repo). `entire status`
confirms: `Checkpoints sync to: origin`.

### Exclusion list for Saturday's import whitelist

Do NOT copy from this sandbox into the fresh repo:

- `.entire/metadata/`, `.entire/logs/`, `.entire/tmp/`, `.entire/settings.local.json`, `.entire/redactors/local/` (session state, gitignored here, not portable)
- `.git/hooks/*` installed by Entire (recreate with `entire enable`)
- any checkpoint or session state beyond `.entire/settings.json` and `.entire/.gitignore`

Do carry over as templates: `.entire/settings.json`, `.entire/.gitignore`,
`.opencode/plugin/entire.ts`, this doc, `evidence/`.

## Evidence produced today

| File | What it is |
|------|------------|
| `evidence/tokens-profile-template.json` | `entire tokens profile --json` sample, 974 B, schema reference for tomorrow's two profiles |
| `evidence/graph-agent-guide-template.md` | 63-line Graph operating guide that `entire graph setup` installs into AGENTS.md tomorrow |
| `docs/entire-rehearsal.md` | this file, pass/fail record and runbook |

## Carry-over checklist for the new repo

1. Copy templates in: `docs/entire-rehearsal.md`, `evidence/tokens-profile-template.json`, `evidence/graph-agent-guide-template.md`.
2. Copy plumbing per decision 5 whitelist: `scripts/`, `src/`, `docs/`, configs, workflows. Do not copy `.entire` session state or `.git/hooks`.
3. Apply the exclusion list above.
4. Do not copy `node_modules/`, `.venv/`, `build/`, `.venv` equivalents (already ignored).

## GO/NO-GO recommendation

**GO**, conditional on one interactive step the operator must do.

| Decision 5 condition | Status |
|----------------------|--------|
| Setup under 45 minutes | MET. Enable 1 s, graph plugin install 15 s, graph health 2 s, tokens profile 15 s. Total rehearsal 10 m 21 s including doc writing and a 53 s gate retry. A cold Saturday setup with login and import should land well under 15 minutes of Entire-specific work. |
| Token gate green | MET. `entire session tokens` rc 0, 31.2k tokens, nonzero input/cache/output/API calls. |
| No origin replacement | MET. `entire status` says checkpoints sync to origin (overlay, not a replacement). Trail create failed before any git action, so no remote change occurred. `git remote -v` is unchanged: only `origin` (private GitHub). No Entire remote was added. |
| Trail creation | NOT PROVEN today, blocked by `entire login` (rc 1). This is the one open risk. The command's own help text says it publishes the current local branch or derives a new branch from the title, and with `--no-branch` creates intent only. It does not reconfigure remotes. |

Residual risk to close first thing Saturday: `entire login` and one
`entire trail create`. Budget 5 minutes for login plus trail, inside the
45 minute timebox. If trail creation after login demands a GitHub app
install or an Entire remote that is not `origin`, abort the Entire track per
decision 5 and keep Sessions plus Graph, which both already work locally
without login.

## Saturday operator order (exact)

1. `entire login` (interactive, browser redirect; use `entire login --device` if no browser opens). Confirm with `entire auth status`.
2. Create the fresh repo and set `origin` to the new private GitHub remote. Never reconfigure `origin` afterwards.
3. Before the first commit: `entire enable -y --agent opencode`.
4. Commit the enable files: `.entire/settings.json`, `.entire/.gitignore`, `.opencode/plugin/entire.ts`.
5. `entire plugin install graph` then `entire graph setup` (this writes the Graph guide into AGENTS.md, which is allowed in the new repo).
6. Import the whitelisted plumbing (decision 5) with the exclusion list above applied. Fix the base path in the same commit as the import.
7. `entire doctor` and `entire status` to confirm hooks and checkpoint sync target.
8. Start the OpenCode session and make one tool-using turn, then `entire session tokens`. This is the gate, expect nonzero numbers. If it says `No active session found`, the session predates enable: run `entire session attach <session-id> --agent opencode` (shows a plan, then `--force` after you agree).
9. `entire tokens profile --json > evidence/tokens-profile-1.json`, repeat later for profile x2.
10. `entire graph stats` for graph evidence, plus `entire graph health`.
11. `entire trail create --title "<honest trail title>"`. Confirm it creates a new branch or intent only, and that `git remote -v` still shows only `origin`. If it demands a GitHub app install or a non-origin remote, stop and report.
12. Token A/B (decision 5 evidence): same small task with and without Graph, capture both `entire session tokens` outputs.
13. Review checkpoint content before any push: `entire checkpoint explain HEAD`. Checkpoints carry agent transcripts and are pushed on `git push`. `entire configure --local --skip-push-sessions` if that is not wanted.

## Follow-up note

The step 3 commit `2e3671e` is the only commit made by this rehearsal, as
authorized. The final version of this file plus the two `evidence/` files
were produced after that commit and are currently uncommitted, because no
second commit was authorized. The orchestrator should either fold them into
the step 3 commit with an amend (note: attach links the checkpoint to the
current sha, so re-run `entire checkpoint explain HEAD` and re-attach with
`entire session attach ses_e4c2111d3ffem1Fh06rbUHwZSw --agent opencode --force`
if the link breaks) or authorize one follow-up commit.

## Lessons for other agents

- `entire enable` does not retroactively track the session that ran it. Session state starts at the next OpenCode session.
- `entire graph init-agents` no longer exists; `entire graph setup` is the writer and `entire graph agent-guide` is the read-only preview.
- Login gates only control plane writes (trails, projects, repos). Local enable, checkpoints, session tokens, tokens profile, and the whole graph plugin work logged out.
- `entire agent-help <command>` is the machine-readable source of truth for flags when docs.entire.io is unreachable.
