# Agent Security Release Checklist

Release: v1.0.0-local  
Date: 2026-04-28  
Owner: Hugo  
Commit: `88e3cb6`

## Build and Test

- [x] `npm run build:assets -- 2026.04.28-rc1` passes
  - Result: generated `bridge/assets/agent-security-rootfs.tar`, `bridge/assets/agent-security-agent.pkg`, and `bridge/assets/release-assets-manifest.json`
- [x] `npm run validate:live -- docs\release-evidence-2026-04-28-live.json` passes live lifecycle
  - Result: install, stop, start, rebuild, and delete succeeded in `live` mode
- [x] `npm run lint` passes
  - Result: passed on 2026-04-28 in current workspace
- [x] `npm test` passes
  - Result: 17 files / 52 tests passed on 2026-04-28 in current workspace
- [x] `npm run build` passes
  - Result: passed on 2026-04-28 in current workspace
- [x] `node scripts/run-blocking-exception-validation.mjs docs\release-evidence-2026-04-28-live.json` passes
  - Result: permission denied, artifact missing, checksum mismatch, and delete failure validated
- [x] `node scripts/validate-release-candidate.mjs --evidence docs\release-evidence-2026-04-28-live.json` passes
  - Result: public release gate passed

## Candidate Gate

- Before public release, use:
  - `docs/go-no-go.md`
  - `docs/real-machine-validation-template.md`
  - `docs/release-evidence-template.json`
  - `docs/bundled-assets-spec.md`
  - `docs/install-guide.md`
  - `docs/risk-explanation.md`
  - `docs/uninstall.md`
  - `docs/recovery-guide.md`
  - `docs/support-guide.md`
  - `node scripts/validate-release-candidate.mjs --evidence <live-evidence.json>`
- Public candidate evidence must be recorded in `live` mode and must not inherit historical shim rehearsal as release proof.

## Current Candidate Status

- [x] bundled rootfs and bundled agent artifact exist
  - Rootfs: `bridge/assets/agent-security-rootfs.tar`
  - Agent: `bridge/assets/agent-security-agent.pkg`
  - Manifest: `bridge/assets/release-assets-manifest.json`
- [x] current candidate validated on dedicated `AgentSecurity` distro for core lifecycle
  - Evidence: `docs/release-evidence-2026-04-28-live.json`
  - Delete verification: `wsl.exe -l -q` no longer lists `AgentSecurity`
- [x] candidate evidence passes public release gate script
  - Status: passed
  - Current evidence check:
    - Command: `node scripts/validate-release-candidate.mjs --evidence docs\release-evidence-2026-04-28-live.json`
    - Result: passed
- [x] v1 blocking exceptions validated
  - Status: complete
  - Validated cases: permission denied, artifact missing, checksum mismatch, delete failure
  - Required format: every case must record `triggerMethod`, `errorCode`, `userVisibleMessage`, `recommendedRecovery`, `actualRecoveryResult`, and `evidence`
  - Gate behavior: `NOT_VALIDATED`, `REPLACE_ME`, `missing`, or empty fields fail the blocking release gate
- [x] documented limitation recovery guidance confirmed
  - Status: complete
  - Required documented cases: WSL disabled, reboot interrupted, startup failure
  - Required fields: user-facing message, recommended recovery, and documentation reference

## Historical Evidence

- `docs/release-evidence-2026-04-24.json` remains a historical controlled rehearsal only.
- It is not valid public-release evidence because execution mode is not `live`, shimmed commands were used, target distro is `Ubuntu`, and it predates the current candidate commit.

## Release Decision

Release status for commit `88e3cb6`: `GO`

Public release can proceed because:

- the 4 v1 blocking exceptions are validated on controlled Windows machine states
- WSL disabled, reboot interrupted, and startup failure have accurate documented recovery guidance
- the live evidence is updated to `go`
- the updated live evidence passes `scripts/validate-release-candidate.mjs`
- README and release notes use the formal v1 public release wording
