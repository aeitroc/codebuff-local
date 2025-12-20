import fs from 'fs'
import path from 'path'

const FEATURE_DIR_PATTERN = /^[0-9]{3}-[a-z0-9][a-z0-9-]*$/
const ARTIFACT_FILES = [
  'spec.md',
  'plan.md',
  'tasks.md',
  'research.md',
  'data-model.md',
  'quickstart.md',
]
const ARTIFACT_DIRS = ['contracts']

export type SpeckitArtifact = {
  label: string
  relativePath: string
  absolutePath: string
  exists: boolean
}

export type SpeckitArtifactsSummary = {
  projectRoot: string
  featureDir: string | null
  artifacts: SpeckitArtifact[]
}

const toRelativePath = (projectRoot: string, absolutePath: string): string => {
  const relative = path.relative(projectRoot, absolutePath)
  return relative.length === 0 ? '.' : relative
}

/**
 * Find the most recently updated Speckit feature directory under /specs.
 *
 * @param projectRoot - Absolute repository root path.
 * @returns Absolute path to the most recent feature directory, or null when none exist.
 */
export function findLatestSpeckitFeatureDir(
  projectRoot: string,
): string | null {
  const specsDir = path.join(projectRoot, 'specs')
  if (!fs.existsSync(specsDir)) {
    return null
  }

  const candidates = fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && FEATURE_DIR_PATTERN.test(entry.name),
    )
    .map((entry) => {
      const featureDir = path.join(specsDir, entry.name)
      const specPath = path.join(featureDir, 'spec.md')
      if (!fs.existsSync(specPath)) {
        return null
      }
      const stat = fs.statSync(specPath)
      return { featureDir, mtimeMs: stat.mtimeMs }
    })
    .filter(
      (item): item is { featureDir: string; mtimeMs: number } =>
        item !== null,
    )

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0].featureDir
}

/**
 * List expected Speckit artifacts for a specific feature directory.
 *
 * @param projectRoot - Absolute repository root path.
 * @param featureDir - Absolute feature directory path.
 * @returns Array of artifact descriptors with existence flags.
 */
export function listSpeckitArtifacts(
  projectRoot: string,
  featureDir: string,
): SpeckitArtifact[] {
  const relativeBase = toRelativePath(projectRoot, featureDir)

  const fileArtifacts = ARTIFACT_FILES.map((file) => {
    const absolutePath = path.join(featureDir, file)
    const relativePath = path.join(relativeBase, file)
    return {
      label: file,
      relativePath,
      absolutePath,
      exists: fs.existsSync(absolutePath),
    }
  })

  const dirArtifacts = ARTIFACT_DIRS.map((dir) => {
    const absolutePath = path.join(featureDir, dir)
    const relativePath = path.join(relativeBase, dir)
    return {
      label: `${dir}/`,
      relativePath,
      absolutePath,
      exists: fs.existsSync(absolutePath),
    }
  })

  return [...fileArtifacts, ...dirArtifacts]
}

/**
 * Build a summary of Speckit artifacts based on the latest feature directory.
 *
 * @param projectRoot - Absolute repository root path.
 * @returns Summary object including resolved artifacts.
 */
export function getSpeckitArtifactsSummary(
  projectRoot: string,
): SpeckitArtifactsSummary {
  const featureDir = findLatestSpeckitFeatureDir(projectRoot)
  if (!featureDir) {
    return { projectRoot, featureDir: null, artifacts: [] }
  }

  return {
    projectRoot,
    featureDir,
    artifacts: listSpeckitArtifacts(projectRoot, featureDir),
  }
}
