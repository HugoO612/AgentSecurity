import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const installerPath = process.argv[2]

if (!installerPath) {
  throw new Error('Usage: node scripts/verify-windows-signature.mjs <path-to-exe>')
}

const command = [
  '$signature = Get-AuthenticodeSignature -LiteralPath $args[0]',
  'if ($signature.Status -ne "Valid") {',
  '  Write-Error ("Authenticode signature is not valid: " + $signature.Status)',
  '  exit 1',
  '}',
  'Write-Output $signature.Status',
].join('; ')

const { stdout } = await execFileAsync(
  'powershell.exe',
  ['-NoLogo', '-NoProfile', '-Command', command, installerPath],
)

process.stdout.write(stdout)
