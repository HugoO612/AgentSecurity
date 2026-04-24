# Agent Security Support Process

## Intake

Collect:
- user symptom
- current state page screenshot
- exported support bundle

## First-pass Triage

1. Validate bridge connectivity.
2. Check latest operation and stage.
3. Check failure stage/type/code.
4. Review command audit summaries.
5. Review boundary and delete reports.

## Response Policy

- If retryable transient failure: guide `retry`.
- If environment inconsistency or repeated start failure: guide `rebuild`.
- If cleanup needed: guide `delete`.
- If policy/permission/system blocking: guide `go_fix` and system remediation.

## Escalation

Escalate when:
- support bundle is missing required sections
- repeated failure after rebuild
- integrity verification fails repeatedly
