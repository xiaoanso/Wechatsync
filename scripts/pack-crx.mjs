#!/usr/bin/env node
/**
 * 用本机 Google Chrome 将 packages/extension/dist 打包为 CRX3。
 * 私钥固定为 packages/extension/wechatsync.pem（已 gitignore），以保证扩展 ID 稳定。
 */
import { existsSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extDir = join(root, 'packages/extension')
const distDir = join(extDir, 'dist')
const keyPath = join(extDir, 'wechatsync.pem')
const version = createRequire(import.meta.url)(join(extDir, 'package.json')).version
const crxOut = join(extDir, `wechatsync-v${version}.crx`)

const chromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome',
  'chromium',
  'chrome',
]

function findChrome() {
  for (const bin of chromeCandidates) {
    if (bin.includes('/') && existsSync(bin)) return bin
    const which = spawnSync('which', [bin], { encoding: 'utf8' })
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim()
  }
  return null
}

if (!existsSync(join(distDir, 'manifest.json'))) {
  console.error('dist/manifest.json missing — run build first')
  process.exit(1)
}

const chrome = findChrome()
if (!chrome) {
  console.error('Google Chrome / Chromium not found')
  process.exit(1)
}

const args = [`--pack-extension=${distDir}`]
if (existsSync(keyPath)) {
  args.push(`--pack-extension-key=${keyPath}`)
}

const result = spawnSync(chrome, args, { encoding: 'utf8' })
if (result.status !== 0 && result.stderr) {
  // Chrome often prints crashpad noise; only fail if no crx produced
}

const packedCrx = join(extDir, 'dist.crx')
const packedPem = join(extDir, 'dist.pem')

if (!existsSync(packedCrx)) {
  console.error('Chrome pack failed — dist.crx not created')
  if (result.stderr) console.error(result.stderr)
  process.exit(1)
}

if (existsSync(crxOut)) unlinkSync(crxOut)
renameSync(packedCrx, crxOut)

if (existsSync(packedPem)) {
  if (!existsSync(keyPath)) {
    renameSync(packedPem, keyPath)
  } else {
    unlinkSync(packedPem)
  }
}

console.log(`CRX: ${crxOut}`)
console.log(`PEM: ${keyPath}${existsSync(keyPath) ? '' : ' (missing)'}`)
