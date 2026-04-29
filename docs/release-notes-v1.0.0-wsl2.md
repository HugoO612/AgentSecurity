# AgentSecurity v1.0.0 One-Click WSL2 Release Notes

This release defaults to a Windows EXE that opens into a one-click WSL2 isolated deployment on Windows. It is the supported public install path for v1, and it keeps OpenClaw inside a dedicated `AgentSecurity` runtime instead of installing the agent directly into the Windows host.

## One-Click Install

1. Download `AgentSecurity Setup.exe` from the GitHub Release assets.
2. Run the Windows installer. If Windows shows an unknown publisher warning, verify the `.sha256` file from the GitHub Release before installing.
3. Open AgentSecurity after install and click the one explicit action to install WSL2 and OpenClaw.
4. Approve the Windows administrator prompt if WSL2 setup requires it.
5. Wait for the installer to create the dedicated `AgentSecurity` WSL2 environment.
6. Use the app controls to start, stop, rebuild, or delete the environment.

If Windows says WSL2 is disabled, enable or install WSL2, reboot if prompted, then rerun the installer. If Windows restarts during setup, rerun the installer after reboot. If the agent fails to start, retry start first, then rebuild, or delete and reinstall.

## v1 Scope

- Windows only.
- WSL2 only.
- Dedicated `AgentSecurity` distro only.
- Bundled rootfs and bundled OpenClaw package only.
- No install into the Windows host runtime.
- No reuse of user-managed Ubuntu or another existing distro.

## Safety Boundary

- The agent stays inside the dedicated `AgentSecurity` isolated environment.
- Windows-side writes are expected only in controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`.
- Administrator permission is only needed when Windows must enable required subsystem features.
- `stop`, `rebuild`, and `delete` are the supported control and rollback actions.
- `delete` removes the dedicated environment and runtime state, then verifies that the dedicated environment is gone.

## Deployment Direction

- Default Windows path: the one-click WSL2 isolated route used by this release.
- Default downloadable artifact: `AgentSecurity Setup.exe` plus `.sha256`.
- Not shipped in this release: cloud-hosted managed deployment.
- Reason: v1 evidence, recovery, and support procedures are all built around one controlled WSL2 isolation boundary.

## Release Gate

The v1 public release gate requires:

- main lifecycle live validation: install, start, stop, rebuild, and delete
- bundled assets manifest matching release evidence
- real validation for `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`
- documented recovery guidance for `wsl_disabled`, `reboot_interrupted`, and `startup_failure`
- `AgentSecurity Setup.exe` SHA256 verified, with signature status recorded as `Valid` or `Unsigned`
- passing `scripts/validate-release-candidate.mjs`

AgentSecurity v1 has verified the main install/start/stop/rebuild/delete lifecycle and covers critical failure scenarios. Some system-level boundary cases, including WSL not enabled, reboot interruption, and agent startup failure, provide explicit recovery guidance; later versions will continue improving automatic recovery.
