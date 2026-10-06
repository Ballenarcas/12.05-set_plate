# SET&PLATE Agent Directives & Token Optimization

> **Full Configuration**: See detailed rules and skills in [`.agents/`](file:///C:/Users/rumuq/OneDrive/Escritorio/set&plate/12.05-set_plate/.agents/).

## Essential Directives

1. **Token Efficiency**:
   - Inspect files with slice parameters (`StartLine`/`EndLine`). Never read large files in full.
   - Respect [`.agents/.agentsignore`](file:///C:/Users/rumuq/OneDrive/Escritorio/set&plate/12.05-set_plate/.agents/.agentsignore) (never scan `node_modules`, `venv`, lockfiles, dist).
   - Filter command output (`Select-Object -First 25` / `head -n 25`). Run tests with `-q`.
   - Use targeted code edits (`replace_file_content`), never rewrite entire files.
   - Keep conversational answers direct, concise, and high signal.

2. **Project Context**:
   - **Backend**: FastAPI in `backend/` (`app/api/`, `app/services/`, `app/schemas/`, `app/db/`).
   - **Frontend**: React 19 + TypeScript + Vite in `frontend/` (`src/pages/`, `src/components/`, `src/services/api.ts`).
   - **AI Trainer**: Adaptive feedback loop connecting nutrition & workout metrics.

3. **Workspace Customizations**:
   - Rules: [`.agents/rules/`](file:///C:/Users/rumuq/OneDrive/Escritorio/set&plate/12.05-set_plate/.agents/rules/)
   - Skills: [`.agents/skills/`](file:///C:/Users/rumuq/OneDrive/Escritorio/set&plate/12.05-set_plate/.agents/skills/)
