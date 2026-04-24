# Agent Security Release Checklist

Release: v1.0.0-local
Date: 2026-04-24
Owner: Hugo
Commit: 2fcd3ad

## Build and Test

- [x] `npm run lint` passes
  - Result: passed
  - Note: 1 non-blocking warning
- [x] `npm test` passes
  - Result: 12 files / 36 tests passed
- [x] `npm run build` passes
  - Result: passed

## Final Validation

- [ ] lifecycle on real machine: install/start/stop/restart/rebuild/delete
  - Status: pending
- [ ] failure paths validated
  - Status: pending
- [ ] support bundle sanitized
  - Status: pending

## Release Decision

Pending items above block formal GA release. Keep release as non-GA until they are complete.
