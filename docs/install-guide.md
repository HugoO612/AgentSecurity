# Agent Security Formal Install Guide

## Prerequisites

- Windows machine with local isolation capability available.
- Local controlled bridge can be started successfully.
- Network available for artifact download and verification.

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
- Prepares dedicated isolated runtime.
- Installs agent and writes runtime config.
- Starts runtime and runs initial health check.
- Emits install summary and reports.

## What Installer Does Not Do

- Does not run the agent directly in Windows host runtime.
- Does not allow arbitrary shell command execution from UI.
- Does not skip checksum verification for artifacts.
