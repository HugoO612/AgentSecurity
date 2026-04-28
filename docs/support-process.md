# Agent Security Support Process

This document is for internal support and release triage. End-user guidance lives in `docs/support-guide.md`.

## Intake

Collect:
- user symptom
- current state page screenshot
- exported support bundle
- release candidate version or public version
- whether the run was `live` or `dev-shim`

## First-pass Triage

1. Validate bridge connectivity.
2. Check latest operation and stage.
3. Check failure stage/type/code.
4. Review command audit summaries.
5. Review boundary and delete reports.
6. Confirm whether the failure happened during install, start, rebuild, or delete.

## Response Policy

- If retryable transient failure: guide `retry`.
- If environment inconsistency or repeated start failure: guide `rebuild`.
- If cleanup needed: guide `delete`.
- If policy/permission/system blocking: guide `go_fix` and system remediation.

## Event Severity

- `sev-0`: possible host-impact or uncontrolled Windows write behavior
- `sev-1`: install/start/delete blocked for multiple users with no reliable recovery
- `sev-2`: recoverable single-user failure with stable retry/rebuild/delete guidance
- `sev-3`: doc confusion, cosmetic state mismatch, or low-risk support request

## Escalation

Escalate when:
- support bundle is missing required sections
- repeated failure after rebuild
- integrity verification fails repeatedly
- execution mode is unexpectedly `dev-shim` on a public candidate or production build
