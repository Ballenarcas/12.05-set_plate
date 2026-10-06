# Token Optimization & Context Conservation Rules

These rules are mandatory for all AI agents working within this repository. Adherence ensures minimal token consumption, avoids context window saturation, and maximizes response precision.

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
- **Prefer minimal diffs / targeted replacements**: Use single contiguous replacement blocks (`replace_file_content`) targeted strictly at modified functions or lines.
- **Never rewrite entire files for small edits**: Avoid overwriting full files when altering a few lines; whole-file replacement burns thousands of tokens per turn.
- **Batch related edits**: When multiple lines in a single block need changes, perform a cohesive single replacement rather than fragmented repetitive tool calls.

## 4. Response Economy & Communication Style
- **High signal, low noise**: Keep conversational responses direct, technical, and concise. Avoid conversational filler ("Certainly!", "I will now proceed to...").
- **Do not re-quote full files**: When presenting code solutions to the user, output only the modified snippets, diffs, or file links—never paste entire unmodified files in chat responses.
- **Use Markdown links**: Link directly to files and line ranges (e.g., `[file.ts](file:///path/to/file.ts#L10-L25)`) instead of copying code blocks into the response text.

## 5. Progressive Disclosure
- **Load documentation on demand**: Do not pack external frameworks or API specs into persistent prompt rules. Keep reference docs in `.agents/skills/*/references/` and view them only when actively needed.
- **Isolate long research tasks**: For extensive codebase exploration, invoke isolated subagents (`research`) so large exploration logs do not bloat the main conversation context.
