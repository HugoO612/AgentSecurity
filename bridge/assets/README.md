# Bundled Release Assets

This directory is intentionally required by the formal release path.

Public release candidates must place the real bundled artifacts here:
- `agent-security-rootfs.tar`
- `openclaw-agent.pkg`
- `openclaw-bootstrap.sh`

Rules:
- do not commit placeholder binaries and call them release-ready assets
- `dev-busybox-placeholder` is valid only for local packaging checks and is rejected by the release gate
- do not produce live release evidence until the real files are present
- record and verify separate SHA256 values for all files
- do not switch the formal release path to a user-managed distro or Windows host install as a fallback

