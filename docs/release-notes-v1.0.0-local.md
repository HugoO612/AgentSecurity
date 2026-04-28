# AgentSecurity v1.0.0 Local Edition Release Notes

This release is the supported local Windows edition for users who need same-machine execution. It is a limited recommendation path, not a claim that every ordinary user should prefer local setup over future managed deployment options.

## One-Click Install

1. Download the one-click installer package from the GitHub Release assets.
2. Extract the zip and run `Install-AgentSecurity.bat` on Windows.
3. Approve the Windows administrator prompt if WSL2 setup requires it.
4. Wait for the installer to create the dedicated `AgentSecurity` WSL2 environment.
5. Open AgentSecurity and use the app controls to start, stop, rebuild, or delete the environment.

This v1 package requires Node.js LTS and npm on the Windows machine before running the batch file.

If Windows says WSL2 is disabled, enable or install WSL2, reboot if prompted, then rerun the installer. If Windows restarts during setup, rerun the installer after reboot. If the agent fails to start, retry start first, then rebuild, or delete and reinstall.

## v1 Scope

- Windows only.
- WSL2 only.
- Dedicated `AgentSecurity` distro only.
- Bundled rootfs and bundled agent package only.
- No install into the Windows host runtime.
- No reuse of user-managed Ubuntu or another existing distro.

## Safety Boundary

- The agent stays inside the dedicated `AgentSecurity` isolated environment.
- Windows-side writes are expected only in controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`.
- Administrator permission is only needed when Windows must enable required subsystem features.
- `stop`, `rebuild`, and `delete` are the supported control and rollback actions.
- `delete` removes the dedicated environment and runtime state, then verifies that the dedicated environment is gone.

## Deployment Direction

- Recommended local path: the WSL2 isolated route used by this release.
- Not shipped in this release: cloud-hosted managed deployment.
- Reason: v1 evidence, recovery, and support procedures are all built around one controlled local isolated boundary.

## Release Gate

The v1 public release gate requires:

- main lifecycle live validation: install, start, stop, rebuild, and delete
- bundled assets manifest matching release evidence
- real validation for `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`
- documented recovery guidance for `wsl_disabled`, `reboot_interrupted`, and `startup_failure`
- passing `scripts/validate-release-candidate.mjs`

AgentSecurity v1 has verified the main install/start/stop/rebuild/delete lifecycle and covers critical failure scenarios. Some system-level boundary cases, including WSL not enabled, reboot interruption, and agent startup failure, provide explicit recovery guidance; later versions will continue improving automatic recovery.
