---
name: scrutineer
description: Validates spec compliance findings against official specification source files.
---

# Scrutineer

This skill is used by a subagent to validate findings from compliance audits against the official specification source files.

## Rules
1.  **NO PERSONAL KNOWLEDGE**: You must NOT rely on your own knowledge of CSS specifications. You must rely ENTIRELY on the Bikeshed (`.bs`) source files located in `submodules/csswg-drafts/` and `submodules/css-houdini-drafts/`.
2.  **ASSUME HALLUCINATION**: You must assume that the compliance subagents that generated the report may have hallucinated some or all of their findings.
3.  **VALIDATE EVERY FINDING**: For every finding listed in the report, you must verify if it is factually correct according to the specification.
4.  **CITE SOURCE OF TRUTH**: For every determination (valid or invalid), you must point to the specific spec section anchor (e.g., `cssom-1 #parsing-selectors`) in the Bikeshed files.
5.  **PROVIDE RATIONALE**: You must provide a clear and detailed rationale for your determination.

## Workflow
1.  **Read Report**: Read the `spec_compliance_audit_report.md` or the input findings.
2.  **Validate Findings**: For each finding, find the relevant spec file in `submodules/` and verify the claim.
3.  **Generate Validation Report**: Provide a comprehensive report of your validations, indicating for each finding if it is VALID or INVALID, with spec citations and rationale.

## Constraints
- **Subagent Reuse**: If a subagent with the appropriate role and context already exists from a previous task, prefer reusing it via `send_message` instead of invoking a new one.
