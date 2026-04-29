# Release Freeze Record

Candidate version: `2026.04.28-rc1`  
Source commit recorded by asset manifest: `0ce54c8`  
Decision: `GO`

## Frozen Assets

The current candidate assets are recorded in `bridge/assets/release-assets-manifest.json`.

- Rootfs path: `bridge/assets/agent-security-rootfs.tar`
- Rootfs SHA256: `9a6aefb429f2208933d56b122dbaf40c1a5d15e06cfaddd361f380ec277fab5d`
- Agent path: `bridge/assets/openclaw-agent.pkg`
- Agent SHA256: `57b93134c89a3a51c5bcf00ad5b395500dbc013532d4d13ebc9247846abb237b`
- Update policy: `bundled-only`

## Evidence Binding

The public release gate requires:

- evidence `commit` equals manifest `sourceCommit`
- evidence bundled asset version equals manifest version
- evidence bundled asset paths equal the fixed `bridge/assets/` paths
- evidence bundled SHA256 values equal the manifest and actual file hashes

## Release Decision

The core live lifecycle passes, the bundled assets match the manifest and evidence, and the 4 v1 blocking exceptions are complete: `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`. The remaining documented limitations for v1 are `wsl_disabled`, `reboot_interrupted`, and `startup_failure`. `AgentSecurity Setup.exe` is produced, recorded in evidence with SHA256 and `signatureStatus: "Unsigned"`, and accepted by the release gate.

