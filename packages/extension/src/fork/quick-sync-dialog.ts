/**
 * FORK PATCH (yian / Wechatsync fork) — 长按悬浮按钮直接打开同步弹窗（选平台 + 同步结果）。
 * 与预览编辑器右上角「同步」打开的 SyncDialog 体验一致，跳过全文预览编辑。
 * 升级后确认 extractor 仍从此处 import。
 */

type ArticleLike = {
  title?: string
  content?: string
  html?: string
  markdown?: string
  cover?: string
  url?: string
  source?: { url?: string; platform?: string }
}

type OpenQuickSyncOptions = {
  /** 提取当前页文章 */
  getArticle: () => Promise<ArticleLike | null> | ArticleLike | null
  /** 埋点 / SYNC_ARTICLE source */
  source?: string
}

let dialogIframe: HTMLIFrameElement | null = null
let dialogContainer: HTMLElement | null = null
let bridgeInstalled = false

function ensureBridge() {
  if (bridgeInstalled) return
  bridgeInstalled = true

  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      if (!data?.type) return
      if (!dialogIframe) return

      if (data.type === 'CLOSE_SYNC_DIALOG') {
        closeQuickSyncDialog()
      } else if (data.type === 'START_SYNC') {
        const syncId = data.syncId
        chrome.runtime.sendMessage({
          type: 'SYNC_ARTICLE',
          payload: {
            article: data.article,
            platforms: data.platforms,
            source: 'floating-longpress',
            syncId,
          },
        }).then(response => {
          dialogIframe?.contentWindow?.postMessage(JSON.stringify({
            type: 'SYNC_COMPLETE',
            results: response?.results,
            rateLimitWarning: response?.rateLimitWarning,
            syncId,
          }), '*')
        }).catch(error => {
          dialogIframe?.contentWindow?.postMessage(JSON.stringify({
            type: 'SYNC_ERROR',
            error: (error as Error).message,
            syncId,
          }), '*')
        })
      }
    } catch {
      // ignore non-JSON
    }
  })

  chrome.runtime.onMessage.addListener(message => {
    if (!dialogIframe) return
    if (message.type === 'SYNC_PROGRESS') {
      dialogIframe.contentWindow?.postMessage(JSON.stringify({
        type: 'SYNC_PROGRESS',
        result: message.payload?.result ?? message.result,
        syncId: message.syncId,
      }), '*')
    }
    if (message.type === 'SYNC_DETAIL_PROGRESS') {
      const progress = message.payload || {
        platform: message.platform,
        platformName: message.platformName,
        stage: message.stage,
        imageProgress: message.imageProgress,
        result: message.result,
        error: message.error,
      }
      dialogIframe.contentWindow?.postMessage(JSON.stringify({
        type: 'SYNC_DETAIL_PROGRESS',
        progress,
        syncId: message.syncId,
      }), '*')
    }
  })
}

export function closeQuickSyncDialog() {
  if (dialogContainer) {
    dialogContainer.remove()
    dialogContainer = null
    dialogIframe = null
  }
}

/**
 * 打开与编辑器右上角「同步」相同的选平台 / 同步结果弹窗。
 */
export async function openQuickSyncDialog(options: OpenQuickSyncOptions): Promise<void> {
  ensureBridge()
  if (dialogContainer) return

  dialogContainer = document.createElement('div')
  dialogContainer.id = 'wechatsync-quick-sync-overlay'
  dialogContainer.setAttribute('data-wechatsync-ui', '')
  dialogContainer.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `
  dialogContainer.addEventListener('click', e => {
    if (e.target === dialogContainer) closeQuickSyncDialog()
  })

  const loadingEl = document.createElement('div')
  loadingEl.style.cssText = `
    background: white; padding: 20px 32px; border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    display: flex; align-items: center; gap: 12px;
  `
  loadingEl.innerHTML = `
    <div style="width:20px;height:20px;border:3px solid #e5e5e5;border-top-color:#07c160;border-radius:50%;animation:wcs-qspin 0.8s linear infinite;"></div>
    <span style="font-size:14px;color:#333;">正在提取文章...</span>
    <style>@keyframes wcs-qspin { to { transform: rotate(360deg); } }</style>
  `
  dialogContainer.appendChild(loadingEl)
  document.body.appendChild(dialogContainer)

  const [rawArticle, platformResp] = await Promise.all([
    Promise.resolve(options.getArticle()),
    chrome.runtime.sendMessage({ type: 'CHECK_ALL_AUTH' }).catch(() => ({ platforms: [] })),
  ])

  if (!rawArticle) {
    closeQuickSyncDialog()
    return
  }

  const article = {
    title: rawArticle.title || '',
    content: rawArticle.content || rawArticle.html || rawArticle.markdown || '',
    cover: rawArticle.cover,
    url: rawArticle.url || rawArticle.source?.url,
  }

  if (!dialogContainer) return
  loadingEl.remove()

  dialogIframe = document.createElement('iframe')
  dialogIframe.src = chrome.runtime.getURL('src/sync-dialog/index.html')
  dialogIframe.style.cssText = `
    width: 400px; height: 520px; border: none;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    background: white;
  `
  dialogContainer.appendChild(dialogIframe)

  const platforms = platformResp?.platforms || []

  const handleReady = (event: MessageEvent) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      if (data.type === 'SYNC_DIALOG_READY') {
        window.removeEventListener('message', handleReady)
        dialogIframe?.contentWindow?.postMessage(JSON.stringify({
          type: 'INIT_DATA',
          article,
          platforms,
        }), '*')
      }
    } catch {
      // ignore
    }
  }
  window.addEventListener('message', handleReady)
}
