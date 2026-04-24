import { spawn } from 'node:child_process'

const ALLOWED_PROGRAMS = new Set(['powershell.exe', 'wsl.exe'])

export type AllowedProgram = 'powershell.exe' | 'wsl.exe'

export type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export async function runAllowedCommand(
  program: AllowedProgram,
  args: string[],
  timeoutMs = 15000,
): Promise<CommandResult> {
  if (!ALLOWED_PROGRAMS.has(program)) {
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
