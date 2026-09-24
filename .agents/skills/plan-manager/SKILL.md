---
name: plan-manager
description: Manages PLAN.md, marking tasks as in-progress or completed.
---

# Plan Manager

This skill is used to maintain \`PLAN.md\` in a consistent state.

## Workflow
1.  **Mark In-Progress**: When a task starts, mark it with \`[/]\`.
2.  **Mark Completed**: When a task is done and verified, mark it with \`[x]\`.
3.  **Add Phases**: Add new phases with consistent structure and objective.
4.  **Archive**: Roughly every 20 completed phases, move the oldest completed phases from `PLAN.md` to the end of `PLAN.archive.md` (verbatim), keeping ~20 recently completed phases in `PLAN.md` as a buffer. Never archive a phase with open `[ ]` tasks. Update the phase range in both files' intro lines.
