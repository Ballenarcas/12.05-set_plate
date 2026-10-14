# SET&PLATE — Agent Instructions

## Project
- Backend: FastAPI, Python 3.10+, and Supabase (`backend/`).
- Frontend: React 19, TypeScript, and Vite (`frontend/`).
- Product areas: nutrition, workouts, and the AI Trainer.

## Before working
- Follow [.agents/AGENTS.md](.agents/AGENTS.md), `.agents/.agentsignore`, and the applicable rules in `.agents/rules/`.
- Read only the relevant skill in `.agents/skills/` when a task calls for one.
- Search first, then inspect bounded sections of relevant files. Never scan ignored dependencies, generated output, caches, or lockfiles unless the task requires it.

## Changes and verification
- Make focused edits and preserve unrelated user changes, including staged work.
- Keep API routing, business logic, persistence, and frontend API calls in their established layers; see `.agents/rules/architecture.md`.
- Protect credentials: do not print `.env` contents, tokens, or private keys. Use dummy values in `.env.example`.
- Find the project's existing build or test command before using it. Do not add or run tests unless the user asks for testing or verification.
- Report what changed and what was actually verified. Never claim a check passed unless it ran successfully.

## AI Trainer availability
- AI model calls are temporarily disabled to conserve tokens. Keep the Home AI tip as a static placeholder; do not call or re-enable a model until the user explicitly asks.

## Coordination
- Delegate only when parallel work materially helps. Assign clear file ownership, coordinate shared contracts, and integrate the results before reporting completion.
