import { randomUUID } from 'node:crypto'
import type {
  CommandAuditSummary,
  EnvironmentActionType,
  FailureStage,
  FailureType,
  OperationStage,
} from '../src/contracts/environment.ts'
import {
  executeAllowedCommand,
  runAllowedCommand,
  setCommandExecutorForTests,
  type AllowedProgram,
  type CommandResult,
} from './command-executor.ts'
import {
  buildStageArtifactsInvocation,
  buildInstallAgentInvocation,
  buildVerifyChecksumInvocation,
} from './artifact-installer.ts'
import {
  buildCheckDistroInvocation,
  buildCheckWslStatusInvocation,
  buildWindowsCapabilityInvocation,
} from './environment-check.ts'
import {
  buildCheckRebootPendingInvocation,
  buildEnableWslFeaturesInvocation,
} from './elevation-controller.ts'
import {
  buildCreateDistroInvocation,
  buildDeleteVerificationInvocation,
  buildSeedDistroInvocation,
  validateTargetDistroOnly,
} from './distro-manager.ts'
import {
  buildCleanupEnvironmentInvocation,
  buildDeleteEnvironmentFilesInvocation,
} from './recovery-controller.ts'
import {
  buildHealthCheckInvocation,
  buildStartAgentInvocation,
  buildStopAgentInvocation,
  buildWriteRuntimeConfigInvocation,
} from './runtime-controller.ts'

const MAX_STDOUT_CHARS = 4000
const MAX_STDERR_CHARS = 4000

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

export type TemplateStage =
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

export type ValidationResult =
  | { ok: true }
  | { ok: false; failureCode: string; detail?: string }

export type CommandInvocation = {
  program: AllowedProgram
  args: string[]
  validate?: (result: CommandResult) => ValidationResult
}

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
  elevationHelperCommand?: string
  allowDevShim?: boolean
  additionalSensitiveValues?: string[]
}

export type ResolvedExecutionContext = {
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
  elevationHelperCommand: string
  allowDevShim: boolean
}

type TemplateSpec = {
  stage: TemplateStage
  failureStage: FailureStage
  failureType: FailureType
  defaultFailureCode: string
  retryable: boolean
  buildInvocation: (context: ResolvedExecutionContext) => CommandInvocation
  validateContext?: (context: ResolvedExecutionContext) => ValidationResult
  exitCodeMap?: Record<number, string>
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
    'install_wsl_kernel_or_update',
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
    'install_wsl_kernel_or_update',
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
    'install_wsl_kernel_or_update',
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
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: () => buildWindowsCapabilityInvocation(),
  },
  check_wsl2: {
    stage: 'check_wsl2',
    failureStage: 'wsl_detection',
    failureType: 'missing_capability',
    defaultFailureCode: 'wsl_not_found',
    retryable: false,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: () => buildCheckWslStatusInvocation(),
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
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildCheckDistroInvocation(context),
  },
  enable_wsl_optional_features: {
    stage: 'enabling_features',
    failureStage: 'wsl_enablement',
    failureType: 'permission_required',
    defaultFailureCode: 'wsl_feature_enable_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildEnableWslFeaturesInvocation(context),
  },
  check_reboot_pending: {
    stage: 'awaiting_reboot',
    failureStage: 'wsl_enablement',
    failureType: 'transient',
    defaultFailureCode: 'reboot_required',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildCheckRebootPendingInvocation(context),
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
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
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
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildCreateDistroInvocation(context),
  },
  seed_distro_base: {
    stage: 'preparing_distro',
    failureStage: 'distro_creation',
    failureType: 'command_failed',
    defaultFailureCode: 'distro_seed_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildSeedDistroInvocation(context),
  },
  download_installer: {
    stage: 'download_installer',
    failureStage: 'agent_install',
    failureType: 'network_error',
    defaultFailureCode: 'install_download_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildStageArtifactsInvocation(context),
  },
  verify_checksum: {
    stage: 'verify_checksum',
    failureStage: 'agent_install',
    failureType: 'command_failed',
    defaultFailureCode: 'artifact_invalid',
    retryable: false,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildVerifyChecksumInvocation(context),
  },
  install_agent: {
    stage: 'install_agent',
    failureStage: 'agent_install',
    failureType: 'command_failed',
    defaultFailureCode: 'agent_install_failed',
    retryable: false,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildInstallAgentInvocation(context),
  },
  write_runtime_config: {
    stage: 'write_runtime_config',
    failureStage: 'environment_install',
    failureType: 'command_failed',
    defaultFailureCode: 'runtime_config_write_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildWriteRuntimeConfigInvocation(context),
  },
  start_agent: {
    stage: 'starting_bridge',
    failureStage: 'agent_start',
    failureType: 'startup_failed',
    defaultFailureCode: 'agent_start_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildStartAgentInvocation(context),
  },
  stop_agent: {
    stage: 'stopping',
    failureStage: 'agent_stop',
    failureType: 'command_failed',
    defaultFailureCode: 'agent_stop_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildStopAgentInvocation(context),
  },
  health_check: {
    stage: 'health_check',
    failureStage: 'health_check',
    failureType: 'startup_failed',
    defaultFailureCode: 'health_check_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildHealthCheckInvocation(context),
  },
  collect_environment_report: {
    stage: 'verifying_install',
    failureStage: 'environment_install',
    failureType: 'command_failed',
    defaultFailureCode: 'environment_report_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => ({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `New-Item -ItemType Directory -Force -Path '${escapePowershellString(context.reportDir)}' | Out-Null; Set-Content -Path '${escapePowershellString(context.reportDir)}\\environment-report.txt' -Value 'distro=${escapePowershellString(context.targetDistro)}'; Write-Output 'report-collected'`,
      ],
    }),
  },
  cleanup_environment: {
    stage: 'cleanup_environment',
    failureStage: 'rebuild',
    failureType: 'command_failed',
    defaultFailureCode: 'environment_cleanup_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildCleanupEnvironmentInvocation(context),
  },
  delete_environment_files: {
    stage: 'deleting',
    failureStage: 'delete',
    failureType: 'command_failed',
    defaultFailureCode: 'delete_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildDeleteEnvironmentFilesInvocation(context),
  },
  delete_verification: {
    stage: 'deleting',
    failureStage: 'delete',
    failureType: 'command_failed',
    defaultFailureCode: 'delete_verification_failed',
    retryable: true,
    validateContext: (context) => validateTargetDistroOnly(context.targetDistro),
    buildInvocation: (context) => buildDeleteVerificationInvocation(context),
  },
}

export async function runTemplateCommand(
  input: TemplateCommandInput,
): Promise<TemplateCommandExecutionResult> {
  assertTemplatedCommandAllowed(input.action, input.command)
  const context = resolveTemplateContext(input)
  const template = TEMPLATE_SPECS[input.command]
  const contextValidation = template.validateContext?.(context) ?? { ok: true }
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const sensitiveValues = collectSensitiveValues(input, context)
  const commandId = randomUUID()

  if (!contextValidation.ok) {
    return createFailureResult({
      input,
      template,
      commandId,
      startedAt,
      startedMs,
      failureCode: contextValidation.failureCode,
      detail: contextValidation.detail,
      timedOut: false,
    })
  }

  const invocation = template.buildInvocation(context)
  const timeoutMs = ACTION_TIMEOUT_MS[input.action]
  let timedOut = false

  try {
    const rawResult = await executeAllowedCommand(
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
    const validation = invocation.validate?.(rawResult) ?? { ok: true }

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
          executor: context.allowDevShim ? 'dev-shim' : 'live',
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
        executor: context.allowDevShim ? 'dev-shim' : 'live',
      },
    }
  } catch (error) {
    const detail = sanitizeAndTruncate(
      error instanceof Error ? error.message : 'Command execution failed.',
      MAX_STDERR_CHARS,
      sensitiveValues,
    )
    return createFailureResult({
      input,
      template,
      commandId,
      startedAt,
      startedMs,
      failureCode: timedOut ? `${input.command}_timeout` : `${input.command}_exception`,
      detail,
      timedOut,
      failureType: timedOut ? 'timeout' : template.failureType,
    })
  }
}

function createFailureResult(input: {
  input: TemplateCommandInput
  template: TemplateSpec
  commandId: string
  startedAt: string
  startedMs: number
  failureCode: string
  detail?: string
  timedOut: boolean
  failureType?: FailureType
}): TemplateCommandFailure {
  const completion = buildCompletion(input.startedMs, undefined)
  return {
    ok: false,
    stage: input.template.stage,
    failureStage: input.template.failureStage,
    failureType: input.failureType ?? input.template.failureType,
    failureCode: input.failureCode,
    retryable: input.template.retryable && !input.timedOut,
    message: input.timedOut
      ? `Command timed out at stage ${input.template.stage}.`
      : `Command execution errored at stage ${input.template.stage}.`,
    detail: input.detail,
    timedOut: input.timedOut,
    audit: {
      commandId: input.commandId,
      action: input.input.action,
      stage: input.template.stage,
      startedAt: input.startedAt,
      completedAt: completion.completedAt,
      durationMs: completion.durationMs,
      timedOut: input.timedOut,
      stderrPreview: input.detail,
      failureCode: input.failureCode,
      executor: input.input.allowDevShim ? 'dev-shim' : 'live',
    },
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

function resolveTemplateContext(input: TemplateCommandInput): ResolvedExecutionContext {
  const runtimeDir = input.runtimeDir ?? 'C:\\AgentSecurity\\runtime'
  return {
    targetDistro: input.targetDistro,
    runtimeDir,
    diagnosticsDir: input.diagnosticsDir ?? 'C:\\AgentSecurity\\diagnostics',
    reportDir: input.reportDir ?? 'C:\\AgentSecurity\\reports',
    distroInstallRoot: input.distroInstallRoot ?? 'C:\\AgentSecurity\\distros',
    rebootResumeMarkerPath:
      input.rebootResumeMarkerPath ?? `${runtimeDir}\\resume-after-reboot.json`,
    installerDownloadUrl: input.installerDownloadUrl ?? 'bundled://agent-security-agent.pkg',
    installerChecksum: input.installerChecksum ?? 'dev-skip-checksum',
    bundledRootfsPath:
      input.bundledRootfsPath ?? 'C:\\AgentSecurity\\bundled\\agent-security-rootfs.tar',
    bundledAgentArtifactPath:
      input.bundledAgentArtifactPath ?? 'C:\\AgentSecurity\\bundled\\agent-security-agent.pkg',
    stagedInstallerPath: `${runtimeDir}\\staged-agent.pkg`,
    stagedRootfsPath: `${runtimeDir}\\staged-rootfs.tar`,
    elevationHelperCommand:
      input.elevationHelperCommand ??
      'powershell.exe -NoProfile -Command "Write-Output elevation-requested"',
    allowDevShim: input.allowDevShim ?? false,
  }
}

function collectSensitiveValues(
  input: TemplateCommandInput,
  context: ResolvedExecutionContext,
) {
  return [
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
  ].filter(Boolean)
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

export { runAllowedCommand, setCommandExecutorForTests }
export type { AllowedProgram, CommandResult }
