# Real Machine Validation Template

Use this template for every release candidate validation run.

## Candidate

- version:
- commit:
- validation date:
- validator:
- machine label:
- Windows version/build:
- WSL status before install:
- execution mode: `live` only
- bundled rootfs path:
- bundled OpenClaw package path:
- bundled checksum:
- bundled artifact version:
- bundled artifact source:
- bundled update policy:

## Validation Steps

For each step record:
- before state
- action taken
- receipt status
- final operation status/stage
- after state
- recovery action if failed
- evidence path or screenshot

Required steps:

1. open app and load snapshot
2. run precheck
3. handle permission request if shown
4. confirm WSL enablement / reboot path if needed
5. create dedicated `AgentSecurity` distro
6. import bundled rootfs
7. install bundled OpenClaw package
8. initial start
9. stop
10. start again
11. rebuild
12. delete
13. uninstall verification

## Exception Matrix

Validate and record real evidence for the 4 blocking cases:

- permission denied
- artifact missing
- checksum mismatch
- delete failure

For each blocking exception include:

- observed error code
- user-visible message
- recommended recovery action
- actual recovery result
- evidence path or screenshot

The following v1 cases are documented limitations and do not block public release by themselves:

- WSL disabled
- reboot interrupted
- startup failure

For each documented limitation include:

- documentation link
- user-visible message
- recovery summary

## Residual Items

After delete/uninstall record:

- Windows paths that remain
- Windows paths confirmed removed
- distro presence after uninstall
- logs/reports retained for support
- any unexpected residue

## Final Result

- overall result: `pass` / `pass with risk` / `fail`
- release blocker summary:
- follow-up owner:
