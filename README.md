# Agent Security v1 Local Edition

AgentSecurity v1 is a Windows-only local product that installs and runs the agent inside a dedicated WSL2 runtime on the same machine.

## Install For Regular Users

1. Download the one-click installer package from the GitHub Release.
2. Run the installer on Windows.
3. Approve the Windows administrator prompt if WSL2 setup requires it.
4. Wait for AgentSecurity to create the dedicated `AgentSecurity` WSL2 environment from the bundled release files.
5. Use the app controls to start, stop, rebuild, or delete the local environment.

If Windows says WSL2 is not enabled, enable or install WSL2, reboot if prompted, then run the installer again. If installation is interrupted by reboot, rerun the installer after Windows starts. If the agent does not start, retry start first, then use rebuild or delete and reinstall.

AgentSecurity v1 has verified the main install/start/stop/rebuild/delete lifecycle and covers critical failure scenarios. Some system-level boundary cases, including WSL not enabled, reboot interruption, and agent startup failure, provide explicit recovery guidance; later versions will continue improving automatic recovery.

Public v1 scope is fixed:
- Windows only
- WSL2 only
- dedicated `AgentSecurity` distro only
- bundled rootfs + bundled agent artifact only
- no direct install into the Windows host runtime
- no reuse of a user-managed Ubuntu or other existing distro

Current release status:
- current workspace is `GO` for v1 public release
- bundled candidate assets exist under `bridge/assets/`
- live lifecycle evidence exists at `docs/release-evidence-2026-04-28-live.json`
- the 4 v1 blocking exceptions are validated and recorded in `docs/blocking-exception-results-2026-04-28.json`

## Technical Boundary

- The agent runs only inside the dedicated `AgentSecurity` WSL2 distro.
- The bridge is the only entry for high-risk local actions.
- The formal release path does not allow custom distro names, custom install paths, or host-runtime fallback.
- If the dedicated distro is missing, the formal installer creates it from the bundled rootfs.
- Critical v1 blockers are: `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`.

## Core Scripts

- `npm run dev`: start app dev server
- `npm run dev:bridge`: start local bridge
- `npm run dev:full`: start app + bridge together
- `npm run test`: run tests and term checks
- `npm run lint`: run lint
- `npm run build:assets -- <version>`: build bundled rootfs and agent package into `bridge/assets/`
- `npm run validate:live -- <evidence-path>`: run live WSL2 lifecycle validation and write evidence
- `npm run build`: build bridge + frontend
- `node scripts/validate-release-candidate.mjs --evidence <live-evidence.json>`: validate public release evidence

## Formal Docs

- [Formal Install Guide](docs/install-guide.md)
- [Risk Explanation](docs/risk-explanation.md)
- [Uninstall Guide](docs/uninstall.md)
- [Recovery Guide](docs/recovery-guide.md)
- [Support Guide](docs/support-guide.md)
- [Bundled Asset Spec](docs/bundled-assets-spec.md)
- [Exception Matrix Validation](docs/exception-matrix-validation.md)
- [Release Freeze Record](docs/release-freeze-2026-04-28.md)
- [Release Notes](docs/release-notes-v1.0.0-local.md)
- [FAQ](docs/faq.md)
- [Release Checklist](docs/release-checklist.md)
- [Go / No-Go Table](docs/go-no-go.md)
- [Real Machine Validation Template](docs/real-machine-validation-template.md)
