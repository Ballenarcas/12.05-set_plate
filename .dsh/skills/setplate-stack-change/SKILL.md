---
name: setplate-stack-change
description: Ship a SET&PLATE feature end to end — SQL migration (handed to the user to run), FastAPI schema/service/facade/api layers, router registration, frontend types plus api and page, and README — then verify with compileall, tsc -b and the Vite build. Use when asked to add or change a SET&PLATE table, endpoint, dashboard field, or UI feature.
whenToUse: Use for any SET&PLATE change that crosses layers (backend migration + API + frontend + docs), for "add X to SET&PLATE", "new endpoint/table/dashboard field", "ship this feature", and whenever SQL must be run against the user's Supabase database.
---

# SET&PLATE stack change

One pipeline for every cross-layer SET&PLATE feature. The order is enforced: SQL first (handed off, never executed here), then backend layers bottom-up, then the compile gate, then the route check, then frontend, then the build gates, then README.

## Steps

1. Read the local rules and one existing feature for shape before writing anything: `.agents/rules/architecture.md`, a current `backend/app/api/*.py` with its `services/` and `facades/` siblings, and `backend/app/db/migrations/` for naming. If configuration is involved, list `.env` **names only** — never values:

   ```powershell
   Get-Content .env | Where-Object { $_ -match '^\s*[A-Za-z_]+\s*=' } | ForEach-Object { ($_ -split '=',2)[0].Trim() }
   ```

2. Write the migration as `backend/app/db/migrations/<feature>.sql`: tables, indexes, and RLS policies that match the existing style (enable RLS, owner-scoped policy, service-role policy). Then add every new table name to the table-array loop in `backend/app/db/migrations/harden_rls.sql` so the hardened policies cover it too.

3. Hand the SQL to the user instead of running it. `psql` and the `supabase` CLI are not installed (`Get-Command psql`/`Get-Command supabase` exit 1) and the user has standing instructions to run migrations themselves. Give the file path and the exact SQL, and say the feature is not live in the database until they run it.

4. Add the backend layers in this order, one file per feature:
   1. `backend/app/schemas/<feature>.py` — Pydantic request/response models and enums.
   2. `backend/app/services/<feature>_service.py` — Supabase access and business logic, docstring explaining the contract.
   3. `backend/app/facades/<feature>_facade.py` — the thin facade the API calls.
   4. `backend/app/api/<feature>.py` — `APIRouter`, `Depends(current_user)` from `app.core.auth`, HTTP errors, calls into the facade only.

5. Register the router in `backend/main.py` in two edits: add the module to the sorted `from app.api import ...` line, and add `api_router.include_router(<feature>.router)` next to the other `include_router` calls. Skipping either leaves the code compiling and the endpoints invisible.

6. Extend any shared response contract the feature feeds, e.g. `backend/app/schemas/dashboard.py` (`DashboardSummary`) for a dashboard field, keeping the builders that construct those responses (service `_response` helpers) in sync.

7. Backend compile gate, from `backend/`:

   ```powershell
   .\venv\Scripts\python.exe -m compileall -q app main.py; if ($LASTEXITCODE -eq 0) { 'compile ok' }
   ```

8. Confirm the routes through the OpenAPI schema, from `backend/`:

   ```powershell
   @'
   import main
   print(sorted(path for path in main.app.openapi()["paths"] if "<feature>" in path))
   '@ | .\venv\Scripts\python.exe -
   ```

   All expected `/api/v1/<feature>/...` paths must be printed. Do **not** filter `main.app.routes`: included routers show up as `_IncludedRouter`, which has no `.path` and raises `AttributeError`.

9. Frontend: add the request/response types next to the existing API types, put the call in `frontend/src/api.ts`, and wire the page (`frontend/src/pages/Settings.tsx`, the dashboard page, or a new route). Reuse the existing classes from `frontend/src/styles/global.css` (`.primary-button`, `.secondary-action`, `.danger-action`, `.modal-backdrop`, `.confirmation-modal`, `.modal-actions`) instead of new CSS. Keep edits inside one page plus `api.ts` per change so parallel work cannot collide on the shared file.

10. Type check, from `frontend/` — silent output means pass:

    ```powershell
    npx tsc -b
    ```

11. Production build, from `frontend/`:

    ```powershell
    npm run build 2>&1 | Select-Object -Last 40
    ```

    `build` is `tsc -b && vite build`. If it fails with `failed to load config from ...\vite.config.ts` under the workspace sandbox, that is a sandbox limitation, not a code error: retry the same command with `sandbox_permissions=danger-full-access` (Vite loads its config in a child process). If escalation is unavailable in your scope, report the exact error verbatim and state the build is unverified — never report it as passing.

12. When verification is requested, prove the contract with an ad-hoc `TestClient` script run in `backend/` (a one-off here-string, not a new test file): set `AUTH_SECRET_KEY` in `os.environ` before importing `main`, build headers with `tests/auth_helpers.auth_headers`, patch the Supabase client with `unittest.mock.patch`, then assert status codes on the happy path and at least one auth/validation failure.

13. Update `README.md` in the same change: the feature status table, the routes table, and the schema/tables table. If an edit fails with `ReplaceFileW EIO (Win32 1175)`, the OneDrive folder was locked for the atomic replace — retry the identical edit once, no other change needed.

## Pitfalls

- **Running migrations locally.** `psql` and `supabase` are absent; every attempt exits 1. Write the SQL, hand it over, and say what remains manual.
- **`main.app.routes` route checks.** Included routers are `_IncludedRouter` objects without `.path`. Use `main.app.openapi()["paths"]`.
- **Treating the sandbox Vite failure as a code failure.** The config-load error comes from the file sandbox, not from the TypeScript or the app; the same build passes with full access.
- **Forgetting `harden_rls.sql`.** New tables stay outside the hardened policy loop unless added to its array, and compileall and the build gates will not notice.
- **Skipping router registration.** `main.py` needs both the import and the `include_router` line; the tests above catch it only if you run step 8.
- **Claiming gates passed.** Report the real output of `compileall`, `npx tsc -b`, and `npm run build`, and say which checks did not run.
- **Printing secrets.** List `.env` names only; never echo values or tokens.
- **Re-enabling the AI Trainer.** Model calls are disabled on purpose; extend the static tip instead of adding a model call.

## Verification

- `compileall` printed `compile ok` (backend).
- The OpenAPI listing printed every new `/api/v1/<feature>/...` path.
- `npx tsc -b` finished with no output, and `npm run build` exited 0 with `dist/assets/...` bundle lines (or its exact error text is reported instead).
- The `TestClient` run printed the expected status codes, including one rejection path.
- The SQL file lives in `backend/app/db/migrations/`, its tables are in `harden_rls.sql`, and the user has been told to run it.
- `README.md` no longer describes the feature as a placeholder.
