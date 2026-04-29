# Agent Security Formal Install Guide

## Scope

This guide applies only to the formal Windows release path:
- Windows only
- WSL2 only
- dedicated `AgentSecurity` distro only
- bundled rootfs and bundled OpenClaw package only

The formal release does not:
- install into the Windows host runtime
- reuse an existing Ubuntu distro
- support custom distro names or custom install targets

This is the default and recommended Windows install path for v1. It is not a direct-host install path and it is not the promised fit for every future user segment.

## Before You Start

- The app may request administrator permission if WSL features must be enabled.
- The machine may need to reboot before install can continue.
- A normal install or rebuild can take several minutes depending on WSL setup and machine speed.
- The expected Windows-side write scope is limited to controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`.
- The supported rollback paths are `stop`, `rebuild`, and `delete`.

## Install Flow

1. Run `AgentSecurity Setup.exe` and open the app after installation finishes.
2. Click the one explicit action to install WSL2 and OpenClaw.
3. The app runs precheck first.
4. If the app requests permission, approve the Windows administrator prompt.
5. If Windows feature enablement requires a reboot, reboot the machine and reopen the app.
6. Wait while the installer:
   collects facts, enables WSL features when needed, creates the dedicated `AgentSecurity` distro, imports the bundled rootfs, stages the bundled OpenClaw package, verifies checksum, writes runtime config, starts OpenClaw, and runs health check.
7. Review the final state and keep the support bundle available in case recovery is needed.

## What Installer Does

- Collects system facts.
- Enables required features when needed.
- Automatically prepares the dedicated `AgentSecurity` distro when missing.
- Imports the bundled rootfs.
- Installs the bundled OpenClaw package and writes runtime config.
- Starts the runtime and runs initial health check.
- Emits install summary and reports.

## Host Boundary

What it can change on the Windows host:
- controlled runtime state
- controlled diagnostics
- controlled reports
- dedicated distro install root

What it should not do in the public release path:
- run OpenClaw directly in the Windows host runtime
- reuse a user-managed Ubuntu environment
- write OpenClaw runtime files into arbitrary user folders
- skip bundled artifact checksum verification

## What Installer Does Not Do

- Does not run OpenClaw directly in Windows host runtime.
- Does not allow arbitrary shell command execution from UI.
- Does not skip checksum verification for artifacts.
- Does not fall back to a user-managed Ubuntu or other custom distro in the public release path.
