import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  findLatestSpeckitFeatureDir,
  getSpeckitArtifactsSummary,
} from '../speckit/speckit-artifacts'

let tempRoot: string | null = null

const createTempRoot = () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    tempRoot = null
  }
})

describe('speckit-artifacts', () => {
  it('findLatestSpeckitFeatureDir picks the most recent spec', () => {
    const root = createTempRoot()
    const specsDir = path.join(root, 'specs')
    fs.mkdirSync(specsDir, { recursive: true })

    const olderDir = path.join(specsDir, '001-old')
    const newerDir = path.join(specsDir, '002-new')
    fs.mkdirSync(olderDir, { recursive: true })
    fs.mkdirSync(newerDir, { recursive: true })

    const olderSpec = path.join(olderDir, 'spec.md')
    const newerSpec = path.join(newerDir, 'spec.md')
    fs.writeFileSync(olderSpec, 'old')
    fs.writeFileSync(newerSpec, 'new')

    const oldTime = new Date('2020-01-01T00:00:00Z')
    const newTime = new Date('2025-01-01T00:00:00Z')
    fs.utimesSync(olderSpec, oldTime, oldTime)
    fs.utimesSync(newerSpec, newTime, newTime)

    const latest = findLatestSpeckitFeatureDir(root)
    assert.equal(latest, newerDir)
  })

  it('getSpeckitArtifactsSummary reports relative paths', () => {
    const root = createTempRoot()
    const featureDir = path.join(root, 'specs', '003-test')
    fs.mkdirSync(featureDir, { recursive: true })
    fs.writeFileSync(path.join(featureDir, 'spec.md'), 'spec')
    fs.writeFileSync(path.join(featureDir, 'plan.md'), 'plan')

    const summary = getSpeckitArtifactsSummary(root)
    assert.equal(summary.featureDir, featureDir)
    assert.ok(
      summary.artifacts.some((item) => item.relativePath.endsWith('spec.md')),
    )
    assert.ok(
      summary.artifacts.some((item) => item.relativePath.endsWith('plan.md')),
    )
  })
})
