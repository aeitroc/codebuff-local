import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildSpeckitSummary } from '../speckit/speckit-summary'

import type { SpeckitArtifactsSummary } from '../speckit/speckit-artifacts'

describe('buildSpeckitSummary', () => {
  it('includes status and artifact paths', () => {
    const summary: SpeckitArtifactsSummary = {
      projectRoot: '/repo',
      featureDir: '/repo/specs/001-test',
      artifacts: [
        {
          label: 'spec.md',
          relativePath: 'specs/001-test/spec.md',
          absolutePath: '/repo/specs/001-test/spec.md',
          exists: true,
        },
        {
          label: 'plan.md',
          relativePath: 'specs/001-test/plan.md',
          absolutePath: '/repo/specs/001-test/plan.md',
          exists: false,
        },
      ],
    }

    const output = buildSpeckitSummary({
      status: 'success',
      artifacts: summary,
    })

    assert.ok(output.includes('Speckit status: success'))
    assert.ok(output.includes('specs/001-test/spec.md'))
    assert.ok(output.includes('specs/001-test/plan.md (missing)'))
  })

  it('handles missing feature directory', () => {
    const summary: SpeckitArtifactsSummary = {
      projectRoot: '/repo',
      featureDir: null,
      artifacts: [],
    }

    const output = buildSpeckitSummary({
      status: 'failed',
      artifacts: summary,
    })

    assert.ok(output.includes('Speckit status: failed'))
    assert.ok(output.includes('Artifacts: none found'))
  })
})
