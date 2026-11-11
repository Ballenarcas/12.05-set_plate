# SET&PLATE

**Train with purpose. Eat with clarity.**

A phone-first web app for logging workouts and meals in one place, with rule-based coaching and optional AI help.

React 19 · TypeScript · Vite · FastAPI · Supabase · any OpenAI-compatible AI

---

## Features

- **Home:** calories and macros left today, today's workout plan, and an AI tip you can accept or dismiss.
- **Nutrition:** log meals with several ingredients, search foods (local catalog plus Open Food Facts), review past days, and scan a meal photo into editable ingredients, weights, and calories.
- **Workouts:** build routines from 1,324 exercises, track sets, reps, weight, RPE and rest timers live, then review history and statistics.
- **AI coach:** plans today's workout, suggests changes mid-session, and proposes calorie goal changes from the last 7 days.
- **Premium:** monthly and yearly plans. Checkout is a mock and takes no payment.

The calorie goal uses the Mifflin-St Jeor formula and is adjusted for your goal. Tips and calorie changes are decided by rules: a model can only reword them, and it never invents numbers.

## Quick start

You need Python 3.11+, Node 20+ and a Supabase project. An AI API key is optional and only needed for the AI features.

```bash
git clone https://github.com/Ballenarcas/12.05-set_plate.git
cd 12.05-set_plate
cp .env.example .env        # then fill in your Supabase keys
```

**Backend**, in one terminal:

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload   # http://localhost:8000, API docs at /docs
```

**Frontend**, in another:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Vite forwards `/api` to the backend, so you can also open the dev server from your phone on the same network.

## Database

Run the SQL files in [`backend/app/db/migrations/`](backend/app/db/migrations) in the Supabase SQL editor. `replace_exercises_with_dataset.sql` loads the exercise catalog, and `harden_rls.sql` closes the tables to everyone except the backend.

> The repo has no full starting schema. The base tables (`users`, `meals`, `routines`, `workouts` and their child tables) must already exist.

## Environment variables

| Variable | Needed | What it does |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Yes | Your Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Backend-only database key. Never put it in a `VITE_` variable |
| `AUTH_SECRET_KEY` | In production | Signs login sessions. Changing it logs everyone out |
| `AUTH_TOKEN_TTL_HOURS` | No | Session length, default `12` |
| `AI_API_KEY` | No | Turns on the AI features |
| `AI_BASE_URL` | No | Which AI provider to call, default Groq. See [AI provider](#ai-provider) |
| `AI_MODEL`, `AI_TIPS_MODEL` | No | Models for planning and for tips, default `openai/gpt-oss-20b` and `openai/gpt-oss-120b` |
| `AI_TIPS_MODEL_ENABLED` | No | Lets a model reword tips for Premium users, default `false` |
| `AI_VISION_BASE_URL`, `AI_VISION_API_KEY`, `AI_VISION_MODEL` | For photo scanning | A vision-capable OpenAI-compatible provider. Falls back to `AI_BASE_URL` and `AI_API_KEY`; `AI_VISION_MODEL` is required. With no value, Scan plate returns a setup message |
| `CORS_ORIGINS` | No | Allowed browser origins, default `http://localhost:5173` |
| `ENVIRONMENT` | No | `production` hides `/docs` |
| `ALLOWED_HOSTS` | In production | Allowed `Host` names |
| `VITE_API_URL` | No | API address baked into a production frontend build. Leave empty when nginx serves both |

## AI provider

The backend talks to any API that follows the OpenAI chat format. Set three values to switch:

| Provider | `AI_BASE_URL` | Example `AI_MODEL` |
| --- | --- | --- |
| Groq (default) | `https://api.groq.com/openai/v1` | `openai/gpt-oss-20b` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` (any non-empty `AI_API_KEY`) |

Plus `AI_API_KEY` from that provider. Models must support JSON output. The older `GROQ_API_KEY`, `GROQ_MODEL` and `GROQ_TIPS_MODEL` names still work.

### Photo meal scanning

Photo meal scanning needs a model that accepts image input. Use a separate provider when your text provider has no vision model. Set `AI_VISION_BASE_URL`, `AI_VISION_API_KEY` and `AI_VISION_MODEL`; the text AI settings stay unchanged. For example, `AI_VISION_BASE_URL=https://api.openai.com/v1`, `AI_VISION_MODEL=gpt-4o-mini`, and an OpenAI key. If those values are blank, the Scan plate screen explains that scanning is not configured.

## Tests

```bash
cd backend && pytest -q
cd frontend && npm test && npm run build
```

CI runs these on every push and pull request, plus container and nginx checks.

## Deploy

`docker-compose.yml` runs nginx and the API from images that CI pushes to GHCR. Merging to `master` redeploys the home server automatically. See [deploy/HOMELAB.md](deploy/HOMELAB.md).

## Project layout

```text
backend/app/
  api/        HTTP routes
  facades/    connect routes to services
  services/   business rules and outside calls
  schemas/    request and response models
  db/         Supabase client and migrations
frontend/src/
  pages/      one file per screen
  components/ shared UI
  services/   API client
```

Routes call facades, facades call services, and all frontend API calls live in `frontend/src/services/api.ts`. See [AGENTS.md](AGENTS.md) before contributing.

## Known limits

- **No password reset or email check yet.** Logging out only clears the phone, and a session stays valid until it expires.
- **Premium is a mock.** Anyone with an account can turn it on.
- **Photo meal scanning needs a vision model.** It returns estimates, so review and edit every item before logging. It never saves a scan directly.
- **Rate limits live in nginx**, so a bare `uvicorn` run has none.
- Calorie and nutrition numbers are estimates, not medical advice.

## Credits

[Supabase](https://supabase.com/) · [Open Food Facts](https://world.openfoodfacts.org/) · [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) · [Lucide](https://lucide.dev/)
