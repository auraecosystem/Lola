/* eslint-disable import/no-extraneous-dependencies */

import retry from 'async-retry'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs' // Added readFileSync
import { basename, dirname, join, resolve } from 'node:path'
import { cyan, green, red } from 'picocolors'
import type { RepoInfo } from './helpers/examples'
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  existsInRepo,
  getRepoInfo,
  hasRepo,
} from './helpers/examples'
import type { PackageManager } from './helpers/get-pkg-manager'
import { tryGitInit } from './helpers/git'
import { install } from './helpers/install'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { isWriteable } from './helpers/is-writeable'

import type { TemplateMode, TemplateType } from './templates'
import { getTemplateFile, installTemplate } from './templates'

export class DownloadError extends Error {}

export async function createApp({
  appPath,
  packageManager,
  example,
  examplePath,
  typescript,
  tailwind,
  eslint,
  app,
  srcDir,
  importAlias,
  skipInstall,
  empty,
  turbopack,
  disableGit,
}: {
  appPath: string
  packageManager: PackageManager
  example?: string
  examplePath?: string
  typescript: boolean
  tailwind: boolean
  eslint: boolean
  app: boolean
  srcDir: boolean
  importAlias: string
  skipInstall: boolean
  empty: boolean
  turbopack: boolean
  disableGit?: boolean
}): Promise<void> {
  let repoInfo: RepoInfo | undefined
  const mode: TemplateMode = typescript ? 'ts' : 'js'
  const template: TemplateType = `${app ? 'app' : 'default'}${tailwind ? '-tw' : ''}${empty ? '-empty' : ''}`

  if (example) {
    let repoUrl: URL | undefined

    try {
      repoUrl = new URL(example)
    } catch (error: unknown) {
      const err = error as Error & { code: string | undefined }
      if (err.code !== 'ERR_INVALID_URL') {
        console.error(error)
        process.exit(1)
      }
    }

    if (repoUrl) {
      if (repoUrl.origin !== 'https://github.com') {
        console.error(
          `Invalid URL: ${red(
            `"${example}"`
          )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`
        )
        process.exit(1)
      }

      repoInfo = await getRepoInfo(repoUrl, examplePath)

      if (!repoInfo) {
        console.error(
          `Found invalid GitHub URL: ${red(
            `"${example}"`
          )}. Please fix the URL and try again.`
        )
        process.exit(1)
      }

      const found = await hasRepo(repoInfo)

      if (!found) {
        console.error(
          `Could not locate the repository for ${red(
            `"${example}"`
          )}. Please check that the repository exists and try again.`
        )
        process.exit(1)
      }
    } else if (example !== '__internal-testing-retry') {
      const found = await existsInRepo(example)

      if (!found) {
        console.error(
          `Could not locate an example named ${red(
            `"${example}"`
          )}. It could be due to the following:\n`,
          `1. Your spelling of example ${red(
            `"${example}"`
          )} might be incorrect.\n`,
          `2. You might not be connected to the internet or you are behind a proxy.`
        )
        process.exit(1)
      }
    }
  }

  const root = resolve(appPath)

  if (!(await isWriteable(dirname(root)))) {
    console.error(
      'The application path is not writable, please check folder permissions and try again.'
    )
    console.error(
      'It is likely you do not have write permissions for this folder.'
    )
    process.exit(1)
  }

  const appName = basename(root)

  mkdirSync(root, { recursive: true })
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const useYarn = packageManager === 'yarn'
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  console.log(`Creating a new Next.js app in ${green(root)}.`)
  console.log()

  process.chdir(root)

  const packageJsonPath = join(root, 'package.json')
  let hasPackageJson = false

  if (example) {
    /**
     * If an example repository is provided, clone it.
     */
    try {
      if (repoInfo) {
        const repoInfo2 = repoInfo
        console.log(
          `Downloading files from repo ${cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractRepo(root, repoInfo2), {
          retries: 3,
        })
      } else {
        console.log(
          `Downloading files for example ${cyan(
            example
          )}. This might take a moment.`
        )
        console.log()
        await retry(() => downloadAndExtractExample(root, example), {
          retries: 3,
        })
      }
    } catch (reason) {
      function isErrorLike(err: unknown): err is { message: string } {
        return (
          typeof err === 'object' &&
          err !== null &&
          typeof (err as { message?: unknown }).message === 'string'
        )
      }
      throw new DownloadError(
        isErrorLike(reason) ? reason.message : reason + ''
      )
    }
    // Copy `.gitignore` if the application did not provide one
    const ignorePath = join(root, '.gitignore')
    if (!existsSync(ignorePath)) {
      copyFileSync(
        getTemplateFile({ template, mode, file: 'gitignore' }),
        ignorePath
      )
    }

    // Copy `next-env.d.ts` to any example that is typescript
    const tsconfigPath = join(root, 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      copyFileSync(
        getTemplateFile({ template, mode: 'ts', file: 'next-env.d.ts' }),
        join(root, 'next-env.d.ts')
      )
    }

    hasPackageJson = existsSync(packageJsonPath)
  } else {
    /**
     * If an example repository is not provided for cloning, proceed
     * by installing from a template.
     */
    await installTemplate({
      appName,
      root,
      template,
      mode,
      packageManager,
      isOnline,
      tailwind,
      eslint,
      srcDir,
      importAlias,
      skipInstall: true, // Temporarily skip install to modify package.json first
      turbopack,
    })
    hasPackageJson = true
  }

  // ==========================================
  // CUSTOM MODIFICATION START
  // ==========================================
  try {
    const baseSourceDir = srcDir ? join(root, 'src') : root

    // 1. Create a modern architecture directory tree
    const directoriesToCreate = [
      join(baseSourceDir, 'components'),
      join(baseSourceDir, 'lib'),
      join(baseSourceDir, 'hooks'),
    ]

    for (const dir of directoriesToCreate) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }

    // 2. If Tailwind is enabled, drop a standard class-merging utility file (shadcn style)
    if (tailwind) {
      const ext = typescript ? 'ts' : 'js'
      const utilsPath = join(baseSourceDir, 'lib', `utils.${ext}`)
      
      const utilsContent = typescript 
        ? [
            "import { clsx, type ClassValue } from 'clsx'",
            "import { twMerge } from 'tailwind-merge'",
            "",
            "export function cn(...inputs: ClassValue[]) {",
            "  return twMerge(clsx(inputs))",
            "}",
          ].join('\n')
        : [
            "import { clsx } from 'clsx'",
            "import { twMerge } from 'tailwind-merge'",
            "",
            "export function cn(...inputs) {",
            "  return twMerge(clsx(inputs))",
            "}",
          ].join('\n')

      writeFileSync(utilsPath, utilsContent, 'utf-8')
      console.log(`Created Tailwind helper utility at ${cyan(join(srcDir ? 'src' : '', 'lib', `utils.${ext}`))}`)
    }

    // 3. Inject custom workspace scripts & packages directly into package.json
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      
      // Inject workflow optimization scripts
      pkg.scripts = {
        ...pkg.scripts,
        'lint:fix': 'next lint --fix',
        'format': 'prettier --write "**/*.{js,jsx,ts,tsx,json,css,md}"',
      }

      // Automatically add tailwind utilities to dependencies if tailwind is active
      if (tailwind) {
        pkg.dependencies = {
          ...pkg.dependencies,
          'clsx': '^2.1.1',
          'tailwind-merge': '^2.3.0',
        }
      }

      writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2), 'utf-8')
      console.log(`Injected custom lifecycle scripts into ${cyan('package.json')}.`)
    }

    // 4. Generate standard .env.local fallback
    const envPath = join(root, '.env.local')
    if (!existsSync(envPath)) {
      const envContent = [
        '# Next.js Local Environment Variables',
        'NEXT_PUBLIC_API_URL=http://localhost:3000/api',
        'DATABASE_URL=postgres://user:password@localhost:5432/db',
        '',
      ].join('\n')
      writeFileSync(envPath, envContent, 'utf-8')
    }

  } catch (customError) {
    console.warn('Warning: Failed to execute extended system bootstrapping.', customError)
  }
  // ==========================================
  // CUSTOM MODIFICATION END
  // ==========================================

  // Run the delayed installer with our custom updates fully injected
  if (!skipInstall && hasPackageJson) {
    console.log('Installing packages. This might take a couple of minutes.')
    console.log()

    await install(packageManager, isOnline)
    console.log()
  }

  if (disableGit) {
    console.log('Skipping git initialization.')
    console.log()
  } else if (tryGitInit(root)) {
    console.log('Initialized a git repository.')
    console.log()
  }

  let cdpath: string
  if (join(originalDirectory, appName) === appPath) {
    cdpath = appName
  } else {
    cdpath = appPath
  }

  console.log(`${green('Success!')} Created ${appName} at ${appPath}`)

