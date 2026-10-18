import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('src/runtime/public/manifest.json', root), 'utf8'))
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync(new URL('playground/.output/public/build-info.json', root), JSON.stringify({
  commit,
  scannerAssets: manifest.version,
  generatedAt: new Date().toISOString(),
}, null, 2) + '\n')
