---
name: surgical-editing
description: >-
  Use this skill when making precise, low-overhead code refactors and edits that minimize context consumption.
---

# Surgical Code Editing Workflow

This skill guides the agent through making targeted, minimal-diff edits rather than large file rewrites.

---

## 4-Step Editing Protocol

1. **Locate Target Function / Scope**:
   - Identify line bounds using symbol search or pattern matching.
   - Read only the target function with 10 lines of surrounding padding:
     - `StartLine = target_start - 10`
     - `EndLine = target_end + 10`

2. **Formulate Single Contiguous Replacement**:
   - Ensure `TargetContent` matches the file exactly (character for character, preserving whitespace).
   - Only include the minimal lines that need modification.

3. **Verify Line Indices**:
   - Match `StartLine` and `EndLine` to ensure uniqueness and fast replacement execution.

4. **Self-Audit**:
   - Check if surrounding code or imports need updates before completing the turn.
   - Run a quick typecheck or test if relevant.
