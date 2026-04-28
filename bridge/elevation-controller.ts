import type {
  CommandInvocation,
  ResolvedExecutionContext,
} from './command-runner.ts'

export function buildEnableWslFeaturesInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  if (context.allowDevShim) {
    return {
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        "Write-Output 'dev-shim: elevation bypassed'; exit 0",
      ],
    }
  }

  if (context.elevationHelperCommand.trim()) {
    return {
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        context.elevationHelperCommand,
      ],
    }
  }

  const elevatedScript = [
    '$ErrorActionPreference="Stop"',
    'Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart | Out-Null',
    'Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart | Out-Null',
    'Write-Output "WSL features enabled"',
  ].join('; ')

  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$script = '${escapePowershellString(elevatedScript)}'`,
        '$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))',
        'try {',
        '  $proc = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @("-NoProfile","-EncodedCommand",$encoded)',
        '  exit $proc.ExitCode',
        '} catch {',
        '  Write-Error $_.Exception.Message',
        '  exit 1223',
        '}',
      ].join('; '),
    ],
  }
}

export function buildCheckRebootPendingInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$resumePath='${escapePowershellString(context.rebootResumeMarkerPath)}'`,
        '$pending=(Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") -or (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired")',
        'if ($pending) {',
        `  Set-Content -Path $resumePath -Value '{"resume":"installer","targetDistro":"${escapeJsonString(context.targetDistro)}"}';`,
        '  Write-Error "reboot required";',
        '  exit 3;',
        '}',
        'Write-Output "No reboot required"; exit 0',
      ].join('; '),
    ],
  }
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}

function escapeJsonString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
