# Code Standards & Architectural Conventions

Enforce these conventions across the SET&PLATE codebase.

---

## 1. Backend (Python & FastAPI)
- **Framework & Runtime**: Python 3.10+ / FastAPI. Use `async def` for async I/O; keep handlers synchronous when using blocking synchronous clients and calls.
- **Data Validation**: Strict Pydantic models for all API request bodies and response models (`app/schemas/`).
- **Layered Architecture**:
  - `app/api/`: Routing and HTTP request/response serialization only. No direct DB logic here.
  - `app/facades/`: Orchestrate service and database subsystems for a use case.
  - `app/services/`: Business logic, AI recommendation synthesis, metric calculation.
  - `app/db/`: Supabase client and persistence abstractions.
  - `app/core/`: Application settings (`pydantic-settings`), environment configs, constants.
- **Type Annotations**: Full static type hints across all functions and methods.
- **Error Handling**: Use explicit `HTTPException` with meaningful status codes and detail payloads.

## 2. Frontend (React 19 & TypeScript)
- **Framework & Tooling**: Vite + React 19 + TypeScript.
- **Components & Layout**: Functional components with hooks; mobile-first styling with safe-area considerations.
- **State & Data Fetching**: Clean async service calls located in `src/services/api.ts` with typed responses.
- **Type Safety**: Strictly typed interfaces and types defined in `src/types/`. Avoid `any`.
- **Icons**: Use `lucide-react` with proper sizing and accessibility attributes.

## 3. Formatting & Linting
- **Python**: Follow PEP 8 standards; keep imports sorted (standard library, third-party, local app).
- **TypeScript**: Consistent camelCase for variables/functions, PascalCase for components/types.
