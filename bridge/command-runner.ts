import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type {
  CommandAuditSummary,
  EnvironmentActionType,
  FailureStage,
  FailureType,
  OperationStage,
} from '../src/contracts/environment.ts'

const MAX_STDOUT_CHARS = 4000
const MAX_STDERR_CHARS = 4000

export type AllowedProgram = 'powershell.exe' | 'wsl.exe'

export type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type TemplatedAction = EnvironmentActionType | 'installer'

export type TemplateCommandId =
  | 'check_windows_capabilities'
  | 'check_wsl2'
  | 'check_distro'
  | 'enable_wsl_optional_features'
  | 'check_reboot_pending'
  | 'install_wsl_kernel_or_update'
  | 'create_distro'
  | 'seed_distro_base'
  | 'download_installer'
  | 'verify_checksum'
  | 'install_agent'
  | 'write_runtime_config'
  | 'start_agent'
  | 'stop_agent'
  | 'health_check'
  | 'collect_environment_report'
  | 'cleanup_environment'
  | 'delete_environment_files'
  | 'delete_verification'

type TemplateStage =
  | Extract<
      OperationStage,
      | 'collecting_facts'
      | 'enabling_features'
      | 'awaiting_reboot'
      | 'preparing_distro'
      | 'installing_agent'
      | 'writing_config'
      | 'starting_bridge'
      | 'verifying_install'
      | 'check_wsl2'
      | 'check_distro'
      | 'download_installer'
      | 'verify_checksum'
      | 'install_agent'
      | 'write_runtime_config'
      | 'health_check'
      | 'stopping'
      | 'cleanup_environment'
      | 'deleting'
    >

type TemplateSpec = {
  stage: TemplateStage
  failureStage: FailureStage
  failureType: FailureType
  defaultFailureCode: string
  retryable: boolean
  buildInvocation: (context: ResolvedTemplateContext) => {
    program: AllowedProgram
    args: string[]
    validate?: (result: CommandResult) => ValidationResult
  }
  exitCodeMap?: Record<number, string>
}

type ValidationResult =
  | { ok: true }
  | { ok: false; failureCode: string; detail?: string }

export type TemplateCommandInput = {
  action: TemplatedAction
  command: TemplateCommandId
  targetDistro: string
  operationId?: string
  runtimeDir?: string
  diagnosticsDir?: string
  reportDir?: string
  distroInstallRoot?: string
  rebootResumeMarkerPath?: string
  installerDownloadUrl?: string
  installerChecksum?: string
  bundledRootfsPath?: string
  bundledAgentArtifactPath?: string
  additionalSensitiveValues?: string[]
}

type ResolvedTemplateContext = {
  targetDistro: string
  runtimeDir: string
  diagnosticsDir: string
  reportDir: string
  distroInstallRoot: string
  rebootResumeMarkerPath: string
  installerDownloadUrl: string
  installerChecksum: string
  bundledRootfsPath: string
  bundledAgentArtifactPath: string
  stagedInstallerPath: string
  stagedRootfsPath: string
}

export type TemplateCommandSuccess = {
  ok: true
  exitCode: number
  stdout: string
  stderr: string
  stage: TemplateStage
  audit: CommandAuditSummary
}

export type TemplateCommandFailure = {
  ok: false
  stage: TemplateStage
  failureStage: FailureStage
  failureType: FailureType
  failureCode: string
  retryable: boolean
  message: string
  detail?: string
  exitCode?: number
  timedOut: boolean
  audit: CommandAuditSummary
}

export type TemplateCommandExecutionResult =
  | TemplateCommandSuccess
  | TemplateCommandFailure

type CommandExecutor = (
  program: AllowedProgram,
  args: string[],
  timeoutMs: number,
  onTimeout?: () => void,
) => Promise<CommandResult>

const ACTION_TIMEOUT_MS: Record<TemplatedAction, number> = {
  installer: 15 * 60 * 1000,
  install_environment: 15 * 60 * 1000,
  retry_install: 15 * 60 * 1000,
  request_permission: 60 * 1000,
  run_precheck: 60 * 1000,
  start_agent: 90 * 1000,
  stop_agent: 90 * 1000,
  restart_agent: 2 * 60 * 1000,
  rebuild_environment: 20 * 60 * 1000,
  delete_environment: 5 * 60 * 1000,
}

const ACTION_TEMPLATE_TABLE: Record<TemplatedAction, readonly TemplateCommandId[]> = {
  installer: [
    'check_windows_capabilities',
    'check_wsl2',
    'enable_wsl_optional_features',
    'check_reboot_pending',
    'create_distro',
    'seed_distro_base',
    'download_installer',
    'verify_checksum',
    'install_agent',
    'write_runtime_config',
    'start_agent',
    'health_check',
    'collect_environment_report',
  ],
  install_environment: [
    'check_windows_capabilities',
    'check_wsl2',
    'create_distro',
    'seed_distro_base',
    'download_installer',
    'verify_checksum',
    'install_agent',
    'write_runtime_config',
    'start_agent',
    'health_check',
    'collect_environment_report',
  ],
  retry_install: [
    'check_windows_capabilities',
    'check_wsl2',
    'check_distro',
    'download_installer',
    'verify_checksum',
    'install_agent',
    'write_runtime_config',
    'start_agent',
    'health_check',
    'collect_environment_report',
  ],
  run_precheck: ['check_windows_capabilities', 'check_wsl2', 'check_distro'],
  request_permission: ['enable_wsl_optional_features'],
  start_agent: ['check_distro', 'start_agent', 'health_check'],
  stop_agent: ['check_distro', 'stop_agent'],
  restart_agent: ['check_distro', 'stop_agent', 'start_agent', 'health_check'],
  rebuild_environment: [
    'check_distro',
    'stop_agent',
    'cleanup_environment',
    'download_installer',
    'verify_checksum',
    'install_agent',
    'write_runtime_config',
    'start_agent',
    'health_check',
    'collect_environment_report',
  ],
  delete_environment: [
    'check_distro',
    'stop_agent',
    'delete_environment_files',
    'delete_verification',
    'collect_environment_report',
  ],
}

const TEMPLATE_SPECS: Record<TemplateCommandId, TemplateSpec> = {
  check_windows_capabilities: {
    stage: 'collecting_facts',
    failureStage: 'precheck',
    failureType: 'unsupported_environment',
    defaultFailureCode: 'windows_capability_check_failed',
    retryable: false,
    buildInvocation: () => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        '$caps=@{platform=$env:OS; virtualization=$true}; $caps | ConvertTo-Json -Compress',
      ],
      validate: (result) =>
        result.stdout.includes('platform')
          ? { ok: true }
          : { ok: false, failureCode: 'windows_capability_check_failed', detail: result.stderr || result.stdout },
    }),
  },
  check_wsl2: {
    stage: 'check_wsl2',
    failureStage: 'wsl_detection',
    failureType: 'missing_capability',
    defaultFailureCode: 'wsl_not_found',
    retryable: false,
    buildInvocation: () => ({
      program: 'wsl.exe',
      args: ['--status'],
    }),
    exitCodeMap: {
      1: 'wsl_not_enabled',
      2: 'wsl_policy_blocked',
    },
  },
  check_distro: {
    stage: 'check_distro',
    failureStage: 'distro_creation',
    failureType: 'missing_capability',
    defaultFailureCode: 'distro_not_found',
    retryable: true,
    buildInvocation: ({ targetDistro }) => ({
      program: 'wsl.exe',
      args: ['-l', '-q'],
      validate: (result) => {
        const distros = result.stdout
          .split(/\r?\n/)
          .map((entry) => entry.replaceAll('\u0000', '').trim())
          .filter(Boolean)
        return distros.includes(targetDistro)
          ? { ok: true }
          : { ok: false, failureCode: 'distro_not_found', detail: `Missing dedicated distro: ${targetDistro}` }
      },
    }),
  },
  enable_wsl_optional_features: {
    stage: 'enabling_features',
    failureStage: 'wsl_enablement',
    failureType: 'permission_required',
    defaultFailureCode: 'wsl_feature_enable_failed',
    retryable: true,
    buildInvocation: () => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          '$ErrorActionPreference="Stop"',
          'Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart | Out-Null',
          'Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart | Out-Null',
          'Write-Output "WSL features enabled"',
        ].join('; '),
      ],
    }),
  },
  check_reboot_pending: {
    stage: 'awaiting_reboot',
    failureStage: 'wsl_enablement',
    failureType: 'transient',
    defaultFailureCode: 'reboot_required',
    retryable: true,
    buildInvocation: ({ rebootResumeMarkerPath, targetDistro }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `$resumePath='${escapePowershellPath(rebootResumeMarkerPath)}'`,
          '$pending=(Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") -or (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired")',
          'if ($pending) {',
          `  Set-Content -Path $resumePath -Value '{"resume":"installer","targetDistro":"${escapeJsonString(targetDistro)}"}'`,
          '  Write-Error "reboot required"',
          '  exit 3',
          '}',
          'Write-Output "No reboot required"; exit 0',
        ].join(' '),
      ],
    }),
    exitCodeMap: {
      3: 'reboot_required',
    },
  },
  install_wsl_kernel_or_update: {
    stage: 'enabling_features',
    failureStage: 'wsl_enablement',
    failureType: 'command_failed',
    defaultFailureCode: 'wsl_kernel_update_failed',
    retryable: true,
    buildInvocation: () => ({
      program: 'wsl.exe',
      args: ['--update'],
    }),
  },
  create_distro: {
    stage: 'preparing_distro',
    failureStage: 'distro_creation',
    failureType: 'command_failed',
    defaultFailureCode: 'distro_create_failed',
    retryable: true,
    buildInvocation: ({ targetDistro, distroInstallRoot, bundledRootfsPath }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `$distroPath='${escapePowershellPath(`${distroInstallRoot}\\${targetDistro}`)}'`,
          `$rootfs='${escapePowershellPath(bundledRootfsPath)}'`,
          'New-Item -ItemType Directory -Force -Path $distroPath | Out-Null',
          'if (-not (Test-Path $rootfs)) { Write-Error "rootfs missing"; exit 1 }',
          `& wsl.exe --import '${escapePowershellString(targetDistro)}' $distroPath $rootfs --version 2`,
          'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
          `Write-Output '${escapePowershellString(targetDistro)}'`,
        ].join('; '),
      ],
    }),
  },
  seed_distro_base: {
    stage: 'preparing_distro',
    failureStage: 'distro_creation',
    failureType: 'command_failed',
    defaultFailureCode: 'distro_seed_failed',
    retryable: true,
    buildInvocation: ({ targetDistro }) => ({
      program: 'wsl.exe',
      args: [
        '-d',
        targetDistro,
        '--',
        'sh',
        '-lc',
        'mkdir -p /opt/agent-security/bootstrap && printf seeded >/opt/agent-security/bootstrap/state && echo seeded',
      ],
    }),
  },
  download_installer: {
    stage: 'download_installer',
    failureStage: 'agent_install',
    failureType: 'network_error',
    defaultFailureCode: 'install_download_failed',
    retryable: true,
    buildInvocation: ({ bundledAgentArtifactPath, bundledRootfsPath, stagedInstallerPath, stagedRootfsPath }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `$installer='${escapePowershellPath(bundledAgentArtifactPath)}'`,
          `$rootfs='${escapePowershellPath(bundledRootfsPath)}'`,
          `$stagedInstaller='${escapePowershellPath(stagedInstallerPath)}'`,
          `$stagedRootfs='${escapePowershellPath(stagedRootfsPath)}'`,
          'if (-not (Test-Path $installer)) { Write-Error "agent artifact missing"; exit 1 }',
          'if (-not (Test-Path $rootfs)) { Write-Error "rootfs artifact missing"; exit 1 }',
          'Copy-Item -Force $installer $stagedInstaller',
          'Copy-Item -Force $rootfs $stagedRootfs',
          'Write-Output "artifacts-staged"',
        ].join('; '),
      ],
    }),
  },
  verify_checksum: {
    stage: 'verify_checksum',
    failureStage: 'agent_install',
    failureType: 'command_failed',
    defaultFailureCode: 'artifact_invalid',
    retryable: false,
    buildInvocation: ({ installerChecksum, stagedInstallerPath }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        installerChecksum === 'dev-skip-checksum'
          ? `if (Test-Path '${escapePowershellPath(stagedInstallerPath)}') { Write-Output 'checksum-skipped'; exit 0 } else { exit 1 }`
          : `$hash=(Get-FileHash -Algorithm SHA256 -Path '${escapePowershellPath(stagedInstallerPath)}').Hash.ToLower(); if ($hash -eq '${escapePowershellString(installerChecksum.toLowerCase())}') { Write-Output 'checksum-ok'; exit 0 } else { Write-Error 'checksum mismatch'; exit 1 }`,
      ],
    }),
  },
  install_agent: {
    stage: 'install_agent',
    failureStage: 'agent_install',
    failureType: 'command_failed',
    defaultFailureCode: 'agent_install_failed',
    retryable: false,
    buildInvocation: ({ targetDistro, stagedInstallerPath }) => ({
      program: 'wsl.exe',
      args: [
        '-d',
        targetDistro,
        '--',
        'sh',
        '-lc',
        `mkdir -p /opt/agent-security && printf '%s' '${escapeShellSingleQuoted(
          windowsPathToWslPath(stagedInstallerPath),
        )}' >/opt/agent-security/installer-source && echo installed`,
      ],
    }),
  },
  write_runtime_config: {
    stage: 'write_runtime_config',
    failureStage: 'environment_install',
    failureType: 'command_failed',
    defaultFailureCode: 'runtime_config_write_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir, targetDistro, rebootResumeMarkerPath }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `Set-Content -Path '${escapePowershellPath(runtimeDir)}\\runtime.env' -Value 'TARGET_DISTRO=${escapePowershellString(targetDistro)}'`,
          `if (Test-Path '${escapePowershellPath(rebootResumeMarkerPath)}') { Remove-Item -Force '${escapePowershellPath(rebootResumeMarkerPath)}' }`,
          "Write-Output 'config-written'",
        ].join('; '),
      ],
    }),
  },
  start_agent: {
    stage: 'starting_bridge',
    failureStage: 'agent_start',
    failureType: 'startup_failed',
    defaultFailureCode: 'agent_start_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir, targetDistro }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `& wsl.exe -d '${escapePowershellString(targetDistro)}' -- sh -lc "mkdir -p /var/lib/agent-security && printf running >/var/lib/agent-security/state && echo running"`,
          'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
          `Set-Content -Path '${escapePowershellPath(runtimeDir)}\\agent.state' -Value 'running'`,
          "Write-Output 'running'",
        ].join('; '),
      ],
    }),
  },
  stop_agent: {
    stage: 'stopping',
    failureStage: 'agent_stop',
    failureType: 'command_failed',
    defaultFailureCode: 'agent_stop_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir, targetDistro }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `& wsl.exe -d '${escapePowershellString(targetDistro)}' -- sh -lc "mkdir -p /var/lib/agent-security && printf stopped >/var/lib/agent-security/state && echo stopped"`,
          'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
          `Set-Content -Path '${escapePowershellPath(runtimeDir)}\\agent.state' -Value 'stopped'`,
          "Write-Output 'stopped'",
        ].join('; '),
      ],
    }),
  },
  health_check: {
    stage: 'health_check',
    failureStage: 'health_check',
    failureType: 'startup_failed',
    defaultFailureCode: 'health_check_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `if ((Get-Content '${escapePowershellPath(runtimeDir)}\\agent.state' -ErrorAction SilentlyContinue) -eq 'running') { Write-Output 'healthy'; exit 0 } else { Write-Error 'not running'; exit 1 }`,
      ],
    }),
  },
  collect_environment_report: {
    stage: 'verifying_install',
    failureStage: 'environment_install',
    failureType: 'command_failed',
    defaultFailureCode: 'environment_report_failed',
    retryable: true,
    buildInvocation: ({ reportDir, targetDistro }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `New-Item -ItemType Directory -Force -Path '${escapePowershellPath(reportDir)}' | Out-Null; Set-Content -Path '${escapePowershellPath(reportDir)}\\environment-report.txt' -Value 'distro=${escapePowershellString(targetDistro)}'; Write-Output 'report-collected'`,
      ],
    }),
  },
  cleanup_environment: {
    stage: 'cleanup_environment',
    failureStage: 'rebuild',
    failureType: 'command_failed',
    defaultFailureCode: 'environment_cleanup_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `Remove-Item -Force -ErrorAction SilentlyContinue '${escapePowershellPath(runtimeDir)}\\agent.state','${escapePowershellPath(runtimeDir)}\\runtime.env'; Write-Output 'cleaned'`,
      ],
    }),
  },
  delete_environment_files: {
    stage: 'deleting',
    failureStage: 'delete',
    failureType: 'command_failed',
    defaultFailureCode: 'delete_failed',
    retryable: true,
    buildInvocation: ({ runtimeDir, targetDistro, distroInstallRoot }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `& wsl.exe --unregister '${escapePowershellString(targetDistro)}'`,
          'if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 4294967295) { exit $LASTEXITCODE }',
          `Remove-Item -Recurse -Force -ErrorAction SilentlyContinue '${escapePowershellPath(`${distroInstallRoot}\\${targetDistro}`)}','${escapePowershellPath(runtimeDir)}\\agent.state','${escapePowershellPath(runtimeDir)}\\runtime.env','${escapePowershellPath(runtimeDir)}\\staged-agent.pkg','${escapePowershellPath(runtimeDir)}\\staged-rootfs.tar'`,
          "Write-Output 'deleted'",
        ].join('; '),
      ],
    }),
  },
  delete_verification: {
    stage: 'deleting',
    failureStage: 'delete',
    failureType: 'command_failed',
    defaultFailureCode: 'delete_verification_failed',
    retryable: true,
    buildInvocation: ({ distroInstallRoot, targetDistro }) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          `$distroDir='${escapePowershellPath(`${distroInstallRoot}\\${targetDistro}`)}'`,
          "$distros=& wsl.exe -l -q",
          `if (-not (Test-Path $distroDir) -and ($distros -notmatch '^${escapePowershellRegex(targetDistro)}$')) { Write-Output 'verified'; exit 0 } else { exit 1 }`,
        ].join('; '),
      ],
    }),
  },
}

let commandExecutor: CommandExecutor = runAllowedCommand

export async function runTemplateCommand(
  input: TemplateCommandInput,
): Promise<TemplateCommandExecutionResult> {
  assertTemplatedCommandAllowed(input.action, input.command)
  const context = resolveTemplateContext(input)
  const template = TEMPLATE_SPECS[input.command]
  const invocation = template.buildInvocation(context)
  const timeoutMs = ACTION_TIMEOUT_MS[input.action]
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const sensitiveValues = collectSensitiveValues(input, context)
  const commandId = randomUUID()

  let timedOut = false
  try {
    const rawResult = await commandExecutor(
      invocation.program,
      invocation.args,
      timeoutMs,
      () => {
        timedOut = true
      },
    )
    const stdout = sanitizeAndTruncate(rawResult.stdout, MAX_STDOUT_CHARS, sensitiveValues)
    const stderr = sanitizeAndTruncate(rawResult.stderr, MAX_STDERR_CHARS, sensitiveValues)
    const completion = buildCompletion(startedMs, rawResult.exitCode)
    const validation = invocation.validate?.({ ...rawResult, stdout, stderr }) ?? { ok: true }

    if (validation.ok && rawResult.exitCode === 0) {
      return {
        ok: true,
        exitCode: rawResult.exitCode,
        stdout,
        stderr,
        stage: template.stage,
        audit: {
          commandId,
          action: input.action,
          stage: template.stage,
          startedAt,
          completedAt: completion.completedAt,
          durationMs: completion.durationMs,
          exitCode: rawResult.exitCode,
          timedOut,
          stdoutPreview: stdout,
          stderrPreview: stderr,
        },
      }
    }

    const failureCode = resolveFailureCode(template, rawResult.exitCode, validation)
    return {
      ok: false,
      stage: template.stage,
      failureStage: template.failureStage,
      failureType: template.failureType,
      failureCode,
      retryable: template.retryable && !timedOut,
      message: `Command failed at stage ${template.stage}.`,
      detail: validation.ok ? stderr || stdout : validation.detail,
      exitCode: rawResult.exitCode,
      timedOut,
      audit: {
        commandId,
        action: input.action,
        stage: template.stage,
        startedAt,
        completedAt: completion.completedAt,
        durationMs: completion.durationMs,
        exitCode: rawResult.exitCode,
        timedOut,
        stdoutPreview: stdout,
        stderrPreview: stderr,
        failureCode,
      },
    }
  } catch (error) {
    const completion = buildCompletion(startedMs, undefined)
    const errorMessage = sanitizeAndTruncate(
      error instanceof Error ? error.message : 'Command execution failed.',
      MAX_STDERR_CHARS,
      sensitiveValues,
    )
    const failureCode = timedOut ? `${input.command}_timeout` : `${input.command}_exception`
    return {
      ok: false,
      stage: template.stage,
      failureStage: template.failureStage,
      failureType: timedOut ? 'timeout' : template.failureType,
      failureCode,
      retryable: template.retryable,
      message: timedOut
        ? `Command timed out at stage ${template.stage}.`
        : `Command execution errored at stage ${template.stage}.`,
      detail: errorMessage,
      timedOut,
      audit: {
        commandId,
        action: input.action,
        stage: template.stage,
        startedAt,
        completedAt: completion.completedAt,
        durationMs: completion.durationMs,
        timedOut,
        stderrPreview: errorMessage,
        failureCode,
      },
    }
  }
}

function assertTemplatedCommandAllowed(
  action: TemplatedAction,
  command: TemplateCommandId,
) {
  const allowed = ACTION_TEMPLATE_TABLE[action]
  if (!allowed.includes(command)) {
    throw new Error(`Command template ${command} is not allowed for action ${action}.`)
  }
}

function resolveTemplateContext(input: TemplateCommandInput): ResolvedTemplateContext {
  const runtimeDir = input.runtimeDir ?? 'C:\\AgentSecurity\\runtime'
  return {
    targetDistro: input.targetDistro,
    runtimeDir,
    diagnosticsDir: input.diagnosticsDir ?? 'C:\\AgentSecurity\\diagnostics',
    reportDir: input.reportDir ?? 'C:\\AgentSecurity\\reports',
    distroInstallRoot: input.distroInstallRoot ?? 'C:\\AgentSecurity\\distros',
    rebootResumeMarkerPath:
      input.rebootResumeMarkerPath ?? `${runtimeDir}\\resume-after-reboot.json`,
    installerDownloadUrl: input.installerDownloadUrl ?? 'https://example.com/openclaw/install.sh',
    installerChecksum: input.installerChecksum ?? 'dev-skip-checksum',
    bundledRootfsPath:
      input.bundledRootfsPath ?? 'C:\\AgentSecurity\\bundled\\agent-security-rootfs.tar',
    bundledAgentArtifactPath:
      input.bundledAgentArtifactPath ?? 'C:\\AgentSecurity\\bundled\\agent-security-agent.pkg',
    stagedInstallerPath: `${runtimeDir}\\staged-agent.pkg`,
    stagedRootfsPath: `${runtimeDir}\\staged-rootfs.tar`,
  }
}

function collectSensitiveValues(
  input: TemplateCommandInput,
  context: ResolvedTemplateContext,
) {
  const values = [
    context.runtimeDir,
    context.diagnosticsDir,
    context.reportDir,
    context.distroInstallRoot,
    context.rebootResumeMarkerPath,
    context.installerDownloadUrl,
    context.installerChecksum,
    context.bundledRootfsPath,
    context.bundledAgentArtifactPath,
    context.stagedInstallerPath,
    context.stagedRootfsPath,
    ...(input.additionalSensitiveValues ?? []),
  ]
  return values.filter(Boolean)
}

function buildCompletion(startedMs: number, exitCode: number | undefined) {
  return {
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    exitCode,
  }
}

function resolveFailureCode(
  template: TemplateSpec,
  exitCode: number,
  validation: ValidationResult,
) {
  if (!validation.ok) {
    return validation.failureCode
  }
  return template.exitCodeMap?.[exitCode] ?? template.defaultFailureCode
}

export async function runAllowedCommand(
  program: AllowedProgram,
  args: string[],
  timeoutMs = 15000,
  onTimeout?: () => void,
): Promise<CommandResult> {
  if (program !== 'powershell.exe' && program !== 'wsl.exe') {
    throw new Error(`Program is not allowlisted: ${program}`)
  }

  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      onTimeout?.()
      child.kill()
      reject(new Error(`Command timed out: ${program}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      resolve({
        exitCode: exitCode ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}

export function setCommandExecutorForTests(
  executor: CommandExecutor | null,
) {
  commandExecutor = executor ?? runAllowedCommand
}

function sanitizeAndTruncate(
  value: string,
  limit: number,
  sensitiveValues: string[],
) {
  let sanitized = redactKnownSensitivePatterns(value)
  for (const sensitiveValue of sensitiveValues) {
    sanitized = sanitized.split(sensitiveValue).join('[REDACTED]')
  }
  const normalized = sanitized.trim()
  if (normalized.length <= limit) {
    return normalized
  }
  return `${normalized.slice(0, limit)}...[TRUNCATED]`
}

function redactKnownSensitivePatterns(value: string) {
  const patterns: Array<[RegExp, string]> = [
    [/(authorization\s*[:=]\s*)(bearer\s+[^\s"'`]+)/gi, '$1[REDACTED]'],
    [/(x-agent-security-token\s*[:=]\s*)([^\s"'`]+)/gi, '$1[REDACTED]'],
    [/(token\s*[:=]\s*)([^\s"'`]+)/gi, '$1[REDACTED]'],
    [/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g, '[REDACTED_PATH]'],
  ]

  return patterns.reduce((content, [pattern, replacement]) => {
    return content.replace(pattern, replacement)
  }, value)
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}

function escapePowershellPath(value: string) {
  return escapePowershellString(value)
}

function escapePowershellRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeJsonString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function windowsPathToWslPath(value: string) {
  const drive = value.slice(0, 1).toLowerCase()
  const rest = value.slice(2).replace(/\\/g, '/')
  return `/mnt/${drive}${rest}`
}

function escapeShellSingleQuoted(value: string) {
  return value.replace(/'/g, `'"'"'`)
}
