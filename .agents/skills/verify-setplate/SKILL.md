---
name: verify-setplate
description: Verify SET&PLATE, a React 19 web UI backed by FastAPI on a shared Supabase project, by launching or attaching to the dev servers, logging in, and driving the real app with the bundled Chrome DevTools harness. Use when asked to verify a change, reproduce a UI bug, capture before/after proof of a user journey such as Settings or Health Connect, or to run the verification harness and leave the repository clean.
---

# Verify SET&PLATE

SET&PLATE is a mobile-first React 19 + Vite web app. The FastAPI backend runs from `backend/` and talks to a shared remote Supabase project and Groq.

## Hard limits

- The database is shared and remote. There is no local data directory to reset. The proof journey is read-only and must not write to another user's account.
- Groq calls cost tokens and are disabled for routine work. Never open `/` with an account that has no plan for today, and never press the AI button in an active workout. The driver logs in and full-navigates to the exercise picker specifically to cancel the login redirect before Home mounts and calls `POST /api/v1/workouts/plan-today`. A one-off driver must land on a non-Home route after login for the same reason.
- The Settings Health Connect card is a write surface on the verification account: connecting changes that account's stored status. Put the account back to how you found it (disconnect, or reconnect as recorded), and record that in `result.json`.
- Credentials come from `.env.verify` at the repo root (gitignored) or from `SETPLATE_VERIFY_EMAIL` and `SETPLATE_VERIFY_PASSWORD`. Create the file with those two keys and an existing account. Never print, commit, or screenshot them.
- Ports are fixed at 8000 and 5173. Vite proxies `/api` to `127.0.0.1:8000` and the default CORS origin is `http://localhost:5173`. Do not try to run a second instance on other ports. Attach to the healthy stack instead.
- Only the `proof` journey is automated. Settings, Health Connect, the Home activity card and everything else in `features/` are not. Name the journeys you did not drive instead of implying they are verified.

## Steps

Run from the repo root. Commands are PowerShell.

1. Pre-flight: read the tree so you can tell later what the harness did.

   ```powershell
   git status --short
   ```

   Note the edits that were already there. If `.agents/skills/verify-setplate/.run/mode` already shows as modified or deleted, restore it now with `git restore .agents/skills/verify-setplate/.run/mode`.

2. Launch the stack.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/launch.ps1
   ```

   Accept only JSON with `mode: "attached"` or `mode: "managed"` plus a healthy backend and the Vite page. On `Servers did not become ready within 60 seconds`, follow [When readiness times out](#when-readiness-times-out); never report success after a timeout.

3. Doctor.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/doctor.ps1
   ```

   Proceed only when it reports `"ok": true` with backend health and the Vite page reachable. `ok: false` because a port is not listening means start the missing server and rerun; it is not a reason to skip the UI proof.

4. Drive the journey.

   ```powershell
   node .agents/skills/verify-setplate/scripts/drive.mjs --scenario proof --out .agents/skills/verify-setplate/evidence/<run>
   ```

   For a journey with no scenario yet (Settings, Health Connect, the Home activity card), use [One-off page drive](#one-off-page-drive). Escalate both the dev server and the Chrome call as described in [Sandbox and elevation](#sandbox-and-elevation).

5. Read the evidence before believing it: `ok`, the `before`/`after` states, the 430x932 screenshots, `console.log` for uncaught errors, and `network.json` for the API responses the screen depends on.

6. Teardown.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/cleanup.ps1
   ```

7. Post-run hygiene: restore `.run/mode`, remove `chrome-profile-*` and any scratch `*.mjs`, then prove the ports are closed and `git status --short` shows only the intended edits. See [End-of-run check](#end-of-run-check).

## Sandbox and elevation

Two commands in this repo do not work under the default workspace sandbox, and both fail with a misleading symptom rather than a permission error:

| Command | Symptom under the default sandbox | What works |
| --- | --- | --- |
| Vite dev server (`npm run dev -- --host 127.0.0.1 --port 5173` in `frontend/`) | config loader spawn blocked with `EPERM`; `.run/frontend.err.log` fills up but nothing ever binds 5173 | rerun with `sandbox_permissions: danger-full-access`, justification naming the config-loader `EPERM` |
| Headless Chrome (`node .../drive.mjs` or a one-off script) | `Chrome exited early with code ...` before any CDP connection exists | rerun with `sandbox_permissions: danger-full-access` |

- Escalate per call, put the reason in the justification, and state in the final report which commands needed it. A sandbox-blocked run is not a passing verification.
- If escalation is rejected (a delegated subagent cannot widen its own scope), stop and report the exact command that needs `danger-full-access` instead of dropping the UI proof.

## Launch

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/launch.ps1
```

- Default mode is `auto`. It attaches when both ports already serve this app, otherwise it starts the backend with the repo virtualenv and Vite from `frontend/node_modules`, then records their PIDs in `.run/`.
- Ready means the command prints JSON with `mode: "attached"` or `mode: "managed"`, `http://127.0.0.1:8000/api/v1/health` returns `{"status":"ok"}`, and `http://localhost:5173` returns HTML containing `id="root"`.
- Logs live in `.agents/skills/verify-setplate/.run/`.
- If a port is held by a process that is not this app, launch fails instead of killing it. Report the owner.
- Teardown is `cleanup.ps1`. Managed mode stops only the PIDs launch recorded. Attached mode leaves the servers alone.

### When readiness times out

`launch.ps1` prints `Servers did not become ready within 60 seconds` and exits non-zero. That is a diagnosis point, not a verdict on the app:

```powershell
Get-Content .agents\skills\verify-setplate\.run\frontend.err.log -Raw
Get-Content .agents\skills\verify-setplate\.run\backend.err.log -Raw
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8000,5173 } | Select-Object LocalPort,OwningProcess
```

- `EPERM` or a spawn error in `frontend.err.log` means the sandbox blocked Vite, not that the app is broken: start Vite yourself with `danger-full-access` from `frontend/` (`npm run dev -- --host 127.0.0.1 --port 5173`, as a background job) and continue in attached mode.
- A missing listener on 8000 means the backend never started: run `..\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000` from `backend/` as a background job (the venv already exists at the repo root). Start only the server that is missing. `dart`/`uvicorn` line endings are not the problem; read the log.
- A non-zero log size that prints nothing with `Get-Content -Tail` still has content. Use `-Raw`.
- Re-check the listeners and rerun `doctor.ps1` before driving anything.

## Doctor

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/doctor.ps1
```

Run this first whenever anything looks off. It is read-only and checks Node 22 or newer (needed for the built-in WebSocket), Chrome or Edge, backend health, the Vite page, credentials, a real login through `POST /api/v1/users/login`, and whether Home is safe to drive (`has_plan_today` or `completed_workout_today`). It exits 1 on a required failure and never prints the password. The login user id is reported only as an 8-character prefix.

Running it before the servers are up is expected while bootstrapping: start the missing server, rerun, and only start driving when `ok` is `true`.

## Drive

```powershell
node .agents/skills/verify-setplate/scripts/drive.mjs --scenario proof --out .agents/skills/verify-setplate/evidence/<run>
```

`proof` does the following against the real app:

1. Opens `/login` at a 430x932 mobile viewport in headless Chrome.
2. Fills `#login-email` and `#login-password` and submits `form.login-form`.
3. Waits for `set_plate_user` in `localStorage`, then full-navigates to `/workouts/active/exercises` so the login timer never mounts Home.
4. Waits for the real exercise catalog, types `bench` into `input[aria-label="Search exercises"]`, and waits for the debounced request.
5. Compares the rendered `.exercise-picker-item` count and names with the `/api/v1/workouts/exercises?q=bench...` response body.
6. Writes screenshots, `result.json`, `console.log`, and `network.json` to the evidence directory.

Stable handles:

- Login: `#login-email`, `#login-password`, `form.login-form`.
- Exercise picker: `input[aria-label="Search exercises"]`, `.exercise-picker-item`, `.exercise-picker-item strong`, `.pagination-count`.
- Navigation: `nav[aria-label="Primary navigation"] button[aria-label="Home"|"Workouts"|"Nutrition"|"Settings"]`.
- Active workout: `button[aria-label="Ask AI for adjustments"]` (do not click), `button.finish-button`, `#completed-workout-name`.

Only `proof` is automated today. For the other journeys, follow the matching file in `features/` and add a scenario to `drive.mjs` ([Adding a scenario](#adding-a-scenario)) or drive a single page once with a scratch script ([One-off page drive](#one-off-page-drive)). Do not weaken a journey to make it pass, and do not edit `proof` to accommodate a new one.

To check a slow login, add `--login-latency 6000`. The driver applies that much CDP network latency around the login request, then resets it for the rest of the run. The login budget is 15 seconds (`LOGIN_TIMEOUT_MS`), so the run should still pass; the old 5-second budget failed.

## One-off page drive

Use this for a journey that has no scenario yet, when you need before/after proof for one page and do not want to ship a scenario as part of the change. The recorded Health Connect run used exactly this shape: `.agents/skills/verify-setplate/.run/settings-check.mjs` producing `ok: true` with the Settings before/after state.

- Write the script inside `.run/` so it is obviously scratch: `.agents/skills/verify-setplate/.run/<name>.mjs`.
- Reuse the driver internals instead of adding a dependency. `puppeteer`, `playwright`, `chrome-remote-interface` and `ws` are **not** installed in `frontend/node_modules`, and `drive.mjs` is dependency-free on Node 22+ (built-in `WebSocket`). Copy the `readDotEnv` helper and the `Cdp` class out of `scripts/drive.mjs` (585 lines; the CDP class begins near line 433) along with its Chrome launch and close block. Do not write a second CDP client.
- Keep the 430x932 viewport and the same screenshot helper `drive.mjs` uses, so the evidence matches the shipped runs.
- Log in with the documented handles, land on a non-Home route, then reach the target page through the real nav where you can.
- Run it with `danger-full-access` ([Sandbox and elevation](#sandbox-and-elevation)).
- Delete the script and its `chrome-profile-*` directory when the run is done.

Template — the TODO blocks are the only parts you author; everything else comes from `drive.mjs`:

```js
// .agents/skills/verify-setplate/.run/<journey>.mjs — scratch, never committed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// TODO: paste readDotEnv, the Cdp class and the Chrome launch/close block from
// ../scripts/drive.mjs. drive.mjs does not export them today: copy, do not import.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../..') // .run -> skill -> skills -> .agents -> repo
const out = resolve(repoRoot, process.argv[2] ?? '')
mkdirSync(out, { recursive: true })

const env = readDotEnv(join(repoRoot, '.env.verify'))

// TODO: launch Chrome exactly as drive.mjs does (fresh --user-data-dir under .run/),
// connect Cdp, open /login, fill #login-email / #login-password, submit form.login-form.
// TODO: full-navigate to a non-Home route, then click
// nav[aria-label="Primary navigation"] button[aria-label="Settings"] and wait for the card.
// TODO: screenshot before -> click Connect -> screenshot the permission/consent state
// -> screenshot the connected state, reading the card text between steps.
// TODO: write result.json LAST, after every assertion, and close Chrome.
```

Evidence shape to aim for — the same fields as `proof`, with the state re-read after each action:

```json
{
  "ok": true,
  "heading": "Health Connect",
  "before": { "heading": "Health Connect", "status": "Not connected", "connectVisible": true, "body": "..." },
  "after": { "status": "...", "body": "..." },
  "screenshots": ["01-disconnected.png", "02-permission.png", "03-connected.png"]
}
```

## Adding a scenario

A journey worth repeating belongs in `scripts/drive.mjs`, not in a scratch script.

1. Read `features/README.md` and the matching feature file for the journey and its evidence standard.
2. Add a scenario branch and register it in the argument parser; leave the existing `proof` branch untouched.
3. Reuse the stable handles: login `#login-email`, `#login-password`, `form.login-form`; navigation `nav[aria-label="Primary navigation"] button[aria-label="Settings"]` (or Home / Workouts / Nutrition). Reach Settings by clicking that nav button from a non-Home route — the same safe landing `proof` uses, `/workouts/active/exercises` — so Home never mounts. If that route is not reachable for the verification account, full-navigate to `/settings` instead and say so in the report.
4. Record an action screenshot and a resulting-state screenshot at 430x932, `network.json` when the page depends on an API response, plus the same `result.json` and `console.log` file set as `proof`.
5. Run `proof` and the new scenario back to back, so a regression in the shipped journey shows up.
6. Update the feature map entry for the journey so it stops being listed as not automated.

## Evidence

Each run writes to `evidence/<UTC timestamp>/`:

- `result.json`: assertions, counts, masked account, errors, artifact list.
- `01-before-search.png` and `02-search-bench.png`: the action and the resulting state at 430x932.
- `console.log`: runtime errors and exceptions.
- `network.json`: the real exercise API responses used for the comparison.

Proof standards:

- Drive the real UI and the real backend. No route interception, no test-only endpoints, no `localStorage` injection or direct database reads to fake a result.
- Capture the action and the resulting state, not just the final screen. For a card that changes state, capture each state the user sees (disconnected, permission, connected).
- Verify side effects alongside what is visible. The proof is read-only; any write journey in the feature map must record the created row and delete it through the app. A Health Connect connect must be undone before teardown.
- Mocks are acceptable only where production already isolates an external system. In this app, never mock Groq by calling it: skip the AI path and say so.
- Evidence survives cleanup. Keep the evidence directory out of the final `git status`: check `git check-ignore -v <evidence-dir>` and, if the tree reports it, place the evidence outside the repo rather than deleting proof.

## Cleanup

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/cleanup.ps1
```

- Managed mode stops only the recorded PIDs after confirming their command line still matches, then removes `.run/`.
- Attached mode leaves the user's servers running.
- Chrome is closed by the driver with `Browser.close`, with a PID-scoped `taskkill /T` fallback.
- Cleanup removes stale Chrome profiles but never evidence and never the verification account.
- If a journey created a meal or workout, delete it through the app API or UI before cleanup and record the deletion in `result.json`.

### The working tree must come back clean

A run can leave state in the repo even when every assertion passed:

- `.agents/skills/verify-setplate/.run/mode` is a **tracked** file, but `.run/` is scratch and cleanup removes the directory, so `git status` shows `D .agents/skills/verify-setplate/.run/mode` after a managed run. Put it back:

  ```powershell
  git restore .agents/skills/verify-setplate/.run/mode
  ```

- Headless Chrome leaves `.agents/skills/verify-setplate/.run/chrome-profile-*` directories behind when a run dies or Chrome cannot close cleanly. Remove them by name, not with a blind `.run/` wipe while a server may still be writing:

  ```powershell
  Get-ChildItem .agents\skills\verify-setplate\.run -Directory -Filter 'chrome-profile-*' |
    Remove-Item -LiteralPath { $_.FullName } -Recurse -Force
  ```

- Scratch drivers written for the run (`.run/*.mjs`) and their output directories go too.
- Committed helper scripts and `features/` edits are deliverables; a scratch file is not.

### End-of-run check

```powershell
Start-Sleep -Seconds 1
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 8000,5173 } | Select-Object LocalPort,OwningProcess
git status --short
```

- Empty port output means both servers are down. Any row names a leftover process: stop the job you started. Servers you attached to were the user's; leave them and say so.
- `git status --short` must list only the source and doc edits the task intended: no `D`, `M` or `??` under `.agents/skills/verify-setplate/`, no `chrome-profile-*`, no scratch `*.mjs`.

## Verification

A run is complete only when all of these hold:

- `doctor.ps1` reported `"ok": true` with the backend health check and the Vite page reachable before the first drive command.
- The evidence directory holds `result.json` with `"ok": true` (or the real failing assertion, reported as a failure), the asserted `before` and `after` states, PNG screenshots of the action and the resulting state at 430x932, `console.log`, and `network.json` when the screen depends on an API call.
- The report states the launch mode, which commands needed `danger-full-access`, and which journeys were not automated.
- The port check above returns nothing for the servers this run started, or says the attached ones were left running on purpose.
- The final `git status --short` is clean under the skill directory and shows only the intended edits.

## Helpers

- `scripts/launch.ps1`: start or attach, readiness gate, PID files, logs.
- `scripts/doctor.ps1`: environment, stack, login, and Home safety check.
- `scripts/drive.mjs`: dependency-free Chrome DevTools Protocol driver and the `proof` scenario.
- `scripts/cleanup.ps1`: PID-scoped teardown and scratch cleanup.

All helpers are run from the repo root. Invocations are shown above and in each feature file.

## Feature map

Start at `features/README.md`. It indexes the user-facing journeys, their routes, their write and AI exposure, and the evidence standard for each.

## Maintenance

Use `/maintain-verification-skill` after routes, selectors, or data contracts change.

## Proven scope

The shipped `proof` run covered `launch.ps1` in `attached` mode, `doctor.ps1`, `drive.mjs`, evidence capture, and `cleanup.ps1` against the real backend and a real login. It did not exercise `launch.ps1` in `managed` mode because ports 8000 and 5173 were already held by the running dev servers. Run the proof once on a clean checkout with the ports free to cover managed start and teardown.

A Health Connect verification ran on the same stack through a one-off `.run/settings-check.mjs` copied from `drive.mjs`: it returned `ok: true` with the Settings before/after state and screenshots, and it needed `danger-full-access` for both the Vite dev server and headless Chrome. That journey is not a shipped scenario yet — add it with [Adding a scenario](#adding-a-scenario).

The database is shared, so there is no empty local data directory to reset; the verification account is the isolation boundary.
