# Agent Security Safety Boundary

## Who This Release Is For

AgentSecurity v1 is the supported Windows release for users who want the default one-click WSL2 isolated deployment.

It is not the only long-term product direction. It is the current local path with the narrowest supported runtime boundary:

- Windows host
- dedicated `AgentSecurity` isolated environment
- bundled rootfs and bundled agent package
- fixed install and recovery flow

## What It Changes On The Host

AgentSecurity does not install the agent directly into the Windows host runtime.

Expected Windows-side writes are limited to controlled AgentSecurity paths under `%LOCALAPPDATA%\\AgentSecurity\\v2\\`:

- runtime state
- diagnostics
- reports
- dedicated distro install root

It should not write agent runtime files into arbitrary user folders, reuse an existing Ubuntu environment, or switch the agent into direct host execution.

## When It Needs Administrator Permission

Administrator permission is only needed when Windows must enable required subsystem features for the isolated environment path.

If the user refuses that permission:

- install must stop
- the product must not report fake success
- the user can retry later and approve the request

## What Runs With Ongoing Privilege

The release does not install a permanent Windows system service for the agent.

Normal runtime activity is expected to stay inside the dedicated isolated environment after setup completes. The Windows host keeps bridge state, diagnostics, and reports in controlled paths.

## How To Stop Using It

For a normal stop:

- open the app
- select `stop`

For a full reset:

- select `rebuild`

For full removal:

- select `delete`

Delete is the product's supported uninstall path. It removes the dedicated `AgentSecurity` registration and runtime state, then verifies the dedicated environment is gone.

## What Remains After Delete

Expected residue after delete:

- controlled diagnostics
- controlled reports
- controlled support artifacts

Unexpected residue that should be reported:

- `AgentSecurity` still appears in the isolated environment list
- runtime still reports `running`
- files remain outside controlled AgentSecurity paths

## Failure Recovery

Use these rules:

- `retry`: for transient failure
- `rebuild`: for inconsistent local environment state
- `delete`: for full removal or clean reinstall

Stop and escalate if:

- checksum mismatch is reported
- delete verification fails
- the product reports host writes outside controlled AgentSecurity paths

## Recommended Path Guidance

For Windows users, the recommended public install path is the dedicated WSL2 isolated environment route used by this release.

Users who do not want local subsystem setup, local recovery responsibility, or any host-side setup work should wait for a future cloud-hosted managed offering rather than bypassing the local isolation boundary.
