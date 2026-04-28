# Agent Security Support Guide

## What To Export Before Asking For Help

Collect:
- app version or release candidate version
- current state page screenshot
- support bundle export
- the failing action: `install`, `start`, `stop`, `rebuild`, or `delete`
- the visible error code and message

## Where To Send It

Send the exported support bundle and screenshots to the product support owner for the current release train. The exact address or queue must be filled in by release operations before public launch.

## When To Stop And Not Continue Alone

Stop and contact support immediately if:
- checksum mismatch is reported
- delete completes but the `AgentSecurity` distro is still present
- the product reports unexpected writes outside controlled Agent Security paths
- the app shows `dev-shim` on a public candidate or release build
- rebuild fails more than once

## What Support Will Ask First

Support will usually ask for:
- whether the run was `live`
- whether Windows requested administrator permission
- whether the machine rebooted during install
- whether `retry`, `rebuild`, or `delete` was already attempted

## Privacy And Scope

The support bundle must not contain:
- bridge token values
- raw authorization headers
- uncontrolled host paths

Redacted markers are expected in the exported data.
