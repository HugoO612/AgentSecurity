# Agent Security Recovery Guide

## Recovery Actions

### `retry`

Use `retry` when the failure was transient and the environment structure is still expected to be valid.

Typical cases:
- temporary permission interruption
- temporary WSL update failure
- temporary artifact staging failure

### `rebuild`

Use `rebuild` when the dedicated `AgentSecurity` distro exists but the installed runtime is inconsistent.

What it does:
- stops the running agent if present
- clears `/opt/agent-security/current` and `/opt/agent-security/inbox` inside the dedicated distro
- removes local staged runtime files
- reinstalls the bundled agent artifact
- rewrites runtime config
- starts the agent again and runs health check

Use `rebuild` when:
- start keeps failing
- health check keeps failing
- the product recommends rebuild after install corruption

### `delete`

Use `delete` when the user wants to fully remove the current Agent Security environment.

What it does:
- stops the running agent if present
- unregisters the dedicated `AgentSecurity` distro
- removes runtime state files under the controlled Agent Security paths
- verifies that the dedicated distro is gone

Use `delete` when:
- uninstall is the goal
- rebuild is no longer desired
- support asks for a clean reinstall from zero

## Which Action To Choose

- choose `retry` first for temporary or permission-related failure
- choose `rebuild` for repeated startup or health-check failure
- choose `delete` for uninstall or full reset

Stop and contact support if:
- checksum validation fails
- delete verification fails
- the product reports unexpected host-impact behavior

## v1 Documented System Limitations

### WSL is disabled

If Windows reports that WSL2 is unavailable or not enabled, install or enable WSL2 from Windows features or the official Windows WSL installer path. Reboot if Windows asks for it, then rerun AgentSecurity install.

### Reboot interrupts installation

If Windows restarts before installation finishes, rerun the AgentSecurity installer after reboot. The installer checks the current state and either continues from the safe point or recommends a reinstall.

### Agent startup fails

If the environment installs but the agent does not start, retry start first. If startup keeps failing, use `rebuild`; if rebuild does not recover, use `delete` and reinstall from the bundled release package.
