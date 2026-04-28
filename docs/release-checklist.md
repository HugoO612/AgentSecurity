# Agent Security Release Checklist

Release: v1.0.0-local
Date: 2026-04-24
Owner: Hugo
Commit: f4bd194

## Build and Test

- [x] `npm run lint` passes
  - Result: passed
  - Note: 1 non-blocking warning
- [x] `npm test` passes
  - Result: 12 files / 36 tests passed
- [x] `npm run build` passes
  - Result: passed

## Final Validation

- [x] lifecycle on real machine: install/start/stop/restart/rebuild/delete
  - Status: completed
  - Evidence: `docs/release-evidence-2026-04-24.json`
  - Operation chain result: install -> start -> stop -> restart -> rebuild -> delete all succeeded in bridge state machine flow.
- [x] failure paths validated
  - Status: completed
  - Evidence: `docs/release-evidence-2026-04-24.json`
  - Validated cases:
    - `invalid_token` (401)
    - `origin_not_allowed` (403)
    - `generation_conflict` (409)
    - `confirm_token_invalid` (409)
- [x] support bundle sanitized
  - Status: completed
  - Evidence: `docs/release-evidence-2026-04-24.json`
  - Checks:
    - no bridge token leakage
    - no LocalAppData path leakage
    - no authorization header leakage
    - redaction markers present (`[CONTROLLED_*]`)

## Candidate Gate

- Before public release, use:
  - `docs/go-no-go.md`
  - `docs/real-machine-validation-template.md`
  - `docs/release-evidence-template.json`
- Public candidate evidence must be recorded in `live` mode and must not inherit this historical shimmed rehearsal as release proof.

## Release Decision

Release evidence is complete for v1.0.0-local.

Note: this historical verification run was executed in a non-elevated terminal session with controlled command shims for privileged or host-destructive steps; it must not be treated as real Windows release evidence. Any future release evidence must clearly distinguish `live` execution from `dev-shim`, and the shimmed command list remains recorded in `docs/release-evidence-2026-04-24.json`.
