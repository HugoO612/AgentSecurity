import type {
  CommandInvocation,
  ResolvedExecutionContext,
  ValidationResult,
} from './command-runner.ts'

export function buildCreateDistroInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$distro='${escapePowershellString(context.targetDistro)}'`,
        `$distroPath='${escapePowershellString(`${context.distroInstallRoot}\\${context.targetDistro}`)}'`,
        `$rootfs='${escapePowershellString(context.bundledRootfsPath)}'`,
        `$expectedRootfsSha256='${escapePowershellString(context.bundledRootfsChecksum)}'`,
        '$existing = (& wsl.exe -l -q) -split "`r?`n" | ForEach-Object { ($_ -replace "`0","").Trim() } | Where-Object { $_ }',
        'if ($existing -contains $distro) { Write-Output "distro-exists"; exit 0 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "rootfs missing"; exit 1 }',
        'if ($expectedRootfsSha256 -eq "dev-skip-checksum") { Write-Error "rootfs checksum missing"; exit 1 }',
        '$stream=[IO.File]::OpenRead($rootfs)',
        'try { $actualRootfsSha256=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($stream))).Replace("-","").ToLower() } finally { $stream.Dispose() }',
        'if ($actualRootfsSha256 -ne $expectedRootfsSha256.ToLower()) { Write-Error "rootfs checksum mismatch"; exit 1 }',
        'New-Item -ItemType Directory -Force -Path $distroPath | Out-Null',
        '& wsl.exe --import $distro $distroPath $rootfs --version 2',
        'exit $LASTEXITCODE',
      ].join('; '),
    ],
  }
}

export function buildSeedDistroInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  const script = [
    'set -eu',
    'mkdir -p /opt/agent-security/bin /opt/agent-security/current /opt/agent-security/inbox /var/lib/agent-security /var/log/agent-security /var/run',
    "cat > /opt/agent-security/bin/start-managed.sh <<'EOF'",
    '#!/bin/sh',
    'set -eu',
    'mkdir -p /var/run /var/log/agent-security /var/lib/agent-security',
    'target=/opt/agent-security/current/bin/start-agent-security.sh',
    'if [ ! -x "$target" ]; then echo "managed start script missing" >&2; exit 22; fi',
    'nohup "$target" >/var/log/agent-security/openclaw-managed.log 2>&1 &',
    'pid=$!',
    'echo "$pid" >/var/run/agent-security.pid',
    'echo running',
    'EOF',
    "cat > /opt/agent-security/bin/stop-managed.sh <<'EOF'",
    '#!/bin/sh',
    'set +e',
    'if [ -f /var/run/agent-security.pid ]; then',
    '  pid="$(cat /var/run/agent-security.pid)"',
    '  kill "$pid" >/dev/null 2>&1',
    '  rm -f /var/run/agent-security.pid',
    'fi',
    'mkdir -p /var/lib/agent-security',
    'echo stopped >/var/lib/agent-security/state',
    'echo stopped',
    'EOF',
    "cat > /opt/agent-security/bin/health-check.sh <<'EOF'",
    '#!/bin/sh',
    'set -eu',
    '[ -f /var/run/agent-security.pid ]',
    'pid="$(cat /var/run/agent-security.pid)"',
    'kill -0 "$pid"',
    '[ "$(cat /var/lib/agent-security/state)" = running ]',
    '[ -f /var/lib/agent-security/onboarding-url ]',
    'echo healthy',
    'EOF',
    'chmod +x /opt/agent-security/bin/start-managed.sh /opt/agent-security/bin/stop-managed.sh /opt/agent-security/bin/health-check.sh',
    'echo seeded >/opt/agent-security/bootstrap.state',
  ].join('\n')
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$script='${escapePowershellString(script)}'`,
        `$script | & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- /bin/sh -s`,
        'exit $LASTEXITCODE',
      ].join('; '),
    ],
  }
}

export function buildDeleteVerificationInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$distroDir='${escapePowershellString(`${context.distroInstallRoot}\\${context.targetDistro}`)}'`,
        "$distros=& wsl.exe -l -q",
        `if (-not (Test-Path $distroDir) -and ($distros -notmatch '^${escapePowershellRegex(context.targetDistro)}$')) { Write-Output 'verified'; exit 0 } else { exit 1 }`,
      ].join('; '),
    ],
  }
}

export function validateTargetDistroOnly(targetDistro: string): ValidationResult {
  return targetDistro === 'AgentSecurity'
    ? { ok: true }
    : {
        ok: false,
        failureCode: 'target_distro_invalid',
        detail: `Unsupported target distro: ${targetDistro}`,
      }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}

function escapePowershellRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
