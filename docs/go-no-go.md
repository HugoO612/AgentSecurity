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
- any v1 blocking exception remains unvalidated: `permission_denied`, `artifact_missing`, `checksum_mismatch`, `delete_failure`

## Go Criteria

All of the following must be true:

- `npm test`, `npm run lint`, and `npm run build` pass on the release candidate commit
- release evidence explicitly records `executionMode` as `live`
- candidate package is configured for bundled assets only
- target distro is fixed to `AgentSecurity`
- candidate package contains the real files `bridge/assets/agent-security-rootfs.tar` and `bridge/assets/agent-security-agent.pkg`
- release evidence records the artifact version, SHA256, fixed path, and source for the bundled assets
- install, start, stop, rebuild, and delete pass in `live` mode on target Windows machines
- `permission_denied`, `artifact_missing`, `checksum_mismatch`, and `delete_failure` are validated with real evidence
- `wsl_disabled`, `reboot_interrupted`, and `startup_failure` have accurate documented recovery guidance linked from the evidence
- destructive flows have matching residual-item documentation
- install, risk, uninstall, recovery, and support documentation match the current candidate behavior
- support lead confirms current errors map to stable recovery guidance

## Decision Record

Record each release decision with:

- candidate version
- commit SHA
- decision date
- decision: `go`, `hold`, or `rollback`
- blocking reasons
- required follow-up owner
