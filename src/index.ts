// src/index.ts
import { createApp } from './create-app'

async function run() {
  const targetFolder = process.argv[2] || './my-next-app'
  
  console.log('Launching custom app generation engine...')
  
  await createApp({
    appPath: targetFolder,
    packageManager: 'npm',
    typescript: true,
    tailwind: true,
    eslint: true,
    app: true,
    srcDir: true,
    importAlias: '@/*',
    skipInstall: false,
    empty: false,
    turbopack: false,
    disableGit: false
  })
}

run().catch((err) => {
  console.error('Fatal CLI execution breakdown:', err)
  process.exit(1)
})
