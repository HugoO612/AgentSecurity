import type {
  CommandInvocation,
  CommandResult,
  ResolvedExecutionContext,
  ValidationResult,
} from './command-runner.ts'

export function buildStageArtifactsInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$installer='${escapePowershellString(context.bundledAgentArtifactPath)}'`,
        `$rootfs='${escapePowershellString(context.bundledRootfsPath)}'`,
        `$stagedInstaller='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$stagedRootfs='${escapePowershellString(context.stagedRootfsPath)}'`,
        'if (-not (Test-Path $installer)) { Write-Error "agent artifact missing"; exit 1 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "rootfs artifact missing"; exit 1 }',
        'Copy-Item -Force $installer $stagedInstaller',
        'Copy-Item -Force $rootfs $stagedRootfs',
        'Write-Output "artifacts-staged"',
      ].join('; '),
    ],
  }
}

export function buildVerifyChecksumInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$artifact='${escapePowershellString(context.stagedInstallerPath)}'`,
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        '$stream=[IO.File]::OpenRead($artifact)',
        'try { $hash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($stream))).Replace("-","").ToLower() } finally { $stream.Dispose() }',
        `Write-Output "sha256=$hash"`,
      ].join('; '),
    ],
    validate: (result) => validateChecksumResult(result, context),
  }
}

export function validateChecksumResult(
  result: CommandResult,
  context: ResolvedExecutionContext,
): ValidationResult {
  const actual = extractHash(result.stdout)
  if (!actual) {
    return {
      ok: false,
      failureCode: 'artifact_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }

  if (context.installerChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'artifact_checksum_unconfigured',
          detail: 'A real checksum is required when development shims are disabled.',
        }
  }

  return actual === context.installerChecksum.toLowerCase()
    ? { ok: true }
    : {
        ok: false,
        failureCode: 'artifact_invalid',
        detail: `Expected ${context.installerChecksum.toLowerCase()} but received ${actual}`,
      }
}

export function buildInstallAgentInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$artifact='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$name=[IO.Path]::GetFileName($artifact)`,
        `$destRoot='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security'`,
        '$destInbox=Join-Path $destRoot "inbox"',
        '$destCurrent=Join-Path $destRoot "current"',
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        'New-Item -ItemType Directory -Force -Path $destInbox | Out-Null',
        'New-Item -ItemType Directory -Force -Path $destCurrent | Out-Null',
        'Copy-Item -Force $artifact (Join-Path $destInbox $name)',
        '$lower=$name.ToLowerInvariant()',
        'if ($lower.EndsWith(".sh")) {',
        `  & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "chmod +x /opt/agent-security/inbox/$name && /opt/agent-security/inbox/$name"`,
        '  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '} else {',
        `  & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "mkdir -p /opt/agent-security/current && tar -tf /opt/agent-security/inbox/$name >/dev/null 2>&1 && tar -xf /opt/agent-security/inbox/$name -C /opt/agent-security/current"`,
        '  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '}',
        '$receipt=@("source=$name","installedAt=$(Get-Date -Format o)") -join "`n"',
        'Set-Content -Path (Join-Path $destRoot "install-receipt.txt") -Value $receipt',
        'Write-Output "installed"',
      ].join('; '),
    ],
  }
}

function extractHash(stdout: string) {
  const match = stdout.match(/sha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
