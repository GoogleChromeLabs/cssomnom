---
name: high-scrutiny-spec-compliance-agent-launcher
description: Kicks off multiple spec compliance auditor subagents and consolidates their reports after validation.
---

# High-Scrutiny Spec Compliance Agent Launcher

This skill is used to launch a comprehensive compliance audit of the CSSOM parser against W3C specifications.

## Workflow
1.  **Spawn Auditors**: Spawn specialized read-only subagents (`Model: 'flash'`) in parallel for assigned specifications:
    *   **CSSOM Auditor**: `submodules/csswg-drafts/cssom-1/Overview.bs` and `css-style-attr-1/Overview.src.html` -> `src/types.ts`, `src/CSSOM.ts`, `src/CSSStyleDeclaration.ts`, `src/css-escape.ts`, and `src/rules/`.
    *   **CSS Syntax Auditor**: `submodules/csswg-drafts/css-syntax-3/Overview.bs` -> `src/tokenizer.ts`, `src/AbstractTokenizer.ts`, `src/streaming-tokenizer.ts`, `src/TokenStream.ts`, `src/parser.ts`, and `src/serializer.ts`.
    *   **Selectors Auditor**: `submodules/csswg-drafts/selectors-4/Overview.bs`, `css-namespaces-3/Overview.bs`, and relevant HTML matching hooks in `submodules/whatwg-html/source` -> `src/SelectorParser.ts`, `src/specificity.ts`, and `src/matcher.ts`.
    *   **Values & Typed OM Auditor**: `submodules/csswg-drafts/css-values-4/Overview.bs`, `submodules/css-houdini-drafts/css-typed-om/Overview.bs`, and `submodules/css-houdini-drafts/css-typed-om-2/Overview.bs` -> `src/math-parser.ts` and `src/typed-om/`.
    *   **Properties & Variables Auditor**: `submodules/csswg-drafts/css-variables-1/Overview.bs` and `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs` -> `src/PropertyRegistry.ts` and `src/cascade/variable-resolver.ts`.
    *   **Nesting Auditor**: `submodules/csswg-drafts/css-nesting-1/Overview.bs` -> `src/parser.ts`, `src/rules/`, and `src/cascade/rule-filter.ts`.
    *   **Cascade Auditor**: `submodules/csswg-drafts/css-cascade-5/Overview.bs` and `css-cascade-6/Overview.bs` -> `src/cascade/`.
    *   **Media Queries Auditor**: `submodules/csswg-drafts/mediaqueries-4/Overview.bs` -> `src/MediaParser.ts`.
    *   **Conditional Auditor**: `submodules/csswg-drafts/css-conditional-3/Overview.bs` and `css-conditional-4/Overview.bs` -> `src/parser.ts`, `src/rules/at-rules.ts`, and `src/parser-api.ts`.
    *   **Logical Properties & Shorthands Auditor**: `submodules/csswg-drafts/css-logical-1/Overview.bs` -> `src/shorthands.ts`, `src/CSSStyleDeclaration.ts`, and `src/data/gen/LogicalMapping.ts`.
    > [!IMPORTANT]
    > **Tooling Requirement**: Spawned subagents MUST use `Model: 'flash'` and have read-only access (`EnableWriteTools: false`) to read specs and source files.
2.  **General Task for Auditors**:
    *   Read `README.md` (Intentional Deviations / Non-Goals) and `AGENTS.md` (7 Browser-Only Capability Boundaries + Spec Citations policy) first so intentional non-goals are never flagged as compliance bugs.
    *   Read the relevant spec in `submodules/` (`csswg-drafts/`, `css-houdini-drafts/`, `whatwg-html/`) and compare against `src/`.
    *   Report findings in **two strictly separated buckets**:
        1.  **Behavioral Compliance**: Genuine algorithmic, parsing, serialization, cascade, or matching discrepancies vs the normative spec, with `src/` file:line links and verified `<spec> #<anchor>` citations.
        2.  **Citation Hygiene** (governed by the 3-trigger high-bar policy in `AGENTS.md` — no ceremonial spam):
            *   **Retarget**: Existing comment's `#anchor` does not match the algorithm actually implemented underneath it, or points to a renamed/non-existent anchor.
            *   **Prune**: Ceremonial citation on a trivial getter/setter, basic character predicate, or internal helper, or leftover `§ X.Y` section numbers on vendored specs.
            *   **Add (high bar only)**: A non-obvious normative algorithm entry point or subtle step-ordering/edge-case invariant in `src/` has zero citation today and a future refactor could silently break conformance without `// <spec> #<anchor>: why`.
3.  **Wait for Reports**: Wait for all auditors to complete and report back.
4.  **Consolidate Findings**: Consolidate all auditor findings into `docs/reports/spec_compliance_audit_report.md` (keeping Behavioral Compliance and Citation Hygiene cleanly separated). **Ensure this file is fully updated before proceeding.**
5.  **Add Tentative Findings to Plan**: Append the unverified findings to `PLAN.md` in a new phase, marking them as `(UNVERIFIED — pending Scrutineer)`. **This must be done before invoking the Scrutineer.**
6.  **Spawn Scrutineer**: Spawn a read-only `scrutineer` subagent (`Model: 'flash'`) using the `scrutineer` skill to validate every Behavioral Compliance and Citation Hygiene finding in `docs/reports/spec_compliance_audit_report.md` against both `submodules/` and `src/`.
7.  **Revise Plan**: Once the Scrutineer returns its validation report, prune invalidated findings from `docs/reports/spec_compliance_audit_report.md` and `PLAN.md`, and remove the unverified tag.

## Constraints
- Auditors must cite verified spec anchors in `// <spec> #<anchor>[: optional step/note]` format (no `§ X.Y` section numbers for vendored specs).
- Scrutineer must ignore its own training weights and verify every claim against both repo specs (`submodules/`) and current `src/` code.
- Auditors and Scrutineer must be read-only (`EnableWriteTools: false`) and run on `Model: 'flash'`.
