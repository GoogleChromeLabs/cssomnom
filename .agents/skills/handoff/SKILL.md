---
name: handoff
description: >
  Generates a crisp, structured summary of the current project state,
  user knowledge, work accomplished, model knowledge, and next steps.
  Use this skill when the user asks for a "handoff" or "checkpoint summary".
---

# Handoff Skill

This skill provides you with a structured template to generate a high-fidelity summary of the current state of the project, suitable for starting a new conversation or handing off work to another agent.

## Instructions

When the user asks for a "handoff" or "checkpoint summary", you MUST generate a response following this exact 5-part structure:

### 1. Outstanding Requests & Guardrails
- List all active background tasks and their IDs.
- List current rules, personas (e.g., "Champ"), and guardrails established in the conversation.

### 2. User Knowledge & Workflow Decisions
- Summarize preferences, choices, and specific instructions provided by the user.

### 3. Work Accomplished
- Summarize the milestones reached and files modified since the last summary or checkpoint.

### 4. Model Knowledge & Edge Cases
- Document technical discoveries, specific error resolutions, and insights gained during the session.

### 5. Current Work & Next Steps
- Detail what is happening right now and what tasks are immediately next on the plan.

Keep each section concise but technically detailed. Use standard markdown for formatting.
