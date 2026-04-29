# Bundled Assets Specification

Public release candidates are not valid unless the candidate package includes these real artifacts under `bridge/assets/`:

- `bridge/assets/agent-security-rootfs.tar`
- `bridge/assets/openclaw-agent.pkg`
- `bridge/assets/openclaw-bootstrap.sh`

## Required Metadata

Each candidate must also record:
- artifact version
- source commit
- rootfs source, which must identify a real Ubuntu 24.04 LTS rootfs for public release
- `agentName: "OpenClaw"`
- `ubuntuVersion: "24.04-lts"`
- `nodeVersion: "24"`
- `openClawInstallSource: "npm"`
- `openClawVersionPolicy: "latest"`
- SHA256 for `agent-security-rootfs.tar`
- SHA256 for `openclaw-agent.pkg`
- SHA256 for `openclaw-bootstrap.sh`
- build source
- packaging timestamp
- update policy

## Fixed Release Rules

- the formal release path uses a mostly bundled Ubuntu bootstrap
- OpenClaw itself is installed inside WSL2 Ubuntu through `npm install -g openclaw@latest`
- the runtime formal release path does not accept a user-supplied rootfs
- the formal release path does not accept a user-supplied distro name
- the release gate rejects `dev-busybox-placeholder` and any other placeholder rootfs source

## Building The Rootfs Asset

For local packaging checks, `npm run build:assets -- <version>` can still produce a small development placeholder rootfs. That output is not public-release eligible.

For a public release candidate, build assets with one of:
- `AGENT_SECURITY_UBUNTU_ROOTFS_PATH=<path-to-ubuntu-24.04-wsl-rootfs.tar-or-tar.gz> npm run build:assets -- <version>`
- `AGENT_SECURITY_DOWNLOAD_UBUNTU_ROOTFS=1 npm run build:assets -- <version>`

The download path uses Canonical's Ubuntu 24.04 WSL rootfs URL unless `AGENT_SECURITY_UBUNTU_ROOTFS_URL` overrides it. The resulting manifest `source` must include `ubuntu-24.04-lts` and must not be `dev-busybox-placeholder`.

## Candidate Packaging Checklist

Before live validation:
- place the real rootfs tarball at `bridge/assets/agent-security-rootfs.tar`
- place the real OpenClaw package at `bridge/assets/openclaw-agent.pkg`
- place the real OpenClaw bootstrap script at `bridge/assets/openclaw-bootstrap.sh`
- compute the SHA256 for the agent artifact
- compute the SHA256 for the rootfs artifact
- compute the SHA256 for the bootstrap artifact
- record artifact version, all SHA256 values, fixed paths, Ubuntu version, Node version, and source in the release evidence file
- confirm `bridge/assets/release-assets-manifest.json` `sourceCommit` equals the evidence `commit`
- verify the candidate commit can start in non-dev mode without missing-asset errors

## Runtime Environment Variables

Formal non-dev runs must use:
- `AGENT_SECURITY_MODE=production`
- `AGENT_SECURITY_BRIDGE_TOKEN=<release bridge token>`
- `AGENT_SECURITY_ROOTFS_SHA256=<64-character SHA256 for bridge/assets/agent-security-rootfs.tar>`
- `AGENT_SECURITY_AGENT_INSTALL_SHA256=<64-character SHA256 for bridge/assets/openclaw-agent.pkg>`
- `AGENT_SECURITY_BOOTSTRAP_SHA256=<64-character SHA256 for bridge/assets/openclaw-bootstrap.sh>`
- `AGENT_SECURITY_AGENT_NAME=OpenClaw`
- `AGENT_SECURITY_UBUNTU_VERSION=24.04-lts`
- `AGENT_SECURITY_NODE_VERSION=24`
- `AGENT_SECURITY_OPENCLAW_INSTALL_SOURCE=npm`
- `AGENT_SECURITY_OPENCLAW_VERSION_POLICY=latest`

The release path rejects `dev-skip-checksum`, mutable installer URLs, custom distro names, and missing bundled files outside dev mode.

