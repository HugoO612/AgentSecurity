# Agent Security Go / No-Go Table

Release target: public local WSL2 edition  
Decision owner: release lead + support lead + engineering lead

## Hard Stop

Release is `NO-GO` if any of the following is true:

- live mode still depends on `dev-shim` for install, start, stop, delete, or rebuild
- production config allows non-`AgentSecurity` distro, non-bundled installer source, or weak checksum
- delete or rebuild can leave the product in an unrecoverable state
- there is any unexplained host-impact behavior that may touch non-controlled Windows locations
- support bundle or command audit can leak tokens, raw authorization headers, or uncontrolled host paths
- real Windows validation has not been completed on the current candidate build

## Go Criteria

All of the following must be true:

- `npm test`, `npm run lint`, and `npm run build` pass on the release candidate commit
- release evidence explicitly records `executionMode` as `live` or `dev-shim`
- candidate package is configured for bundled assets only
- target distro is fixed to `AgentSecurity`
- install, start, stop, rebuild, and delete pass in `live` mode on target Windows machines
- destructive flows have matching residual-item documentation
- support lead confirms current errors map to stable recovery guidance

## Decision Record

Record each release decision with:

- candidate version
- commit SHA
- decision date
- decision: `go`, `hold`, or `rollback`
- blocking reasons
- required follow-up owner
