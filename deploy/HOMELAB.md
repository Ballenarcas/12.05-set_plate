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
- **The images come from GHCR**, built by CI on every push to `master`. The NAS only pulls them; it never builds. Nothing is compiled on the NAS, so a deploy takes about a minute.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Backend and frontend services, both from GHCR |
| `backend/Dockerfile` | FastAPI image, built by CI |
| `frontend/Dockerfile` | Vite build plus nginx runtime, built by CI |
| `frontend/nginx.conf` | SPA fallback, static caching, `/api` proxy |
| `.env.homelab.example` | Environment variable template |
| `.github/workflows/ci.yml` | Tests, container checks, and the GHCR publish |
| `.github/workflows/deploy.yml` | Redeploy on the NAS after a green CI |

## Option A: deploy from Portainer (recommended)

1. Push this repository to GitHub, GitLab, or another Git host that the NAS can reach.
2. In Portainer, open **Stacks -> Add stack**.
3. Name the stack `set-and-plate`.
4. Choose **Repository** as the build method.
   - Repository URL: your clone URL.
   - Reference: `refs/heads/master`.
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
   WEB_CONCURRENCY=1
   ```

   `AUTH_SECRET_KEY`, `ALLOWED_HOSTS` and `CORS_ORIGINS` are mandatory: the stack fails to start without them. Keep `127.0.0.1` and `localhost` inside `ALLOWED_HOSTS` because the backend healthcheck calls `/health` on loopback.

6. Click **Deploy the stack** and wait until both containers report healthy.
7. Run `tailscale funnel --bg 8080` on the host, then open the `.ts.net` URL that it prints.

If port `8080` is already used, change `APP_PORT`. The backend port is intentionally not published, and the frontend is published on loopback only.

Do not use the Portainer **Web editor** for the stack: the automatic redeploy calls the Git redeploy endpoint, which rejects a stack that was pasted into the editor (`400 Stack is not created from git`).

`IMAGE_TAG` is optional and defaults to `latest`, which is what CI publishes. Set it to a `sha-<short>` tag from the CI run to pin a specific build.

## Option B: deploy from SSH

Copy the repository to the NAS, then:

```sh
cp .env.homelab.example .env.homelab
# edit .env.homelab with the real values
docker compose --env-file .env.homelab config -q
docker compose --env-file .env.homelab pull
docker compose --env-file .env.homelab up -d
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

With Portainer, open the stack and choose **Pull and redeploy**. With SSH:

```sh
git pull
docker compose --env-file .env.homelab pull
docker compose --env-file .env.homelab up -d
```

Both pull the new images from GHCR. Building locally is only needed if you changed a Dockerfile and did not push to GitHub:

```sh
docker build -t ghcr.io/ballenarcas/set-plate-backend:latest ./backend
docker build -t ghcr.io/ballenarcas/set-plate-frontend:latest ./frontend
docker compose --env-file .env.homelab up -d
```

The frontend build takes `VITE_API_URL` as a build argument and defaults to empty, which is what same-origin nginx needs. Changing it means a new image, not another environment variable.

## Automatic deployment on push to master

Two workflows, no extra infrastructure:

1. `.github/workflows/ci.yml` runs the tests, validates the compose file and the nginx config, and then builds both images and pushes them to GHCR as `:latest` and `:sha-<short>`. This only happens on a push, never on a pull request.
2. `.github/workflows/deploy.yml` starts when CI succeeds on `master`. The runner joins the tailnet, asks Portainer to redeploy the stack, and then verifies the result.

Stack webhooks are a Portainer **Business Edition** feature, so this drives the Community Edition through its API instead. That is also why the images come from a registry: Portainer only rebuilds a stack image when the service sets `pull_policy: build`, and building on the NAS on every push is slow and needs the whole repository on the host. Building in CI keeps the deploy to a pull.

One-time setup:

1. **Make the packages pullable.** The NAS pulls anonymously, so both GHCR packages have to be public: **GitHub -> your avatar -> Your packages -> `set-plate-backend` -> Package settings -> Change visibility -> Public**, and the same for `set-plate-frontend`. They appear after the first green push. If you would rather keep them private, add the registry in Portainer (**Registries -> Add registry -> Custom**: `ghcr.io`, your GitHub username, and a PAT with `read:packages`) and select it when deploying the stack.
2. **Track master**: **Stacks -> the stack -> Repository reference** set to `refs/heads/master`. The redeploy uses the branch configured in the stack, not the branch that triggered CI.
3. **Create a Portainer API token**: **My account -> Access tokens -> Add access token**. It is shown once and expires when you say so; `PORTAINER_API_TOKEN` is that value.
4. **Create a Tailscale OAuth client**: admin console -> **Settings -> Trust credentials** (the page was called *OAuth clients* before the rename) -> generate one with the **`auth_keys` write scope** and the `tag:ci` tag. The tag also needs an owner in the policy file (`"tagOwners": { "tag:ci": ["autogroup:admin"] }`) and a grant to reach the NAS on the Portainer port:

   ```json
   { "src": ["tag:ci"], "dst": ["zimaos.<your-tailnet>.ts.net"], "ip": ["tcp:9443"] }
   ```

   Portainer listens on `9443` (HTTPS). Use `tcp:9000` instead if you enabled its plain-HTTP port and set `PORTAINER_URL` accordingly.

   If your tailnet does not allow tagged OAuth clients, swap the `oauth-client-id`/`oauth-secret` inputs in the workflow for a single `authkey` input and store it as `TS_AUTHKEY`.

5. Repository secrets:

   | Secret | Value |
   | --- | --- |
   | `TS_OAUTH_CLIENT_ID` | OAuth client ID |
   | `TS_OAUTH_CLIENT_SECRET` | OAuth client secret |
   | `PORTAINER_API_TOKEN` | the token from step 3 |

   Repository variables:

   | Variable | Value |
   | --- | --- |
   | `PORTAINER_HOST` | MagicDNS name, for the connectivity ping (`<nas>.<tailnet>.ts.net`) |
   | `PORTAINER_URL` | `https://<nas>.<tailnet>.ts.net:9443` |
   | `PORTAINER_STACK_ID` | the number at the end of the stack URL (`#!/docker/stacks/3` -> `3`) |
   | `PORTAINER_ENDPOINT_ID` | the environment id; `GET /api/endpoints` lists it, and it is usually `1` |
   | `PUBLIC_URL` | `https://<machine>.<tailnet>.ts.net`, for the post-deploy checks |

6. Push to `master` and confirm the run turns green.

The API token is a bearer credential: anyone who has it can redeploy the stack and read the Portainer API. Keep it in secrets, scope it with an expiry, and keep Portainer reachable only through the tailnet. The workflow uses `-k` for the self-signed certificate, which is acceptable over Tailscale and would not be over the internet.

Before redeploying, the workflow reads the stack (`GET /api/stacks/<id>`) and checks that every `${VAR:?}` in `docker-compose.yml` has a non-empty value in the stack's environment. That matters because Portainer CE 2.19-2.21 do `stack.Env = payload.Env` **unconditionally** in `stack_update_git_redeploy.go`: a request without `Env` deploys with no variables at all, even though the stack still has them in the UI. The workflow therefore echoes the stored `Env` array back in the request, along with the stored `RepositoryReferenceName`, and refuses to touch the stack when something is missing.

It also verifies anonymously that both `ghcr.io` images can be pulled (`docker manifest inspect`), which is exactly what the NAS does, so a private package fails the job before the stack goes down.

The redeploy itself is `PUT /api/stacks/<id>/git/redeploy?endpointId=<id>` with `RepullImageAndRedeploy`, so Portainer pulls the new `:latest` digest instead of reusing the local one. It retries on `409` while another deployment is running and fails with a readable message on `400` (stack was created in the web editor), `401`/`403` (bad token) and `404` (wrong stack or environment id).

After the call it does not trust the `200`: it waits up to ten minutes for `/healthz`, then checks `/api/v1/health`, asserts that `Content-Security-Policy` and `X-Frame-Options: DENY` are present (a missing header means `nginx.conf` never reached the image), and compares the served bundle hash with the one recorded before the deploy. An unchanged hash raises a warning: it means the NAS is still running the previous image, usually because the GHCR package is private and the pull failed.

To confirm by hand which image the frontend is running:

```sh
docker inspect --format '{{.Config.Image}} {{.Created}}' set_plate-frontend-1
```

The `Created` timestamp must be recent, and the image must be `ghcr.io/ballenarcas/set-plate-frontend:latest`.

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
| `required variable <X> is missing a value`, and `<X>` changes on every attempt | Compose reports a random missing variable because it walks a Go map. Either the stack really has none of them, or the API call sent an empty `Env` (Portainer CE 2.19-2.21 replace `stack.Env` with the payload's, even when it is absent). The workflow now reads the stack and sends its `Env` back, so this means the values are genuinely absent or empty: edit **Stacks -> set_plate -> Environment variables** and click **Update the stack**. |
| Everyone is logged out after a redeploy | `AUTH_SECRET_KEY` changed. Keep it stable or accept the re-login. |
| `429` on login | nginx allows 5 attempts per minute per IP by design. Wait a minute. |
| Blank page or 404 after refresh | Rebuild the frontend and confirm `frontend/nginx.conf` was copied into the image. |
| `CORS` error | The default setup is same-origin and needs no CORS. If you set `VITE_API_URL`, rebuild the frontend and add that origin to `CORS_ORIGINS` — with scheme, without trailing slash, never `*`. |
| Login or registration returns 500 | Check `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the backend logs. Onboarding needs the service-role key. |
| `port is already allocated` | Change `APP_PORT` and recreate the stack; the container keeps its old port mapping until it is recreated. Then point Funnel at the same number. |
| Tunnel answers `502` but `curl http://127.0.0.1:<APP_PORT>/healthz` is `ok` | `tailscale funnel` targets a different port. Run `tailscale funnel reset` and then `tailscale funnel --bg <APP_PORT>`. |
| Deploy fails with `denied` or `unauthorized` pulling `ghcr.io/...` | The GHCR package is private and the NAS has no registry credentials. Make both packages public, or add `ghcr.io` under **Registries** and select it in the stack. |
| Deploy fails with `HTTP 400` from the Portainer API | The stack was created in the web editor, so it has no Git configuration. Recreate it from the repository; `git/redeploy` only works on Git stacks. |
| Deploy fails with `HTTP 401`/`403` | `PORTAINER_API_TOKEN` is wrong, expired, or belongs to a user who cannot manage the stack. |
| Deploy fails with `HTTP 404` | `PORTAINER_STACK_ID` or `PORTAINER_ENDPOINT_ID` is wrong. Both are in the stack URL and in `GET /api/stacks`. |
| Deploy succeeds but the old page is still served | `docker inspect --format '{{.Config.Image}}' set_plate-frontend-1` must show the `ghcr.io` image. If it shows a local tag, the stack still has a `build:`/local `image:`; if the pull failed, the deploy log says so. |
| First load is slow | The first image pull and the first Supabase request are the slow parts. Later loads use nginx caching and the warmed Supabase client. |
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
