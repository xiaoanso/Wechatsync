/**
 * FORK PATCH (yian / Wechatsync fork) — 勾选时懒检查登录的平台列表。
 * 替代官方 components/sync-dialog/PlatformList；升级后确认 SyncDialog 仍 import 本文件。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, Loader2, ExternalLink, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Platform, SyncResult, PlatformProgress, DialogStatus } from '@/components/sync-dialog/types'
import type { AuthStatus } from './lazy-platform-auth'

interface PlatformListProps {
  platforms: Platform[]
  selected: Set<string>
  status: DialogStatus
  results: SyncResult[]
  platformProgress: Map<string, PlatformProgress>
  selectedPlatforms: string[]
  onToggle: (id: string) => void
  onSelectAll: () => void
}

type AuthMap = Record<string, { status: AuthStatus; username?: string }>

function initialAuthStatus(platform: Platform): AuthStatus {
  const fromMeta = (platform as Platform & { authStatus?: AuthStatus }).authStatus
  if (fromMeta) return fromMeta
  if (platform.isAuthenticated) return 'authenticated'
  return 'unknown'
}

/** Drop-in 替换官方 PlatformList */
export function PlatformList({
  platforms,
  selected,
  status,
  results,
  platformProgress,
  selectedPlatforms,
  onToggle,
}: PlatformListProps) {
  const isIdle = status === 'idle' || status === 'loading'
  const isSyncing = status === 'syncing'
  const isCompleted = status === 'completed'

  const [authMap, setAuthMap] = useState<AuthMap>({})

  // Sync auth map when platform list identity changes; keep verified overrides
  useEffect(() => {
    setAuthMap(prev => {
      const next: AuthMap = {}
      for (const p of platforms) {
        const existing = prev[p.id]
        if (existing && (existing.status === 'authenticated' || existing.status === 'unauthenticated' || existing.status === 'checking')) {
          next[p.id] = existing
        } else {
          next[p.id] = {
            status: initialAuthStatus(p),
            username: p.username,
          }
        }
      }
      return next
    })
  }, [platforms])

  const resolveStatus = useCallback((id: string): AuthStatus => {
    return authMap[id]?.status ?? 'unknown'
  }, [authMap])

  const resolveUsername = useCallback((id: string, fallback?: string) => {
    return authMap[id]?.username ?? fallback
  }, [authMap])

  const authenticatedIds = useMemo(
    () => platforms.filter(p => resolveStatus(p.id) === 'authenticated').map(p => p.id),
    [platforms, resolveStatus],
  )
  const authenticatedCount = authenticatedIds.length
  const selectedCount = selected.size
  const successCount = results.filter(r => r.success).length
  const failedCount = results.filter(r => !r.success).length
  const allUnauthenticated =
    platforms.length > 0 &&
    platforms.every(p => resolveStatus(p.id) === 'unauthenticated')

  const visiblePlatforms = isIdle
    ? [
        ...platforms.filter(p => resolveStatus(p.id) === 'authenticated'),
        ...platforms.filter(p => resolveStatus(p.id) !== 'authenticated'),
      ]
    : selectedPlatforms
        .map(id => platforms.find(p => p.id === id))
        .filter(Boolean) as Platform[]

  const handleSelectAllClick = () => {
    const allSelected =
      authenticatedCount > 0 &&
      authenticatedIds.every(id => selected.has(id)) &&
      selectedCount === authenticatedCount

    if (allSelected) {
      for (const id of authenticatedIds) {
        if (selected.has(id)) onToggle(id)
      }
      return
    }
    for (const id of authenticatedIds) {
      if (!selected.has(id)) onToggle(id)
    }
  }

  const handleRowActivate = async (platform: Platform) => {
    if (!isIdle) return
    const st = resolveStatus(platform.id)

    if (st === 'checking') return

    if (st === 'authenticated') {
      onToggle(platform.id)
      return
    }

    if (st === 'unauthenticated') {
      if (platform.homepage) chrome.tabs.create({ url: platform.homepage })
      return
    }

    // unknown → verify then select or gray + login
    setAuthMap(prev => ({
      ...prev,
      [platform.id]: { ...prev[platform.id], status: 'checking' },
    }))

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_AUTH',
        payload: { platformId: platform.id },
      })
      const auth = response?.auth
      if (auth?.isAuthenticated) {
        setAuthMap(prev => ({
          ...prev,
          [platform.id]: {
            status: 'authenticated',
            username: auth.username,
          },
        }))
        if (!selected.has(platform.id)) onToggle(platform.id)
      } else {
        setAuthMap(prev => ({
          ...prev,
          [platform.id]: { status: 'unauthenticated' },
        }))
      }
    } catch {
      setAuthMap(prev => ({
        ...prev,
        [platform.id]: { status: 'unauthenticated' },
      }))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        {isIdle && (
          <>
            <span className="text-sm font-medium text-foreground">
              选择平台
              <span className="ml-1.5 text-muted-foreground font-normal">
                {selectedCount}/{authenticatedCount}
              </span>
            </span>
            {authenticatedCount > 0 && (
              <button
                onClick={handleSelectAllClick}
                className="text-xs text-primary hover:underline"
              >
                {selectedCount === authenticatedCount && authenticatedIds.every(id => selected.has(id))
                  ? '取消全选'
                  : '全选'}
              </button>
            )}
          </>
        )}
        {isSyncing && (
          <>
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-sm font-medium">同步中</span>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {results.length}/{selectedPlatforms.length}
            </span>
          </>
        )}
        {isCompleted && (
          <>
            <span className="text-sm font-medium">同步完成</span>
            <div className="flex items-center gap-2">
              {successCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
                  <Check className="w-3 h-3" />{successCount}
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs text-red-500">
                  <X className="w-3 h-3" />{failedCount}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {isSyncing && selectedPlatforms.length > 0 && (
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(results.length / selectedPlatforms.length) * 100}%` }}
          />
        </div>
      )}

      <div className="space-y-0.5">
        {visiblePlatforms.map(platform => {
          const result = results.find(r => r.platform === platform.id)
          const progress = platformProgress.get(platform.id)
          const isSelected = selected.has(platform.id)
          const authStatus = resolveStatus(platform.id)
          const username = resolveUsername(platform.id, platform.username)

          return (
            <PlatformRow
              key={platform.id}
              platform={platform}
              authStatus={authStatus}
              username={username}
              isSelected={isSelected}
              isIdle={isIdle}
              isWaiting={isSyncing && !result && !progress}
              isInProgress={isSyncing && !result && !!progress}
              result={result || null}
              progress={progress || null}
              onActivate={() => handleRowActivate(platform)}
            />
          )
        })}
      </div>

      {isIdle && allUnauthenticated && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">还没有登录任何平台</p>
          <p className="text-xs text-muted-foreground mt-1">点击平台前往登录</p>
        </div>
      )}
    </div>
  )
}

function PlatformRow({
  platform,
  authStatus,
  username,
  isSelected,
  isIdle,
  isWaiting,
  isInProgress,
  result,
  progress,
  onActivate,
}: {
  platform: Platform
  authStatus: AuthStatus
  username?: string
  isSelected: boolean
  isIdle: boolean
  isWaiting: boolean
  isInProgress: boolean
  result: SyncResult | null
  progress: PlatformProgress | null
  onActivate: () => void
}) {
  const isDone = !!result
  const isAuthed = authStatus === 'authenticated'
  const isUnauthed = authStatus === 'unauthenticated'
  const isChecking = authStatus === 'checking'
  const isUnknown = authStatus === 'unknown'

  return (
    <div
      onClick={() => { if (isIdle) onActivate() }}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200',
        isIdle && (isAuthed || isUnknown) && 'cursor-pointer hover:bg-muted/60',
        isIdle && isUnauthed && 'cursor-pointer opacity-50 hover:opacity-70',
        isIdle && isChecking && 'cursor-wait opacity-70',
        isIdle && isSelected && isAuthed && 'bg-primary/5',
        isDone && result?.success && 'bg-green-50 dark:bg-green-950/20',
        isDone && result && !result.success && 'bg-red-50 dark:bg-red-950/20',
      )}
    >
      <RowIndicator
        isIdle={isIdle}
        isSelected={isSelected}
        authStatus={authStatus}
        isWaiting={isWaiting}
        isInProgress={isInProgress}
        result={result}
      />

      <img
        src={platform.icon}
        alt={platform.name}
        className="w-5 h-5 rounded flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/assets/icon-48.png'
        }}
      />

      <span className="text-sm flex-1 truncate">{platform.name}</span>

      <RowInfo
        platform={platform}
        authStatus={authStatus}
        username={username}
        isIdle={isIdle}
        isWaiting={isWaiting}
        isInProgress={isInProgress}
        result={result}
        progress={progress}
      />
    </div>
  )
}

function RowIndicator({
  isIdle,
  isSelected,
  authStatus,
  isWaiting,
  isInProgress,
  result,
}: {
  isIdle: boolean
  isSelected: boolean
  authStatus: AuthStatus
  isWaiting: boolean
  isInProgress: boolean
  result: SyncResult | null
}) {
  if (result) {
    return result.success ? (
      <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
        <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
      </div>
    ) : (
      <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
        <X className="w-3 h-3 text-red-600 dark:text-red-400" />
      </div>
    )
  }
  if (isInProgress || (isIdle && authStatus === 'checking')) {
    return <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
  }
  if (isWaiting) {
    return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
  }
  if (authStatus === 'unauthenticated') {
    return <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0" />
  }
  // unknown or authenticated → checkbox
  return (
    <div className={cn(
      'w-[18px] h-[18px] rounded border-2 transition-colors flex items-center justify-center flex-shrink-0',
      isSelected && authStatus === 'authenticated'
        ? 'bg-primary border-primary'
        : 'border-gray-300 dark:border-gray-500'
    )}>
      {isSelected && authStatus === 'authenticated' && <Check className="w-3 h-3 text-white" />}
    </div>
  )
}

function RowInfo({
  platform,
  authStatus,
  username,
  isIdle,
  isWaiting,
  isInProgress,
  result,
  progress,
}: {
  platform: Platform
  authStatus: AuthStatus
  username?: string
  isIdle: boolean
  isWaiting: boolean
  isInProgress: boolean
  result: SyncResult | null
  progress: PlatformProgress | null
}) {
  if (result) {
    if (result.success && result.postUrl) {
      return (
        <span className="flex items-center gap-1 flex-shrink-0">
          {result.message && (
            <span className="relative group">
              <span className="text-[10px] text-gray-400 truncate block" style={{ maxWidth: '140px' }}>
                {result.message}
              </span>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[11px] text-white bg-gray-800 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {result.message}
              </span>
            </span>
          )}
          <a
            href={result.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
            onClick={e => e.stopPropagation()}
          >
            {result.draftOnly ? '草稿' : '查看'}
            <ExternalLink className="w-3 h-3" />
          </a>
        </span>
      )
    }
    if (!result.success) {
      return (
        <span
          className="text-xs text-red-500 dark:text-red-400 truncate max-w-[120px] flex-shrink-0"
          title={result.error}
        >
          {result.error || '失败'}
        </span>
      )
    }
    return <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">完成</span>
  }

  if (isInProgress && progress) {
    const stageText = {
      starting: '准备中',
      uploading_images: progress.imageProgress
        ? `图片 ${progress.imageProgress.current}/${progress.imageProgress.total}`
        : '上传图片',
      saving: '保存中',
      completed: '完成',
      failed: '失败',
    }[progress.stage]

    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-primary">{stageText}</span>
        {progress.stage === 'uploading_images' && progress.imageProgress && (
          <div className="w-10 h-1 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(progress.imageProgress.current / progress.imageProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  if (isWaiting) {
    return <span className="text-xs text-muted-foreground flex-shrink-0">等待中</span>
  }

  if (!isIdle) return null

  if (authStatus === 'checking') {
    return <span className="text-xs text-muted-foreground flex-shrink-0">检查登录…</span>
  }
  if (authStatus === 'unauthenticated') {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
        去登录 <ChevronRight className="w-3 h-3" />
      </span>
    )
  }
  if (authStatus === 'authenticated') {
    return (
      <span className="text-xs text-muted-foreground truncate max-w-[80px] flex-shrink-0">
        {username || '已登录'}
      </span>
    )
  }
  // unknown — no status text yet
  return null
}
