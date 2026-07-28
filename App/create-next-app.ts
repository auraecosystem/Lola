/* eslint-disable import/no-extraneous-dependencies */

import retry from 'async-retry'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs' // Added readFileSync & writeFileSync
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
      skipInstall,
      turbopack,
    })
    hasPackageJson = true
  }

  // ==========================================
  // ADVANCED CUSTOMIZATION START
  // ==========================================
  try {
    // 1. Structural Folder Generation
    // Dynamically choose base folder based on whether the user selected the `src/` directory flag
    const baseDir = srcDir ? join(root, 'src') : root
    const foldersToCreate = ['components', 'lib', 'hooks', 'types']

    console.log(`Generating base folder architecture inside ${cyan(srcDir ? 'src/' : 'root')}...`)
    
    for (const folder of foldersToCreate) {
      const targetFolder = join(baseDir, folder)
      mkdirSync(targetFolder, { recursive: true })
      
      // Seed a placeholder file into each directory to maintain structural integrity in Git
      const fileExtension = typescript ? 'ts' : 'js'
      const placeholderPath = join(targetFolder, `.gitkeep`)
      if (!existsSync(placeholderPath)) {
        writeFileSync(placeholderPath, '', 'utf-8')
      }
    }

    // 2. Custom package.json Script Modifications
    if (hasPackageJson && existsSync(packageJsonPath)) {
      console.log(`Injecting custom workflow scripts into ${cyan('package.json')}...`)
      
      const packageJsonRaw = readFileSync(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonRaw)
      
      // Ensure scripts block exists
      packageJson.scripts = packageJson.scripts || {}

      // Add shorthand quality-of-life and maintenance commands
      packageJson.scripts['format'] = 'prettier --write "**/*.{js,jsx,ts,tsx,json,md,css}"'
      packageJson.scripts['clean'] = 'rm -rf .next node_modules out'
      
      if (eslint) {
        packageJson.scripts['lint:fix'] = 'next lint --fix'
      }
      
      // Overwrite the original package.json file with structured formats
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')
    }
  } catch (customError) {
    console.warn('Warning: Advanced project customizations skipped due to an internal error:', customError)
  }
  // ==========================================
  // ADVANCED CUSTOMIZATION END
  // ==========================================

  // Perform dependency installations after our changes are cleanly injected
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

  if (hasPackageJson) {
    console.log('Inside that directory, you can run several commands:')
    console.log()
    console.log(cyan(`  ${packageManager} ${useYarn ? '' : 'run '}dev`))
    console.log('    Starts the development server.')
    console.log()
    console.log(cyan(`  ${packageManager} ${useYarn ? '' : 'run '}build`))
    console.log('    Builds the app for production.')
    console.log()
    console.log(cyan(`  ${packageManager} start`))
    console.log('    Runs the built app in production mode.')
    console.log()
    
    // Announce the newly injected commands in the final terminal interface log
    console.log(cyan(`  ${packageManager} run format`))
    console.log('    Formats your entire codebase using Prettier.')
    console.log()

    console.log('We suggest that you begin by typing:')
    console.log()
    console.log(cyan('  cd'), cdpath)
