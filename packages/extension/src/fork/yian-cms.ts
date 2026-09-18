/**
 * FORK PATCH (yian / Wechatsync fork) — 易安 CMS 发布入口。
 * 勿随上游整文件覆盖删除本文件；升级后确认 background 仍从此处 import。
 *
 * 职责：
 * 1. 知乎等抽取只有 html/markdown、无 content 时补齐正文
 * 2. 默认 draftOnly + 不转存外链图（避免知乎图床重试卡死「保存中」）
 * 3. 分发到官方 wordpress / metaweblog 适配器
 * 4. 易安预览地址用前台 /blog/{slug}，不用 WordPress wp-admin 编辑页
 */

import * as wordpressAdapter from '../adapters/cms/wordpress'
import * as metaweblogAdapter from '../adapters/cms/metaweblog'

export type ArticleBodyFields = {
  title?: string
  content?: string
  html?: string
  markdown?: string
}

export type CmsType = 'wordpress' | 'typecho' | 'metaweblog'

type CmsCredentials = { url: string; username: string; password: string }

type CmsPublishResult = {
  success: boolean
  postId?: string
  postUrl?: string
  message?: string
  error?: string
}

const YIAN_PUBLIC_ORIGIN_BY_XMLRPC_HOST: Record<string, string> = {
  'mcp.yianso.cn': 'https://yianso.cn',
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function yianPublicOrigin(xmlrpcUrl: string): string | null {
  try {
    const host = new URL(xmlrpcUrl).hostname.toLowerCase()
    if (YIAN_PUBLIC_ORIGIN_BY_XMLRPC_HOST[host]) return YIAN_PUBLIC_ORIGIN_BY_XMLRPC_HOST[host]
    if (host === 'yianso.cn' || host === 'hub.yianso.cn') return `https://${host}`
    if (host === 'www.yianso.cn') return 'https://yianso.cn'
  } catch {
    /* ignore */
  }
  return null
}

/** XML-RPC 若返回 permalink 或 slug，改写成前台文章地址。 */
export function resolveYianPreviewUrl(
  credentials: CmsCredentials,
  result: CmsPublishResult,
): CmsPublishResult {
  if (!result.success) return result
  const postId = (result.postId || '').trim()
  if (isHttpUrl(postId)) return { ...result, postUrl: postId }

  const origin = yianPublicOrigin(credentials.url)
  if (origin && postId && !isUuid(postId)) {
    const slug = postId.replace(/^\/+/, '').replace(/^blog\//, '')
    return { ...result, postUrl: `${origin}/blog/${slug}` }
  }
  return result
}

/** 得到可用于 CMS 发文的正文（优先 content，其次 HTML / markdown） */
export function resolveArticleBody(article: ArticleBodyFields | null | undefined): string {
  if (!article) return ''
  return article.content || article.html || article.markdown || ''
}

/** 补齐 content/html，供 SYNC 等路径统一使用 */
export function normalizeArticleForCms<T extends ArticleBodyFields>(article: T): T & {
  content: string
  html: string
  markdown: string
} {
  const body = resolveArticleBody(article)
  return {
    ...article,
    content: body,
    html: article.html || article.content || body,
    markdown: article.markdown || '',
  }
}

/**
 * 统一 CMS 发布入口：补齐知乎等来源缺失的 content，默认不转存外链图。
 */
export async function publishArticleToCms(
  type: CmsType | string,
  credentials: CmsCredentials,
  article: ArticleBodyFields & { title: string },
  options?: { draftOnly?: boolean; processImages?: boolean },
) {
  const payload = normalizeArticleForCms(article)
  const opts = {
    draftOnly: options?.draftOnly ?? true,
    processImages: options?.processImages === true,
  }

  switch (type) {
    case 'wordpress':
      return resolveYianPreviewUrl(credentials, await wordpressAdapter.publish(credentials, payload, opts))
    case 'typecho':
      return resolveYianPreviewUrl(credentials, await metaweblogAdapter.publishToTypecho(credentials, payload, opts))
    case 'metaweblog':
      return resolveYianPreviewUrl(credentials, await metaweblogAdapter.publish(credentials, payload, opts))
    default:
      return { success: false as const, error: '不支持的 CMS 类型' }
  }
}
