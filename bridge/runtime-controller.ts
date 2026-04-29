import type {
  CommandInvocation,
  ResolvedExecutionContext,
} from './command-runner.ts'

const OPENCLAW_ONBOARDING_URL = 'http://127.0.0.1:18789/'

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
        `$runtimeValue=@("TARGET_DISTRO=${escapePowershellString(context.targetDistro)}","AGENT_NAME=OpenClaw","UBUNTU_VERSION=${escapePowershellString(context.ubuntuVersion)}","NODE_VERSION=${escapePowershellString(context.nodeVersion)}","OPENCLAW_INSTALL_SOURCE=npm","OPENCLAW_VERSION_POLICY=latest","ONBOARDING_URL=${OPENCLAW_ONBOARDING_URL}") -join "\`n"`,
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
        `$onboardingFile='${escapePowershellString(`${context.runtimeDir}\\onboarding.url`)}'`,
        `$runtimeFile='${escapePowershellString(`${context.runtimeDir}\\runtime.env`)}'`,
        `$distro='${escapePowershellString(context.targetDistro)}'`,
        '$agentScript="/opt/agent-security/current/bin/start-agent-security.sh"',
        '$proc=Start-Process wsl.exe -WindowStyle Hidden -PassThru -ArgumentList @("-d",$distro,"--","/bin/sh",$agentScript)',
        '$ready=$false',
        '$onboardingUrl=""',
        'for ($i=0; $i -lt 45; $i++) {',
        '  Start-Sleep -Seconds 1',
        '  if ($proc.HasExited) { break }',
        '  $onboardingUrl=(& wsl.exe -d $distro -- /bin/sh -c "cat /var/lib/agent-security/onboarding-url 2>/dev/null || true").Trim()',
        `  if (-not $onboardingUrl) { $onboardingUrl='${OPENCLAW_ONBOARDING_URL}' }`,
        '  try {',
        '    $response=Invoke-WebRequest -Uri $onboardingUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop',
        '    if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500) {',
        '      $ready=$true',
        '      break',
        '    }',
        '  } catch {}',
        '}',
        'if (-not $ready) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Write-Error "OpenClaw onboarding endpoint did not become reachable."; exit 1 }',
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stateFile) | Out-Null',
        'Set-Content -Path $pidFile -Value $proc.Id',
        'Set-Content -Path $onboardingFile -Value $onboardingUrl',
        'if (Test-Path $runtimeFile) { $matched=$false; $runtimeLines=@(Get-Content -Path $runtimeFile | ForEach-Object { if ($_ -like "ONBOARDING_URL=*") { $matched=$true; "ONBOARDING_URL=$onboardingUrl" } else { $_ } }); if (-not $matched) { $runtimeLines += "ONBOARDING_URL=$onboardingUrl" }; Set-Content -Path $runtimeFile -Value $runtimeLines }',
        "Set-Content -Path $stateFile -Value 'running'",
        'Write-Output "running"',
        'Write-Output "onboardingUrl=$onboardingUrl"',
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
        `$onboardingFile='${escapePowershellString(`${context.runtimeDir}\\onboarding.url`)}'`,
        'if (Test-Path $pidFile) { $pidText=Get-Content -Path $pidFile -ErrorAction SilentlyContinue; if ($pidText) { Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue }; Remove-Item -Force -ErrorAction SilentlyContinue $pidFile }',
        'Remove-Item -Force -ErrorAction SilentlyContinue $onboardingFile',
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
        `$onboardingFile='${escapePowershellString(`${context.runtimeDir}\\onboarding.url`)}'`,
        'if (-not (Test-Path $pidFile)) { Write-Error "missing pid file"; exit 1 }',
        '$pidText=Get-Content -Path $pidFile -ErrorAction Stop',
        '$proc=Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue',
        'if (-not $proc) { Write-Error "agent process not running"; exit 1 }',
        `$wslCheck = & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- /bin/sh -c 'test "$(cat /var/lib/agent-security/state)" = running && test -f /var/run/agent-security.pid && kill -0 "$(cat /var/run/agent-security.pid)"'`,
        'if ($LASTEXITCODE -ne 0) { Write-Error "OpenClaw process is not healthy inside WSL."; exit $LASTEXITCODE }',
        `if (Test-Path $onboardingFile) { $onboardingUrl=(Get-Content -Path $onboardingFile -ErrorAction Stop).Trim() } else { $onboardingUrl='${OPENCLAW_ONBOARDING_URL}' }`,
        'try {',
        '  $response=Invoke-WebRequest -Uri $onboardingUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop',
        '  if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 500) { Write-Error "OpenClaw onboarding endpoint is not healthy."; exit 1 }',
        '} catch { Write-Error "OpenClaw onboarding endpoint is not reachable."; exit 1 }',
        'Write-Output "healthy"',
      ].join('; '),
    ],
  }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
