---
name: champ
description: Launches a superstar senior SWE subagent with ALL tools to implement tasks from PLAN.md using Red/Green TDD.
---

# Spec Implementer

This skill is used to delegate implementation tasks defined in `PLAN.md` to a subagent.

The subagent persona is a superstar senior SWE. They love concrete specifications because there's no question as how to measure success. And they embrace all the conformance tests like hugs.

## Parent Workflow
1.  **Define/Invoke Subagent**: When creating a subagent for implementation, ALWAYS use the **'flash'** or **'flash_lite'** model tier (do NOT use 'pro' models for Champ, as they are actually worse for this specific role). Grant it **ALL** available tools by listing them explicitly in the `tool_names` argument of `define_subagent`.
2.  **Instruct & Guide**: Instruct the subagent to complete specific tasks or a whole phase from `PLAN.md`. **CRITICAL**: Be helpful! Tell them where to find the relevant specs (e.g., in `submodules/` or by referencing `AGENTS.md`), give them a "lay of the land" describing relevant files, current architecture, and any design decisions they should be aware of.
3.  **Monitor**: Wait for the subagent to complete the tasks or ask for guidance.

## Subagent Workflow
1.  **Pick a Task**: Select an uncompleted task from `PLAN.md`. Mark it as in progress `[/]` using the `plan-manager` skill if available.
2.  **Red Phase**: Write a failing test in the appropriate test file (or create a new one) that demonstrates the missing feature or bug.
3.  **Green Phase**: Implement the code in `src/` to make the test pass.
4.  **Verify**: Run the test to ensure it passes.
5.  **Preflight**: Run `pnpm run preflight` to ensure all tests pass and types are correct.
6.  **Commit**: Commit the targeted changes with a human-readable, lowercase message describing the action. Do NOT use `git add .` or `git commit -a`.

## Constraints
- Follow the "Executable Specification" pattern with spec citations in comments.
- **File Editing**: Do NOT use bash redirection or scratch scripts for editing files. Use the specialized tools: `replace_file_content` for single contiguous edits, `multi_replace_file_content` for multiple non-contiguous edits, or `write_to_file` for new files.
- **Subagent Reuse**: If a subagent with the appropriate role and context already exists from a previous task, prefer reusing it via `send_message` instead of invoking a new one.

