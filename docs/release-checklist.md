# Agent Security Release Checklist

## Build and Test

- [ ] `npm run build` passes
- [ ] `npm test` passes

## Bridge Contract and API

- [ ] `/installer/start` and `/installer/operations/:id` verified
- [ ] `/reports/environment` verified
- [ ] `/reports/boundary` verified
- [ ] `/reports/delete-last` verified
- [ ] `/diagnostics/export` verified and sanitized

## Security Boundary

- [ ] controlled command templates only
- [ ] no free-form destructive command input
- [ ] confirm token enforced for destructive actions
- [ ] no token/auth header/full sensitive host path leaks
- [ ] stdout/stderr previews truncated

## UX and Recovery

- [ ] install complete page available
- [ ] status page shows boundary facts
- [ ] recovery page shows impact and duration
- [ ] support bundle export reachable

## Final Validation

- [ ] lifecycle on real machine: install/start/stop/restart/rebuild/delete
- [ ] failure paths validated
- [ ] release notes and support docs updated
