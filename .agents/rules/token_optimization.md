# Token Optimization & Context Conservation Rules

Use these rules to keep repository work focused and outputs easy to review.

---

## 1. Targeted File Ingestion
- **Never read entire files blindly**: Always inspect file length or use `StartLine` and `EndLine` slicing when reading files exceeding 80 lines.
- **Do not re-read unchanged files**: Rely on cached context within the ongoing session instead of repeatedly invoking file view tools for previously inspected files.
- **Ignore generated, minified, and lock files**: Never load `package-lock.json`, bundle maps, minified scripts, `.log` files, or virtual environments (`venv/`, `node_modules/`).
- **Use symbol or grep lookups before reading**: Use fast regex search or symbol search to locate target line ranges before retrieving file content.

## 2. Command Output Pruning & Budgeting
- **Limit command verbosity**: When executing shell commands (PowerShell / Bash), always pipe or limit output to prevent hundreds of lines from polluting the context:
  - *PowerShell*: `Select-Object -First 20` or `Select-String -Pattern "..."`
  - *Bash*: `| head -n 25` or `grep -E "..."`
- **Avoid open directory trees**: Never run unconstrained recursive directory listings (`Get-ChildItem -Recurse` or `tree`). Always constrain depth (`-Depth 1` or `-Depth 2`).
- **Suppress noisy test/build output**: Run tests in quiet or summary mode (e.g., `pytest -q`, `npm run build -- --silent`). Only inspect verbose output if an error specifically occurs.

## 3. Surgical Code Modifications
- **Prefer minimal diffs / targeted patches**: Edit only the relevant functions or lines. Use the available patch or editor workflow; do not assume a particular editing tool exists.
- **Never rewrite entire files for small edits**: Avoid overwriting full files when altering a few lines; whole-file replacement burns thousands of tokens per turn.
- **Batch related edits**: When multiple lines in a single block need changes, perform a cohesive single replacement rather than fragmented repetitive tool calls.

## 4. Response Economy & Communication Style
- **High signal, low noise**: Keep conversational responses direct, technical, and concise. Avoid conversational filler ("Certainly!", "I will now proceed to...").
- **Do not re-quote full files**: When presenting code solutions to the user, output only the modified snippets, diffs, or file links—never paste entire unmodified files in chat responses.
- **Use Markdown links**: Link directly to workspace files when useful instead of copying large code sections into the response.

## 5. Progressive Disclosure
- **Load documentation on demand**: Do not pack external frameworks or API specs into persistent prompt rules. Keep reference docs in `.agents/skills/*/references/` and view them only when actively needed.
- **Keep research scoped**: Break large investigations into clear questions and inspect only the relevant areas. Do not spawn or delegate to agents unless the user explicitly requests it.
