/**
 * FORK PATCH (yian / Wechatsync fork) — 平台登录懒检查。
 * 勿随上游整文件覆盖删除本文件；升级后确认 background / SyncDialog 仍从此处接线。
 *
 * 职责：
 * 1. 打开弹窗时只返回平台元信息，不跑批量 checkAuth（避免读 cookie / 会话请求）
 * 2. 勾选平台时再单平台校验（见 LazyPlatformList）
 * 3. getAccounts 等仍需全量登录态时走 listPlatformsWithAuth
 */

import {
  initAdapters,
  getAllPlatformMetas,
  checkAllPlatformsAuth,
  checkPlatformAuth,
} from '../adapters'

export type AuthStatus = 'unknown' | 'checking' | 'authenticated' | 'unauthenticated'

export type LazyPlatformInfo = {
  id: string
  name: string
  icon: string
  homepage?: string
  isAuthenticated: boolean
  username?: string
  authStatus: AuthStatus
  sourceType: 'dsl' | 'cms'
  cmsType?: string
  error?: string
}

function getCmsIcon(type: string): string {
  switch (type) {
    case 'wordpress':
      return 'https://s.w.org/style/images/about/WordPress-logotype-simplified.png'
    case 'typecho':
      return chrome.runtime.getURL('assets/typecho.ico')
    case 'metaweblog':
      return 'https://www.cnblogs.com/favicon.ico'
    default:
      return chrome.runtime.getURL('assets/icon-48.png')
  }
}

async function loadCmsPlatforms(): Promise<LazyPlatformInfo[]> {
  const cmsStorage = await chrome.storage.local.get('cmsAccounts')
  const cmsAccounts = cmsStorage.cmsAccounts || []
  return cmsAccounts
    .filter((a: { isConnected?: boolean }) => a.isConnected)
    .map((a: { id: string; name: string; url?: string; username?: string; type: string }) => ({
      id: a.id,
      name: a.name,
      icon: getCmsIcon(a.type),
      homepage: a.url,
      isAuthenticated: true,
      username: a.username,
      authStatus: 'authenticated' as const,
      sourceType: 'cms' as const,
      cmsType: a.type,
    }))
}

/**
 * 返回全部平台，不调用 checkAuth。DSL 为 unknown，已连接 CMS 为 authenticated。
 */
export async function listPlatformsWithoutAuth(): Promise<LazyPlatformInfo[]> {
  await initAdapters()
  const metas = getAllPlatformMetas()
  const dslPlatforms: LazyPlatformInfo[] = metas.map(meta => ({
    ...meta,
    isAuthenticated: false,
    authStatus: 'unknown' as const,
    sourceType: 'dsl' as const,
  }))
  const cmsPlatforms = await loadCmsPlatforms()
  return [...dslPlatforms, ...cmsPlatforms]
}

/**
 * 官方行为：批量 checkAuth + CMS（供 getAccounts / forceAuth）。
 */
export async function listPlatformsWithAuth(forceRefresh = false): Promise<LazyPlatformInfo[]> {
  const dslPlatforms = await checkAllPlatformsAuth(forceRefresh)
  const dslWithType: LazyPlatformInfo[] = dslPlatforms.map(p => ({
    ...p,
    authStatus: (p.isAuthenticated ? 'authenticated' : 'unauthenticated') as AuthStatus,
    sourceType: 'dsl' as const,
  }))
  const cmsPlatforms = await loadCmsPlatforms()
  return [...dslWithType, ...cmsPlatforms]
}

/**
 * 单平台校验（勾选时调用）。
 */
export async function verifyPlatformAuth(platformId: string) {
  return checkPlatformAuth(platformId)
}

/**
 * CHECK_ALL_AUTH 统一入口。
 * - 默认：不验登录
 * - forceAuth: true：全量验登录（页面 API getAccounts）
 */
export async function resolveCheckAllAuth(payload?: {
  forceRefresh?: boolean
  forceAuth?: boolean
}): Promise<{ platforms: LazyPlatformInfo[] }> {
  const forceAuth = payload?.forceAuth === true
  const forceRefresh = payload?.forceRefresh ?? false
  const platforms = forceAuth
    ? await listPlatformsWithAuth(forceRefresh)
    : await listPlatformsWithoutAuth()

  chrome.storage.local.set({ platformListCache: platforms }).catch(() => {})
  return { platforms }
}
