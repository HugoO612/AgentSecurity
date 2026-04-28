import { spawn } from 'node:child_process'

export type AllowedProgram = 'powershell.exe' | 'wsl.exe'

export type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type CommandExecutor = (
  program: AllowedProgram,
  args: string[],
  timeoutMs: number,
  onTimeout?: () => void,
) => Promise<CommandResult>

let commandExecutor: CommandExecutor = runAllowedCommand

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

export async function executeAllowedCommand(
  program: AllowedProgram,
  args: string[],
  timeoutMs: number,
  onTimeout?: () => void,
) {
  return commandExecutor(program, args, timeoutMs, onTimeout)
}

export function setCommandExecutorForTests(
  executor: CommandExecutor | null,
) {
  commandExecutor = executor ?? runAllowedCommand
}
