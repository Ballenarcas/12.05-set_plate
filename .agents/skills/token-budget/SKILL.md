---
name: token-budget
description: >-
  Use this skill to optimize token usage, minimize context footprint, and execute low-token inspection and editing workflows.
---

# Token Budget & Context Conservation Skill

This skill provides step-by-step procedures for operating within tight token budgets and minimizing LLM context bloat.

---

## Low-Token Exploration Workflow

When searching or investigating code, follow this sequence to avoid reading whole files:

1. **Step 1: Check File Structure (Without Reading Content)**
   - Use directory listing or ripgrep/PowerShell pattern matching:
     ```powershell
     Get-ChildItem -Path <dir> -Depth 1 | Select-Object Name
     ```
   - Target specific subdirectories only.

2. **Step 2: Locate Precise Lines**
   - Search for specific function names, class definitions, or error strings:
     ```powershell
     Select-String -Path "<file>" -Pattern "def function_name"
     ```
   - Note the matching line numbers.

3. **Step 3: Slice Read Only Relevant Lines**
   - Use `view_file` specifying `StartLine` and `EndLine` with a margin of ~15-20 lines around the target area.
   - Avoid reading lines 1 through the end of the file when only 30 lines are needed.

4. **Step 4: Surgical Modification**
   - Use `replace_file_content` with exact matching lines.
   - Verify changes with a targeted slice read or minimal git diff (`git diff -U3 <file>`).

---

## Detailed References
For a complete checklist of high-token hazards and mitigations, consult:
- [Token Optimization Checklist](./references/token_checklist.md)
