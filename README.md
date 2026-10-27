# SET&PLATE

SET&PLATE is a mobile fitness and nutrition application that brings training, nutrition, and artificial intelligence together in one adaptive personal wellness experience.

The application is designed to understand the relationship between what a person eats, how they train, and how their body responds over time. SET&PLATE uses this context to provide personalized recommendations, adjust workout volume, guide daily nutrition, and help users make consistent progress toward their goals.

## Product Vision

SET&PLATE is built around a continuous feedback loop:

1. The user records meals, calories, and macronutrients.
2. The user completes workouts and records training performance.
3. SET&PLATE analyzes nutrition and training data together.
4. The AI trainer identifies patterns and provides actionable guidance.
5. Training and nutrition recommendations adapt to the user's progress, energy balance, and goals.

The goal is not to treat nutrition and exercise as separate tools. SET&PLATE connects both sides of the user's routine so every recommendation is informed by the complete picture.

## Core Experience

- Personalized AI trainer insights based on nutrition and training history.
- Daily calorie and macronutrient tracking.
- Programmed workouts with exercise volume and duration.
- Adaptive workout recommendations based on recovery, energy balance, and recent performance.
- Meal registration with manual entry and plate scanning workflows.
- Progress statistics that connect body composition, nutrition, and training consistency.
- Mobile-first navigation designed for fast daily interactions.

## Current Application

The SET&PLATE dashboard includes:

- A personalized greeting and daily date context.
- AI trainer notifications with adaptive recommendations.
- Remaining daily calories and visual progress tracking.
- Protein, carbohydrate, and fat summaries.
- Manual meal registration and plate scanning actions.
- The programmed workout for the day.
- A full-width training call to action.
- Bottom navigation for Home, Workouts, Nutrition, and Settings.

## Architecture

```text
.
├── .env.example
├── docker-compose.yml
├── deploy/
│   └── HOMELAB.md
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── nutrition.py
│   │   │   ├── routines.py
│   │   │   ├── stats.py
│   │   │   └── workouts.py
│   │   ├── core/
│   │   │   └── config.py
│   │   ├── db/
│   │   │   └── supabase_client.py
│   │   ├── schemas/
│   │   │   ├── nutrition.py
│   │   │   └── workout.py
│   │   └── services/
│   │       ├── nutrition_service.py
│   │       └── workout_service.py
│   ├── main.py
│   ├── requirements.txt
│   └── supabase_client.py
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/layout/MainLayout.tsx
    │   ├── pages/
    │   │   ├── Home.tsx
    │   │   ├── Nutrition.tsx
    │   │   ├── Settings.tsx
    │   │   └── Workouts.tsx
    │   ├── services/api.ts
    │   ├── styles/global.css
    │   ├── types/index.ts
    │   ├── App.tsx
    │   └── main.tsx
    ├── package.json
    └── vite.config.ts
```

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- Lucide React
- Mobile-first CSS with safe-area support

### Backend

- Python
- FastAPI
- Pydantic and pydantic-settings
- Uvicorn
- Supabase client
- CORS configuration for local and deployed frontend origins

## Requirements

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- A Supabase project for database-backed features
- Docker Engine with Compose v2 (optional, for the homelab demo)

## Configuration

From the repository root, create a local environment file:

```powershell
Copy-Item .env.example .env
```

Set the real values for `SUPABASE_URL` and `SUPABASE_KEY` in `.env`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase project URL | Empty |
| `SUPABASE_KEY` | Supabase anon key | Empty |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend-only key for protected Supabase reads | Empty |
| `VITE_API_URL` | FastAPI base URL used by the frontend | Empty (same origin) |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins | `http://localhost:5173,http://localhost:8080` |
| `GROQ_API_KEY` | GroqCloud API key used by the AI trainer | Empty |
| `GROQ_MODEL` | GroqCloud model used for trainer insights | `llama-3.3-70b-versatile` |

## Run the Backend

```powershell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.

### API Endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | API status and Supabase configuration status |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/workouts/` | Workout data endpoint |
| `GET` | `/api/v1/routines/` | Routine data endpoint |
| `GET` | `/api/v1/nutrition/` | Nutrition data endpoint |
| `GET` | `/api/v1/stats/` | Statistics data endpoint |
| `POST` | `/api/v1/ai/trainer-insight` | Generate a personalized insight with GroqCloud |
| `GET` | `/api/v1/dashboard/summary?user_id={uuid}` | Build the dashboard from Supabase data; the UUID comes from onboarding |

Interactive API documentation is available at `http://localhost:8000/docs`.

## Run the Frontend

In a separate terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

### Frontend Scripts

```powershell
npm run dev      # Start the Vite development server
npm run build    # Run TypeScript and create a production build
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

## Deploy a Homelab Demo

A Docker Compose stack for ZimaOS and Portainer is included. It builds the React app into nginx, proxies `/api` to FastAPI, and keeps the backend private inside the Compose network.

See [deploy/HOMELAB.md](deploy/HOMELAB.md) for the deployment steps, environment variables, security notes, and remote access options.

## Application Routes

| Route | View |
| --- | --- |
| `/` | Home dashboard |
| `/workouts` | Workouts and training statistics |
| `/nutrition` | Nutrition and macronutrients |
| `/settings` | User and application settings |

## AI Integration Direction

The AI layer is intended to act as SET&PLATE's personal training and nutrition intelligence. It will combine:

- Calorie intake and macronutrient distribution.
- Workout completion, volume, intensity, and duration.
- Training consistency and historical progress.
- Recovery signals and energy balance.
- User goals and preferences.

This shared context enables recommendations such as adjusting workout volume after a calorie deficit, suggesting nutrition changes after a demanding training session, and identifying long-term patterns that are difficult to see when nutrition and training data are stored separately.

## Mobile Design System

The interface uses a flat dark visual system optimized for mobile screens and one-handed interaction.

- Background: `#121212`
- Cards and containers: `#1E1E1E`
- AI notification: `#6B6A00` and `#7F7D0D`
- Primary action: `#28CD62`
- Progress accent: `#5B507A`
- Primary text: `#FFFFFF`
- Secondary text: `#A0A0A0`

The main application shell is constrained to a mobile width, uses touch-friendly controls, and accounts for iOS and Android safe areas.

## Validation

Run the frontend checks before opening a change:

```powershell
Set-Location frontend
npm run lint
npm run build
```

Run the backend health check with the virtual environment activated:

```powershell
Set-Location backend
.\venv\Scripts\Activate.ps1
python -c "from fastapi.testclient import TestClient; from main import app; print(TestClient(app).get('/api/v1/health').json())"
```
