# 重写说明：Skald 2.0 前端

> 2026-11-04 · 分支 `rewrite/v2`
> 本文档说明新前端的架构选择、目录结构、状态模型，以及从旧前端迁移的进度。

---

## 1. 决策

| 项目 | 旧 | 新 | 理由 |
|---|---|---|---|
| UI 框架 | React 19 | **Svelte 5（runes）** | 无虚拟 DOM，编译期生成更新代码。构建产物 JS 从 **971 kB → 79 kB**（-92%），CSS 48.9 kB → 20.9 kB |
| 状态管理 | 单个 1600 行 `useOnyxState` 大对象 | **按领域拆分的 store 类**（session / library / ui） | 组件只订阅自己读的字段；改播放器不会重渲染书架 |
| 样式 | 内联 `style={{…}}` + 令牌混用 | **类名 + 三层 CSS**（tokens / base / components） | 组件不写像素；样式只有一处真相 |
| 类型边界 | 各组件自行 `invoke` | **单一 `lib/ipc.ts`** | 命令名、参数、错误形状只有一份定义 |
| i18n | React Context + 1057 键 | **runes + 扁平词典** | `t()` 直接读 `locale` rune，模板自动响应，无 provider |
| Rust 内核 | 21,426 行 / 205 命令 | **完全保留** | 播放（LibVLC）、下载、同步、离线缓存是资产，不是负债 |

**没有换掉 Rust。** 换语言的前提是它有问题；这块代码跑得好好的，重写的收益是负的。

---

## 2. 目录结构

```
web/
  index.html
  tsconfig.json
  src/
    main.ts                 挂载入口
    App.svelte              路由：boot → Login / Shell
    lib/
      ipc.ts                唯一的 Rust 边界：类型 + 命令 + IpcError
      state.svelte.ts       session / library / ui 三个 store
      i18n.svelte.ts        词典、t()、时长格式化
    design/
      tokens.css            颜色/字号/间距/圆角/阴影/动效令牌
      base.css              reset、文字角色、滚动条、动效偏好
      components.css        按钮/输入/开关/分段/卡片/列表/弹窗…
    components/
      Titlebar.svelte       无边框窗口的拖拽区与窗口按钮
      Shell.svelte          左侧导航 + 内容区
      Icon.svelte           封闭图标集（联合类型，防止图标风格漂移）
      Cover.svelte          封面：Rust 取图 → asset:// URL
    routes/
      Login.svelte
      Library.svelte
      Settings.svelte
```

`src/`（旧 React 应用）仍在仓库里，但**已不参与构建**——`vite.config.ts` 的 `root` 指向 `web/`。这样可以逐屏迁移，随时对照旧实现，迁完再删。

---

## 3. 状态模型

三个 store，都是 `.svelte.ts` 里的类，字段用 `$state` 声明：

```ts
session  serverUrl / user / authenticated / libraries / activeLibraryId
         bootstrap() loadLibraries() signInWithKey() signInWithPassword() selectLibrary()
library  items / loading / error
         load(serverUrl, libraryId, force?)   // 同一 library 不重复请求
ui       theme / reduceMotion / route / query
         setTheme() setReduceMotion()
player   item / position / duration / playing / rate / volume / expanded
         open() toggle() seek() skip() skipChapter() setRate() setVolume()
```

`player` 不自己数秒：Rust 会话每秒发一次 `playback-tick`（`currentTime /
duration / isPlaying`），store 只是它的投影。这一点是刻意的——本地计时器
是播放头与音频走偏的唯一来源。`resume_audio` 也只在 store 里调用，因为
后端会在恢复时按配置回退几秒，UI 不能自己再算一遍。

要点：

- **派生值用 `$derived`**（`activeLibrary` 由 `libraries + activeLibraryId` 算出），不存冗余状态。
- **副作用用 `$effect`**（Library 页在 server/库变化时重新拉取），依赖自动追踪。
- **不做全局事件总线**：没有 `setToast` 满天飞，错误留在发起它的 store 里。

---

## 4. 设计语言（已重做，不是移植）

旧界面是"编辑部风格"（衬线标题、等宽标签、金色渐变），新界面是**中性工具风格**：

| 维度 | 规则 |
|---|---|
| 字体 | 只有一个族（`--font`）。数字用 `tabular-nums` 对齐。**没有等宽角色，没有衬线角色** |
| 字号 | 9 档，按语义命名：`--text-2xs` … `--text-3xl` |
| 间距 | 按意图命名：`--gap-tight`(4) `--gap-inline`(8) `--gap-row`(12) `--gap-panel`(16) `--gap-block`(24) `--gap-section`(32) `--gap-page`(40) |
| 圆角 | 6 档：5 / 7 / 10 / 14 / 20 / pill |
| 表面 | 5 层平涂：canvas → surface → raised → overlay → inset。深度靠 1px 发丝线 + 1 个阴影 |
| 阴影 | 只有 3 个：`--shadow-1/2/3` |
| 主题 | 3 套完整配色：Graphite（深灰）/ Paper（浅）/ Midnight（深蓝）。每套重定义全部语义色，不是简单反色 |

主题切换是 `document.documentElement.dataset.theme = 'paper'`，CSS 变量整组替换。

---

## 5. i18n

```svelte
<script>
  import { t } from '../lib/i18n.svelte';
</script>
<h1>{t('login.title')}</h1>
```

- 词典是 `as const` 对象，`TranslationKey` 由它推导——**漏键是编译错误**。
- `t()` 读模块级 `locale` rune，模板自动重渲染，不需要 Context。
- 首次运行跟随系统语言，之后记住选择。
- 时长格式化也在这里（`formatDuration` / `formatLength`），避免每个组件自己拼。

---

## 6. 迁移进度

| 区域 | 状态 |
|---|---|
| 构建链路（Vite root → web，Tauri dist 不变） | ✅ |
| 设计令牌 + 基础层 + 组件样式 | ✅ |
| 状态 store（session / library / ui） | ✅ |
| IPC 边界 + 登录（API key / 密码） | ✅ |
| 窗口标题栏（拖拽、最小化、最大化、关闭） | ✅ |
| 侧栏导航（库切换、账户） | ✅ |
| 书库页（搜索、继续收听、封面网格、骨架屏、空/错状态） | ✅ |
| 设置页（语言、主题、动效） | ✅ |
| 播放器（传输条、章节列表、详情、速度、音量） | ✅ |
| 播放条（全局常驻，随导航存活） | ✅ |
| 播客（节目页、单集列表、单集播放） | ✅ |
| 书籍详情页（简介、章节、文件、标记已听） | ✅ |
| 睡眠定时（分钟 / 本章结束） | ✅ |
| 均衡器（10 段 + 预设 + 前级） | ✅ |
| 设置：输出设备 / 存储目录 / 版本 | ✅ |
| 下载（下载、进度、列表、删除、离线播放回退） | ✅ |
| 弹窗组（匹配、元数据、文件检查器、上传、分享） | ⬜ |
| 引导流程 | ⬜ |
| 播放器：书签、全局快捷键 | ✅ |
| 同步面板（socket 状态、离线队列、其他设备） | ✅ |
| 管理页（书库扫描、用户、任务、备份） | ✅ |
| 拼音搜索（按需加载词典） | ✅ |
| 元数据匹配 / 分享 RSS / cron 编辑 / 日志流 | ⬜ 不做（ABS 网页端更合适） |
| 虚拟滚动（书库 >240 本启用窗口化） | ✅ |
| 拖拽排序 | ⬜ 不做 |

完成一项就在上表打勾，全部完成后删除 `src/` 并把 `root` 移回仓库根。

---

## 7. 验证

```bash
npx svelte-check --tsconfig ./web/tsconfig.json   # 新前端类型（0 error）
npx vite build                                     # 产物到 dist/
npx tsc --noEmit                                   # 旧前端（迁移期间）
npx vitest run                                     # 旧前端测试（迁移期间）
```

> 旧测试（350 条）覆盖的是 Rust 命令契约与业务规则，迁移时应**逐条移植到新前端**，
> 而不是丢弃——它们是这个项目唯一的行为护栏。
