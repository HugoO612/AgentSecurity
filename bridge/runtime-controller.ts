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
        `$runtimeValue=@("TARGET_DISTRO=${escapePowershellString(context.targetDistro)}","AGENT_NAME=OpenClaw","UBUNTU_VERSION=${escapePowershellString(context.ubuntuVersion)}","NODE_VERSION=${escapePowershellString(context.nodeVersion)}","OPENCLAW_INSTALL_SOURCE=npm","OPENCLAW_VERSION_POLICY=latest","ONBOARDING_URL=http://127.0.0.1:3000") -join "\`n"`,
        'Set-Content -Path $runtimeFile -Value $runtimeValue',
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $wslConfig) | Out-Null',
        'Set-Content -Path $wslConfig -Value $runtimeValue',
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
        `$pidFile='${escapePowershellString(`${context.runtimeDir}\\agent.pid`)}'`,
        `$distro='${escapePowershellString(context.targetDistro)}'`,
        '$agentScript="/opt/agent-security/current/bin/start-agent-security.sh"',
        '$proc=Start-Process wsl.exe -WindowStyle Hidden -PassThru -ArgumentList @("-d",$distro,"--","/bin/sh",$agentScript)',
        'Start-Sleep -Seconds 1',
        'if ($proc.HasExited) { Write-Error "agent process exited early"; exit 1 }',
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- /bin/sh -c 'mkdir -p /var/lib/agent-security; echo running >/var/lib/agent-security/state; echo http://127.0.0.1:3000 >/var/lib/agent-security/onboarding-url'`,
        'if ($LASTEXITCODE -ne 0) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit $LASTEXITCODE }',
        'Set-Content -Path $pidFile -Value $proc.Id',
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
        `$pidFile='${escapePowershellString(`${context.runtimeDir}\\agent.pid`)}'`,
        'if (Test-Path $pidFile) { $pidText=Get-Content -Path $pidFile -ErrorAction SilentlyContinue; if ($pidText) { Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue }; Remove-Item -Force -ErrorAction SilentlyContinue $pidFile }',
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- /bin/sh /opt/agent-security/bin/stop-managed.sh`,
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
        `$pidFile='${escapePowershellString(`${context.runtimeDir}\\agent.pid`)}'`,
        'if (-not (Test-Path $pidFile)) { Write-Error "missing pid file"; exit 1 }',
        '$pidText=Get-Content -Path $pidFile -ErrorAction Stop',
        '$proc=Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue',
        'if (-not $proc) { Write-Error "agent process not running"; exit 1 }',
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- /bin/sh -c 'test "$(cat /var/lib/agent-security/state)" = running'`,
        'exit $LASTEXITCODE',
      ].join('; '),
    ],
  }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
