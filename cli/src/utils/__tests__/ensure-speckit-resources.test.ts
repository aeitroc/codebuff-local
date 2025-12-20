import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  ensureSpeckitResources,
} from '../speckit/ensure-speckit-resources'
import { SPECKIT_COMMAND_FILES } from '../speckit/constants'

let tempRoot: string | null = null

const createTempRoot = () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-sync-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    tempRoot = null
  }
})

describe('ensureSpeckitResources', () => {
  it('copies missing command files and .specify directory from commands root', () => {
    const root = createTempRoot()
    const sourceCommands = path.join(root, 'commands')
    const sourceSpecify = path.join(root, 'commands', '.specify', 'templates')
    fs.mkdirSync(sourceCommands, { recursive: true })
    fs.mkdirSync(sourceSpecify, { recursive: true })

    for (const filename of SPECKIT_COMMAND_FILES) {
      fs.writeFileSync(path.join(sourceCommands, filename), `content-${filename}`)
    }

    fs.writeFileSync(
      path.join(sourceSpecify, 'spec-template.md'),
      '# template',
    )

    const result = ensureSpeckitResources(root)
    assert.equal(result.ok, true)
    assert.ok(
      result.updated.some((item) =>
        item.endsWith('commands/2-speckit.specify.md'),
      ),
    )
    assert.ok(
      result.updated.some((item) =>
        item.endsWith('.specify/templates/spec-template.md'),
      ),
    )
  })

  it('falls back to legacy commands/commands sources', () => {
    const root = createTempRoot()
    const sourceCommands = path.join(root, 'commands', 'commands')
    fs.mkdirSync(sourceCommands, { recursive: true })

    for (const filename of SPECKIT_COMMAND_FILES) {
      fs.writeFileSync(path.join(sourceCommands, filename), `content-${filename}`)
    }

    const result = ensureSpeckitResources(root)
    assert.equal(result.ok, true)
    assert.ok(
      result.updated.some((item) =>
        item.endsWith('commands/2-speckit.specify.md'),
      ),
    )
  })

  it('skips copying when targets are newer', () => {
    const root = createTempRoot()
    const sourceCommands = path.join(root, 'commands', 'commands')
    const sourceSpecify = path.join(root, 'commands', '.specify', 'templates')
    fs.mkdirSync(sourceCommands, { recursive: true })
    fs.mkdirSync(sourceSpecify, { recursive: true })

    for (const commandFile of SPECKIT_COMMAND_FILES) {
      fs.writeFileSync(path.join(sourceCommands, commandFile), `content-${commandFile}`)
    }

    fs.writeFileSync(
      path.join(sourceSpecify, 'spec-template.md'),
      '# template',
    )

    const filename = SPECKIT_COMMAND_FILES[0]
    const sourceFile = path.join(sourceCommands, filename)
    fs.writeFileSync(sourceFile, 'old')

    const targetFile = path.join(root, 'commands', filename)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.writeFileSync(targetFile, 'newer')

    const olderTime = new Date('2000-01-01T00:00:00Z')
    const newerTime = new Date('2030-01-01T00:00:00Z')
    fs.utimesSync(sourceFile, olderTime, olderTime)
    fs.utimesSync(targetFile, newerTime, newerTime)

    const result = ensureSpeckitResources(root)
    assert.equal(result.ok, true)
    assert.equal(result.updated.includes(path.join('commands', filename)), false)
    assert.equal(result.skipped.includes(path.join('commands', filename)), true)
  })
})
