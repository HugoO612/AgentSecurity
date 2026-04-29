# Bundled Assets Specification

Public release candidates are not valid unless the candidate package includes these two real artifacts under `bridge/assets/`:

- `bridge/assets/agent-security-rootfs.tar`
- `bridge/assets/openclaw-agent.pkg`

## Required Metadata

Each candidate must also record:
- artifact version
- source commit
- `agentName: "OpenClaw"`
- SHA256 for `agent-security-rootfs.tar`
- SHA256 for `openclaw-agent.pkg`
- build source
- packaging timestamp
- update policy

## Fixed Release Rules

- the formal release path uses bundled assets only
- the formal release path does not download a mutable remote installer
- the formal release path does not accept a user-supplied rootfs
- the formal release path does not accept a user-supplied distro name

## Candidate Packaging Checklist

Before live validation:
- place the real rootfs tarball at `bridge/assets/agent-security-rootfs.tar`
- place the real OpenClaw package at `bridge/assets/openclaw-agent.pkg`
- compute the SHA256 for the agent artifact
- compute the SHA256 for the rootfs artifact
- record artifact version, both SHA256 values, fixed paths, and source in the release evidence file
- confirm `bridge/assets/release-assets-manifest.json` `sourceCommit` equals the evidence `commit`
- verify the candidate commit can start in non-dev mode without missing-asset errors

## Runtime Environment Variables

Formal non-dev runs must use:
- `AGENT_SECURITY_MODE=production`
- `AGENT_SECURITY_BRIDGE_TOKEN=<release bridge token>`
- `AGENT_SECURITY_ROOTFS_SHA256=<64-character SHA256 for bridge/assets/agent-security-rootfs.tar>`
- `AGENT_SECURITY_AGENT_INSTALL_SHA256=<64-character SHA256 for bridge/assets/openclaw-agent.pkg>`
- `AGENT_SECURITY_AGENT_NAME=OpenClaw`

The release path rejects `dev-skip-checksum`, mutable installer URLs, custom distro names, and missing bundled files outside dev mode.

