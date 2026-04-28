# Agent Security Uninstall Guide

## What Delete Removes

- dedicated `AgentSecurity` distro registration
- dedicated distro files under the controlled Agent Security distro install root
- runtime state files such as `agent.state`, `runtime.env`, and staged artifacts
- running agent process state inside the dedicated distro

## What Delete Keeps

- controlled diagnostics and report directories for support
- controlled Agent Security host data root used for audit and future support workflows

## Uninstall from Product

1. Open the Recovery page or the completed install page.
2. Select `delete` or `uninstall`.
3. Confirm the destructive action.
4. Wait for completion.
5. Review the delete result report.

## Verification

Confirm all of the following:
- the status snapshot shows `not-installed`
- the delete result report is present
- support bundle export is still available
- `wsl.exe -l -q` no longer lists `AgentSecurity`

## Residue Expectations

Expected residue after delete:
- controlled logs
- controlled reports
- controlled support artifacts

Unexpected residue that should trigger support escalation:
- `AgentSecurity` still appears in WSL distro list
- runtime state still reports `running`
- unexpected files remain outside controlled Agent Security paths
