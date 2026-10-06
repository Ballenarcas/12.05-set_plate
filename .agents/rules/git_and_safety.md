# Security, Secrets & Safe Tool Usage

---

## 1. Environment & Secret Protection
- **Never expose raw secrets**: Never echo or print contents of `.env` files, Supabase service keys, API tokens, or credentials into terminal output or agent conversation transcripts.
- **Reference `.env.example`**: When modifying configuration requirements, update `.env.example` with dummy values rather than referencing real `.env` contents.
- **Never commit `.env` or credentials**: Ensure `.env`, `.env.*` (except `.env.example`), and local private keys remain in `.gitignore`.

## 2. Command Safety
- **No destructive operations without confirmation**: Do not run recursive deletes (`rm -rf`, `Remove-Item -Recurse -Force`) on top-level folders or git histories without explicit instructions.
- **Safe git operations**: Do not use `git push --force` or `git reset --hard` on remote branches.
- **Background tasks**: For persistent commands (e.g., development servers), run them as background tasks or daemon processes and do not block the agent turn.
