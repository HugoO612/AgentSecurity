# Changelog

## v1.0.0-local (Unreleased)

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

- `npm run lint` passed (1 non-blocking warning).
- `npm test` passed (12 files / 36 tests).
- `npm run build` passed.
- Real-machine lifecycle and failure-path verification: pending.
