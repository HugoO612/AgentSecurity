import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true })
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }
    throw error
  }
}

export async function writeJsonFileAtomic(path: string, data: unknown) {
  await ensureDirectory(dirname(path))
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

export async function removePath(path: string) {
  await rm(path, { recursive: true, force: true })
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
