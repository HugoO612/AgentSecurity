# Agent Security (Formal Local Edition)

Agent Security is a local product that runs the agent inside a dedicated isolated runtime on the same machine.

Current formal scope:
- In-app installer orchestration for local setup.
- Dedicated `AgentSecurity` distro strategy with controlled bridge actions.
- User-visible boundary reports, delete results, and support bundle export.
- Recovery center with stable recommended actions and impact summaries.

## Product Boundary

- The agent runs in a dedicated isolated environment.
- The bridge is the only entry for high-risk local actions.
- The product does not directly install the agent into Windows host runtime.
- If the dedicated distro is missing, the formal installer automatically prepares it.

## Core Scripts

- `npm run dev`: start app dev server
- `npm run dev:bridge`: start local bridge
- `npm run dev:full`: start app + bridge together
- `npm run test`: run tests and term checks
- `npm run lint`: run lint
- `npm run build`: build bridge + frontend

## Formal Docs

- [Formal Install Guide](docs/install-guide.md)
- [FAQ](docs/faq.md)
- [Uninstall Guide](docs/uninstall.md)
- [Support Process](docs/support-process.md)
- [Release Checklist](docs/release-checklist.md)
- [Go / No-Go Table](docs/go-no-go.md)
- [Real Machine Validation Template](docs/real-machine-validation-template.md)
