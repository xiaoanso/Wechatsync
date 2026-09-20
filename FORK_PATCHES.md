# Wechatsync Fork 补丁清单（易安）

本仓库是 [wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync) 的 fork。易安业务改动尽量集中在单一入口，升级上游时冲突面最小。

## 主文件（必须保留）

| 路径 | 说明 |
|------|------|
| `packages/extension/src/fork/yian-cms.ts` | **CMS 发布入口**：正文归一化 + `publishArticleToCms`（默认草稿、不转存外链图）；预览链接改写为 `https://yianso.cn/blog/{slug}` |
| `packages/extension/src/fork/lazy-platform-auth.ts` | **平台登录懒检查**：打开时不批量 `checkAuth`；`resolveCheckAllAuth` / `listPlatformsWithoutAuth` |
| `packages/extension/src/fork/LazyPlatformList.tsx` | **勾选时验登录 UI**：未知→检查中→已登录高亮 / 未登录置灰去登录 |
| `packages/extension/src/fork/extract-hardening.ts` | **提取健壮性**：无 content script 时注入重试；忽略非 JSON postMessage；Defuddle clone 补 base |
| `packages/extension/src/fork/draggable-fab.ts` | **悬浮按钮**：自由拖动、关闭贴右半隐藏、悬停展开、点击固定；短按预览 / 长按 3 秒同步（进度条，松开取消）；状态存 `floatingFabState` |
| `packages/extension/src/fork/quick-sync-dialog.ts` | **长按同步弹窗**：打开与编辑器右上角「同步」相同的 SyncDialog（选平台 + 同步结果） |

文件头含 `FORK PATCH (yian)` 注释。

## 上游调用点（仅 import / 薄接线）

| 文件 | 改动 |
|------|------|
| `packages/extension/src/background/index.ts` | `yian-cms` + `lazy-platform-auth` + `extract-hardening.sendTabMessage`；`CHECK_ALL_AUTH` → `resolveCheckAllAuth`；右键/悬浮打开编辑器用 `listPlatformsWithoutAuth`；`preCheckPlatformsAuth` 空实现 |
| `packages/extension/src/background/sync-service.ts` | `import { publishArticleToCms } from '../fork/yian-cms'` |
| `packages/extension/src/components/sync-dialog/SyncDialog.tsx` | `PlatformList` 改从 `fork/LazyPlatformList` import |
| `packages/extension/src/content/api.ts` | `getAccounts` 传 `forceAuth: true` |
| `packages/extension/src/content/extractor.ts` | `parseEditorMessage` 从 `fork/extract-hardening`；`createSyncFab` 从 `fork/draggable-fab`；长按 `openQuickSyncDialog` |
| `packages/extension/src/content/weixin.ts` | `createSyncFab` 从 `fork/draggable-fab` |
| `packages/extension/src/lib/reader/index.ts` | `cloneDocumentForExtraction` 从 `fork/extract-hardening` import |
| `packages/extension/src/popup/stores/sync.ts` | `extractArticleFromActiveTab` |
| `packages/extension/src/popup/pages/HomeNew.tsx` | `openEditorOnActiveTab` |
| `packages/extension/src/mcp/client.ts` | `sendTabMessage` |
| `packages/extension/src/sync-dialog/SyncDialogPage.tsx` / `editor/EditorApp.tsx` | 恢复选中时仅保留已带登录态项（CMS） |

冲突口诀：上游大段以官方为准；**重新接上 fork import** 即可，业务逻辑不用重写。

## 其它登记（不在 fork 业务文件内）

| 项 | 路径 | 说明 |
|------|------|------|
| `parseMarkdownImages` 空值防护 | `packages/core/src/lib/markdown-images.ts` | `if (typeof markdown !== 'string') return []`，防御性；可单独向上游 PR |
| nginx / Edge XML-RPC | 易安小站仓 | 见小站文档，不在本扩展仓 |

刻意**不**改：`wordpress.ts` / `metaweblog.ts`（跟官方一致）。图片卡死靠入口传 `processImages: false` 绕过；易安预览 URL 在 `yian-cms.ts` 的 `resolveYianPreviewUrl` 改写。

## Git 升级约定

```bash
# 首次
git remote add upstream https://github.com/wechatsync/Wechatsync.git

# 常规升级
git fetch upstream
git merge upstream/v2
pnpm check:fork
pnpm --filter @wechatsync/extension build
```

- **origin**：本 fork（`xiaoanso/Wechatsync`），主分支 `v2`
- **upstream**：官方 `wechatsync/Wechatsync`

## 合入检查

```bash
pnpm check:fork
```

断言：

1. `fork/yian-cms.ts`、`fork/lazy-platform-auth.ts`、`fork/LazyPlatformList.tsx`、`fork/extract-hardening.ts`、`fork/draggable-fab.ts` 存在
2. `background/index.ts`、`sync-service.ts` 仍引用 `fork/yian-cms`
3. `background/index.ts` 仍引用 `fork/lazy-platform-auth` / `resolveCheckAllAuth`
4. `SyncDialog.tsx` 仍从 `fork/LazyPlatformList` 引入 `PlatformList`
5. `background/index.ts` / `sync.ts` / `extractor.ts` / `reader/index.ts` 仍引用 `fork/extract-hardening`
6. `extractor.ts` / `weixin.ts` 仍从 `fork/draggable-fab` 引入 `createSyncFab`

## 手测

1. 知乎文章页 → 同步到 CMS（MetaWeblog / WordPress）→ `https://mcp.yianso.cn`
2. 确认草稿写入成功，UI 不长时间停在「保存中」
3. 预览链接为 `https://yianso.cn/blog/{slug}`，不是 `https://mcp.yianso.cn/wp-admin/post.php?...`
4. 正文含知乎图床外链时，不因传图重试卡住（默认不转存）
5. 打开 popup：平台列表立即出现，**不**批量验登录；勾选某平台才检查；已登录高亮可选，未登录置灰「去登录」
6. 扩展重载后不刷新页面，打开 popup 仍能提取文章；页面有 `[tea-sdk]ready` 时控制台不再刷 JSON 解析错误
7. 开启悬浮按钮：可拖动；点右上角 × 收起贴右只露半圆；悬停展开；点击固定；拖到右边缘也可自动贴边
8. 短按悬浮按钮 → 预览编辑器；长按 3 秒（进度条满）→ 选平台同步弹窗；中途松开取消
