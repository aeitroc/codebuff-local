#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from 'child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

type TargetInfo = {
  bunTarget: string
  platform: NodeJS.Platform
  arch: string
}

const VERBOSE = process.env.VERBOSE === 'true'
const OVERRIDE_TARGET = process.env.OVERRIDE_TARGET
const OVERRIDE_PLATFORM = process.env.OVERRIDE_PLATFORM as
  | NodeJS.Platform
  | undefined
const OVERRIDE_ARCH = process.env.OVERRIDE_ARCH ?? undefined

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)

function log(message: string) {
  if (VERBOSE) {
    console.log(message)
  }
}

function logAlways(message: string) {
  console.log(message)
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: VERBOSE ? 'inherit' : 'pipe',
    env: options.env,
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? ''
    throw new Error(
      `Command "${command} ${args.join(' ')}" failed with exit code ${
        result.status
      }${stderr ? `\n${stderr}` : ''}`,
    )
  }
}

function getTargetInfo(): TargetInfo {
  if (OVERRIDE_TARGET && OVERRIDE_PLATFORM && OVERRIDE_ARCH) {
    return {
      bunTarget: OVERRIDE_TARGET,
      platform: OVERRIDE_PLATFORM,
      arch: OVERRIDE_ARCH,
    }
  }

  const platform = process.platform
  const arch = process.arch

  const mappings: Record<string, TargetInfo> = {
    'linux-x64': { bunTarget: 'bun-linux-x64', platform: 'linux', arch: 'x64' },
    'linux-arm64': {
      bunTarget: 'bun-linux-arm64',
      platform: 'linux',
      arch: 'arm64',
    },
    'darwin-x64': {
      bunTarget: 'bun-darwin-x64',
      platform: 'darwin',
      arch: 'x64',
    },
    'darwin-arm64': {
      bunTarget: 'bun-darwin-arm64',
      platform: 'darwin',
      arch: 'arm64',
    },
    'win32-x64': {
      bunTarget: 'bun-windows-x64',
      platform: 'win32',
      arch: 'x64',
    },
  }

  const key = `${platform}-${arch}`
  const target = mappings[key]

  if (!target) {
    throw new Error(`Unsupported build target: ${key}`)
  }

  return target
}

function getRipgrepPlatformDir(targetInfo: TargetInfo): string {
  if (targetInfo.platform === 'win32' && targetInfo.arch === 'x64') {
    return 'x64-win32'
  }
  if (targetInfo.platform === 'darwin' && targetInfo.arch === 'arm64') {
    return 'arm64-darwin'
  }
  if (targetInfo.platform === 'darwin' && targetInfo.arch === 'x64') {
    return 'x64-darwin'
  }
  if (targetInfo.platform === 'linux' && targetInfo.arch === 'arm64') {
    return 'arm64-linux'
  }
  if (targetInfo.platform === 'linux' && targetInfo.arch === 'x64') {
    return 'x64-linux'
  }
  throw new Error(`Unsupported ripgrep platform: ${targetInfo.platform}-${targetInfo.arch}`)
}

function copyRipgrepBinary(targetInfo: TargetInfo, binDir: string): void {
  const platformDir = getRipgrepPlatformDir(targetInfo)
  const rgFileName = targetInfo.platform === 'win32' ? 'rg.exe' : 'rg'
  const rgSource = join(
    repoRoot,
    'sdk',
    'dist',
    'vendor',
    'ripgrep',
    platformDir,
    rgFileName,
  )

  if (!existsSync(rgSource)) {
    logAlways(`Ripgrep binary not found at ${rgSource}; skipping copy`)
    return
  }

  const rgDest = join(binDir, rgFileName)
  copyFileSync(rgSource, rgDest)

  if (targetInfo.platform !== 'win32') {
    chmodSync(rgDest, 0o755)
  }

  logAlways(`Copied ripgrep binary to ${rgDest}`)
}

async function main() {
  const [, , binaryNameArg, version] = process.argv
  const binaryName = binaryNameArg ?? 'codecane'

  if (!version) {
    throw new Error('Version argument is required when building a binary')
  }

  log(`Building ${binaryName} @ ${version}`)

  const targetInfo = getTargetInfo()
  const binDir = join(cliRoot, 'bin')

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Generate bundled agents file before compiling
  log('Generating bundled agents...')
  runCommand('bun', ['run', 'scripts/prebuild-agents.ts'], { cwd: cliRoot, env: process.env })

  // Ensure SDK assets exist before compiling the CLI
  log('Building SDK dependencies...')
  runCommand('bun', ['run', 'build:sdk'], { cwd: cliRoot, env: process.env })

  patchOpenTuiAssetPaths()
  patchOpenTuiReactJsxDevRuntime()
  await ensureOpenTuiNativeBundle(targetInfo)

  const outputFilename =
    targetInfo.platform === 'win32' ? `${binaryName}.exe` : binaryName
  const outputFile = join(binDir, outputFilename)

  // Collect all NEXT_PUBLIC_* environment variables
  const nextPublicEnvVars = Object.entries(process.env)
    .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
    .map(([key, value]) => [`process.env.${key}`, `"${value ?? ''}"`])

  const defineFlags = [
    ['process.env.NODE_ENV', '"production"'],
    ['process.env.CODEBUFF_IS_BINARY', '"true"'],
    ['process.env.CODEBUFF_CLI_VERSION', `"${version}"`],
    [
      'process.env.CODEBUFF_CLI_TARGET',
      `"${targetInfo.platform}-${targetInfo.arch}"`,
    ],
    ...nextPublicEnvVars,
  ]

  // Bun's bundler currently emits `jsxDEV(...)` calls for TSX/JSX.
  // React 19 intentionally makes `react/jsx-dev-runtime` export `jsxDEV` as
  // undefined when NODE_ENV=production, so a production binary would crash.
  //
  // To build a stable production binary:
  // 1) transpile TS/TSX with TypeScript (tsx -> `jsx/jsxs` calls)
  // 2) bundle/compile the emitted JS with Bun
  const emitRoot = mkdtempSync(join(cliRoot, '.tmp-codebuff-cli-tsc-'))
  const tscOutDir = join(emitRoot, 'dist')
  const tscProject = join(cliRoot, 'tsconfig.emit.json')

  try {
    runCommand(
      'bunx',
      ['tsc', '-p', tscProject, '--outDir', tscOutDir, '--rootDir', repoRoot],
      { cwd: cliRoot, env: process.env },
    )

    const entryPoint = join(tscOutDir, 'cli', 'src', 'index.js')
    if (!existsSync(entryPoint)) {
      throw new Error(
        `TypeScript emit failed: expected entry point at ${entryPoint}`,
      )
    }

    const buildArgs = [
      'build',
      entryPoint,
      '--compile',
      `--target=${targetInfo.bunTarget}`,
      `--outfile=${outputFile}`,
      '--sourcemap=none',
      ...defineFlags.flatMap(([key, value]) => ['--define', `${key}=${value}`]),
    ]

    log(
      `bun ${buildArgs
        .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
        .join(' ')}`,
    )

    runCommand('bun', buildArgs, { cwd: cliRoot, env: process.env })
  } finally {
    try {
      rmSync(emitRoot, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
  }

  if (targetInfo.platform !== 'win32') {
    chmodSync(outputFile, 0o755)
  }

  copyRipgrepBinary(targetInfo, binDir)

  const binary = readFileSync(outputFile)
  if (
    binary.includes(Buffer.from('import_jsx_dev_runtime')) ||
    binary.includes(Buffer.from('jsxDEV('))
  ) {
    throw new Error(
      'Built binary still contains jsxDEV call sites. This typically indicates that JSX was compiled in dev mode and will crash under React 19 when NODE_ENV=production.',
    )
  }

  logAlways(
    `Built ${outputFilename} (${targetInfo.platform}-${targetInfo.arch})`,
  )
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
})

function patchOpenTuiAssetPaths() {
  const coreDir = join(cliRoot, 'node_modules', '@opentui', 'core')
  if (!existsSync(coreDir)) {
    log('OpenTUI core package not found; skipping asset patch')
    return
  }

  const indexFile = readdirSync(coreDir).find(
    (file) => file.startsWith('index') && file.endsWith('.js'),
  )

  if (!indexFile) {
    log('OpenTUI core index bundle not found; skipping asset patch')
    return
  }

  const indexPath = join(coreDir, indexFile)
  const content = readFileSync(indexPath, 'utf8')

  const absolutePathPattern =
    /var __dirname = ".*?packages\/core\/src\/lib\/tree-sitter\/assets";/
  if (!absolutePathPattern.test(content)) {
    log('OpenTUI core bundle already has relative asset paths')
    return
  }

  const replacement =
    'var __dirname = path3.join(path3.dirname(fileURLToPath(new URL(".", import.meta.url))), "lib/tree-sitter/assets");'

  const patched = content.replace(absolutePathPattern, replacement)
  writeFileSync(indexPath, patched)
  logAlways('Patched OpenTUI core tree-sitter asset paths')
}

function patchOpenTuiReactJsxDevRuntime() {
  const reactTargets = [
    {
      label: 'workspace root',
      packageDir: join(repoRoot, 'node_modules', '@opentui', 'react'),
    },
    {
      label: 'CLI workspace',
      packageDir: join(cliRoot, 'node_modules', '@opentui', 'react'),
    },
  ]

  const filesToPatch = [
    { relPath: 'index.js', description: 'main bundle' },
    { relPath: join('src', 'reconciler', 'renderer.js'), description: 'renderer bundle' },
  ]

  for (const target of reactTargets) {
    for (const file of filesToPatch) {
      const filePath = join(target.packageDir, file.relPath)
      if (!existsSync(filePath)) continue

      const content = readFileSync(filePath, 'utf8')
      if (!content.includes('react/jsx-dev-runtime') && !content.includes('jsxDEV')) {
        continue
      }

      const devRuntimeImportPattern =
        /^import\s+\{([^}]*)\}\s+from\s+["']react\/jsx-dev-runtime["'];\s*$/gm

      const patched = content
        .replace(
          devRuntimeImportPattern,
          (match: string, specifierBlock: string) => {
            if (!/\bjsxDEV\b/.test(specifierBlock)) {
              return match
            }

            const fragmentAliasMatch = specifierBlock.match(
              /\bFragment\s+as\s+([A-Za-z_$][\w$]*)\b/,
            )
            const fragmentSpecifier = fragmentAliasMatch
              ? `Fragment as ${fragmentAliasMatch[1]}`
              : /\bFragment\b/.test(specifierBlock)
                ? 'Fragment'
                : null

            const jsxDevAliasMatch = specifierBlock.match(
              /\bjsxDEV\s+as\s+([A-Za-z_$][\w$]*)\b/,
            )
            const jsxSpecifier = jsxDevAliasMatch
              ? `jsx as ${jsxDevAliasMatch[1]}`
              : 'jsx'

            const runtimeSpecifiers = [fragmentSpecifier, jsxSpecifier].filter(
              (value): value is string => Boolean(value),
            )
            return `import { ${runtimeSpecifiers.join(', ')} } from "react/jsx-runtime";`
          },
        )
        .replace(/\bjsxDEV\(/g, 'jsx(')
        .replace(
          /,\s*(?:true|false),\s*(?:undefined|void 0|null),\s*(?:this|undefined|void 0|null)\)/g,
          ')',
        )

      if (patched === content) continue

      writeFileSync(filePath, patched)
      logAlways(
        `Patched OpenTUI react ${file.description} (${target.label}) to avoid jsxDEV in production builds`,
      )
    }
  }
}

async function ensureOpenTuiNativeBundle(targetInfo: TargetInfo) {
  const packageName = `@opentui/core-${targetInfo.platform}-${targetInfo.arch}`
  const packageFolder = `core-${targetInfo.platform}-${targetInfo.arch}`
  const installTargets = [
    {
      label: 'workspace root',
      packagesDir: join(repoRoot, 'node_modules', '@opentui'),
      packageDir: join(repoRoot, 'node_modules', '@opentui', packageFolder),
    },
    {
      label: 'CLI workspace',
      packagesDir: join(cliRoot, 'node_modules', '@opentui'),
      packageDir: join(cliRoot, 'node_modules', '@opentui', packageFolder),
    },
  ]

  const missingTargets = installTargets.filter(
    ({ packageDir }) => !existsSync(packageDir),
  )
  if (missingTargets.length === 0) {
    log(
      `OpenTUI native bundle already present for ${targetInfo.platform}-${targetInfo.arch}`,
    )
    return
  }

  const corePackagePath =
    installTargets
      .map(({ packagesDir }) => join(packagesDir, 'core', 'package.json'))
      .find((candidate) => existsSync(candidate)) ?? null

  if (!corePackagePath) {
    log('OpenTUI core package metadata missing; skipping native bundle fetch')
    return
  }
  const corePackageJson = JSON.parse(readFileSync(corePackagePath, 'utf8')) as {
    optionalDependencies?: Record<string, string>
  }
  const version = corePackageJson.optionalDependencies?.[packageName]
  if (!version) {
    log(
      `No optional dependency declared for ${packageName}; skipping native bundle fetch`,
    )
    return
  }

  const registryBase =
    process.env.CODEBUFF_NPM_REGISTRY ??
    process.env.NPM_REGISTRY_URL ??
    'https://registry.npmjs.org'
  const metadataUrl = `${registryBase.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`
  log(`Fetching OpenTUI native bundle metadata from ${metadataUrl}`)

  const metadataResponse = await fetch(metadataUrl)
  if (!metadataResponse.ok) {
    throw new Error(
      `Failed to fetch metadata for ${packageName}: ${metadataResponse.status} ${metadataResponse.statusText}`,
    )
  }

  const metadata = (await metadataResponse.json()) as {
    versions?: Record<
      string,
      {
        dist?: {
          tarball?: string
        }
      }
    >
  }
  const tarballUrl = metadata.versions?.[version]?.dist?.tarball
  if (!tarballUrl) {
    throw new Error(`Tarball URL missing for ${packageName}@${version}`)
  }

  log(`Downloading OpenTUI native bundle from ${tarballUrl}`)
  const tarballResponse = await fetch(tarballUrl)
  if (!tarballResponse.ok) {
    throw new Error(
      `Failed to download ${packageName}@${version}: ${tarballResponse.status} ${tarballResponse.statusText}`,
    )
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'opentui-'))
  try {
    const tarballPath = join(
      tempDir,
      `${packageName.split('/').pop() ?? 'package'}-${version}.tgz`,
    )
    await Bun.write(tarballPath, await tarballResponse.arrayBuffer())

    for (const target of missingTargets) {
      mkdirSync(target.packagesDir, { recursive: true })
      mkdirSync(target.packageDir, { recursive: true })

      if (!existsSync(target.packageDir)) {
        throw new Error(
          `Failed to create directory for ${packageName}: ${target.packageDir}`,
        )
      }

      const tarballForTar =
        process.platform === 'win32'
          ? tarballPath.replace(/\\/g, '/')
          : tarballPath
      const extractDirForTar =
        process.platform === 'win32'
          ? target.packageDir.replace(/\\/g, '/')
          : target.packageDir

      const tarArgs = [
        '-xzf',
        tarballForTar,
        '--strip-components=1',
        '-C',
        extractDirForTar,
      ]
      if (process.platform === 'win32') {
        tarArgs.unshift('--force-local')
      }

      runCommand('tar', tarArgs)
      log(
        `Installed OpenTUI native bundle for ${targetInfo.platform}-${targetInfo.arch} in ${target.label}`,
      )
    }
    logAlways(
      `Fetched OpenTUI native bundle for ${targetInfo.platform}-${targetInfo.arch}`,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
