# Agent Security Formal Install Guide

## Scope

This guide applies only to the formal Windows release path:
- Windows only
- WSL2 only
- dedicated `AgentSecurity` distro only
- bundled rootfs and bundled agent artifact only

The formal release does not:
- install into the Windows host runtime
- reuse an existing Ubuntu distro
- support custom distro names or custom install targets

This is the recommended local path for Windows users who need local execution. It is not a direct-host install path and it is not the promised fit for every future user segment.

## Before You Start

- The app may request administrator permission if WSL features must be enabled.
- The machine may need to reboot before install can continue.
- A normal install or rebuild can take several minutes depending on WSL setup and machine speed.
- The expected Windows-side write scope is limited to controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`.
- The supported rollback paths are `stop`, `rebuild`, and `delete`.

## Install Flow

1. Open the app and load the current environment snapshot.
2. Run precheck.
3. If the app requests permission, approve the Windows administrator prompt.
4. If Windows feature enablement requires a reboot, reboot the machine and reopen the app.
5. Start install.
6. Wait while the installer:
   collects facts, enables WSL features when needed, creates the dedicated `AgentSecurity` distro, imports the bundled rootfs, stages the bundled agent artifact, verifies checksum, writes runtime config, starts the agent, and runs health check.
7. Review the final state and keep the support bundle available in case recovery is needed.

## What Installer Does

- Collects system facts.
- Enables required features when needed.
- Automatically prepares the dedicated `AgentSecurity` distro when missing.
- Imports the bundled rootfs.
- Installs the bundled agent artifact and writes runtime config.
- Starts the runtime and runs initial health check.
- Emits install summary and reports.

## Host Boundary

What it can change on the Windows host:
- controlled runtime state
- controlled diagnostics
- controlled reports
- dedicated distro install root

What it should not do in the public release path:
- run the agent directly in the Windows host runtime
- reuse a user-managed Ubuntu environment
- write agent runtime files into arbitrary user folders
- skip bundled artifact checksum verification

## What Installer Does Not Do

- Does not run the agent directly in Windows host runtime.
- Does not allow arbitrary shell command execution from UI.
- Does not skip checksum verification for artifacts.
- Does not fall back to a user-managed Ubuntu or other custom distro in the public release path.
