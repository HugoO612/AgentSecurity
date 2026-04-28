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
        '$existing = (& wsl.exe -l -q) -split "`r?`n" | ForEach-Object { $_.Replace([char]0,"").Trim() } | Where-Object { $_ }',
        'if ($existing -contains $distro) { Write-Output "distro-exists"; exit 0 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "rootfs missing"; exit 1 }',
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
  return {
    program: 'wsl.exe',
    args: [
      '-d',
      context.targetDistro,
      '--',
      'sh',
      '-lc',
      [
        'set -eu',
        'mkdir -p /opt/agent-security/bin /opt/agent-security/current /opt/agent-security/inbox /var/lib/agent-security /var/log',
        "cat > /opt/agent-security/bin/agent-security-runner.sh <<'EOF'",
        '#!/bin/sh',
        'set -eu',
        'mkdir -p /var/lib/agent-security',
        'echo running > /var/lib/agent-security/state',
        'trap \'echo stopped > /var/lib/agent-security/state; exit 0\' TERM INT',
        'while true; do sleep 30; done',
        'EOF',
        'chmod +x /opt/agent-security/bin/agent-security-runner.sh',
        "printf '%s' seeded > /opt/agent-security/bootstrap.state",
        'echo seeded',
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
