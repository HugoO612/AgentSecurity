# Agent Security Risk Explanation

## Why The Formal Release Uses WSL2

The formal release keeps the agent inside a dedicated WSL2 distro so that:
- the runtime boundary is predictable for ordinary users
- install, rebuild, delete, and rollback can target one fixed location
- high-risk runtime behavior stays out of the Windows host runtime
- support can ask one consistent set of diagnostics questions

For the current public release, this is the default Windows deployment path. It is narrower and easier to reason about than a direct host install.

## Why The Formal Release Does Not Install Into Windows Directly

The product does not install the agent into the Windows host runtime because that would expand the blast radius for:
- process execution
- file writes
- cleanup and rollback
- support investigation

The formal Windows host write boundary is limited to controlled Agent Security paths under `%LOCALAPPDATA%\AgentSecurity\...` plus WSL-managed storage for the dedicated distro.

## Why Existing Ubuntu Is Not Supported

The formal release does not reuse a user-managed Ubuntu distro because that breaks the guarantees for:
- clean install scope
- deterministic rebuild behavior
- uninstall verification
- residue analysis
- support ownership

If a user already has Ubuntu installed, Agent Security still creates and manages its own dedicated `AgentSecurity` distro.

## User-Facing Risk Summary

- The installer may request administrator permission when Windows features or WSL components must be enabled.
- The machine may require a reboot before install can continue.
- Rebuild can remove data inside the dedicated `AgentSecurity` distro.
- Delete unregisters the dedicated `AgentSecurity` distro and removes runtime state, but retains controlled logs and reports for support.

## Cloud-Hosted Direction

Cloud-hosted managed deployment remains an important product direction, but it is not part of this v1 public release.

Current reason:
- the shipped evidence and recovery model in this release are built around one controlled local isolated environment boundary

Best fit today:
- choose the one-click WSL2 isolated deployment if Windows local execution is required
- wait for a future cloud-hosted managed option if the user wants less local setup responsibility and less host-side recovery work
