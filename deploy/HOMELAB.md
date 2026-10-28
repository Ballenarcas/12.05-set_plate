# Homelab demo on ZimaOS with Portainer

This stack runs two containers:

- `frontend`: nginx serving the built React app and proxying `/api/` to the backend.
- `backend`: FastAPI on port 8000, reachable only inside the Compose network.

Supabase stays external. There is no database container and no persistent volume.

## Read this before exposing the demo

- **Use a demo Supabase project if possible.** The backend uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row Level Security. If you reuse your real project, take a backup first and keep the demo limited to people you trust.
- **Do not port-forward this stack directly to the internet.** Every API endpoint requires a bearer token, logins are rate limited by nginx, and the compose port is bound to `127.0.0.1`, but TLS termination and the public edge still belong to Tailscale Funnel or Cloudflare Tunnel.
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
   AUTH_SECRET_KEY=<python -c "import secrets; print(secrets.token_urlsafe(48))">
   AUTH_TOKEN_TTL_HOURS=168
   ENVIRONMENT=production
   ALLOWED_HOSTS=127.0.0.1,localhost,zimaos.tailxxxx.ts.net
   ADMIN_USER_IDS=
   CORS_ORIGINS=https://zimaos.tailxxxx.ts.net
   APP_PORT=8080
   GROQ_API_KEY=
   GROQ_MODEL=llama-3.3-70b-versatile
   VITE_API_URL=
   WEB_CONCURRENCY=1
   ```

   `AUTH_SECRET_KEY`, `ALLOWED_HOSTS` and `CORS_ORIGINS` are mandatory: the stack fails to start without them. Keep `127.0.0.1` and `localhost` inside `ALLOWED_HOSTS` because the backend healthcheck calls `/health` on loopback.

6. Click **Deploy the stack** and wait until both containers report healthy.
7. Run `tailscale funnel --bg 8080` on the host, then open the `.ts.net` URL that it prints.

If port `8080` is already used, change `APP_PORT`. The backend port is intentionally not published, and the frontend is published on loopback only.

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

Open the `.ts.net` URL printed by `tailscale funnel status`, or `http://127.0.0.1:8080` from a shell on the NAS itself.

Useful commands:

```sh
docker compose --env-file .env.homelab logs -f backend frontend
docker compose --env-file .env.homelab restart backend
docker compose --env-file .env.homelab down
```

The stack is stateless. If you add a volume later, put it under ZimaOS's `/DATA/AppData` directory.

## Verify the deployment

- App: the `https://<machine>.<tailnet>.ts.net` URL, or `http://127.0.0.1:8080` on the NAS.
- Frontend health: `<url>/healthz` should return `ok`.
- API through nginx: `<url>/api/v1/health` should return `{"status":"ok"}`.
- Backend logs should contain `Application startup complete.`
- Register a new account (password: 12 characters minimum), log in, open the dashboard, log a meal, and complete a short workout.

## Updating the demo

With Portainer, open the stack and choose **Pull and redeploy** or **Update the stack**. With SSH:

```sh
git pull
docker compose --env-file .env.homelab up -d --build
```

`VITE_API_URL` is baked into the frontend at build time. Changing it requires rebuilding the `frontend` image.

## Remote access for testers

### Tailscale (recommended)

Install Tailscale on the ZimaOS host. The compose port is loopback-only, so the tunnel has to run on that same host and forward to `127.0.0.1:8080`:

```sh
tailscale serve  --bg 8080   # tailnet only, no public exposure
tailscale funnel --bg 8080   # public HTTPS on https://<machine>.<tailnet>.ts.net
```

`tailscale funnel status` prints the exact hostname. Put it, without scheme or port, in `ALLOWED_HOSTS`, and with `https://` in `CORS_ORIGINS`; otherwise the app answers `400 Invalid host header`. Funnel needs HTTPS certificates enabled in the admin console (**DNS**) and `funnel` allowed for the node in **Access controls**. Reset with `tailscale funnel reset`.

The hostname is stable across reboots, unlike a `trycloudflare.com` quick tunnel.

### Cloudflare Tunnel with Access

Run `cloudflared` on the NAS or as another container, publish only the frontend, and put Cloudflare Access in front of the hostname with an email allowlist. Do not create a public DNS record that bypasses Access.

### Public port forwarding

Avoid it for this demo. If you must use it, put a reverse proxy with authentication and rate limiting in front of the stack, and use HTTPS.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `502 Bad Gateway` | Backend is unhealthy, or the frontend publishes no host port. Run `docker compose logs backend` and check that `docker ps` shows `127.0.0.1:<APP_PORT>->8080/tcp` for the frontend. |
| Frontend `healthy` but the `PORTS` column is empty | The service is attached only to an `internal: true` network, so Docker allocates no published port. Keep the shared network non-internal; isolation comes from binding to `127.0.0.1` and from the backend having no published port. Confirm with `docker inspect -f '{{json .NetworkSettings.Ports}}' <frontend>` — an empty `{}` means nothing was published. |
| `400 Invalid host header` | The host you opened is missing from `ALLOWED_HOSTS` (no scheme, no port). Restart the backend after editing it. |
| Frontend never starts, backend `unhealthy` | `ALLOWED_HOSTS` must include `127.0.0.1` and `localhost`: the healthcheck calls `/health` on loopback. |
| `AUTH_SECRET_KEY is required` on deploy | The `:?` guards reject an empty value. Generate one with the command in `.env.homelab.example`. |
| Everyone is logged out after a redeploy | `AUTH_SECRET_KEY` changed. Keep it stable or accept the re-login. |
| `429` on login | nginx allows 5 attempts per minute per IP by design. Wait a minute. |
| Blank page or 404 after refresh | Rebuild the frontend and confirm `frontend/nginx.conf` was copied into the image. |
| `CORS` error | The default setup is same-origin and needs no CORS. If you set `VITE_API_URL`, rebuild the frontend and add that origin to `CORS_ORIGINS` — with scheme, without trailing slash, never `*`. |
| Login or registration returns 500 | Check `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the backend logs. Onboarding needs the service-role key. |
| `port is already allocated` | Change `APP_PORT` and recreate the stack; the container keeps its old port mapping until it is recreated. Then point Funnel at the same number. |
| Tunnel answers `502` but `curl http://127.0.0.1:<APP_PORT>/healthz` is `ok` | `tailscale funnel` targets a different port. Run `tailscale funnel reset` and then `tailscale funnel --bg <APP_PORT>`. |
| First load is slow | The first build and the first Supabase request are the slow parts. Later loads use nginx caching and the warmed Supabase client. |
| AI adjustment shows an error | `GROQ_API_KEY` is empty or invalid. This is expected for a no-cost demo. |

## Demo checklist

- [ ] Demo Supabase project, or a backup of the current one.
- [ ] `harden_rls.sql` and `add_unique_user_email.sql` run in the Supabase SQL editor.
- [ ] Unique email for each tester.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in the stack environment.
- [ ] Fresh `AUTH_SECRET_KEY`; `ALLOWED_HOSTS` and `CORS_ORIGINS` set to the real tunnel host.
- [ ] `APP_PORT` free on the NAS.
- [ ] Tailscale Funnel or Cloudflare Access enabled before sharing the URL.
- [ ] Register, login, dashboard, meal, and workout flows tested from a second device.
- [ ] Stack stopped or access revoked after the demo.
