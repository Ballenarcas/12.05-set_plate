# SET&PLATE Frontend

The SET&PLATE frontend is a mobile-first React application for connecting nutrition tracking, training plans, and AI-powered wellness guidance.

## Development

```powershell
npm install
npm run dev
```

The development server runs at `http://localhost:5173`.

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

Set `VITE_API_URL` in the project environment to point to the SET&PLATE FastAPI backend. The default value is `http://localhost:8000`. The dashboard uses the `public.users.id` returned by onboarding and stored in the local profile.
