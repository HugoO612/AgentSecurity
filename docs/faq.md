# Agent Security FAQ

## Where does the agent run?

The agent runs in a dedicated isolated runtime, not directly in Windows host runtime.

## What gets written on Windows host?

Only controlled product directories for data, runtime, diagnostics, and reports.

## What if the dedicated distro is missing?

The formal installer automatically prepares the dedicated `AgentSecurity` distro. No manual distro creation is required.

## Can I recover from failures?

Yes. Recovery center provides stable actions:
- `retry`
- `rebuild`
- `delete`
- `export support bundle`

## What happens after delete?

Delete removes isolated runtime artifacts and provides a structured delete result report:
- deleted items
- remaining items
- host residual summary

## What should I share with support?

Export and share support bundle. It includes sanitized diagnostics and boundary reports.
