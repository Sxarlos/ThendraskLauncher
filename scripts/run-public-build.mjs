import { spawnSync } from 'node:child_process'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = process.argv.slice(2)
const result = spawnSync(command, args, {
  env: {
    ...process.env,
    CURSEFORGE_ENABLED: 'false',
    RESTRICTED_CATALOGS_ENABLED: 'false'
  },
  shell: process.platform === 'win32',
  stdio: 'inherit'
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
