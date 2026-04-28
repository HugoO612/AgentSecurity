import { lookup } from 'node:dns/promises'
import { statfs } from 'node:fs/promises'
import type { BridgeConfig } from './config.ts'
import type {
  FailureSnapshot,
  PrecheckItem,
} from '../src/contracts/environment.ts'
import type {
  CommandResult,
  CommandInvocation,
  ResolvedExecutionContext,
  ValidationResult,
} from './command-runner.ts'
import { runAllowedCommand } from './command-executor.ts'

const DISK_BLOCK_BYTES = 3 * 1024 * 1024 * 1024

type WslFailureReason =
  | 'none'
  | 'not_enabled'
  | 'permission_denied'
  | 'policy_blocked'
  | 'unknown'

export type WslStatus = {
  available: boolean
  virtualizationReady: boolean
  detail: string
  reason: WslFailureReason
}

export type DistroStatus = {
  exists: boolean
  detail: string
}

export async function buildPrecheck(config: BridgeConfig) {
  const now = new Date().toISOString()
  const wsl = await detectWslAvailability()
  const disk = await checkDisk(config.runtimeDir)
  const network = await checkNetwork()
  const distro = await checkDedicatedDistro(config.targetDistro)

  const checks: PrecheckItem[] = [
    {
      code: 'windows_version',
      status: process.platform === 'win32' ? 'passed' : 'blocked',
      message:
        process.platform === 'win32'
          ? '当前设备满足正式本地版的基础系统要求。'
          : '正式本地版当前只支持 Windows 设备。',
      rawDetail: `platform=${process.platform}`,
      resolutionKind: process.platform === 'win32' ? 'auto' : 'manual',
      userAction: process.platform === 'win32' ? 'none' : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'wsl_status',
      status: wsl.available ? 'passed' : 'blocked',
      message: describeWslMessage(wsl),
      detail: wsl.available ? '系统已具备 WSL2 运行基础。' : '当前还无法使用 WSL2。',
      rawDetail: wsl.detail,
      resolutionKind:
        wsl.available ? 'auto' : wsl.reason === 'permission_denied' ? 'user_confirm' : 'manual',
      userAction: wsl.available
        ? 'none'
        : wsl.reason === 'permission_denied'
          ? 'request_permission'
          : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'virtualization',
      status: wsl.virtualizationReady ? 'passed' : 'blocked',
      message: describeVirtualizationMessage(wsl),
      detail: wsl.virtualizationReady ? '虚拟化能力可用。' : '虚拟化能力暂不可用。',
      rawDetail: wsl.detail,
      resolutionKind:
        wsl.virtualizationReady
          ? 'auto'
          : wsl.reason === 'permission_denied'
            ? 'user_confirm'
            : 'manual',
      userAction: wsl.virtualizationReady
        ? 'none'
        : wsl.reason === 'permission_denied'
          ? 'request_permission'
          : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'disk_space',
      status: disk.blocked ? 'blocked' : 'passed',
      message: disk.blocked ? '可用空间不足，暂时无法准备正式本地版。' : '磁盘空间足够。',
      detail: disk.detail,
      rawDetail: disk.detail,
      resolutionKind: disk.blocked ? 'manual' : 'auto',
      userAction: disk.blocked ? 'manual_fix' : 'none',
      updatedAt: now,
    },
    {
      code: 'network',
      status: network.available ? 'passed' : 'warning',
      message: network.available ? '网络连接可用。' : '网络不稳定，安装可能失败。',
      detail: network.detail,
      rawDetail: network.detail,
      resolutionKind: network.available ? 'auto' : 'manual',
      userAction: network.available ? 'none' : 'retry',
      updatedAt: now,
    },
    {
      code: 'permission',
      status: wsl.reason === 'permission_denied' ? 'blocked' : 'warning',
      message:
        wsl.reason === 'permission_denied'
          ? '继续前需要系统权限确认。'
          : '后续某些步骤可能请求系统权限。',
      rawDetail: wsl.detail,
      resolutionKind: 'user_confirm',
      userAction: 'request_permission',
      updatedAt: now,
    },
    {
      code: 'distro',
      status: distro.exists ? 'passed' : 'warning',
      message: distro.exists
        ? `已检测到专用隔离环境 ${config.targetDistro}。`
        : `安装器会自动准备专用隔离环境 ${config.targetDistro}。`,
      detail: distro.exists
        ? '专用 distro 已存在。'
        : '缺失时会由正式安装器自动准备，无需手工创建。',
      rawDetail: distro.detail,
      resolutionKind: 'auto',
      userAction: 'none',
      updatedAt: now,
    },
    {
      code: 'agent_installed',
      status: 'warning',
      message: '当前尚未确认正式版 agent 已安装完成。',
      detail: '正式安装器会在后续步骤中完成安装与验证。',
      rawDetail: 'installation state evaluated during installer run',
      resolutionKind: 'auto',
      userAction: 'none',
      updatedAt: now,
    },
    {
      code: 'host_isolation',
      status: 'passed',
      message: '正式版会把 agent 保持在隔离环境中运行。',
      detail: '不会把 agent 直接安装到 Windows 主环境。',
      rawDetail: 'dedicated isolated runtime enforced by bridge orchestration',
      resolutionKind: 'auto',
      userAction: 'none',
      updatedAt: now,
    },
    {
      code: 'recovery_available',
      status: 'passed',
      message: '正式版支持重试、重建、删除和导出诊断包。',
      detail: '失败后会给出推荐动作和固定影响说明。',
      rawDetail: 'recovery center enabled',
      resolutionKind: 'auto',
      userAction: 'none',
      updatedAt: now,
    },
    {
      code: 'delete_available',
      status: 'passed',
      message: '正式版支持删除隔离环境并展示删除结果。',
      detail: '删除后会明确显示已删除内容和保留内容。',
      rawDetail: 'delete result report available',
      resolutionKind: 'auto',
      userAction: 'none',
      updatedAt: now,
    },
  ]

  return {
    checks,
    failure:
      checks.find((check) => check.status === 'blocked') !== undefined
        ? mapPrecheckFailure(checks, wsl)
        : undefined,
  }
}

export async function detectWslAvailability(): Promise<WslStatus> {
  if (process.platform !== 'win32') {
    return {
      available: false,
      virtualizationReady: false,
      detail: 'WSL checks only run on Windows hosts.',
      reason: 'unknown',
    }
  }

  try {
    const result = await runAllowedCommand('wsl.exe', ['--status'])
    const output = `${result.stdout}\n${result.stderr}`.trim()

    if (result.exitCode === 0) {
      return {
        available: true,
        virtualizationReady: true,
        detail: output,
        reason: 'none',
      }
    }

    const reason = classifyWslFailureReason(output)
    return {
      available: false,
      virtualizationReady: false,
      detail: output || 'wsl.exe --status returned a non-zero exit code.',
      reason,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'wsl.exe unavailable'
    return {
      available: false,
      virtualizationReady: false,
      detail: message,
      reason: classifyWslFailureReason(message),
    }
  }
}

export async function checkDedicatedDistro(targetDistro: string): Promise<DistroStatus> {
  try {
    const result = await runAllowedCommand('wsl.exe', ['-l', '-q'])
    return {
      exists: parseWslDistroList(result).includes(targetDistro),
      detail: `distros=${parseWslDistroList(result).join(',')}`,
    }
  } catch (error) {
    return {
      exists: false,
      detail: error instanceof Error ? error.message : 'Unable to enumerate distros.',
    }
  }
}

export function parseWslDistroList(result: CommandResult) {
  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replaceAll('\u0000', '').trim())
    .filter(Boolean)
}

async function checkDisk(runtimeDir: string) {
  try {
    const info = await statfs(runtimeDir)
    const freeBytes = info.bavail * info.bsize
    return {
      blocked: freeBytes < DISK_BLOCK_BYTES,
      detail: `Free bytes: ${freeBytes}`,
    }
  } catch (error) {
    return {
      blocked: false,
      detail: error instanceof Error ? error.message : 'Disk space unavailable',
    }
  }
}

async function checkNetwork() {
  try {
    await lookup('microsoft.com')
    return {
      available: true,
      detail: 'DNS lookup succeeded.',
    }
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : 'Network lookup failed.',
    }
  }
}

function mapPrecheckFailure(
  checks: PrecheckItem[],
  wsl: WslStatus,
): FailureSnapshot {
  const blocked = checks.find((check) => check.status === 'blocked')
  const now = new Date().toISOString()

  if (blocked?.code === 'permission') {
    return {
      stage: 'permission',
      type: 'permission_required',
      code: 'permission_required',
      message: '继续前需要系统权限确认。',
      detail: blocked.rawDetail ?? wsl.detail,
      retryable: true,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'disk_space') {
    return {
      stage: 'precheck',
      type: 'disk_space_insufficient',
      code: 'disk_space_insufficient',
      message: '可用空间不足，当前无法继续正式安装。',
      detail: blocked.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'windows_version') {
    return {
      stage: 'precheck',
      type: 'unsupported_environment',
      code: 'windows_version_unsupported',
      message: '当前系统版本不满足正式本地版要求。',
      detail: blocked.rawDetail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'wsl_status') {
    if (wsl.reason === 'permission_denied') {
      return {
        stage: 'permission',
        type: 'permission_required',
        code: 'permission_denied',
        message: '当前无法在未授权状态下确认 WSL2。',
        detail: blocked.rawDetail,
        retryable: true,
        occurredAt: now,
        suggestedRecovery: 'view_fix_instructions',
      }
    }
    return {
      stage: 'wsl_enablement',
      type: wsl.reason === 'policy_blocked' ? 'unsupported_environment' : 'missing_capability',
      code: wsl.reason === 'policy_blocked' ? 'wsl_policy_blocked' : 'wsl_not_enabled',
      message: '当前设备尚未满足 WSL2 运行要求。',
      detail: blocked.rawDetail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'virtualization') {
    return {
      stage: 'wsl_detection',
      type: 'missing_capability',
      code: 'virtualization_unavailable',
      message: '当前设备的虚拟化能力不可用。',
      detail: blocked.rawDetail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  return {
    stage: 'precheck',
    type: 'missing_capability',
    code: blocked?.code ?? 'precheck_blocked',
    message: '当前设备尚未满足正式本地版安装前提。',
    detail: blocked?.detail,
    retryable: false,
    occurredAt: now,
    suggestedRecovery: 'view_fix_instructions',
  }
}

function describeWslMessage(wsl: WslStatus) {
  if (wsl.available) {
    return 'WSL2 已可用。'
  }
  if (wsl.reason === 'permission_denied') {
    return '当前无法在未授权状态下确认 WSL2。'
  }
  if (wsl.reason === 'policy_blocked') {
    return 'WSL2 被系统策略阻止。'
  }
  if (wsl.reason === 'not_enabled') {
    return 'WSL2 尚未启用。'
  }
  return '当前无法确认 WSL2 状态。'
}

function describeVirtualizationMessage(wsl: WslStatus) {
  if (wsl.virtualizationReady) {
    return '虚拟化能力已准备好。'
  }
  if (wsl.reason === 'policy_blocked') {
    return '虚拟化能力被系统策略阻止。'
  }
  if (wsl.reason === 'permission_denied') {
    return '需要系统权限以确认虚拟化能力。'
  }
  return '虚拟化能力当前不可用。'
}

export function classifyWslFailureReason(detail: string): WslFailureReason {
  const normalized = detail.toLowerCase()
  const permissionHints = [
    'access is denied',
    'permission denied',
    'requires elevation',
    'administrator privileges',
    '0x80070005',
    '拒绝访问',
  ]
  if (permissionHints.some((hint) => normalized.includes(hint))) {
    return 'permission_denied'
  }

  const policyHints = [
    'group policy',
    'blocked by policy',
    'disabled by policy',
    'disabled by your organization',
    '策略',
    '组织',
  ]
  if (policyHints.some((hint) => normalized.includes(hint))) {
    return 'policy_blocked'
  }

  const notEnabledHints = [
    'wsl is not enabled',
    'windows subsystem for linux has not been enabled',
    'optional component is not enabled',
    'feature is disabled',
    '0x80370114',
    '未启用',
  ]
  if (notEnabledHints.some((hint) => normalized.includes(hint))) {
    return 'not_enabled'
  }

  return 'unknown'
}

export function buildWindowsCapabilityInvocation(): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        '$os = Get-CimInstance Win32_OperatingSystem',
        '$computer = Get-CimInstance Win32_ComputerSystem',
        '$caps = @{',
        '  caption = $os.Caption',
        '  build = $os.BuildNumber',
        '  version = $os.Version',
        '  hypervisorPresent = $computer.HypervisorPresent',
        '}',
        '$caps | ConvertTo-Json -Compress',
      ].join('; '),
    ],
    validate: (result) =>
      result.stdout.includes('build')
        ? { ok: true }
        : {
            ok: false,
            failureCode: 'windows_capability_check_failed',
            detail: result.stderr || result.stdout,
          },
  }
}

export function buildCheckWslStatusInvocation(): CommandInvocation {
  return {
    program: 'wsl.exe',
    args: ['--status'],
  }
}

export function buildCheckDistroInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'wsl.exe',
    args: ['-l', '-q'],
    validate: (result) => validateDedicatedDistro(result, context.targetDistro),
  }
}

export function validateDedicatedDistro(
  result: CommandResult,
  targetDistro: string,
): ValidationResult {
  const distros = parseWslDistroList(result)
  return distros.includes(targetDistro)
    ? { ok: true }
    : {
        ok: false,
        failureCode: 'distro_not_found',
        detail: `Missing dedicated distro: ${targetDistro}`,
      }
}
