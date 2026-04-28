# Exception Matrix Validation

Use this runbook only after the bundled assets are frozen and the core live lifecycle passes.

## Completion Definition

Completion for public v1 means:

- main lifecycle passes in `live` mode
- the 4 blocking cases are triggered on controlled Windows machines or snapshots
- each blocking case records trigger method, actual error code, user-visible message, recommended recovery, recovery result, and evidence
- the 3 documented limitations have user-facing recovery documentation and evidence links to that documentation
- `node scripts/validate-release-candidate.mjs --evidence <evidence-file>` passes
- release docs match the observed behavior

Do not set `goNoGo.decision` to `go` until all items above are true.

## Blocking Cases

Record these fields for every blocking case:

- `triggerMethod`
- `errorCode`
- `userVisibleMessage`
- `recommendedRecovery`
- `actualRecoveryResult`
- `evidence`

## Documented Limitations

These do not block public v1 by themselves, but must stay honest and actionable:

- `wsl_disabled`
- `reboot_interrupted`
- `startup_failure`

Record at minimum:

- `userVisibleMessage`
- `recommendedRecovery`
- `documentationReference`
- `recoverySummary`

## Case Matrix

### permission_denied

Trigger by denying the Windows administrator prompt on a clean controlled machine where WSL enablement requires elevation.

Expected evidence:
- actual bridge error code
- exact user-visible permission message
- recovery path after granting permission

### wsl_disabled

Documented limitation for v1. This case does not require real-machine matrix evidence before public release, but user-facing recovery guidance must stay present and accurate.

Required documentation:
- user-visible message explaining that WSL2 is unavailable or not enabled
- recovery guidance to install or enable WSL2, reboot if Windows requests it, then rerun AgentSecurity install
- evidence link to this recovery guidance in the release evidence

### reboot_interrupted

Documented limitation for v1. This case does not require real-machine matrix evidence before public release, but the user must have a clear recovery path.

Required documentation:
- user-visible message that installation was interrupted before completion
- recovery guidance to rerun the installer after reboot so it can check state and continue or recommend reinstall
- evidence link to this recovery guidance in the release evidence

### artifact_missing

Trigger by removing or renaming one frozen bundled artifact before install.

Expected evidence:
- missing artifact error code
- user-visible message
- recovery result after restoring the exact frozen artifact

### checksum_mismatch

Trigger by changing one artifact or configuring a mismatched SHA256 while keeping the frozen evidence values unchanged.

Expected evidence:
- checksum mismatch error code
- user-visible message
- recovery result after restoring the exact frozen artifact and checksum

### startup_failure

Documented limitation for v1. This case does not require real-machine matrix evidence before public release, but recovery must be explicit.

Required documentation:
- user-visible message that the environment installed but the agent did not start
- recovery guidance to retry start, rebuild the environment, or delete and reinstall
- evidence link to this recovery guidance in the release evidence

### delete_failure

Trigger by blocking delete on a controlled machine, for example by holding the distro resources open or forcing `wsl --unregister AgentSecurity` failure.

Expected evidence:
- delete error code
- user-visible message
- recovery result after releasing the block and retrying delete

## Final Gate

Run:

```powershell
node scripts\validate-release-candidate.mjs --evidence docs\release-evidence-<date>-live.json
```

Only after this passes may release owners:

- set `goNoGo.decision` to `go`
- update `docs/release-checklist.md` from `HOLD / NO-GO` to release-ready
- update `README.md` to say the formal path is recommended for ordinary users
