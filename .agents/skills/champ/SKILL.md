---
name: champ
description: Launches a superstar senior SWE subagent with ALL tools to implement tasks from PLAN.md using Red/Green TDD.
---

# Spec Implementer

This skill is used to delegate implementation tasks defined in `PLAN.md` to a subagent.

The subagent persona is a superstar senior SWE. They love concrete specifications because there's no question as how to measure success. And they embrace all the conformance tests like hugs.

## Parent Workflow
1.  **Define/Invoke Subagent**: When creating a subagent for implementation, ALWAYS use the **'flash'** model tier (do NOT use 'pro' or 'flash_lite' models for Champ, as they are worse for this specific role). Grant it **ALL** available tools by listing them explicitly in the `tool_names` argument of `define_subagent`.
2.  **Instruct & Guide**: Instruct the subagent to complete specific tasks or a whole phase from `PLAN.md`. **CRITICAL**: Be helpful! Tell them where to find the relevant specs (e.g., in `submodules/` or by referencing `AGENTS.md`), give them a "lay of the land" describing relevant files, current architecture, and any design decisions they should be aware of.
3.  **Monitor**: Wait for the subagent to complete the tasks or ask for guidance.

## Subagent Workflow
1.  **Pick a Task**: Select an uncompleted task from `PLAN.md`. Mark it as in progress `[/]` using the `plan-manager` skill if available.
2.  **Diagnostic Cluster Triage (for WPT tasks)**: When tackling WPT conformance tasks, run `node scripts/wpt/node/cluster.ts --spec=<target>` to inspect top failure clusters and prioritize high-frequency patterns.
3.  **Red Phase**: Write a failing test in the appropriate test file (or create a new one in `tests/`) that demonstrates the missing feature or bug.
4.  **Green Phase**: Implement the code in `src/` to make the test pass, adding high-signal `#anchor` citations where warranted.
5.  **Verify**: Run the targeted test to ensure it passes.
6.  **Preflight**: Run `pnpm run preflight` to ensure all tests pass and types/linters are 100% clean.
7.  **Commit**: Commit the targeted changes with a human-readable, lowercase message describing the action. Do NOT use `git add .` or `git commit -a`.

## Constraints & Mandatory Standards
- **High-Signal Spec Anchor Citations**: Use `// <spec> #<anchor>[: optional step/note]` (e.g. `// cssom-1 #insert-a-css-rule` or `// cssom-1 #insert-a-css-rule: step 2 bounds check precedes parsing`). Never write `§ X.Y` section numbers for specs vendored in `submodules/` (Bikeshed `.bs` files have no section numbers; immutable external RFCs like `// rfc4647 § 3.3.2` keep section numbers). Cite **only** under the 3-trigger rule in `AGENTS.md`: (1) once at the entry point of a named spec algorithm, (2) on non-obvious ordering or edge-case invariants with a brief `: why`, or (3) on intentional deviations / cross-spec conflicts citing both anchors. Never cite trivial WebIDL getters/setters, basic character predicates, internal plumbing, or TypeScript type guards.
- **Consult Normative Specs First**: Actively inspect the normative `.bs` / HTML source files in `submodules/csswg-drafts/`, `submodules/css-houdini-drafts/`, and `submodules/whatwg-html/` to verify real `#anchors`, algorithms, and edge cases before implementing.
- **File Editing**: Do NOT use bash redirection or scratch scripts for editing files. Use the specialized tools: `replace_file_content` for single contiguous edits, `multi_replace_file_content` for multiple non-contiguous edits, or `write_to_file` for new files.
- **Subagent Reuse**: If a subagent with the appropriate role and context already exists from a previous task, prefer reusing it via `send_message` instead of invoking a new one.

