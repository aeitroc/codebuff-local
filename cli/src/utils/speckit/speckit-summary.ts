import path from 'path'

import type { SpeckitArtifactsSummary } from './speckit-artifacts'

export type SpeckitSummaryStatus = 'success' | 'cancelled' | 'failed'

/**
 * Build a user-facing summary string for a Speckit run.
 *
 * @param params - Summary inputs including status and artifact metadata.
 * @returns Formatted multi-line summary.
 */
export function buildSpeckitSummary(params: {
  status: SpeckitSummaryStatus
  artifacts: SpeckitArtifactsSummary
}): string {
  const { status, artifacts } = params
  const lines: string[] = [`Speckit status: ${status}`]

  if (!artifacts.featureDir) {
    lines.push('Artifacts: none found')
    return lines.join('\n')
  }

  const relativeDir = path.relative(artifacts.projectRoot, artifacts.featureDir)
  lines.push(`Feature directory: ${relativeDir.length > 0 ? relativeDir : '.'}`)
  lines.push('Artifacts:')

  if (artifacts.artifacts.length === 0) {
    lines.push('- none found')
    return lines.join('\n')
  }

  for (const artifact of artifacts.artifacts) {
    const suffix = artifact.exists ? '' : ' (missing)'
    lines.push(`- ${artifact.relativePath}${suffix}`)
  }

  return lines.join('\n')
}
