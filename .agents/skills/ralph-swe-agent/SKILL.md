---
name: ralph-swe-agent
description: Delegate plan work to Ralph, configuring it to act like a superstar senior SWE (Champ) following Red/Green TDD.
---

# Ralph SWE Agent Skill

This skill is used to delegate implementation tasks defined in `PLAN.md` to the autonomous agent **Ralph**, configuring it to act like a superstar senior SWE (Champ) and follow Red/Green TDD.

## Workflow

0.  **Reset State (Critical for New Phases)**:
    - If you are delegating a new phase or task list to Ralph, you MUST delete the state file `.gemini/ralph-state.md` to ensure he starts at Iteration 1 and does not resume a previous run.

1.  **Prepare Problem Statement**: 
    - Create a file `.gemini/problem.md` containing the description of the Phase or tasks from `PLAN.md` you want Ralph to implement.
    
2.  **Design Tasks & Context**:
    - Run Ralph's design phase to generate `.gemini/tasks.md` and `.gemini/context.md`.
    - Command: `/google/bin/releases/ralph-team/ralph design`
    - *Fallback*: If the command fails due to API overload or other issues, you can emulate it by passing Ralph's design prompt (found in `//depot/google3/video/youtube/devtools/executors/ralph/design_prompt.py`) to a subagent to generate the JSON output with tasks and context, and then creating the files manually.

3.  **Configure "Champ" Persona & Structure Context**:
    - Update the generated `.gemini/context.md` to enforce the following structure, keeping the persona top-of-mind and task-specific context at the bottom.

    ```markdown
    ## Persona
    You are acting as **Champ**, a superstar senior SWE. You love concrete specifications because there's no question as how to measure success. And you embrace all the conformance tests like hugs.

    ## Workflow
    For every task you pick from `.gemini/tasks.md`:
    1. **Red Phase**: Write a failing test in the appropriate test file (or create a new one) that demonstrates the missing feature or bug.
    2. **Green Phase**: Implement the code in `src/` to make the test pass.
    3. **Verify**: Run the test to ensure it passes.
    4. **Preflight**: Run `pnpm run preflight` to ensure all tests pass and types are correct.
    5. **Commit**: Commit the targeted changes with a human-readable, lowercase message describing the action. Do NOT use `git add .` or `git commit -a`.

    ## Constraints
    - Follow the "Executable Specification" pattern with spec citations in comments.
    - File Editing: Do NOT use bash redirection or scratch scripts for editing files. Use the specialized tools: `replace_file_content`, `multi_replace_file_content`, or `write_to_file`.

    ## Metacognition & Knowledge Management
    - (Include the core 6 directives and knowledge management rules here to govern behavior and ensure learning).

    ## Context for Current Development Phase (Phase X)
    - (Move the automatically generated assumptions, decisions, and risks from the design phase to this section at the bottom of the file).
    ```

4.  **Execute the Loop**:
    - Run Ralph with the `--jetski` flag to execute the tasks autonomously.
    - Command: `/google/bin/releases/ralph-team/ralph run --jetski`
    - **CRITICAL**: You MUST set the `--max_iterations` flag to be HIGHER than the **total number of tasks** defined in the `.gemini/tasks.md` file (plus a buffer of 10-20 for retries). Remember that `--max_iterations` is a cap on the **total cumulative iterations** (including past runs if resuming), NOT the number of iterations to run in the current session! For example, if the task file has 34 tasks in total, set `--max_iterations=50` or higher, even if you are resuming at iteration 10.

5.  **Monitor**:
    - You can check the status anytime using `/google/bin/releases/ralph-team/ralph status` or watch it live with `watch` command.

6.  **Handoff & Plan Update**:
    - When Ralph completes all tasks and stops, the **primary agent** MUST read the final `.gemini/tasks.md` and update the main `PLAN.md` to mark the corresponding tasks and phase as completed. Ralph does not update `PLAN.md` directly.

## References
- **Ralph Documentation**: Accessible via `/google/src/head/depot/google3/video/youtube/devtools/executors/ralph/g3doc/index.md` or `go/ralph`.
- **Ralph README**: Super helpful overview and CLI reference, accessible via `/google/src/head/depot/google3/video/youtube/devtools/executors/ralph/README.md`.
