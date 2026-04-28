# Bundled Release Assets

This directory is intentionally required by the formal release path.

Public release candidates must place the real bundled artifacts here:
- `agent-security-rootfs.tar`
- `agent-security-agent.pkg`

Rules:
- do not commit placeholder binaries and call them release-ready assets
- do not produce live release evidence until the real files are present
- record and verify separate SHA256 values for both files
- do not switch the formal release path to a user-managed distro or Windows host install as a fallback
