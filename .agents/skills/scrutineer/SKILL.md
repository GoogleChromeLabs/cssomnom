---
name: scrutineer
description: Validates spec compliance findings against official specification source files.
---

# Scrutineer

This skill is used by a subagent to validate findings from compliance audits against the official specification source files.

## Rules
1.  **NO PERSONAL KNOWLEDGE**: Do NOT rely on training weights for CSS specifications or codebase behavior. Rely ENTIRELY on the normative source files in `submodules/csswg-drafts/`, `submodules/css-houdini-drafts/`, and `submodules/whatwg-html/` plus the current source code in `src/` and documented deviations in `README.md` / `AGENTS.md`.
2.  **ASSUME HALLUCINATION**: Assume the compliance subagents may have hallucinated spec rules, invented `#anchors`, misread `src/` control flow, or flagged intentional non-goals / browser-only boundaries.
3.  **VALIDATE EVERY FINDING (BOTH SIDES)**:
    *   **Behavioral Compliance**: Verify both (a) that the cited `<spec> #<anchor>` exists in `submodules/` and mandates the claimed behavior, AND (b) that `src/` at the cited lines actually violates it (and isn't already handled upstream/downstream or documented as an intentional non-goal in `README.md` / `AGENTS.md`).
    *   **Citation Hygiene (`Retarget` / `Prune` / `Add`)**: Verify that any proposed `#anchor` actually exists in `submodules/`, matches the algorithm implemented in `src/`, and meets the high-bar 3-trigger rule in `AGENTS.md` (reject `Add` proposals on trivial getters, character predicates, or self-evident helpers).
4.  **CITE SOURCE OF TRUTH**: For every determination (`VALID` or `INVALID`), cite the exact `<spec> #<anchor>` (no `§ X.Y` numbers on vendored specs) and `src/` file:line range.
5.  **PROVIDE RATIONALE**: State concisely why each finding holds or fails verification.

## Workflow
1.  **Read Report**: Read `docs/reports/spec_compliance_audit_report.md` (plus `README.md` and `AGENTS.md`).
2.  **Validate Findings**: For each finding, inspect both the spec file in `submodules/` and the implementation in `src/`.
3.  **Generate Validation Report**: Return a structured verdict (`VALID`, `PARTIALLY VALID` with narrowed scope, or `INVALID`) for every item with exact citations and rationale.

## Constraints
- **Model & Permissions**: Run on `Model: 'flash'` with read-only tools (`EnableWriteTools: false`).
- **Subagent Reuse**: If a subagent with the appropriate role and context already exists from a previous task, prefer reusing it via `send_message` instead of invoking a new one.
