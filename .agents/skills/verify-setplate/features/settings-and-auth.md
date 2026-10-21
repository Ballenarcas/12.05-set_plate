# Settings and auth

## Sub-features

- Login with email and password at `/login`.
- Three-step onboarding at `/onboarding` that creates a user with calories derived from weight, height, age, gender, and goal.
- Profile editing at `/settings`: age, weight, height, gender, and main goal, then Save Changes.
- Log Out, which clears `set_plate_user` from `localStorage`.

## How to get to it (user POV)

- Login: Welcome screen, `Sign in`.
- Onboarding: Welcome screen, `Create your profile`.
- Settings: bottom dock, `Settings`.

## Driving it with Chrome DevTools

Login is the authentication step of the shipped proof:

```powershell
node .agents/skills/verify-setplate/scripts/drive.mjs --scenario proof
```

Handles:

- Login: `#login-email`, `#login-password`, submit `form.login-form` with `requestSubmit()`. Success writes `set_plate_user` to `localStorage` and then navigates to `/` after 1.6 seconds.
- Logout: `button.logout-btn` in Settings.
- Settings fields: `input.settings-input` and `select.settings-input` inside the profile card, then `button.settings-btn` with text `Save Changes`.
- Onboarding: three steps with `input` fields and a final submit. Creating a user is a permanent write.

Do not log in through the UI and then wait for the redirect if Home is unsafe to drive. The proof full-navigates away right after `set_plate_user` appears, which cancels the delayed redirect.

## Gotchas

- The login form uses `FormData`. Setting the DOM values is enough; no React state is involved.
- The frontend aborts a login after 15 seconds (`LOGIN_TIMEOUT_MS`). A cold backend can exceed the 5-second budget used by the other requests. The driver warms the login endpoint first and retries the form when the notice says the request timed out. To exercise the budget, run `node .agents/skills/verify-setplate/scripts/drive.mjs --scenario proof --login-latency 6000`. The run should still pass.
- After a successful login the page waits 1.6 seconds and then routes to `/`. A full-page navigation to the target route cancels that timer. A client-side route change does not.
- Protected routes redirect to `/welcome` when `set_plate_user` is missing.
- Onboarding upserts on email. For an existing email it keeps the stored password, so re-running onboarding does not re-provision a broken account. It still writes the profile fields.
- Settings has no stable `aria-label` on its inputs. Prefer the surrounding label text and `input.settings-input` order, and add ids to the component if you need durable selectors.
- Logout clears local state only. The account and its rows remain in Supabase.
