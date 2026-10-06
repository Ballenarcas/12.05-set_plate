# Token Optimization Checklist for Agents

Use this checklist during every agent session to prevent unnecessary token expenditure:

### 1. Pre-Read Checks
- [ ] Have I searched for the specific symbol/line number using grep or regex before reading the file?
- [ ] Is the file larger than 80 lines? If yes, specify `StartLine` and `EndLine` slices.
- [ ] Is this file in `.agentsignore` or `.gitignore` (e.g. `node_modules`, `venv`, lockfiles, build bundles)? If yes, do not read it.
- [ ] Did I already view this file earlier in the conversation transcript? If yes, reuse context.

### 2. Command Execution Checks
- [ ] Does my command risk printing hundreds of lines? (e.g. `npm list`, directory recursion, full test suites).
- [ ] Did I pipe through `head`, `Select-Object -First`, or regex filters?
- [ ] Are test commands running in summary mode (e.g., `pytest -q`, `npm test -- --watch=false --reporter=min`)?
- [ ] Is this a long-running process (dev server)? If yes, launch as background daemon with minimal initial wait.

### 3. File Modification Checks
- [ ] Am I using `replace_file_content` instead of overwriting the entire file?
- [ ] Did I target only the specific lines or functions requiring modification?
- [ ] Did I verify the exact whitespace and characters to avoid failed replacement iterations?

### 4. Response Generation Checks
- [ ] Am I avoiding echoing back large code blocks or raw terminal dumps?
- [ ] Did I format file references as clickable markdown links (`file:///...`) instead of printing code in chat?
- [ ] Is my response concise and focused on what was accomplished?
