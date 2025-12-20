import fs from 'fs'
import path from 'path'

import {
  SPECKIT_COMMAND_FILES,
  SPECKIT_COMMANDS_DIR,
  SPECKIT_COMMANDS_SOURCE_DIRS,
} from './constants'

export type SpeckitResourceSyncResult = {
  ok: boolean
  updated: string[]
  skipped: string[]
  errors: string[]
}

const toRelative = (projectRoot: string, absolutePath: string): string => {
  const relative = path.relative(projectRoot, absolutePath)
  return relative.length === 0 ? '.' : relative
}

const shouldCopyFile = (source: string, target: string): boolean => {
  if (!fs.existsSync(target)) {
    return true
  }

  const sourceStat = fs.statSync(source)
  const targetStat = fs.statSync(target)
  if (sourceStat.mtimeMs <= targetStat.mtimeMs) {
    return false
  }

  const sourceContent = fs.readFileSync(source)
  const targetContent = fs.readFileSync(target)
  return !sourceContent.equals(targetContent)
}

const syncFile = (params: {
  projectRoot: string
  source: string
  target: string
  updated: string[]
  skipped: string[]
  errors: string[]
}) => {
  const { projectRoot, source, target, updated, skipped, errors } = params

  if (!fs.existsSync(source)) {
    errors.push(`Missing source: ${toRelative(projectRoot, source)}`)
    return
  }

  const targetDir = path.dirname(target)
  fs.mkdirSync(targetDir, { recursive: true })

  if (shouldCopyFile(source, target)) {
    fs.copyFileSync(source, target)
    updated.push(toRelative(projectRoot, target))
    return
  }

  skipped.push(toRelative(projectRoot, target))
}

const syncDirectory = (params: {
  projectRoot: string
  sourceDir: string
  targetDir: string
  updated: string[]
  skipped: string[]
  errors: string[]
}) => {
  const { projectRoot, sourceDir, targetDir, updated, skipped, errors } = params

  if (!fs.existsSync(sourceDir)) {
    errors.push(`Missing source: ${toRelative(projectRoot, sourceDir)}`)
    return
  }

  fs.mkdirSync(targetDir, { recursive: true })

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      syncDirectory({
        projectRoot,
        sourceDir: sourcePath,
        targetDir: targetPath,
        updated,
        skipped,
        errors,
      })
      continue
    }

    if (entry.isFile()) {
      syncFile({
        projectRoot,
        source: sourcePath,
        target: targetPath,
        updated,
        skipped,
        errors,
      })
    }
  }
}

/**
 * Ensure Speckit command resources exist in their canonical locations.
 *
 * @param projectRoot - Absolute repository root path.
 * @returns Result object describing updates and errors.
 */
export function ensureSpeckitResources(
  projectRoot: string,
): SpeckitResourceSyncResult {
  const updated: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  const commandsDir = path.join(projectRoot, SPECKIT_COMMANDS_DIR)
  fs.mkdirSync(commandsDir, { recursive: true })

  for (const filename of SPECKIT_COMMAND_FILES) {
    const sourcePath = SPECKIT_COMMANDS_SOURCE_DIRS
      .map((sourceDir) => path.join(projectRoot, sourceDir, filename))
      .find((candidate) => fs.existsSync(candidate))

    syncFile({
      projectRoot,
      source: sourcePath ??
        path.join(projectRoot, SPECKIT_COMMANDS_SOURCE_DIRS[0], filename),
      target: path.join(commandsDir, filename),
      updated,
      skipped,
      errors,
    })
  }

  const sourceSpecifyDir = path.join(projectRoot, 'commands', '.specify')
  const targetSpecifyDir = path.join(projectRoot, '.specify')
  if (fs.existsSync(sourceSpecifyDir)) {
    syncDirectory({
      projectRoot,
      sourceDir: sourceSpecifyDir,
      targetDir: targetSpecifyDir,
      updated,
      skipped,
      errors,
    })
  } else if (!fs.existsSync(targetSpecifyDir)) {
    errors.push(`Missing source: ${toRelative(projectRoot, sourceSpecifyDir)}`)
  }

  return {
    ok: errors.length === 0,
    updated,
    skipped,
    errors,
  }
}
