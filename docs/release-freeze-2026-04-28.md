# Release Freeze Record

Candidate version: `2026.04.28-rc1`  
Source commit recorded by asset manifest: `88e3cb6`  
Decision: `GO`

## Frozen Assets

The current candidate assets are recorded in `bridge/assets/release-assets-manifest.json`.

- Rootfs path: `bridge/assets/agent-security-rootfs.tar`
- Rootfs SHA256: `c8393f681033d6b41cf3ca0b8863193fd6dd3fd3efbd7808faf79ff55b5a9159`
- Agent path: `bridge/assets/agent-security-agent.pkg`
- Agent SHA256: `c96935f893a0235af6fb6cafa1962212b153ff8a9c6f51bd30bbe7fd8997e6c0`
- Update policy: `bundled-only`

## Evidence Binding

The public release gate requires:

- evidence `commit` equals manifest `sourceCommit`
- evidence bundled asset version equals manifest version
- evidence bundled asset paths equal the fixed `bridge/assets/` paths
- evidence bundled SHA256 values equal the manifest and actual file hashes

## Release Decision

The core live lifecycle passes, the bundled assets match the manifest and evidence, and the 4 v1 blocking exceptions are complete: `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure`. The remaining documented limitations for v1 are `wsl_disabled`, `reboot_interrupted`, and `startup_failure`. This freeze record approves publishing the v1 GitHub release.
