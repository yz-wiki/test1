# Skald 界面系统说明文档

> 版本 1.5.0 · 2026-11-04
> 本文档描述重构后的前端设计系统：它是什么、怎么用、哪些地方已迁移、哪些仍是历史遗留。
> 目标只有一个：**任何新界面都不需要自己决定像素，只决定语义。**

---

## 1. 为什么重构

重构前的状态（可量化）：

| 问题 | 数据 |
|---|---|
| 界面文案用等宽字体 | 48 个文件里 487 处 `fontFamily: MONO` |
| 标题用衬线字体 | 116 处 `fontFamily: SERIF` |
| 字号取值 | **11 种**（8 / 9 / 10 / 11 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 26 / 30 / 33） |
| 间距取值（gap） | **9 种**（4 / 6 / 7 / 8 / 10 / 12 / 14 / 16 / 22） |
| 圆角取值 | **9 种**（2 / 4 / 5 / 6 / 7 / 8 / 10 / 12 / 16） |
| 阴影 | 每个弹窗一套，共 6 种写法 |
| 弹窗遮罩 | 16 个弹窗各自手写（不透明度 0.6/0.65/0.66/0.7/0.72，模糊 2/10px） |
| 写死的旧调色板颜色 | 91 处（`#ebe7df`、`rgba(235,231,223,…)`、`#0b0b0e`）—— 在浅色主题下会变成浅底浅字 |

结果是：每个界面都"差不多但不一致"，浅色主题下部分面板对比度失效。

重构后：

| 指标 | 结果 |
|---|---|
| 硬编码字体族 | **0**（`About → 开源许可` 里列的是随包字体文件名，属正确用法） |
| 非令牌字号 | **0** |
| 非令牌圆角 | **0** |
| 非令牌间距 | 1 处（封面拼贴的 2px 缝隙，刻意保留） |
| 阴影 | 归并为 2 个令牌 + 3 处封面缩略图专用 |
| 弹窗遮罩 | 16 个弹窗统一为 `.ui-scrim` |
| 旧调色板残留 | **0** |
| 玻璃卡片组件 `Glass` | **0**（全部改为 `.ui-card`） |
| 设计令牌 | 44 个 |
| 组件类 | 58 个 |
| 原语组件 | 21 个 |

---

## 2. 文件地图

```
src/styles/system.css      ← 唯一的设计系统（令牌 + 组件类），1306 行
src/ui/index.tsx           ← 唯一的组件原语（21 个），语义 props，不收 style 覆盖
src/styles/macos.css       ← 历史遗留：外壳结构类（.mac-window / .mac-titlebar 等）
src/index.css              ← 全局 reset、滚动条、选区策略
```

**加载顺序很重要**：`index.css → macos.css → system.css`。system.css 最后加载，
因此它的类型、间距、圆角规则覆盖历史样式。`src/main.tsx` 中有注释说明。

---

## 3. 令牌表

所有令牌定义在 `system.css` 的 `:root`。**组件与界面代码只允许引用令牌，不写像素。**

### 3.1 间距（4px 基数）

| 令牌 | 值 | 典型用途 |
|---|---|---|
| `--s-1` | 4px | 图标与文字、紧凑内边距 |
| `--s-2` | 8px | 按钮内部、列表项内边距 |
| `--s-3` | 12px | 控件之间的常规间隔 |
| `--s-4` | 16px | 卡片内边距、区块间隔 |
| `--s-5` | 20px | 面板内边距 |
| `--s-6` | 24px | 页面内边距、大区块 |
| `--s-8` | 32px | 分区间隔 |
| `--s-10` | 40px | 空状态、引导页留白 |
| `--s-12` | 48px | 极少使用 |

### 3.2 字阶

| 令牌 | 值 | 用途 |
|---|---|---|
| `--fs-0` | 10px | 眉标（全大写小标签） |
| `--fs-1` | 11px | 元信息、徽章、时间 |
| `--fs-2` | 12px | 次要文字、提示 |
| `--fs-3` | 13px | 正文（默认） |
| `--fs-4` | 14px | 强调正文 |
| `--fs-5` | 16px | 列表标题 |
| `--fs-6` | 20px | 页面标题 |
| `--fs-7` | 26px | 特大标题（罕见） |

字体族只有两个：

- `--font-ui` — 界面文字。Inter + 系统中文字体（PingFang SC / 微软雅黑 / Noto Sans SC）。
- `--font-tech` — 仅用于**需要字符对齐的技术内容**：文件路径、URL、cron 表达式、API 密钥、日志行。

> 数字（时间码、进度、计数）不用等宽字体，而用 `font-variant-numeric: tabular-nums`。
> 这样既对齐又保持与正文同一字体。对应类 `.ui-num`。

### 3.3 圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| `--r-xs` | 4px | 行内标签、键帽 |
| `--r-sm` | 6px | 所有控件（按钮、输入、图标按钮） |
| `--r-md` | 8px | 小容器、封面 |
| `--r-card` | 10px | 卡片、面板、弹出层 |
| `--r-overlay` | 14px | 对话框 |
| `--r-pill` | 999px | 胶囊（徽章、进度条、开关） |

`--r-control` 是 `--r-sm` 的别名，保留以兼容旧规则。

### 3.4 控件高度

| 令牌 | 值 |
|---|---|
| `--h-sm` | 26px（小按钮、分段控件内项） |
| `--h-md` | 30px（默认按钮、输入框） |
| `--h-lg` | 34px（主行动按钮） |

### 3.5 表面层级（只有四层）

| 变量 | 含义 |
|---|---|
| `--surface-canvas` | 窗口底色 |
| `--surface-raised` | 卡片、侧栏、抬起的面板 |
| `--surface-overlay` | 对话框、菜单、弹出层 |
| 弹层阴影 | `--shadow-popover`（菜单）/ `--shadow-dialog`（对话框） |

层级之间用 **1px 发丝线**（`--hairline`）分隔，不再堆叠毛玻璃与多层阴影。

### 3.6 颜色

颜色**全部**来自 `--onyx-*`，由 `src/state/theme.ts` 在运行时按主题与强调色改写：

```
--onyx-bg / --onyx-bg-deep        窗口底色
--onyx-panel / --onyx-panel2      面板
--onyx-line                       分隔线
--onyx-text / -dim / -mute        三级文字
--onyx-accent / -bright / -dim / -edge   强调色及其派生
```

五行主题预设：Onyx（深）、Folio（浅）、Midnight、Nord、Sepia。

> ⚠️ **禁止在组件里写颜色字面量**。重构前有 91 处 `#ebe7df` 之类的旧配色，
> 在浅色主题下会造成浅底浅字。现已清零，请保持。

---

## 4. 组件原语（`src/ui/index.tsx`）

21 个导出。**全部只接受语义 props，不接受 `className` 或任意 `style` 覆盖**——这是保证一致性的关键机制。

### 4.1 按钮

```tsx
<Button tone="primary" size="lg" block onClick={save}>保存</Button>
<Button tone="ghost" size="sm" icon="plus">添加</Button>
<Button tone="danger">删除</Button>
<IconButton icon="panel-left" label="折叠侧栏" active={open} onClick={toggle} />
```

| tone | 用途 |
|---|---|
| `default` | 次要行动（有边框） |
| `primary` | 每个界面只应有一个（实心强调色） |
| `ghost` | 工具栏、行内动作（默认可视性最低） |
| `danger` | 不可逆操作，且必须在确认后使用 |

size：`sm`(26) / `md`(30) / `lg`(34)。

### 4.2 表单

```tsx
<Field label="显示名称" hint="仅保存在本机。">
  <Input value={name} onChange={e => setName(e.target.value)} />
</Field>

<Select value={theme} onChange={setTheme} options={[{value:'dark',label:'Onyx'}]} />

<Switch checked={on} onChange={setOn} label="实时同步" />
```

- `Input` 的 `tech` prop 对应等宽技术字体（路径、密钥）。
- `Switch` 输出真正的 `role="switch"` + `aria-checked`。

### 4.3 选择

```tsx
<Segmented value={tab} onChange={setTab} options={[{value:'a',label:'A'}]} />
<Tabs value={tab} onChange={setTab} tabs={[...]} />   // 带下划线指示器
```

`Segmented` 用于 2–4 个互斥选项（分段控件）；`Tabs` 用于页面级分页。

### 4.4 容器

```tsx
<Card title="主题" actions={<Button size="sm">重置</Button>}>…</Card>

<SettingsRow label="界面缩放" hint="缩放整个应用。">
  <Segmented … />
</SettingsRow>

<List>
  <ListItem icon="home" label="首页" active meta="12" onClick={…} />
</List>
```

### 4.5 覆盖层

```tsx
<Sheet title="匹配书籍" onClose={close} footer={<><Button>取消</Button><Button tone="primary">保存</Button></>}>
  …内容…
</Sheet>
```

`Sheet` 自带遮罩、圆角、标题栏、关闭按钮、可滚动内容区、右对齐按钮区。
**新弹窗请直接用它，不要再手写遮罩。**

### 4.6 其他

`Badge`（普通/强调/警告/危险）、`EmptyState`、`Progress`、`Screen`、`Stack`、`RowLine`、`Toolbar`、`GroupLabel`。

---

## 5. 迁移状态

### 5.1 结构性重建（用了原语，不只是换值）

| 界面 | 说明 |
|---|---|
| 侧边栏 | 源列表（`ui-list__item`）、库切换器为带边框的表头控件、账户固定在底部、折叠为 60px 图标轨 |
| 标题栏 | 统一图标按钮、徽章、键帽 |
| 播放条 | 统一发丝线高度、章节弹层用 `ui-popover` |
| 设置页 | 导航轨改为列表，内容列独立滚动；13 个面板通过重写的 `shared.tsx` 一次性升级 |
| 登录页 | 从双栏"编辑部海报"（衬线标题、金色渐变 CTA、颗粒噪点）重写为居中单卡片 |
| 确认对话框 | 使用 `Sheet` 原语 |
| 顶栏 | 玻璃卡 → 工具栏；搜索框用 `ui-input`；两个下拉用 `ui-popover`；操作按钮用 `ui-btn` |
| 焦点面板 / 欢迎面板 | 玻璃卡 → `ui-card`，340px 列宽，眉标与标题用语义类 |
| 引导页左栏 | 渐变光斑 + 噪点 → 品牌栏（与侧边栏同一套表面与字阶） |
| 书架容器 / Pick it up 卡片 | 玻璃卡 → `ui-card` |

### 5.2 值归一化（结构未动，但已完全令牌化）

这些文件仍用内联样式，但**字号、间距、圆角、阴影、颜色全部来自令牌**，
换主题、换强调色、调缩放都会正确跟随。它们与重建过的界面在视觉上已经一致。

- Player 内部（统计块、章节行、书签卡）
- 全部弹窗的内部布局（MatchModal、文件检查器、上传、分享、元数据编辑、用户编辑、
  改密、播客三个弹窗、文件夹选择、合集/播放列表详情、文件列表）
- 书架网格与瓷砖（LibraryShelf、BrowseTile、BrowseList、ShelfHeader）
- 播客浏览与详情
- 引导流程的 7 个步骤
- 设置面板内部的自定义块（通知、日志、收听记录、账户等）

**为什么不全量重写**：1874 处内联样式中，绝大多数是布局属性（`display:flex`、
`flex:1`、`minWidth`）。逐个改成 CSS 类不会改变视觉结果，只会增加回归风险。
本次的原则是：**视觉一致性由令牌保证，而不是由"能否删除内联样式"衡量。**

### 5.3 已知例外

| 位置 | 原因 |
|---|---|
| `CoverMosaic` 的 `gap: '2px'` | 封面拼贴的物理缝隙，比 4px 阶更细是刻意设计 |
| 封面缩略图的 3 处 `boxShadow` | 缩略图阴影随封面尺寸缩放，不能共用令牌 |
| `About → 开源许可` 里的字体名 | 描述随包文件，不是 CSS 值 |
| `macos.css` | 保留外壳结构类（`.mac-window`、`.mac-titlebar`、`.mac-nowbar` 等），
其视觉规则已被 `system.css` 中同名块覆盖 |

---

## 6. 交互逻辑

**必须明确说明：本次重构以视觉与结构为主，交互逻辑基本保持原样。** 有改动的只有：

| 位置 | 改动 |
|---|---|
| 登录页 | 挂载时自动聚焦第一个输入框；协议选择从自定义下拉改为原生 `select`；登录方式改为分段控件 |
| 设置页 | 导航从"按钮列表"改为语义列表 + `aria-current="page"`；内容列独立滚动，切面板不再滚动到顶部 |
| 播放器 | 窄窗口的三面板切换从"手写胶囊"改为共享分段控件（行为等价） |
| 侧边栏 | 折叠按钮图标从 `list` 改为 `panel-left`；折叠语义不变（收成图标轨，永不隐藏） |
| 全局 | 移除装饰性背景层 `OnyxWash`，窗口改为平坦画布（同时消除了曾导致整屏黑屏的层叠上下文陷阱） |
| 确认对话框 | 按钮顺序与语义不变，视觉换为系统按钮 |

**未改动**：书架点击/双击/右键、播放/跳转/章节、命令面板、快捷键、导航历史、
弹窗打开关闭与焦点管理、拖拽排序、虚拟滚动。

如果还需要"交互逻辑重构"（例如单击选中/双击播放、拖拽入库、播放器手势），
那是独立的一轮工作，本文档不覆盖。

---

## 7. 无障碍约定

| 控件 | ARIA |
|---|---|
| 开关 | `role="switch"` + `aria-checked` |
| 分段控件 | `role="group"` + 每项 `aria-pressed` |
| 标签页 | `role="tablist"` / `role="tab"` + `aria-selected` |
| 列表导航 | `aria-current="page"` |
| 对话框 | `role="dialog"` + `aria-modal` + `aria-labelledby` |
| 图标按钮 | 必须传 `label`，输出 `aria-label` + `title` |
| 进度条 | `role="progressbar"` + `aria-valuenow/min/max` |

聚焦环统一为 `2px` 强调色描边（`button:focus-visible`，定义在 `index.css`）。
`prefers-reduced-motion` 与设置里的"减少动态效果"都会把动画压到 0.001ms。

---

## 8. 新增界面的规范

```tsx
import { Screen, Card, SettingsRow, Button, Input, Field } from '../ui';

export default function NewPane() {
  return (
    <Screen>
      <h1 className="ui-title">标题</h1>
      <Card title="分组">
        <SettingsRow label="选项" hint="说明文字">
          <Input value={v} onChange={e => setV(e.target.value)} />
        </SettingsRow>
      </Card>
      <Button tone="primary">保存</Button>
    </Screen>
  );
}
```

硬性规则：

1. **不写字体族**。需要技术对齐才用 `.ui-tech`。
2. **不写字号/间距/圆角的像素值**，只写 `var(--fs-*)` / `var(--s-*)` / `var(--r-*)`。
3. **不写颜色字面量**，只用 `--onyx-*` 或 `--surface-*`。
4. **新弹窗用 `<Sheet>`**，不要手写遮罩。
5. **一个界面只有一个 `tone="primary"` 按钮。**
6. 需要新样式时，**先改 `system.css` 的令牌或组件类**，而不是在组件里内联覆盖。

---

## 9. 验证

每次改动后跑这四条（全部必须通过）：

```bash
npx tsc --noEmit                 # 类型
npx vitest run                   # 44 文件 / 350 测试
node scripts/check-console.mjs   # 禁止裸 console
npx vite build                   # 生产构建
```

一致性审计（可随时复跑）：

```bash
# 应为 0
grep -rho "fontSize: '[0-9]*px'" src --include=*.tsx | wc -l
grep -rho "borderRadius: '[0-9]*px'" src --include=*.tsx | wc -l
grep -rn  "rgba(235,231,223\|#ebe7df\|#0b0b0e" src --include=*.tsx | wc -l
grep -rc  "<Glass" src --include=*.tsx | grep -v ':0' | wc -l
```

---

## 10. 变更影响面

- **视觉**：字体、字号、间距、圆角、阴影、弹窗遮罩、登录页、引导页、顶栏、侧栏全部变化。
- **主题**：现在是真正可用的多主题（此前浅色主题下多处面板是浅底浅字）。
- **文案**：新增键 `loginUi.*`（10 条）、`focus.by`、`nav.roleAdmin/roleUser` 等，
  词典共 1057 条，中英同步（键集一致性由 `i18n.test.ts` 强制）。
- **行为**：仅第 6 节列出的几处，其余不变。
- **体积**：CSS 从 26.9 kB 增至约 49 kB（未压缩），gzip 后影响很小。
