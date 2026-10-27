# Homelab demo on ZimaOS with Portainer

This stack runs two containers:

- `frontend`: nginx serving the built React app and proxying `/api/` to the backend.
- `backend`: FastAPI on port 8000, reachable only inside the Compose network.

Supabase stays external. There is no database container and no persistent volume.

## Read this before exposing the demo

- **Use a demo Supabase project if possible.** The backend uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row Level Security. If you reuse your real project, take a backup first and keep the demo limited to people you trust.
- **Do not port-forward this stack directly to the internet.** The API has no per-endpoint authentication and there is no rate limiting. Use Tailscale, or Cloudflare Tunnel plus Cloudflare Access, in front of it.
- **Never put the service-role key in a `VITE_` variable.** It must only reach the backend container.
- **AI:** leave `GROQ_API_KEY` empty for a zero-cost demo. The AI workout adjustment will return a readable "Groq is not configured" error; the rest of the app works. Set the key only if you accept the API cost.
- The first image build on the NAS can take several minutes because it installs npm and pip dependencies.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Backend and frontend services |
| `backend/Dockerfile` | FastAPI image |
| `frontend/Dockerfile` | Vite build plus nginx runtime |
| `frontend/nginx.conf` | SPA fallback, static caching, `/api` proxy |
| `.env.homelab.example` | Environment variable template |

## Option A: deploy from Portainer (recommended)

1. Push this repository to GitHub, GitLab, or another Git host that the NAS can reach.
2. In Portainer, open **Stacks -> Add stack**.
3. Name the stack `set-and-plate`.
4. Choose **Repository** as the build method.
   - Repository URL: your clone URL.
   - Reference: the branch you want to demo, for example `refs/heads/func/basic-workout-stats`.
   - Compose path: `docker-compose.yml`.
5. Add these stack environment variables:

   ```text
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   APP_PORT=8080
   CORS_ORIGINS=http://localhost:8080
   GROQ_API_KEY=
   GROQ_MODEL=llama-3.3-70b-versatile
   VITE_API_URL=
   WEB_CONCURRENCY=1
   ```

6. Click **Deploy the stack** and wait until both containers report healthy.
7. Open `http://<zimaos-ip>:8080`.

If port `8080` is already used, change `APP_PORT`. The backend port is intentionally not published.

Do not use the Portainer **Web editor** for the first deployment: the Compose file builds from `./backend` and `./frontend`, so Portainer needs the repository files, not just the YAML.

## Option B: deploy from SSH

Copy the repository to the NAS, then:

```sh
cp .env.homelab.example .env.homelab
# edit .env.homelab with the real values
docker compose --env-file .env.homelab config -q
docker compose --env-file .env.homelab up -d --build
docker compose --env-file .env.homelab ps
```

Open `http://<zimaos-ip>:8080`.

Useful commands:

```sh
docker compose --env-file .env.homelab logs -f backend frontend
docker compose --env-file .env.homelab restart backend
docker compose --env-file .env.homelab down
```

The stack is stateless. If you add a volume later, put it under ZimaOS's `/DATA/AppData` directory.

## Verify the deployment

- App: `http://<zimaos-ip>:8080`
- Frontend health: `http://<zimaos-ip>:8080/healthz` should return `ok`.
- API through nginx: `http://<zimaos-ip>:8080/api/v1/health` should return `{"status":"ok"}`.
- Backend logs should contain `Application startup complete.`
- Register a new account, log in, open the dashboard, log a meal, and complete a short workout.

## Updating the demo

With Portainer, open the stack and choose **Pull and redeploy** or **Update the stack**. With SSH:

```sh
git pull
docker compose --env-file .env.homelab up -d --build
```

`VITE_API_URL` is baked into the frontend at build time. Changing it requires rebuilding the `frontend` image.

## Remote access for testers

### Tailscale (recommended)

Install Tailscale on the ZimaOS host and on each tester's device. Share `http://<tailscale-ip>:8080` or the MagicDNS name. Traffic stays inside your tailnet and the port is not exposed to the internet.

### Cloudflare Tunnel with Access

Run `cloudflared` on the NAS or as another container, publish only the frontend, and put Cloudflare Access in front of the hostname with an email allowlist. Do not create a public DNS record that bypasses Access.

### Public port forwarding

Avoid it for this demo. If you must use it, put a reverse proxy with authentication and rate limiting in front of the stack, and use HTTPS.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `502 Bad Gateway` | Backend is unhealthy. Run `docker compose logs backend` and verify the Supabase variables. |
| Blank page or 404 after refresh | Rebuild the frontend and confirm `frontend/nginx.conf` was copied into the image. |
| `CORS` error | The default setup is same-origin and needs no CORS. If you set `VITE_API_URL`, rebuild the frontend and add that origin to `CORS_ORIGINS`. |
| Login or registration returns 500 | Check `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the backend logs. Onboarding needs the service-role key. |
| `port is already allocated` | Change `APP_PORT`. |
| First load is slow | The first build and the first Supabase request are the slow parts. Later loads use nginx caching and the warmed Supabase client. |
| AI adjustment shows an error | `GROQ_API_KEY` is empty or invalid. This is expected for a no-cost demo. |

## Demo checklist

- [ ] Demo Supabase project, or a backup of the current one.
- [ ] Unique email for each tester.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in the stack environment.
- [ ] `APP_PORT` free on the NAS.
- [ ] Tailscale or Cloudflare Access enabled before sharing the URL.
- [ ] Register, login, dashboard, meal, and workout flows tested from a second device.
- [ ] Stack stopped or access revoked after the demo.
