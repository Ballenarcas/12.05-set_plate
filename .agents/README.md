# .agents Directory Architecture

This directory configures autonomous AI coding agents (such as Antigravity, Gemini Code Assist, and other LLM assistants) operating on the **SET&PLATE** repository.

It is purpose-built to **maximize token efficiency**, enforce codebase architecture, and provide modular progressive-disclosure workflows.

---

## Directory Structure

```text
.agents/
├── AGENTS.md                  # Master agent instructions and token economy directives
├── .agentsignore              # Patterns preventing agents from indexing token-heavy assets
├── README.md                  # Overview and maintenance guide (this file)
├── hooks.json                 # Agent lifecycle hooks configuration (pre/post tool actions)
├── skills.json                # Explicit skills catalog and inheritance configuration
├── mcp_config.json            # Model Context Protocol server configuration
├── rules/                     # Always-on and directory-scoped agent rules
│   ├── token_optimization.md  # Core token economy rules (slicing, output filtering, diffs)
│   ├── code_standards.md      # FastAPI, Pydantic, React 19, TypeScript conventions
│   ├── architecture.md        # SET&PLATE domain separation and client abstractions
│   └── git_and_safety.md      # Secret protection, .env rules, safe execution
└── skills/                    # On-demand progressive disclosure skills
    ├── token-budget/          # Low-token exploration & inspection runbook
    │   ├── SKILL.md
    │   └── references/
    │       └── token_checklist.md
    ├── dev-workflows/         # Build, test, and dev server runbooks with quiet flags
    │   └── SKILL.md
    └── surgical-editing/      # Minimal-diff patch techniques
        └── SKILL.md
```

---

## Why Token Optimization Matters

AI agent context windows fill quickly when:
1. **Unbounded file reading**: Ingesting entire files (hundreds or thousands of lines) when only a small function is needed.
2. **Terminal flood**: Running commands like `npm list`, unconstrained `dir -Recurse`, or verbose builds that dump thousands of lines into the prompt context.
3. **Lockfile & dependency indexing**: Loading `package-lock.json`, minified bundles, or files from `venv/` and `node_modules/`.
4. **Whole-file rewrites**: Replacing whole files when only modifying a few lines.

### Built-in Defenses in this `.agents/` Configuration:
- **`.agentsignore`**: Instructs file exploration tools to skip `node_modules/`, `backend/venv/`, `dist/`, `.vite/`, lockfiles, and media.
- **`rules/token_optimization.md`**: Mandates line slicing (`StartLine`/`EndLine`), command output trimming (`Select-Object -First 25`), quiet flags (`-q`), and minimal diffs.
- **Progressive Disclosure (`skills/`)**: Heavy checklists and procedures are stored in skills and reference files loaded on demand, keeping the baseline prompt lightweight.

---

## Extending & Customizing

- **Adding a new Skill**: Create a subfolder in `.agents/skills/<skill-name>/` with a `SKILL.md` containing `name` and `description` YAML frontmatter.
- **Adding a Rule**: Add markdown guidelines in `.agents/rules/<rule-name>.md`.
- **Connecting MCP Servers**: Configure servers in `mcp_config.json` to equip agents with custom databases or APIs.
