# SET&PLATE Frontend

The SET&PLATE frontend is a mobile-first React application for connecting nutrition tracking, training plans, and AI-powered wellness guidance.

## Development

```powershell
npm install
npm run dev
```

The development server runs at `http://localhost:5173`. To test from another device on the same network, start it with `npm run dev -- --host 0.0.0.0` and open the Network URL printed by Vite. Keep the FastAPI backend running on port `8000`; Vite proxies `/api` requests to it, so the other device does not need to connect to `localhost:8000` directly.

## Available Commands

```powershell
npm run dev      # Start the Vite development server
npm run build    # Type-check and build for production
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

## Routes

- `/` - Daily dashboard
- `/workouts` - Training and workout statistics
- `/nutrition` - Nutrition and macronutrient tracking
- `/settings` - User and application settings

## API Configuration

In development, API requests are proxied to `http://127.0.0.1:8000` by Vite. For production builds, set `VITE_API_URL` to the public FastAPI backend URL (or leave it empty when the API is served from the same origin). The dashboard uses the `public.users.id` returned by onboarding and stored in the local profile.
