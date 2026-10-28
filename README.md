# SET&PLATE

**Train with purpose. Eat with clarity.**

SET&PLATE is a mobile-first fitness and nutrition web application. It combines structured workout routines, live set tracking, daily calorie and macronutrient logging, and optional AI coaching into one focused daily workflow.

The project is built as a React single-page application backed by a FastAPI service and a Supabase PostgreSQL database. The interface is designed for phones first, with a dark visual system, large touch targets, and a bottom navigation dock.

---

## Table of contents

- [What SET&PLATE does today](#what-setplate-does-today)
- [Feature status](#feature-status)
- [Screens and routes](#screens-and-routes)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Run the backend](#run-the-backend)
- [Run the frontend](#run-the-frontend)
- [Production build](#production-build)
- [Deploy a homelab demo](#deploy-a-homelab-demo)
- [API reference](#api-reference)
- [How nutrition targets are calculated](#how-nutrition-targets-are-calculated)
- [AI behaviour and guardrails](#ai-behaviour-and-guardrails)
- [Testing and validation](#testing-and-validation)
- [Known limitations](#known-limitations)
- [Design system](#design-system)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)

---

## What SET&PLATE does today

SET&PLATE is organised around a simple loop: set up a profile, log what you eat, train with a routine or an AI-generated plan, and review how the two sides of your routine fit together.

### Onboarding and account access

- Multi-step onboarding collects name, email, password, birth date, gender, weight, height, and training goal.
- A daily calorie goal is calculated automatically from the profile.
- The profile is stored in the Supabase `users` table with a bcrypt password hash.
- Login validates the email and password and restores the profile in the browser.
- Protected screens redirect to `/welcome` when no local session exists.

### Daily dashboard

- Personal greeting and current date.
- Remaining calories and a calorie progress bar.
- Protein, carbohydrate, and fat totals against daily targets.
- A nutrition shortcut to manual meal registration.
- Today's planned workout, including exercise names, sets, and reps.
- Rest-day messaging when the planner decides recovery is the better choice.
- Completed-workout state for the current day.
- Bottom navigation for Home, Workouts, Nutrition, and Settings.

### Nutrition tracking

- Daily nutrition summary with calorie and macro progress.
- Manual meal registration with multiple ingredients.
- Food search using a local food catalog with an Open Food Facts fallback.
- Per-ingredient quantity in grams with calorie and macro values per 100 g.
- Meal type classification (breakfast, lunch, dinner, snack, or meal).
- Edit and delete existing meals.
- Date navigation for reviewing previously saved meals.
- A warning when an ingredient quantity is set above 1,000 g.
- Rule-based calorie goal adjustment based on the last seven days of intake and training volume.

### Workouts and routines

- Create, edit, reorder, and delete reusable routines.
- Choose exercises from the built-in catalog and configure sets and reps per set.
- Start a routine, start an empty workout, or start the plan generated for the day.
- Live workout screen with:
  - elapsed session time;
  - per-exercise rest timers;
  - weight, reps, and RPE per set;
  - warm-up, drop-set, and failure set types;
  - add, replace, or remove exercises;
  - live volume and completed-set counters;
  - save or discard the session.
- Workout history with repeat, edit, and delete actions.
- Exercise catalog search, pagination, category filters, muscle-group filters, and equipment filters.
- Exercise import from the public wger API.

### AI-assisted training

- AI-generated daily workout plan when a Groq API key is configured.
- The planner considers recent training, recovery, saved routines, and recent calorie intake.
- It can select an existing routine, build a new workout from the exercise catalog, or prescribe a rest day.
- Live workout adjustments can change weight, reps, set count, or rest time during a session.
- Live adjustments have a 60-second per-user cooldown.

### Premium screen

- Monthly and annual plan presentation.
- Mock checkout that activates a premium status in the database.
- No payment provider is connected and no real money is charged.
- The listed premium features are product copy; feature-level entitlements are not enforced yet.
- The free-trial copy on the screen is presentation only; the backend activates the selected plan immediately.

### Settings

- Update age, weight, height, gender, and training goal.
- Logout with a confirmation dialog.
- Saving profile details clears the dashboard cache so the next load uses the new values.

---

## Feature status

This table separates what is wired end to end from what is still a placeholder.

| Area | Status | Notes |
| --- | --- | --- |
| Email/password onboarding and login | Available | Custom bcrypt authentication against the Supabase `users` table. |
| Dashboard summary | Available | Aggregates profile, nutrition, workout plan, and completed workout data. |
| Meal logging and meal editing | Available | Requires the `meal_ingredients` table. |
| Food search | Available | Local catalog first, Open Food Facts fallback. |
| Routines and workout history | Available | Create, edit, delete, repeat, and review sessions. |
| Live workout tracking | Available | Sets, reps, weight, RPE, rest timers, set types, and volume. |
| Exercise catalog and wger import | Available | Search, filters, pagination, and import endpoint. |
| AI daily workout plan | Available with Groq | Requires `GROQ_API_KEY`. The dashboard still loads without it. |
| Live AI workout adjustments | Available with Groq | Requires `GROQ_API_KEY`; 60-second cooldown. |
| Rule-based calorie goal adjustment | Available | Deterministic rules over seven days of data; not an LLM call. |
| Home "AI Trainer" insight | Placeholder | The dashboard shows a static message. |
| Plate scanning | Placeholder | The "Scan plate" control is disabled and marked PRO. |
| Premium checkout | Mock | Activates a database status; no payment is processed. |
| Workout statistics page | Not implemented | `/api/v1/stats/` is an empty placeholder and no statistics screen is routed. |
| Password reset and email verification | Not implemented | No recovery flow yet. |
| Production authentication and rate limiting | Implemented | Bearer sessions signed with `AUTH_SECRET_KEY`, per-endpoint identity from the token, and nginx rate limits on login and on `/api/`. |

---

## Screens and routes

| Route | Screen | Access |
| --- | --- | --- |
| `/welcome` | Product introduction with onboarding and login entry points | Public |
| `/login` | Email and password sign-in | Public |
| `/onboarding` | Three-step profile creation | Public |
| `/` | Home dashboard | Protected |
| `/workouts` | Routines, workout history, and workout actions | Protected |
| `/workouts/create` | Create or edit a routine | Protected |
| `/workouts/active` | Active workout session | Protected |
| `/workouts/active/exercises` | Exercise picker for an active session | Protected |
| `/nutrition` | Saved meal history for a selected date | Protected |
| `/log-meals` | Manual meal registration and daily nutrition summary | Public route, requires a local profile to save |
| `/premium` | Premium plans and mock checkout | Protected |
| `/settings` | Profile settings and logout | Protected |

Unknown routes redirect to `/` when signed in, or to `/welcome` when no session exists.

---

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│ Browser                                                       │
│                                                               │
│  React 19 + TypeScript + Vite                                 │
│  ├── React Router routes and protected layout                 │
│  ├── localStorage session profile                             │
│  ├── sessionStorage response caches                           │
│  └── fetch-based API client                                   │
└───────────────────────────────┬───────────────────────────────┘
                                │ /api/v1/*
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ FastAPI + Uvicorn                                             │
│                                                               │
│  api/          HTTP routers and request validation            │
│  facades/      Orchestration between API and services         │
│  services/     Business logic, calculations, external calls   │
│  schemas/      Pydantic request and response models           │
│  db/           Supabase client, SQL migrations, seed data      │
└───────────────────────────────┬───────────────────────────────┘
                                │ Supabase client
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Supabase                                                      │
│  PostgreSQL tables + Row Level Security                       │
└───────────────────────────────────────────────────────────────┘

External services:
  GroqCloud   → optional AI planning, insights, and adjustments
  wger API    → exercise catalog import
  Open Food Facts → food search fallback
```

The backend follows a layered structure:

- **Routers** in `backend/app/api/` define HTTP endpoints.
- **Facades** in `backend/app/facades/` keep routers thin and coordinate services.
- **Services** in `backend/app/services/` contain business rules and external integrations.
- **Schemas** in `backend/app/schemas/` define Pydantic contracts.

The frontend keeps API access in `frontend/src/services/api.ts` and page-level state in each page component. There is no global state library; server data is cached in memory and in browser storage where appropriate.

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Lucide icons |
| Styling | Plain CSS, mobile-first layout, safe-area support |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic 2 |
| Database | Supabase (PostgreSQL + REST client) |
| Authentication | Custom bcrypt password hashing in the `users` table |
| AI | GroqCloud chat completions with structured JSON output |
| Exercise data | Local catalog plus wger REST API import |
| Food data | Local catalog plus Open Food Facts fallback |
| CI | GitHub Actions: frontend build, backend pytest |

---

## Repository layout

```text
.
├── .env.example
├── .github/
│   └── workflows/               # ci.yml (checks) and deploy.yml (homelab)
├── AGENTS.md
├── README.md
├── docker-compose.yml           # Homelab stack for ZimaOS / Portainer
├── deploy/
│   └── HOMELAB.md               # Deployment, tunnel, and CD notes
├── backend/
│   ├── app/
│   │   ├── api/                 # FastAPI routers
│   │   ├── core/                # Settings and password security
│   │   ├── db/
│   │   │   ├── migrations/      # Incremental SQL migrations
│   │   │   ├── seeds/           # Development seed data
│   │   │   └── supabase_client.py
│   │   ├── facades/             # API-to-service orchestration
│   │   ├── schemas/             # Pydantic models
│   │   └── services/            # Business logic and integrations
│   ├── tests/                   # Pytest suite
│   ├── main.py                  # FastAPI application entry point
│   └── requirements.txt
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/          # Layout, workout, and premium components
    │   ├── pages/               # Route-level screens
    │   ├── services/api.ts      # API client and browser storage helpers
    │   ├── styles/              # Screen and component CSS
    │   ├── types/               # Shared TypeScript types
    │   ├── utils/               # Pure helpers and unit tests
    │   ├── App.tsx              # Route table
    │   └── main.tsx             # React entry point
    ├── package.json
    └── vite.config.ts
```

---

## Getting started

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- A Supabase project
- Optional: a GroqCloud API key for AI planning and live adjustments
- Optional: Docker Engine with Compose v2, for the homelab demo

### 1. Clone the repository

```bash
git clone https://github.com/Ballenarcas/12.05-set_plate.git
cd 12.05-set_plate
```

### 2. Create the environment file

From the repository root:

```powershell
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Fill in the Supabase values and, if you want AI features, the Groq key. See [Environment variables](#environment-variables).

> Never put `SUPABASE_SERVICE_ROLE_KEY` in a variable whose name starts with `VITE_`. Vite variables are embedded in the browser bundle.

### 3. Prepare Supabase

Run the SQL migrations and, optionally, the development seed. See [Database setup](#database-setup).

### 4. Load the exercise catalog

The workout picker needs exercises in the `exercises` table. You can import them from wger after the backend is running:

```bash
curl -X POST "http://localhost:8000/api/v1/workouts/exercises/import-wger?sync_supabase=true"
```

Or insert your own exercise rows using the schema in `backend/app/db/migrations/create_exercises_table.sql`.

### 5. Start the backend and frontend

Follow [Run the backend](#run-the-backend) and [Run the frontend](#run-the-frontend), then open `http://localhost:5173`.

---

## Environment variables

Backend variables are read from the repository root `.env` (the backend also checks `backend/.env`). `VITE_API_URL` is a frontend build-time variable: provide it in the shell before `npm run build` or in `frontend/.env.production`. Vite does not read the root `.env` for frontend variables by default.

| Variable | Required | Purpose | Default |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL | Empty |
| `SUPABASE_KEY` | Yes | Supabase anon/public key | Empty |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Backend-only key for admin reads and writes | Empty |
| `GROQ_API_KEY` | No | Enables AI planning, insights, and live adjustments | Empty |
| `GROQ_MODEL` | No | Groq chat model | `llama-3.3-70b-versatile` |
| `CORS_ORIGINS` | No | Comma-separated browser origins allowed to call FastAPI. `*` is rejected at startup | `http://localhost:5173` |
| `AUTH_SECRET_KEY` | Yes in production | Signs the bearer sessions. Rotating it logs everyone out | Falls back to the service-role key |
| `AUTH_TOKEN_TTL_HOURS` | No | Session lifetime in hours | `12` |
| `ENVIRONMENT` | No | `production` disables `/docs` and `/openapi.json` | `development` |
| `ALLOWED_HOSTS` | Yes in production | Comma-separated `Host` allow-list; loopback is always accepted | Empty (no validation) |
| `ADMIN_USER_IDS` | No | Comma-separated user UUIDs allowed to run the wger import | Empty (nobody) |
| `VITE_API_URL` | No | API base URL baked into a production frontend build | Empty |

### Notes on configuration

- The backend reads the service-role key from the server environment only. It must never reach the browser.
- Every `/api/v1` endpoint requires an `Authorization: Bearer <token>` header. The token is issued by login and registration and lives in `localStorage` under `set_plate_session`; `user_id` is never accepted from the client.
- In development, the frontend intentionally calls `/api/...` on its own origin and Vite proxies `/api` to `http://127.0.0.1:8000`. `VITE_API_URL` is ignored by the development build.
- In a production build, `VITE_API_URL` is read at build time. Leave it empty when the frontend and API share an origin behind a reverse proxy, or set it to the public API origin and add that origin to `CORS_ORIGINS`. Provide it through the build environment or `frontend/.env.production`.
- Changing `VITE_API_URL` requires rebuilding the frontend. Restarting the frontend is not enough.
- Without `GROQ_API_KEY`, model-backed AI endpoints return a readable configuration error. Fuzzy matching still works, and the rest of the application continues to operate.

---

## Database setup

SET&PLATE expects an existing Supabase PostgreSQL database with the application tables. The repository includes incremental migrations for newer tables and columns, but it does not contain a full baseline schema for the original tables.

If you are starting from an empty Supabase project, create the base tables (`users`, `meals`, `routines`, `routine_exercises`, `workouts`, `workout_sets`, `subscriptions`) and `ai_calorie_adjustments` from your existing schema or restore a SET&PLATE backup before running the incremental migrations.

### Tables used by the application

| Table | Purpose |
| --- | --- |
| `users` | Profile, password hash, calorie goal, and premium flag |
| `meals` | One row per logged meal |
| `meal_ingredients` | Per-ingredient quantities and nutrition values for a meal |
| `routines` | Saved workout routines |
| `routine_exercises` | Exercises, target sets, and reps for a routine |
| `workouts` | Completed workout sessions and history |
| `workout_sets` | Individual sets belonging to a workout |
| `workout_plans` | The generated or selected plan for a specific day |
| `exercises` | Exercise catalog, including wger identifiers and media |
| `subscriptions` | Mock premium subscription periods |
| `ai_calorie_adjustments` | Pending and decided calorie goal proposals |

### Migrations

Run the SQL files below in the Supabase SQL editor. They cover the tables and columns that are added incrementally in this repository. The recommended order is:

1. `create_exercises_table.sql`
2. `add_meal_ingredients.sql`
3. `create_workout_plans_table.sql`
4. `add_routine_reps_by_set.sql`
5. `add_workout_ai_adjustment_metadata.sql`
6. `grant_subscriptions_access.sql`

The migrations are idempotent where practical and add Row Level Security policies. If a table referenced by a migration does not exist yet, create the base table first or restore an existing SET&PLATE schema.

### Development seed

`backend/app/db/seeds/seed_data.sql` creates permissive development Row Level Security policies and inserts demo users, meals, routines, workouts, and sets. It does not populate the exercise catalog; use the wger import or insert exercises separately.

> The seed opens tables to public access and inserts sample data. Use it only in a local or disposable development project. Do not run it against a shared or production database.

### Optional tables and clear errors

- If `meal_ingredients` is missing, meal creation returns a `503` with a storage-unavailable message.
- If `workout_plans` is missing, daily planning cannot persist.
- If `ai_calorie_adjustments` is missing, the calorie adjustment endpoint returns a table-missing error.
- If the backend role cannot read `subscriptions`, premium checkout returns a message asking you to run `grant_subscriptions_access.sql`.

---

## Run the backend

From the repository root:

```powershell
# Windows PowerShell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

```bash
# macOS / Linux
cd backend
python -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.

- Interactive documentation: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`
- Health check: `http://localhost:8000/api/v1/health`

---

## Run the frontend

In a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

Vite proxies `/api` requests to `http://127.0.0.1:8000`, so the frontend and API behave as one origin during development. This also makes it possible to open the dev server from another device on the same network without rewriting API URLs.

### Frontend scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check with TypeScript and create a production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Node test runner for utility tests |
| `npm run preview` | Preview the production build locally |

---

## Production build

```bash
cd frontend
npm run build
```

The output is written to `frontend/dist/`.

For production, serve `dist/` from a static host or reverse proxy and forward `/api/*` to the FastAPI service. Two common setups work:

1. **Same origin (recommended):** serve the frontend and proxy `/api` to FastAPI. Build with `VITE_API_URL` empty.
2. **Separate origins:** build with `VITE_API_URL=https://api.example.com`, serve the frontend from another host, and add the frontend origin to `CORS_ORIGINS`.

Because Vite embeds `VITE_API_URL` at build time, changing the API URL always requires a new frontend build.

---

## Deploy a homelab demo

`docker-compose.yml` runs the app on ZimaOS or any Docker host: nginx serves the built SPA, proxies `/api` to FastAPI, and publishes only `127.0.0.1:<APP_PORT>`, so a Tailscale Funnel or Cloudflare Tunnel on the same host is the only way in. Both services run the images CI pushes to GHCR; nothing is built on the NAS.

See [deploy/HOMELAB.md](deploy/HOMELAB.md) for the deployment steps, the required environment variables, the tunnel setup, and the automatic deployment on push to `master`.

---

## API reference

All application endpoints are under `/api/v1`. Every endpoint except `/api/v1/health`, login, and registration requires an `Authorization: Bearer <token>` header; the token identifies the user, and a `user_id` in the path or query is never trusted. Interactive documentation is available at `/docs` unless `ENVIRONMENT=production`.

> Sessions are stateless HMAC tokens signed with `AUTH_SECRET_KEY`, valid for `AUTH_TOKEN_TTL_HOURS`. There are no refresh tokens: when one expires the client is sent back to `/login`.

### System

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | API status message |
| `GET` | `/api/v1/health` | Health check |

### Authentication and onboarding

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/users/onboarding` | Create or update a profile and calculate a calorie goal |
| `POST` | `/api/v1/users/login` | Validate credentials and return the public profile |

### Dashboard

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard/summary` | Build the home dashboard summary |

### Routines

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/routines` | List saved routines |
| `POST` | `/api/v1/routines` | Create a routine |
| `PUT` | `/api/v1/routines/{routine_id}` | Replace a routine's name and exercises |
| `DELETE` | `/api/v1/routines/{routine_id}` | Delete a routine |

### Workouts

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/workouts/plan-today` | Generate or select today's plan with Groq |
| `POST` | `/api/v1/workouts/adjust` | Request live AI adjustments for the active session |
| `POST` | `/api/v1/workouts/logs` | Save a completed workout |
| `GET` | `/api/v1/workouts/history?limit=30` | List completed workouts |
| `PUT` | `/api/v1/workouts/history/{workout_id}` | Update a completed workout |
| `DELETE` | `/api/v1/workouts/history/{workout_id}` | Delete a completed workout |

### Exercise catalog

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/workouts/exercises` | Search and filter exercises with pagination |
| `GET` | `/api/v1/workouts/exercises/categories` | List exercise categories |
| `GET` | `/api/v1/workouts/exercises/muscle-groups` | List muscle groups |
| `GET` | `/api/v1/workouts/exercises/{exercise_id}` | Fetch one exercise by ID or wger ID |
| `POST` | `/api/v1/workouts/exercises/import-wger` | Import or refresh exercises from wger |

Supported exercise query parameters: `q`, `category`, `muscle_group`, `muscle`, `equipment`, `page`, `limit`, and `compact`.

### Nutrition

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/nutrition/today` | Daily nutrition summary and logged meals |
| `GET` | `/api/v1/nutrition/search-foods?q={text}` | Search the local food catalog and Open Food Facts |
| `POST` | `/api/v1/nutrition/meals` | Create a meal with ingredients |
| `PUT` | `/api/v1/nutrition/meals/{meal_id}` | Update a meal |
| `DELETE` | `/api/v1/nutrition/meals/{meal_id}` | Delete a meal |

`/nutrition/today` accepts optional `today_start` and `today_end` ISO 8601 timestamps so the frontend can request the user's local day instead of the server's day.

### AI

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/ai/trainer-insight` | Generate a short trainer insight with Groq |
| `POST` | `/api/v1/ai/parse-intent` | Fuzzy-match natural language against foods, exercises, routines, and meals |
| `POST` | `/api/v1/ai/conversational-setup` | Grounded conversational helper for routines and meals |
| `GET` | `/api/v1/ai/calorie-adjustment` | Build a rule-based calorie goal proposal |
| `POST` | `/api/v1/ai/calorie-adjustment/decision` | Accept or reject a calorie goal proposal |

The conversational and intent endpoints are available in the backend and in the frontend API client, but they are not currently connected to a screen.

### Settings

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `PUT` | `/api/v1/settings/update` | Update age, weight, height, gender, and objective |

### Premium

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/premium/subscribe` | Reserved: returns 501 until a payment provider is wired up |

### Placeholder endpoints

These routes exist for compatibility but return empty or static data and are not used by the main screens:

| Method | Endpoint | Current behaviour |
| --- | --- | --- |
| `GET` | `/api/v1/workouts/` | Returns `{"items": []}` |
| `GET` | `/api/v1/workouts/programmed` | Returns a static "Upper Body" summary |
| `GET` | `/api/v1/nutrition/` | Returns `{"items": []}` |
| `GET` | `/api/v1/stats/` | Returns `{"items": []}` |

---

## How nutrition targets are calculated

The application uses deterministic calculations rather than an LLM for baseline targets.

### Daily calorie goal

`backend/app/services/user_profile_service.py` uses the Mifflin-St Jeor equation:

```text
BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + gender_offset
TDEE = BMR × 1.25
```

The gender offset is `+5` for male, `−161` for female, and `−78` for other values. Missing weight, height, and age fall back to 75 kg, 175 cm, and 25. Missing gender uses the male offset.

The goal is then adjusted by objective:

| Objective | Adjustment |
| --- | --- |
| `Lose Weight` (objective contains `lose`) | TDEE − 500 kcal |
| `Hypertrophy` | TDEE + 400 kcal |
| `Strength` | TDEE + 250 kcal |
| `Maintenance`, `Endurance`, or unmatched | TDEE |

The result is clamped to `1,200–5,000 kcal`.

### Macronutrients

`backend/app/services/nutrition_math.py` derives macros from the calorie target:

- Protein: `1.6 g` per kg of body weight
- Fat: `25%` of the calorie budget
- Carbohydrates: the remaining calories after protein and fat

### Calories burned

Workout burn is a deterministic estimate using `MET 5.0` over the recorded session duration and the user's body weight. It is an estimate for tracking, not a medical or laboratory measurement.

### Rule-based calorie adjustments

`backend/app/services/calorie_adjustment_service.py` evaluates the last seven days:

- It requires sufficient compliance before changing the goal.
- It uses a `10%` intake band around the current goal.
- It applies a `1-day` review cooldown.
- It proposes a step of `150 kcal` for fat loss or `200 kcal` for muscle gain, within the `1,200–5,000 kcal` range.
- Accepting a proposal writes the new goal to `users.calorie_goal`.

The interface labels this as an AI trainer tip, but the decision logic itself is rule-based and does not call a model.

---

## AI behaviour and guardrails

AI features are optional and only run when `GROQ_API_KEY` is configured.

### Daily workout plan

`POST /api/v1/workouts/plan-today`:

- Reads the last 48 hours of meals and training.
- Excludes muscle groups trained in the last 48 hours.
- Prefers an existing routine when one is available and safe to train.
- Can build a workout from the exercise catalog when no routine fits.
- Can return a rest day when recovery is the better choice.
- Uses Groq structured JSON output and validates the response before saving.
- Persists the plan in `workout_plans` so repeated dashboard loads do not regenerate it.

If no API key is configured, the endpoint returns a readable configuration error. The frontend catches the failure and keeps the dashboard usable without a plan.

### Live workout adjustments

`POST /api/v1/workouts/adjust`:

- Sends the current session, completed sets, RPE values, and user goal.
- Returns conservative suggestions such as changing weight, reps, set count, or rest time.
- Enforces a `60-second` per-user cooldown and returns `429` when called too quickly.
- Sets `Cache-Control: no-store` on responses.

### Trainer insight

`POST /api/v1/ai/trainer-insight` calls Groq with a nutrition summary, training summary, and user goal. The Home screen currently displays a static placeholder instead of calling this endpoint.

### Conversational helpers

`POST /api/v1/ai/parse-intent` and `POST /api/v1/ai/conversational-setup` use fuzzy matching against database entities. Without a Groq key, the conversational endpoint returns a deterministic response built from the matched entities.

### Cost and privacy

- Groq calls consume API quota and may incur cost.
- Do not send sensitive personal data to a model provider without consent.
- Keep `GROQ_API_KEY` server-side.
- For a zero-cost demo, leave the key empty and use the non-AI parts of the app.

---

## Testing and validation

### Backend

From `backend/` with the virtual environment active:

```bash
pytest -q
```

The suite covers health, onboarding and login, password hashing, nutrition calculations, nutrition summaries, calorie adjustments, workout adjustments, the exercise catalog, wger import, and facade wiring.

### Frontend

From `frontend/`:

```bash
npm run build
npm run lint
npm test
```

`npm test` runs the Node test runner over the utility tests in `frontend/src/utils/`.

### CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` and `master`:

- Frontend: `npm ci`, unit tests, and the type-check plus production build. Lint runs too but is non-blocking while the pre-existing React hook findings are fixed.
- Backend: `pip check` plus the pytest suite, with empty Supabase and Groq credentials so nothing reaches a real project.
- Containers: `docker compose config` with dummy values (this is what enforces the required-variable guards), both image builds, `nginx -t`, and a real container serving `/healthz` on port 8080.
- Images: on a push only, and only after every check above passes, both images are pushed to GHCR as `:latest` and `:sha-<short>`. Pull requests never overwrite `latest`.

`.github/workflows/deploy.yml` runs after a green CI on `master`, redeploys the Portainer stack over the tailnet through its API, and then verifies the app, the API, the security headers, and whether the bundle hash changed. Stack webhooks are a Business Edition feature, so the Community Edition is driven through `PUT /api/stacks/<id>/git/redeploy` with an API token. The job first reads the stack and sends its environment variables back in the payload, because Portainer CE replaces them with the request's `Env` even when it is absent; it also refuses to deploy when a `${VAR:?}` has no value or an image is not publicly pullable. See [deploy/HOMELAB.md](deploy/HOMELAB.md).

### Manual smoke check

With both servers running:

```bash
curl http://localhost:8000/api/v1/health
```

Expected response:

```json
{"status": "ok"}
```

Then open `http://localhost:5173`, create a profile, sign in, open the dashboard, log a meal, create a routine, and complete a short workout.

---

## Known limitations

- **Sessions are stateless and cannot be revoked.** A token stays valid until `AUTH_TOKEN_TTL_HOURS` expires; rotating `AUTH_SECRET_KEY` invalidates every session at once.
- **Rate limiting lives in nginx.** It is per IP and only active in the Compose deployment; a bare `uvicorn` process has none.
- **Session state is client-side.** The signed-in profile is stored in `localStorage`; clearing it signs the user out.
- **No password reset or email verification.** The onboarding flow validates email format but does not prove email ownership.
- **Registration rejects a known email.** A second signup with the same address returns 409 instead of recovering the account.
- **Home AI insight is a placeholder.** The backend endpoint exists, but the dashboard does not call it.
- **Plate scanning is not implemented.** The control is disabled and marked PRO.
- **Premium is a mock.** `POST /api/v1/premium/subscribe` returns 501 until a verified payment webhook exists.
- **Workout statistics are not exposed.** `/api/v1/stats/` returns an empty list and there is no routed statistics screen.
- **AI features require a Groq key.** Without one, planning and live adjustments return configuration errors.
- **Food search depends on a network fallback.** Local matches work offline; Open Food Facts results need outbound network access.
- **Objective matching is substring-based.** Onboarding uses `Lose Weight`, which the calorie calculators recognize. The Settings option `Weight Loss` does not match the current `lose`/`fat`/`cut` checks and falls through to maintenance.
- **Nutrition and calorie calculations are estimates.** They are not medical advice or a substitute for professional guidance.

---

## Design system

The interface uses a flat dark visual system built for phones and one-handed use.

| Token | Value |
| --- | --- |
| Background | `#121212` |
| Cards and containers | `#1E1E1E` |
| Primary action | `#28CD62` |
| AI notification | `#6B6A00` / `#7F7D0D` |
| Progress accent | `#5B507A` |
| Primary text | `#FFFFFF` |
| Secondary text | `#A0A0A0` |

The app shell is constrained to a mobile width, uses touch-friendly controls, and accounts for iOS and Android safe areas. Reusable styles live in `frontend/src/styles/`.

---

## Contributing

1. Create a branch from `master`.
2. Keep changes focused and preserve unrelated work.
3. Follow the existing layering: routers call facades, facades call services, and frontend API calls stay in `frontend/src/services/api.ts`.
4. Run the frontend checks and the backend test suite before opening a pull request.
5. Keep CI green. Pull requests to `master` run the full workflow.

For repository-specific engineering guidance, read `AGENTS.md` and the rules under `.agents/rules/`.

---

## Acknowledgements

- [Supabase](https://supabase.com/) for the hosted PostgreSQL and REST client.
- [GroqCloud](https://groq.com/) for optional AI inference.
- [wger](https://wger.de/) for the open exercise dataset.
- [Open Food Facts](https://world.openfoodfacts.org/) for the food search fallback.
- [Lucide](https://lucide.dev/) for the icon set.
