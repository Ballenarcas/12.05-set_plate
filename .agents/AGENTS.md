# SET&PLATE Engineering Guide

Use this guide with the concise repository-level `AGENTS.md`. Prefer accurate, focused changes over broad rewrites.

---

## 1. Efficient engineering workflow

### Inspect
- Search for relevant symbols or text before opening files.
- Inspect only relevant sections of large files; keep reads bounded (about 80 lines where practical).
- Reuse unchanged context instead of re-reading files.
- Respect `.agents/.agentsignore`; avoid lockfiles, generated bundles, caches, logs, and dependencies unless the task requires them.
- Keep command output bounded with PowerShell `Select-Object -First 25` or an equivalent.

### Edit and communicate
- Make focused patches, preserve unrelated changes, and use the repository's available editing tools.
- Keep progress and completion notes concise. Link to changed files instead of reproducing large code sections.

### Verify
- Discover the existing project command before running a build or test.
- Do not add or run tests unless the user asks for testing or verification.
- Clearly distinguish checks that ran from checks that could not be run.
- Run persistent development servers in the background.

---

## 2. Repository Layout & Domain Boundaries

- **`backend/`** (FastAPI + Python 3.10+):
  - `app/api/`: Routing endpoints (`ai.py`, `nutrition.py`, `workouts.py`, `routines.py`, `stats.py`).
  - `app/facades/`: Use-case orchestration between routers and internal services.
  - `app/services/`: Business logic and AI trainer calculations (`ai_service.py`, `nutrition_service.py`, `workout_service.py`).
  - `app/schemas/`: Pydantic request and response models.
  - `app/db/`: Supabase database client and queries.
  - `app/core/`: Configuration via `pydantic-settings`.
- **`frontend/`** (React 19 + TypeScript + Vite):
  - `src/pages/`: `Home.tsx`, `Nutrition.tsx`, `Workouts.tsx`, `Settings.tsx`.
  - `src/components/layout/`: `MainLayout.tsx` and mobile navigation.
  - `src/services/api.ts`: Centralized backend API client.
  - `src/types/`: Data types and models.

---

## 3. Current product constraint

- AI model calls are temporarily disabled to conserve tokens. Keep the Home AI tip as a static placeholder; do not call or re-enable an AI provider unless the user explicitly asks.

## 4. Skill & Rule Directory Reference

- **Token Rules**: `.agents/rules/token_optimization.md`
- **Code Standards**: `.agents/rules/code_standards.md`
- **Architecture**: `.agents/rules/architecture.md`
- **Security & Secrets**: `.agents/rules/git_and_safety.md`
- **Skills**:
  - `token-budget`: Low-context search and slice inspection procedures.
  - `dev-workflows`: Build, run, and test procedures with suppressed output.
  - `surgical-editing`: Minimal-diff patch techniques.
  - `poteto-mode`: Entry point for non-trivial engineering tasks; choose its matching playbook and follow its verification and reporting steps. Project rules above remain authoritative when instructions conflict.

---

## Multi-Agent Execution Policy

Delegation is optional. Use it only when independent parallel work materially helps. When agents are used, give each clear file ownership, keep shared contracts coordinated, avoid concurrent edits to the same file, and integrate and verify their changes. Explorers and reviewers do not edit application files.
