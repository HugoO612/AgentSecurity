# AgentSecurity v1.0.0 Local Edition Release Notes

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

## Release Gate

The v1 public release gate requires:

- main lifecycle live validation: install, start, stop, rebuild, and delete
- bundled assets manifest matching release evidence
- real validation for `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`
- documented recovery guidance for `wsl_disabled`, `reboot_interrupted`, and `startup_failure`
- passing `scripts/validate-release-candidate.mjs`

AgentSecurity v1 has verified the main install/start/stop/rebuild/delete lifecycle and covers critical failure scenarios. Some system-level boundary cases, including WSL not enabled, reboot interruption, and agent startup failure, provide explicit recovery guidance; later versions will continue improving automatic recovery.
