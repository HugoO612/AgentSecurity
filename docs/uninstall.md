# Agent Security Uninstall Guide

## Uninstall from Product

1. Open Recovery page or Install Complete page.
2. Select `uninstall` (delete environment).
3. Confirm destructive action.
4. Wait for completion and review delete result report.

## Uninstall Outcome

- Removed:
- isolated runtime environment artifacts
- runtime process state

- Kept:
- controlled host directories needed for audit/support policy

## Verification

Check:
- status snapshot shows `not-installed`
- delete result report is present
- diagnostics export is available
