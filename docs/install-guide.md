# Agent Security Formal Install Guide

## Prerequisites

- Windows machine with local isolation capability available.
- Local controlled bridge can be started successfully.
- Bundled rootfs and bundled agent artifact are present in the candidate package.
- Candidate build is configured for the dedicated `AgentSecurity` distro only.

## Install Flow

1. Open app and select local isolated run mode.
2. Confirm preinstall scope.
3. Run precheck and resolve blocked items.
4. Click start install.
5. Wait for installer stages to complete.
6. Open install complete page and choose:
- `start`
- `rebuild`
- `uninstall`

## What Installer Does

- Collects system facts.
- Enables required features when needed.
- Automatically prepares dedicated isolated runtime and distro when missing.
- Installs bundled agent artifacts and writes runtime config.
- Starts runtime and runs initial health check.
- Emits install summary and reports.

## What Installer Does Not Do

- Does not run the agent directly in Windows host runtime.
- Does not allow arbitrary shell command execution from UI.
- Does not skip checksum verification for artifacts.
- Does not fall back to a user-managed Ubuntu or other custom distro in the public release path.
