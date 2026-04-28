# Agent Security Candidate Status

Date: 2026-04-28  
Commit: `c605d17`  
Decision: `HOLD / NO-GO`

## Verified In This Workspace

- `npm run lint`: passed
- `npm test`: passed (`17` files / `52` tests)
- `npm run build`: passed

## Public Release Gate Result

- Command:
  - `node scripts/validate-release-candidate.mjs --evidence docs/release-evidence-2026-04-24.json`
- Result:
  - failed
- Failure:
  - `executionMode must be "live" for public launch evidence.`

## Why The Current Candidate Is Not Ready

- The only recorded evidence file is still a historical shim rehearsal.
- That rehearsal targets `Ubuntu`, not the dedicated `AgentSecurity` distro.
- No current evidence proves `live` install / start / stop / rebuild / delete on the current candidate commit.
- This workspace does not contain release-ready bundled assets under `bridge/assets`, so a compliant public-release evidence run cannot be generated here without the real rootfs and agent artifact.

## Required Next Step

Run a real Windows validation with:

- execution mode: `live`
- dedicated distro: `AgentSecurity`
- bundled rootfs: real release artifact
- bundled agent artifact: real release artifact
- checksum: real production checksum

Then:

1. save the new evidence file under `docs/`
2. run `node scripts/validate-release-candidate.mjs --evidence <new-file>`
3. update `docs/release-checklist.md` from `HOLD / NO-GO` to the new candidate status
