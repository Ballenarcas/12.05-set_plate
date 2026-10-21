# Exercise search

## Sub-features

- Free-text search over the 918-exercise catalog, debounced by 250 ms.
- Pagination at 30 results per page with page numbers, previous, and next.
- Each row shows the exercise name and up to two trained muscles, falling back to the category.
- Selecting a row stores the exercise in `sessionStorage` under `set_plate_pending_exercise` and returns to `/workouts/active`.
- The request is public. No `user_id`, no writes, no Groq.

## How to get to it (user POV)

1. Sign in.
2. Open Workouts in the bottom dock.
3. Start a routine or an empty workout.
4. Press Add exercise inside the session.

The direct route is `/workouts/active/exercises`. It is behind `ProtectedLayout`, so `set_plate_user` must exist in `localStorage`.

## Driving it with Chrome DevTools

The shipped proof does exactly this journey:

```powershell
node .agents/skills/verify-setplate/scripts/drive.mjs --scenario proof
```

It logs in through `/login`, waits for `set_plate_user`, full-navigates to `/workouts/active/exercises` to cancel the login redirect before Home mounts, waits for `.exercise-picker-item`, types `bench` into `input[aria-label="Search exercises"]`, and compares the DOM with the real `/api/v1/workouts/exercises?q=bench...` response.

Manual handles if you extend the driver:

- Search box: `input[aria-label="Search exercises"]`.
- Rows: `.exercise-picker-item`, names in `.exercise-picker-item strong`.
- Page indicator: `.pagination-count` (`Page 1 of N`).
- Empty or error state: `.state-card` with `role="status"` or `role="alert"`.

Assertions that prove it:

1. Initial catalog row count is greater than zero.
2. The `q=bench` request returns HTTP 200 with at least one item.
3. The rendered row count equals the response `items.length`.
4. The first rendered names equal the first response names.
5. At least one rendered name contains `bench`.
6. No failed `/api/` requests and no console errors.

## Gotchas

- There is no `user_id` in the request. Auth only gates the route.
- The 250 ms debounce means the request is not sent on the keystroke. Wait for the `q=bench` response, not a fixed sleep.
- Selecting a row without an active session writes `set_plate_pending_exercise` and lands on an empty session screen. That is not a search failure.
- Images come from wger and can fail offline. Image failures are recorded but do not fail the proof; API failures do.
- `compact=true` is sent, so not every exercise field is present. Compare `id`, `name`, and `category` only.
