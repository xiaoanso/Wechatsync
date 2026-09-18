#!/usr/bin/env node
/**
 * 断言易安 fork 补丁入口仍在位，避免 merge 上游后静默丢失。
 * 用法: node scripts/check-fork-patches.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

const forkFile = 'packages/extension/src/fork/yian-cms.ts'
if (!existsSync(join(root, forkFile))) {
  errors.push(`missing ${forkFile}`)
}

const callSites = [
  'packages/extension/src/background/index.ts',
  'packages/extension/src/background/sync-service.ts',
]

for (const rel of callSites) {
  const path = join(root, rel)
  if (!existsSync(path)) {
    errors.push(`missing call site ${rel}`)
    continue
  }
  const src = readFileSync(path, 'utf8')
  if (!src.includes('fork/yian-cms')) {
    errors.push(`${rel}: missing import from '../fork/yian-cms'`)
  }
  if (!src.includes('publishArticleToCms')) {
    errors.push(`${rel}: missing publishArticleToCms usage`)
  }
}

if (errors.length) {
  console.error('check-fork-patches FAILED:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('check-fork-patches OK')
