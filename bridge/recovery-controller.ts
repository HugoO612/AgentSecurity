import type {
  CommandInvocation,
  ResolvedExecutionContext,
} from './command-runner.ts'

export function buildCleanupEnvironmentInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "set +e; if [ -f /var/run/agent-security.pid ]; then kill $(cat /var/run/agent-security.pid) >/dev/null 2>&1; rm -f /var/run/agent-security.pid; fi; rm -rf /opt/agent-security/current /opt/agent-security/inbox; mkdir -p /opt/agent-security/current /opt/agent-security/inbox; echo cleaned"`,
        'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        `Remove-Item -Force -ErrorAction SilentlyContinue '${escapePowershellString(`${context.runtimeDir}\\agent.state`)}','${escapePowershellString(`${context.runtimeDir}\\runtime.env`)}','${escapePowershellString(context.stagedInstallerPath)}','${escapePowershellString(context.stagedRootfsPath)}'`,
        "Write-Output 'cleaned'",
      ].join('; '),
    ],
  }
}

export function buildDeleteEnvironmentFilesInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "set +e; if [ -f /var/run/agent-security.pid ]; then kill $(cat /var/run/agent-security.pid) >/dev/null 2>&1; rm -f /var/run/agent-security.pid; fi; exit 0"`,
        `& wsl.exe --unregister '${escapePowershellString(context.targetDistro)}'`,
        'if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 4294967295) { exit $LASTEXITCODE }',
        `Remove-Item -Recurse -Force -ErrorAction SilentlyContinue '${escapePowershellString(`${context.distroInstallRoot}\\${context.targetDistro}`)}','${escapePowershellString(`${context.runtimeDir}\\agent.state`)}','${escapePowershellString(`${context.runtimeDir}\\runtime.env`)}','${escapePowershellString(context.stagedInstallerPath)}','${escapePowershellString(context.stagedRootfsPath)}'`,
        "Write-Output 'deleted'",
      ].join('; '),
    ],
  }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
