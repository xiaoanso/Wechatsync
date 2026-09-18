# Wechatsync Fork 补丁清单（易安）

本仓库是 [wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync) 的 fork。易安业务改动尽量集中在单一入口，升级上游时冲突面最小。

## 主文件（必须保留）

| 路径 | 说明 |
|------|------|
| `packages/extension/src/fork/yian-cms.ts` | **唯一业务入口**：正文归一化 + `publishArticleToCms`（默认草稿、不转存外链图） |

文件头含 `FORK PATCH (yian)` 注释。

## 上游调用点（约 3 处，仅 import）

| 文件 | 改动 |
|------|------|
| `packages/extension/src/background/index.ts` | `import { publishArticleToCms } from '../fork/yian-cms'`，CMS 分支一次调用 |
| `packages/extension/src/background/sync-service.ts` | 同上 |

冲突口诀：上游大段以官方为准；**重新接上 `from '../fork/yian-cms'` 即可**，业务逻辑不用重写。

## 其它登记（不在 yian-cms 内）

| 项 | 路径 | 说明 |
|------|------|------|
| `parseMarkdownImages` 空值防护 | `packages/core/src/lib/markdown-images.ts` | `if (typeof markdown !== 'string') return []`，防御性；可单独向上游 PR |
| nginx / Edge XML-RPC | 易安小站仓 | 见小站文档，不在本扩展仓 |

刻意**不**改：`wordpress.ts` / `metaweblog.ts`（跟官方一致）。图片卡死靠入口传 `processImages: false` 绕过。

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

1. `packages/extension/src/fork/yian-cms.ts` 存在
2. `background/index.ts`、`sync-service.ts` 仍引用 `publishArticleToCms` / `fork/yian-cms`

## 手测

1. 知乎文章页 → 同步到 CMS（MetaWeblog）→ `https://mcp.yianso.cn`
2. 确认草稿写入成功，UI 不长时间停在「保存中」
3. 正文含知乎图床外链时，不因传图重试卡住（默认不转存）
