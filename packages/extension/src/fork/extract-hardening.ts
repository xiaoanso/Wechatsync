/**
 * FORK PATCH (yian / Wechatsync fork) — 文章提取健壮性。
 * 勿随上游整文件覆盖删除本文件；升级后确认调用点仍从此处 import。
 *
 * 解决：
 * 1. Receiving end does not exist — 扩展重载后 tab 无 content script，注入后重试
 * 2. "[tea-sdk]ready" JSON.parse 报错 — 忽略页面非 JSON postMessage
 * 3. Defuddle Failed to construct URL — clone 文档补 base / 绝对化相对元数据 URL
 */

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'chrome-search://',
  'brave://',
]

export function isInjectableUrl(url?: string): boolean {
  if (!url) return false
  if (RESTRICTED_URL_PREFIXES.some(p => url.startsWith(p))) return false
  return /^https?:\/\//i.test(url)
}

/** 向指定 tab 注入 reader + extractor content scripts */
export async function injectExtractorScripts(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['reader.js', 'Readability.js'],
  })

  const manifest = chrome.runtime.getManifest()
  const extractorScript = manifest.content_scripts
    ?.flatMap(cs => cs.js || [])
    .find(js => js.includes('extractor'))

  if (extractorScript) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [extractorScript],
    })
  }
}

/**
 * 向 tab 发送消息；若 content script 未就绪则注入后重试一次
 */
export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: unknown,
  options?: { tabUrl?: string }
): Promise<T> {
  if (options?.tabUrl !== undefined && !isInjectableUrl(options.tabUrl)) {
    throw new Error('Current page does not support content scripts')
  }

  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  } catch (firstError) {
    try {
      await injectExtractorScripts(tabId)
    } catch {
      throw firstError
    }
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  }
}

/** 从当前活动标签页提取文章（popup SyncStore 用） */
export async function extractArticleFromActiveTab(): Promise<any | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !isInjectableUrl(tab.url)) return null

  const response = await sendTabMessage<{ article?: any }>(
    tab.id,
    { type: 'EXTRACT_ARTICLE' },
    { tabUrl: tab.url }
  )
  return response?.article || null
}

/** 在当前活动标签页打开编辑器（popup 用） */
export async function openEditorOnActiveTab(payload: {
  platforms: unknown[]
  selectedPlatforms: string[]
}): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !isInjectableUrl(tab.url)) return false

  await sendTabMessage(
    tab.id,
    {
      type: 'OPEN_EDITOR',
      platforms: payload.platforms,
      selectedPlatforms: payload.selectedPlatforms,
    },
    { tabUrl: tab.url }
  )
  return true
}

/**
 * 安全解析来自 iframe/页面的 postMessage。
 * 页面脚本常发非 JSON 字符串（如 "[tea-sdk]ready"），需忽略。
 */
export function parseEditorMessage(data: unknown): { type?: string; [key: string]: unknown } | null {
  if (data == null) return null
  if (typeof data === 'object') {
    return data as { type?: string; [key: string]: unknown }
  }
  if (typeof data !== 'string') return null
  const trimmed = data.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/**
 * 克隆文档并补全 base / 相对元数据 URL，避免 Defuddle MetadataExtractor
 * 在 clone 丢失 location 时对相对 og:url / canonical 调用 new URL 报错。
 * （content script / reader 环境调用）
 */
export function cloneDocumentForExtraction(doc: Document = document): Document {
  const docClone = doc.cloneNode(true) as Document
  docClone.querySelectorAll('[data-wechatsync-ui]').forEach(el => el.remove())

  const pageUrl = (typeof window !== 'undefined' && window.location?.href) || doc.URL || ''
  if (docClone.head && pageUrl && /^https?:\/\//i.test(pageUrl)) {
    let base = docClone.querySelector('base')
    if (!base) {
      base = docClone.createElement('base')
      docClone.head.prepend(base)
    }
    base.setAttribute('href', pageUrl)

    const absolutize = (value: string | null): string | null => {
      if (!value) return null
      if (/^(https?:|data:|blob:|mailto:|#)/i.test(value)) return value
      try {
        return new URL(value, pageUrl).href
      } catch {
        return null
      }
    }

    docClone.querySelectorAll('meta[property="og:url"], meta[property="twitter:url"]').forEach(meta => {
      const abs = absolutize(meta.getAttribute('content'))
      if (abs) meta.setAttribute('content', abs)
    })
    docClone.querySelectorAll('link[rel="canonical"]').forEach(link => {
      const abs = absolutize(link.getAttribute('href'))
      if (abs) link.setAttribute('href', abs)
    })
  }

  return docClone
}
