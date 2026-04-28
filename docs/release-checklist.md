# Agent Security Release Checklist

Release: v1.0.0-local
Date: 2026-04-28
Owner: Hugo
Commit: c605d17

## Build and Test

- [x] `npm run lint` passes
  - Result: passed on 2026-04-28 in current workspace
- [x] `npm test` passes
  - Result: 17 files / 52 tests passed on 2026-04-28 in current workspace
- [x] `npm run build` passes
  - Result: passed on 2026-04-28 in current workspace

## Candidate Gate

- Before public release, use:
  - `docs/go-no-go.md`
  - `docs/real-machine-validation-template.md`
  - `docs/release-evidence-template.json`
  - `node scripts/validate-release-candidate.mjs --evidence <live-evidence.json>`
- Public candidate evidence must be recorded in `live` mode and must not inherit historical shim rehearsal as release proof.

## Current Candidate Status

- [ ] live release evidence for current candidate
  - Status: blocked
  - Required: real Windows machine, `live` mode, dedicated `AgentSecurity` distro, bundled rootfs, bundled agent artifact, checksum-verified install
  - Current blocker: repository does not contain release-ready bundled assets under `bridge/assets`, so a valid live candidate run cannot be produced from this workspace alone
- [ ] candidate evidence passes release gate script
  - Status: failed
  - Current evidence check:
    - Command: `node scripts/validate-release-candidate.mjs --evidence docs/release-evidence-2026-04-24.json`
    - Result: failed
    - Failure: `executionMode must be "live" for public launch evidence.`
- [ ] current candidate validated on dedicated `AgentSecurity` distro
  - Status: not completed
  - Current machine fact: `wsl.exe --status` reports existing `Ubuntu`; no current live evidence proves `AgentSecurity` was created, installed, rebuilt, and deleted successfully

## Historical Evidence

- `docs/release-evidence-2026-04-24.json` remains a historical controlled rehearsal only
- It is not valid public-release evidence because:
  - execution mode is not `live`
  - shimmed commands were used
  - target distro is `Ubuntu`
  - it predates the current candidate commit

## Release Decision

Release status for commit `c605d17`: `HOLD / NO-GO`

Public release must remain blocked until:

- live evidence is produced for the current candidate
- the live evidence passes `scripts/validate-release-candidate.mjs`
- the run uses the dedicated `AgentSecurity` distro with real bundled assets
- uninstall / rebuild / residual-item behavior is re-recorded for the current candidate
