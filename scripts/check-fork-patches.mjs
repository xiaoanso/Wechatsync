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

const forkFiles = [
  'packages/extension/src/fork/yian-cms.ts',
  'packages/extension/src/fork/lazy-platform-auth.ts',
  'packages/extension/src/fork/LazyPlatformList.tsx',
  'packages/extension/src/fork/extract-hardening.ts',
  'packages/extension/src/fork/draggable-fab.ts',
  'packages/extension/src/fork/quick-sync-dialog.ts',
]

for (const forkFile of forkFiles) {
  if (!existsSync(join(root, forkFile))) {
    errors.push(`missing ${forkFile}`)
  }
}

const cmsCallSites = [
  'packages/extension/src/background/index.ts',
  'packages/extension/src/background/sync-service.ts',
]

for (const rel of cmsCallSites) {
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

const bg = join(root, 'packages/extension/src/background/index.ts')
if (existsSync(bg)) {
  const src = readFileSync(bg, 'utf8')
  if (!src.includes('fork/lazy-platform-auth')) {
    errors.push('background/index.ts: missing import from fork/lazy-platform-auth')
  }
  if (!src.includes('resolveCheckAllAuth')) {
    errors.push('background/index.ts: missing resolveCheckAllAuth usage')
  }
}

const syncDialog = join(root, 'packages/extension/src/components/sync-dialog/SyncDialog.tsx')
if (existsSync(syncDialog)) {
  const src = readFileSync(syncDialog, 'utf8')
  if (!src.includes('fork/LazyPlatformList')) {
    errors.push('SyncDialog.tsx: missing import from fork/LazyPlatformList')
  }
}

const extractHardeningSites = [
  'packages/extension/src/background/index.ts',
  'packages/extension/src/popup/stores/sync.ts',
  'packages/extension/src/content/extractor.ts',
  'packages/extension/src/lib/reader/index.ts',
]
for (const rel of extractHardeningSites) {
  const path = join(root, rel)
  if (!existsSync(path)) {
    errors.push(`missing call site ${rel}`)
    continue
  }
  const src = readFileSync(path, 'utf8')
  if (!src.includes('fork/extract-hardening')) {
    errors.push(`${rel}: missing import from fork/extract-hardening`)
  }
}

const fabSites = [
  'packages/extension/src/content/extractor.ts',
  'packages/extension/src/content/weixin.ts',
]
for (const rel of fabSites) {
  const path = join(root, rel)
  if (!existsSync(path)) {
    errors.push(`missing call site ${rel}`)
    continue
  }
  const src = readFileSync(path, 'utf8')
  if (!src.includes('fork/draggable-fab')) {
    errors.push(`${rel}: missing import from fork/draggable-fab`)
  }
}

const extractorPath = join(root, 'packages/extension/src/content/extractor.ts')
if (existsSync(extractorPath)) {
  const src = readFileSync(extractorPath, 'utf8')
  if (!src.includes('fork/quick-sync-dialog')) {
    errors.push('extractor.ts: missing import from fork/quick-sync-dialog')
  }
}

if (errors.length) {
  console.error('check-fork-patches FAILED:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('check-fork-patches OK')
