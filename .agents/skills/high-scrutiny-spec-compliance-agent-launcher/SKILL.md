---
name: high-scrutiny-spec-compliance-agent-launcher
description: Kicks off multiple spec compliance auditor subagents and consolidates their reports after validation.
---

# High-Scrutiny Spec Compliance Agent Launcher

This skill is used to launch a comprehensive compliance audit of the CSSOM parser against W3C specifications.

## Workflow
1.  **Spawn Auditors**: Spawn specialized subagents for assigned specifications. Recommended groupings:
    *   **CSSOM Auditor**: Reads `cssom-1/Overview.bs` -> `src/types.ts` and `src/CSSOM.ts`.
    *   **CSS Syntax Auditor**: Reads `css-syntax-3/Overview.bs` -> `src/tokenizer.ts` and `src/parser.ts`.
    *   **Values & Typed OM Auditor**: Reads `css-values-4/Overview.bs`, `css-typed-om-1/Overview.bs`, and `css-typed-om-2/Overview.bs` (Houdini).
    *   **Properties & Variables Auditor**: Reads `css-variables-1/Overview.bs` and `css-properties-values-api/Overview.bs` (Houdini).
    *   **Nesting Auditor**: Reads `css-nesting-1/Overview.bs`.
    *   **Media Queries Auditor**: Reads `mediaqueries-4/Overview.bs`.
    *   **Logical Properties Auditor**: Reads `css-logical-1/Overview.bs`.
    > [!IMPORTANT]
    > **Tooling Requirement**: Spawned subagents MUST have access to file reading tools (e.g., `view_file`, `list_dir`) to read specs and source files. If the default environment restricts them, explicitly provision them via `tool_names` in `define_subagent` or use a subagent type known to possess these capabilities.
2.  **General Task for Auditors**:
    *   Read the relevant spec in the submodule (`submodules/csswg-drafts/` or `submodules/css-houdini-drafts/`).
    *   Compare with the current implementation in the corresponding file.
    *   Identify non-compliance, missing features, or technical debt.
    *   Report findings with specific spec references and actionable recommendations.
3.  **Wait for Reports**: Wait for all auditors to complete and report back.
4.  **Consolidate Findings**: Consolidate all auditor findings into a file named `spec_compliance_audit_report.md`. **You MUST ensure this file is fully updated with all latest findings before proceeding.**
5.  **Add Tentative Findings to Plan**: Append the unverified findings to `PLAN.md` in a new phase, marking them as unverified. **This must be done before invoking the Scrutineer.**
6.  **Spawn Scrutineer**: Spawn a "Scrutineer" subagent using the `scrutineer` skill to validate `spec_compliance_audit_report.md`.
7.  **Revise Plan**: Once the Scrutineer returns its validation report, update the phase in `PLAN.md` to remove invalid findings and remove the unverified tag.

## Constraints
- Auditors must cite spec anchors for all findings (e.g., `cssom-1 #parsing-selectors` or `css-syntax-3 #consume-token`).
- Scrutineer must ignore its own knowledge and use only repo specs.
- Auditors must be provisioned with read-only tools (`view_file`, `list_dir`, etc.) to access the codebase.
