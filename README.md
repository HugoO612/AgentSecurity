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
- If the dedicated distro is missing, installer guidance is shown and handling is controlled by the installer flow.

## Core Scripts

- `npm run dev`: start app dev server
- `npm run dev:bridge`: start local bridge
- `npm run dev:full`: start app + bridge together
- `npm run test`: run tests and term checks
- `npm run lint`: run lint
- `npm run build`: build bridge + frontend

## Formal Docs

- [Formal Install Guide](A:\AgentSecurity\docs\install-guide.md)
- [FAQ](A:\AgentSecurity\docs\faq.md)
- [Uninstall Guide](A:\AgentSecurity\docs\uninstall.md)
- [Support Process](A:\AgentSecurity\docs\support-process.md)
- [Release Checklist](A:\AgentSecurity\docs\release-checklist.md)
