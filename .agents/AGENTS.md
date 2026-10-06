# SET&PLATE Agent System Guide & Token Economy

Welcome to SET&PLATE. You are acting as an expert autonomous engineering agent. Every token matters: prioritize efficiency, precision, and low context overhead.

---

## 1. Prime Directive: Token Economy & Context Optimization

1. **Slice, Never Ingest Wholesale**:
   - Never view large files from start to finish without line bounds.
   - Use `StartLine` and `EndLine` (keeping ranges under 80 lines).
   - Locate targets first using regex/symbol search before reading.

2. **Strict File Ignore Policy**:
   - Respect `.agents/.agentsignore` unconditionally.
   - NEVER read lockfiles (`package-lock.json`), build bundles (`dist/`, `.vite/`), caches (`__pycache__`), logs, or dependencies (`backend/venv/`, `frontend/node_modules/`).

3. **Output Restraint**:
   - Filter all command executions. Pipe through line limits (`head`, `Select-Object -First 25`).
   - Suppress command noise (`pytest -q`, quiet package managers).
   - For long-running processes (e.g. dev servers), launch as background daemons with short wait times.

4. **Surgical Modifications**:
   - Make targeted edits via `replace_file_content`. Never rewrite entire files for localized modifications.
   - Ensure exact character and indentation match before making replacement calls.

5. **Concise Communication**:
   - Omit conversational preamble and unnecessary code re-printing.
   - Use file links (`[File](file:///path/to/file#L1-L10)`) instead of duplicating code in chat.

---

## 2. Repository Layout & Domain Boundaries

- **`backend/`** (FastAPI + Python 3.10+):
  - `app/api/`: Routing endpoints (`ai.py`, `nutrition.py`, `workouts.py`, `routines.py`, `stats.py`).
  - `app/services/`: Business logic and AI trainer calculations (`ai_service.py`, `nutrition_service.py`, `workout_service.py`).
  - `app/schemas/`: Pydantic request and response models.
  - `app/db/`: Supabase database client and queries.
  - `app/core/`: Configuration via `pydantic-settings`.
- **`frontend/`** (React 19 + TypeScript + Vite):
  - `src/pages/`: `Home.tsx`, `Nutrition.tsx`, `Workouts.tsx`, `Settings.tsx`.
  - `src/components/layout/`: `MainLayout.tsx` and mobile navigation.
  - `src/services/api.ts`: Centralized backend API client.
  - `src/types/index.ts`: Data types and models.

---

## 3. Skill & Rule Directory Reference

- **Token Rules**: `.agents/rules/token_optimization.md`
- **Code Standards**: `.agents/rules/code_standards.md`
- **Architecture**: `.agents/rules/architecture.md`
- **Security & Secrets**: `.agents/rules/git_and_safety.md`
- **Skills**:
  - `token-budget`: Low-context search and slice inspection procedures.
  - `dev-workflows`: Build, run, and test procedures with suppressed output.
  - `surgical-editing`: Minimal-diff patch techniques.
