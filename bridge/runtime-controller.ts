import type {
  CommandInvocation,
  ResolvedExecutionContext,
} from './command-runner.ts'

export function buildWriteRuntimeConfigInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$runtimeFile='${escapePowershellString(`${context.runtimeDir}\\runtime.env`)}'`,
        `$wslConfig='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\etc\\agent-security\\runtime.env'`,
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimeFile) | Out-Null',
        `Set-Content -Path $runtimeFile -Value 'TARGET_DISTRO=${escapePowershellString(context.targetDistro)}'`,
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $wslConfig) | Out-Null',
        `Set-Content -Path $wslConfig -Value 'TARGET_DISTRO=${escapePowershellString(context.targetDistro)}'`,
        `if (Test-Path '${escapePowershellString(context.rebootResumeMarkerPath)}') { Remove-Item -Force '${escapePowershellString(context.rebootResumeMarkerPath)}' }`,
        "Write-Output 'config-written'",
      ].join('; '),
    ],
  }
}

export function buildStartAgentInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$stateFile='${escapePowershellString(`${context.runtimeDir}\\agent.state`)}'`,
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "set -eu; mkdir -p /var/run /var/log; start_script=/opt/agent-security/current/bin/start-agent-security.sh; runner=/opt/agent-security/bin/agent-security-runner.sh; if [ -x $start_script ]; then nohup $start_script >/var/log/agent-security.log 2>&1 & elif [ -x $runner ]; then nohup $runner >/var/log/agent-security.log 2>&1 & else echo missing-runner >&2; exit 1; fi; pid=$!; echo $pid >/var/run/agent-security.pid; echo running >/var/lib/agent-security/state; echo running"`,
        'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        `Set-Content -Path $stateFile -Value 'running'`,
        "Write-Output 'running'",
      ].join('; '),
    ],
  }
}

export function buildStopAgentInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$stateFile='${escapePowershellString(`${context.runtimeDir}\\agent.state`)}'`,
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "set +e; if [ -f /var/run/agent-security.pid ]; then pid=$(cat /var/run/agent-security.pid); kill $pid >/dev/null 2>&1; rm -f /var/run/agent-security.pid; fi; mkdir -p /var/lib/agent-security; echo stopped >/var/lib/agent-security/state; echo stopped"`,
        'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        `Set-Content -Path $stateFile -Value 'stopped'`,
        "Write-Output 'stopped'",
      ].join('; '),
    ],
  }
}

export function buildHealthCheckInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "set -eu; [ -f /var/run/agent-security.pid ]; pid=$(cat /var/run/agent-security.pid); kill -0 $pid; [ $(cat /var/lib/agent-security/state) = running ]; echo healthy"`,
        'exit $LASTEXITCODE',
      ].join('; '),
    ],
  }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
