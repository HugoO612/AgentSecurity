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
- bundled agent artifact path:
- bundled checksum:

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
6. install bundled artifacts
7. initial start
8. stop
9. start again
10. rebuild
11. delete
12. uninstall verification

## Exception Matrix

Validate and record:

- permission denied
- WSL disabled
- reboot interrupted
- bundled artifact missing
- checksum mismatch
- startup failure
- delete failure

For each exception include:

- observed error code
- user-visible message
- recommended recovery action
- actual recovery result

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
