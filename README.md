# Agent Security v1 One-Click WSL2 Deployment

AgentSecurity v1 defaults to a Windows EXE installer that opens into a one-click WSL2 isolated deployment flow for OpenClaw. The supported public install path creates and manages a dedicated `AgentSecurity` WSL2 runtime instead of installing the agent directly into the Windows host.

## Recommended Path

For Windows users, the default and recommended path is the one-click WSL2 isolated route shipped by this release.

This public v1 path is intentionally narrow:
- default install path is a dedicated `AgentSecurity` WSL2 runtime
- not a direct-host install path
- not a user-managed Ubuntu reuse path
- not the final answer for every future deployment mode

Users who do not want to own local subsystem setup and local recovery should wait for a future cloud-hosted managed option rather than bypass the WSL2 isolation boundary.

## Install For Regular Users

1. Download `AgentSecurity Setup.exe` from the GitHub Release.
2. Run the Windows installer. You do not need to extract a zip or install Node.js.
   - If Windows shows an unknown publisher warning, verify the `.sha256` file from the GitHub Release before installing.
3. When the app opens for the first time, review the scope and click the one explicit action to install WSL2 and OpenClaw.
4. Approve the Windows administrator prompt if WSL2 setup requires it.
5. Wait for AgentSecurity to create the dedicated `AgentSecurity` WSL2 environment and stage the bundled OpenClaw package.
6. Use the app controls to start, stop, rebuild, or delete the dedicated WSL2 environment.

If Windows says WSL2 is not enabled, enable or install WSL2, reboot if prompted, then run the installer again. If installation is interrupted by reboot, rerun the installer after Windows starts. If the agent does not start, retry start first, then use rebuild or delete and reinstall.

AgentSecurity v1 has verified the main install/start/stop/rebuild/delete lifecycle and covers critical failure scenarios. Some system-level boundary cases, including WSL not enabled, reboot interruption, and agent startup failure, provide explicit recovery guidance; later versions will continue improving automatic recovery.

## Safety Boundary

- The agent runs only inside the dedicated `AgentSecurity` WSL2 distro.
- The release does not install the agent directly into the Windows host runtime.
- Expected Windows-side writes are limited to controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`.
- Administrator permission is only required when Windows must enable the subsystem features needed for the isolated environment path.
- `stop`, `rebuild`, and `delete` are the supported control and rollback paths.
- Delete keeps controlled diagnostics and reports, and should not leave runtime state outside controlled AgentSecurity paths.

Public v1 scope is fixed:
- Windows only
- WSL2 only
- dedicated `AgentSecurity` distro only
- bundled rootfs + bundled OpenClaw package only
- no direct install into the Windows host runtime
- no reuse of a user-managed Ubuntu or other existing distro

Current release status:
- current desktop release candidate is `GO` with unsigned EXE evidence and matching SHA256
- bundled candidate assets exist under `bridge/assets/`
- live lifecycle evidence exists at `docs/release-evidence-2026-04-29-live.json`
- the 4 v1 blocking exceptions are validated and recorded in `docs/blocking-exception-results-2026-04-28.json`
- public desktop release evidence includes `AgentSecurity Setup.exe`, its SHA256, and `signatureStatus: "Unsigned"`

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
- `npm run dev:desktop`: start the Electron shell against the dev renderer
- `npm run test`: run tests and term checks
- `npm run lint`: run lint
- `npm run build:assets -- <version>`: build bundled rootfs and agent package into `bridge/assets/`
- `npm run build:desktop`: build renderer, bridge, and Electron desktop shell
- `npm run package:desktop:dev`: build an unsigned EXE for local packaging validation
- `npm run package:desktop:release`: build the public EXE and `.sha256`; signs only when signing material is available
- `npm run package:desktop:signed`: require signing material and build a signed EXE
- `npm run release:github -- <tag>`: verify the EXE SHA256 and upload it as the default GitHub Release asset
- `npm run validate:live -- <evidence-path>`: run live WSL2 lifecycle validation and write evidence
- `npm run build`: build bridge + frontend
- `node scripts/validate-release-candidate.mjs --evidence <live-evidence.json>`: validate public release evidence

## Formal Docs

- [Formal Install Guide](docs/install-guide.md)
- [Safety Boundary](docs/safety-boundary.md)
- [Risk Explanation](docs/risk-explanation.md)
- [Uninstall Guide](docs/uninstall.md)
- [Recovery Guide](docs/recovery-guide.md)
- [Support Guide](docs/support-guide.md)
- [Bundled Asset Spec](docs/bundled-assets-spec.md)
- [Exception Matrix Validation](docs/exception-matrix-validation.md)
- [Release Freeze Record](docs/release-freeze-2026-04-28.md)
- [Release Notes](docs/release-notes-v1.0.0-wsl2.md)
- [Desktop Packaging Validation](docs/desktop-packaging-validation-2026-04-29.md)
- [FAQ](docs/faq.md)
- [Release Checklist](docs/release-checklist.md)
- [Go / No-Go Table](docs/go-no-go.md)
- [Real Machine Validation Template](docs/real-machine-validation-template.md)
