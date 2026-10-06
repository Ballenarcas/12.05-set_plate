---
name: dev-workflows
description: >-
  Use this skill to run frontend and backend development tasks, tests, and builds with token-conserved output.
---

# Dev Workflows (FastAPI + React Vite)

Runbooks for executing common project operations efficiently without dumping excessive command output into the context window.

---

## Backend Workflows (FastAPI)

1. **Activate Virtual Environment & Run Backend**:
   - Location: `backend/`
   - Command:
     ```powershell
     cd backend
     .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
     ```
   - Note: Development server should run with `IsDaemon: true` or in background task mode.

2. **Run Pytest (Token-Budgeted)**:
   - Run in quiet mode:
     ```powershell
     cd backend
     .\venv\Scripts\python.exe -m pytest -q
     ```
   - If tests fail, run only the failing test file rather than the entire suite.

3. **Install Backend Dependencies**:
   - Install with quiet flag:
     ```powershell
     cd backend
     .\venv\Scripts\pip.exe install -r requirements.txt -q
     ```

---

## Frontend Workflows (Vite + React 19)

1. **Run Frontend Dev Server**:
   - Location: `frontend/`
   - Command:
     ```powershell
     cd frontend
     npm run dev
     ```
   - Run as background process or daemon.

2. **TypeScript Typecheck**:
   - Run Vite build check without emitting files:
     ```powershell
     cd frontend
     npx tsc --noEmit
     ```

3. **Production Build**:
   - Build frontend:
     ```powershell
     cd frontend
     npm run build
     ```
