# Desktop Packaging Validation

Date: 2026-04-29

## Scope

This record covers the Windows Electron shell and unsigned local NSIS packaging validation for the one-click WSL2 OpenClaw desktop path.

It is not final public release evidence because refreshed live release evidence still needs to bind this desktop installer SHA256 to the current candidate.

## Electron Shell

- Packaged app launched from `release/win-unpacked/AgentSecurity.exe`.
- Electron main process started the bridge by relaunching the packaged EXE with `ELECTRON_RUN_AS_NODE=1`.
- No external Node.js process was required for the packaged bridge.
- Renderer received `BootstrapConfig` through Electron preload.
- Renderer bootstrap token was used to call bridge `GET /health`.
- Bridge health response: `ok: true`, `version: 2.0.0`, `environmentId: local-default`.

## Bundled Assets

Packaged resources under `release/win-unpacked/resources/bridge-assets/`:

- `agent-security-rootfs.tar`
- `openclaw-agent.pkg`
- `release-assets-manifest.json`

Checksum validation against the packaged manifest passed:

- Rootfs SHA256: `9a6aefb429f2208933d56b122dbaf40c1a5d15e06cfaddd361f380ec277fab5d`
- OpenClaw package SHA256: `57b93134c89a3a51c5bcf00ad5b395500dbc013532d4d13ebc9247846abb237b`

## Local Installer

- `npm run package:desktop:dev` produced:
  - `release/AgentSecurity Setup.exe`
  - `release/AgentSecurity Setup.exe.sha256`
- The local dev installer is unsigned.
- Unsigned publication is allowed only when release evidence records `signatureStatus: "Unsigned"`, `signaturePolicy: "unsigned-accepted"`, and a user-visible install note.

## Release Packaging

`npm run package:desktop:release` builds the installer without blocking on signing material. If signing material is present, the installer is signed and verified.

Required signing inputs:

- `CSC_LINK` + `CSC_KEY_PASSWORD`, or
- `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`, or
- `CSC_NAME`

The public release gate requires `releaseArtifacts.windowsInstaller` evidence with a matching EXE SHA256 and signature status `Valid` or `Unsigned`.
