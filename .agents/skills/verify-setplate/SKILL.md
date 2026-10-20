---
name: verify-setplate
description: Verify SET&PLATE, a React 19 web UI backed by FastAPI on a shared Supabase project, by launching or attaching to the dev servers, logging in, and driving the real app with the bundled Chrome DevTools harness. Use when asked to verify a change, reproduce a UI bug, or capture proof of a user journey in this repository.
---

# Verify SET&PLATE

SET&PLATE is a mobile-first React 19 + Vite web app. The FastAPI backend runs from `backend/` and talks to a shared remote Supabase project and Groq.

## Hard limits

- The database is shared and remote. There is no local data directory to reset. The proof journey is read-only and must not write to another user's account.
- Groq calls cost tokens and are disabled for routine work. Never open `/` with an account that has no plan for today, and never press the AI button in an active workout. The driver logs in and full-navigates to the exercise picker specifically to cancel the login redirect before Home mounts and calls `POST /api/v1/workouts/plan-today`.
- Credentials come from `.env.verify` at the repo root (gitignored) or from `SETPLATE_VERIFY_EMAIL` and `SETPLATE_VERIFY_PASSWORD`. Create the file with those two keys and an existing account. Never print, commit, or screenshot them.
- Ports are fixed at 8000 and 5173. Vite proxies `/api` to `127.0.0.1:8000` and the default CORS origin is `http://localhost:5173`. Do not try to run a second instance on other ports. Attach to the healthy stack instead.

## Launch

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/launch.ps1
```

- Default mode is `auto`. It attaches when both ports already serve this app, otherwise it starts the backend with the repo virtualenv and Vite from `frontend/node_modules`, then records their PIDs in `.run/`.
- Ready means the command prints JSON with `mode: "attached"` or `mode: "managed"`, `http://127.0.0.1:8000/api/v1/health` returns `{"status":"ok"}`, and `http://localhost:5173` returns HTML containing `id="root"`.
- Logs live in `.agents/skills/verify-setplate/.run/`.
- If a port is held by a process that is not this app, launch fails instead of killing it. Report the owner.
- Teardown is `cleanup.ps1`. Managed mode stops only the PIDs launch recorded. Attached mode leaves the servers alone.

## Doctor

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/doctor.ps1
```

Run this first whenever anything looks off. It is read-only and checks Node 22 or newer (needed for the built-in WebSocket), Chrome or Edge, backend health, the Vite page, credentials, a real login through `POST /api/v1/users/login`, and whether Home is safe to drive (`has_plan_today` or `completed_workout_today`). It exits 1 on a required failure and never prints the password. The login user id is reported only as an 8-character prefix.

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

Only `proof` is automated today. For the other journeys, follow the matching file in `features/` and add a scenario to `drive.mjs`. Do not weaken a journey to make it pass.

To check a slow login, add `--login-latency 6000`. The driver applies that much CDP network latency around the login request, then resets it for the rest of the run. The login budget is 15 seconds (`LOGIN_TIMEOUT_MS`), so the run should still pass; the old 5-second budget failed.

## Evidence

Each run writes to `evidence/<UTC timestamp>/`:

- `result.json`: assertions, counts, masked account, errors, artifact list.
- `01-before-search.png` and `02-search-bench.png`: the action and the resulting state at 430x932.
- `console.log`: runtime errors and exceptions.
- `network.json`: the real exercise API responses used for the comparison.

Proof standards:

- Drive the real UI and the real backend. No route interception, no test-only endpoints, no `localStorage` injection or direct database reads to fake a result.
- Capture the action and the resulting state, not just the final screen.
- Verify side effects alongside what is visible. The proof is read-only; any write journey in the feature map must record the created row and delete it through the app.
- Mocks are acceptable only where production already isolates an external system. In this app, never mock Groq by calling it: skip the AI path and say so.
- Evidence survives cleanup.

## Cleanup

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/cleanup.ps1
```

- Managed mode stops only the recorded PIDs after confirming their command line still matches, then removes `.run/`.
- Attached mode leaves the user's servers running.
- Chrome is closed by the driver with `Browser.close`, with a PID-scoped `taskkill /T` fallback.
- Cleanup removes stale Chrome profiles but never evidence and never the verification account.
- If a journey created a meal or workout, delete it through the app API or UI before cleanup and record the deletion in `result.json`.

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

The shipped `proof` run covered `launch.ps1` in `attached` mode, `doctor.ps1`, `drive.mjs`, evidence capture, and `cleanup.ps1` against the real backend and a real login. It did not exercise `launch.ps1` in `managed` mode because ports 8000 and 5173 were already held by the running dev servers. Run the proof once on a clean checkout with the ports free to cover managed start and teardown. The database is shared, so there is no empty local data directory to reset; the verification account is the isolation boundary.
