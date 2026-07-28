import { createApp } from './create-app'

createApp({
  appPath: './my-test-app',
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
})
