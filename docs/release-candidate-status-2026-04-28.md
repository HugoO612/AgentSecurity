# Agent Security Candidate Status

Date: 2026-04-28  
Commit: `88e3cb6`  
Decision: `GO`

## Verified In This Workspace

- `npm run build:assets -- 2026.04.28-rc1`: passed
- `npm run validate:live -- docs\release-evidence-2026-04-28-live.json`: passed live lifecycle
- `node scripts/run-blocking-exception-validation.mjs docs\release-evidence-2026-04-28-live.json`: passed
- `node scripts/validate-release-candidate.mjs --evidence docs\release-evidence-2026-04-28-live.json`: passed
- `npm run lint`: passed
- `npm test`: passed (`17` files / `53` tests)
- `npm run build`: passed

## Live Lifecycle Evidence

- Evidence file: `docs/release-evidence-2026-04-28-live.json`
- Execution mode: `live`
- Target distro: `AgentSecurity`
- Shimmed commands: `[]`
- Lifecycle result: install, stop, start, rebuild, and delete succeeded
- Delete verification: `AgentSecurity` is absent from `wsl.exe -l -q` after delete
- Support bundle checks: no bridge token, no authorization header, no raw LocalAppData path

## Blocking Exception Evidence

- Evidence summary: `docs/blocking-exception-results-2026-04-28.json`
- `permission_denied`: validated
- `artifact_missing`: validated
- `checksum_mismatch`: validated
- `delete_failure`: validated
- `wsl_disabled`, `reboot_interrupted`, and `startup_failure`: documented recovery guidance linked from evidence

## Boundary And Recovery Evidence

- Runtime boundary: the agent runs only inside the dedicated `AgentSecurity` isolated environment
- Host write boundary: expected Windows-side writes are limited to controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`
- Recovery surface: `stop`, `rebuild`, and `delete` are the supported control and rollback actions
- Delete evidence: the dedicated environment is absent after delete, while controlled diagnostics and reports remain for support
- User-facing boundary docs: `README.md`, `docs/safety-boundary.md`, `docs/install-guide.md`, `docs/uninstall.md`, and `docs/support-guide.md`

## Bundled Assets

- Rootfs: `bridge/assets/agent-security-rootfs.tar`
- Agent package: `bridge/assets/agent-security-agent.pkg`
- Manifest: `bridge/assets/release-assets-manifest.json`
- Version: `2026.04.28-rc1`
- Update policy: `bundled-only`

## Public Release Gate Result

- Command:
  - `node scripts/validate-release-candidate.mjs --evidence docs\release-evidence-2026-04-28-live.json`
- Result:
  - passed

## Why The Current Candidate Is Ready

- The real install/start/stop/rebuild/delete chain is now proven on this machine.
- The bundled assets exist and match the evidence checksums.
- The 4 v1 blocking exceptions are validated:
  - permission denied
  - artifact missing
  - checksum mismatch
  - delete failure
- The remaining 3 cases are treated as documented limitations for v1, not release blockers:
  - WSL disabled
  - reboot interrupted
  - startup failure
- The release gate passes with `goNoGo.decision` set to `go`.

## Required Next Step

Publish the v1 GitHub release with the one-click installer package and the release notes in `docs/release-notes-v1.0.0-local.md`.
