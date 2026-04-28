# Changelog

## v1.0.0-local (2026-04-28)

### Scope

- Formal local edition only.
- Runtime is limited to local WSL2 isolated execution.
- Agent is not directly installed into Windows host runtime.
- Missing dedicated distro is prepared by the formal installer flow.
- Cloud-hosted runtime is out of scope for this version.

### Notable Changes

- Unified local formal messaging across README, install guide, FAQ, and in-app copy.
- Removed cloud option card from formal entry path.
- Removed prototype/demo fallback wording from user-facing copy.
- Converted release checklist from template to execution record format.

### Verification

- `node scripts/validate-release-candidate.mjs --evidence docs/release-evidence-2026-04-28-live.json` passed.
- `npm run lint` passed.
- `npm test` passed (17 files / 53 tests).
- `npm run build` passed.
- Live lifecycle verification passed for install, start, stop, rebuild, and delete.
- Blocking exception verification passed for permission denied, artifact missing, checksum mismatch, and delete failure.
