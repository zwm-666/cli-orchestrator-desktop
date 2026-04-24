# GPT Prompt: Redesign UI — 仅保留 Black 和 OC-2 两套主题

## 项目

Electron + React 18 + TypeScript 桌面应用。所有样式在 `src/renderer/src/styles.css`（~850行）。CSS 通过 `:root` 自定义属性全局传播，切换主题只需切换变量集。

## 目标

删除当前所有暖色/奶油色/衬线/圆角样式。仅保留两套配色主题，布局和组件规则完全统一，只有颜色不同。两套主题通过 `<html data-theme="black">` 和 `<html data-theme="oc2">` 切换。

---

## 主题色板

### Theme 1: Black（纯黑）

```css
[data-theme="black"] {
  --bg-base:            #101010;
  --bg-surface:         #161616;
  --bg-raised:          #1e1e1e;
  --bg-raised-hover:    #232323;
  --bg-overlay:         #282828;
  --bg-input:           #232323;

  --border-base:        #282828;
  --border-strong:      #3f3f3f;
  --border-focus:       #fab283;

  --text-strong:        #f0f0f0;
  --text-base:          #a4a4a4;
  --text-weak:          #757575;
  --text-weaker:        #545454;

  --accent:             #fab283;
  --accent-hover:       #fcc6a3;
  --accent-surface:     rgba(250,178,131,0.10);
  --accent-surface-strong: rgba(250,178,131,0.18);

  --success:            #29c121;
  --success-surface:    rgba(41,193,33,0.10);
  --warning:            #FCD53B;
  --warning-surface:    rgba(252,213,59,0.10);
  --danger:             #f65a42;
  --danger-surface:     rgba(246,90,66,0.10);
  --info:               #8CB0FF;
  --info-surface:       rgba(140,176,255,0.10);

  --icon-base:          #757575;
  --icon-weak:          #3f3f3f;

  --scrollbar-thumb:    rgba(255,255,255,0.08);
  --scrollbar-hover:    rgba(255,255,255,0.15);

  --syntax-comment:     #8f8f8f;
  --syntax-keyword:     #EDB2F1;
  --syntax-string:      #00ceb9;
  --syntax-primitive:   #8CB0FF;
  --syntax-property:    #fab283;
  --syntax-type:        #FCD53B;
  --syntax-constant:    #93e9f6;
}
```

### Theme 2: OC-2（OpenCode 暗色主题）

```css
[data-theme="oc2"] {
  --bg-base:            #1C1C1C;
  --bg-surface:         #1f1f1f;
  --bg-raised:          #232323;
  --bg-raised-hover:    #282828;
  --bg-overlay:         #2e2e2e;
  --bg-input:           #282828;

  --border-base:        #282828;
  --border-strong:      #3f3f3f;
  --border-focus:       #fab283;

  --text-strong:        #EDEDED;
  --text-base:          #A0A0A0;
  --text-weak:          #707070;
  --text-weaker:        #505050;

  --accent:             #fab283;
  --accent-hover:       #fcc6a3;
  --accent-surface:     rgba(250,178,131,0.10);
  --accent-surface-strong: rgba(250,178,131,0.18);

  --success:            #12c905;
  --success-surface:    #022B00;
  --warning:            #fcd53a;
  --warning-surface:    rgba(252,213,58,0.10);
  --danger:             #fc533a;
  --danger-surface:     #1F0603;
  --info:               #edb2f1;
  --info-surface:       rgba(237,178,241,0.10);

  --icon-base:          #7E7E7E;
  --icon-weak:          #343434;

  --scrollbar-thumb:    rgba(255,255,255,0.08);
  --scrollbar-hover:    rgba(255,255,255,0.15);

  --syntax-comment:     #8f8f8f;
  --syntax-keyword:     #edb2f1;
  --syntax-string:      #00ceb9;
  --syntax-primitive:   #8cb0ff;
  --syntax-property:    #fab283;
  --syntax-type:        #fcd53a;
  --syntax-constant:    #93e9f6;
}
```

> 两套主题的**唯一差异**是色值。布局、字号、间距、圆角、组件结构完全一致。
> 默认加载 `data-theme="oc2"`。

---

## 共享设计系统（不随主题变化）

### 字体

```css
--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: "Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, "Liberation Mono", monospace;
```

- 全局删除 `--font-display`（衬线体）
- 所有 `h1 h2 h3 h4` 使用 `--font-ui`，**禁止衬线体**
- 所有 `code / pre` 使用 `--font-mono`

### 字号

```css
--text-xs:  11px;   /* 徽标、辅助说明 */
--text-sm:  12px;   /* 状态栏、次要标签 */
--text-md:  13px;   /* 正文、按钮、输入框、文件树 — 全局基准 */
--text-lg:  14px;   /* 小标题 h3 */
--text-xl:  16px;   /* 大标题 h1 h2 */
```

- `:root { font-size: 13px; }` — 不再用 rem，直接 px
- 删除 `--text-display`、`clamp()` 等大号展示字体
- `h1`: 16px / 600，`h2`: 14px / 600，`h3`: 13px / 600
- 标题与正文差距很小，靠 `font-weight` 区分

### 行高

```
UI 文本: line-height: 1.4
代码区域: line-height: 1.6
文件树行: line-height: 22px（固定行高）
```

### 间距（4px 倍数）

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
```

### 圆角

```css
--radius-sm: 3px;   /* 徽标 badge */
--radius-md: 4px;   /* 按钮、输入框 */
--radius-lg: 6px;   /* 卡片、面板 */
--radius-dialog: 8px; /* 弹窗 */
```

- 删除 `--radius-pill: 999px`
- 所有按钮、badge 使用 4px 以下圆角
- 不允许药丸形状

### 阴影

```
仅保留一个：
--shadow-dropdown: 0 4px 12px rgba(0,0,0,0.4);
```

- 删除 `--shadow-float`、`--shadow-inset`、`--shadow-lg`、`--shadow-soft`
- 卡片、面板、表面均不使用阴影（纯粹靠背景色层级区分）
- 只有浮层（dropdown、modal）才有阴影

### 过渡

```
--transition-fast: 120ms ease-out;   /* hover 色变 */
--transition-base: 200ms ease-out;   /* 面板展开 */
```

- 删除所有 `transform: translateY()` 悬浮效果
- 删除所有弹跳/浮动关键帧动画

---

## 组件样式改造规则

### 1. 根元素 & body

```css
:root {
  color-scheme: dark;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.4;
  font-weight: 400;
  background: var(--bg-base);
  color: var(--text-base);
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg-base);
}
```

- **删除** `body::before`（竖线网格纹理）
- **删除** `body::after`（径向光晕）
- **删除** `:root` 中的 `radial-gradient` 和 `linear-gradient`
- 背景纯色，不要任何装饰

### 2. 卡片 & 表面

```css
.card,
.inlay-card,
.brief-block,
.list-card,
.info-card,
.stream-entry {
  background: var(--bg-raised);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  box-shadow: none;
}

.card:hover,
.inlay-card:hover {
  background: var(--bg-raised-hover);
}
```

### 3. 侧边栏

```css
.sidebar {
  background: var(--bg-surface);
  padding: 8px 0;
  gap: 2px;
}

/* 导航项 */
.sidebar-nav-link {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-weak);
  border-radius: 0;
}

.sidebar-nav-link:hover {
  background: var(--bg-raised);
  color: var(--text-base);
}

.sidebar-nav-link.is-active {
  background: var(--bg-raised-hover);
  color: var(--text-strong);
  border-left: 2px solid var(--accent);
}

/* 品牌标记 */
.brand-mark {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-ui);
}

.sidebar-brand h1 {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-ui);
}
```

- `--sidebar-width: 240px`（展开），`48px`（折叠）
- 删除品牌区域的渐变背景

### 4. 顶部导航

```css
.top-nav {
  height: 38px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-base);
  padding: 0 16px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 16px;
  -webkit-app-region: drag;
}

.top-nav a {
  color: var(--text-weak);
  text-decoration: none;
}

.top-nav a:hover { color: var(--text-base); }
.top-nav a.is-active { color: var(--text-strong); font-weight: 500; }

--top-nav-height: 38px;  /* 从 5.4rem 改为 38px */
```

### 5. 按钮

```css
.primary-button {
  background: var(--accent);
  color: var(--bg-base);
  border: none;
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
}
.primary-button:hover { background: var(--accent-hover); }
.primary-button:disabled { opacity: 0.4; }

.secondary-button {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-base);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
}
.secondary-button:hover { background: var(--bg-raised-hover); }
```

- 按钮高度 ~28px
- 删除所有 `border-radius: 999px`
- 删除所有 `text-transform: uppercase` 和 `letter-spacing`

### 6. 输入框

```css
input, select, textarea {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-strong);
  padding: 5px 10px;
  font-size: 13px;
  line-height: 1.4;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: none;
}

input::placeholder, textarea::placeholder {
  color: var(--text-weaker);
}
```

### 7. Provider 卡片

```css
.provider-card {
  background: var(--bg-raised);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  gap: 8px;
}
.provider-card.is-active {
  border-color: var(--accent);
}

.provider-card-heading {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
}

.state-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-overlay);
  color: var(--text-weak);
}
.provider-state-success { background: var(--success-surface); color: var(--success); }
.provider-state-error   { background: var(--danger-surface);  color: var(--danger); }
```

### 8. 区域标签（Eyebrow）

```css
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-weak);
  font-family: var(--font-ui);
}
```

### 9. 滚动条

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }
```

### 10. 状态横幅

```css
.status-banner {
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 12px;
  border: 1px solid;
}
.status-success { background: var(--success-surface); border-color: var(--success); color: var(--success); }
.status-error   { background: var(--danger-surface);  border-color: var(--danger);  color: var(--danger); }
.status-info    { background: var(--info-surface);    border-color: var(--info);    color: var(--info); }
```

### 11. 弹窗 / Modal

```css
.dialog-overlay { background: rgba(0,0,0,0.5); }
.dialog-panel {
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-dialog);
  box-shadow: var(--shadow-dropdown);
  padding: 20px 24px;
  max-width: 500px;
}
```

### 12. 文件树（左面板）

```css
.file-explorer {
  background: var(--bg-surface);
  border-right: 1px solid var(--border-base);
  font-size: 13px;
}

.file-explorer-breadcrumb {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-weak);
  border-bottom: 1px solid var(--border-base);
}

.file-explorer-entry {
  padding: 3px 12px;
  line-height: 22px;
  cursor: pointer;
  color: var(--text-base);
}
.file-explorer-entry:hover { background: var(--bg-raised-hover); }
.file-explorer-entry.is-selected { background: var(--bg-overlay); color: var(--text-strong); }
.file-explorer-entry.is-directory { font-weight: 500; }
```

### 13. 聊天面板（右面板）

```css
.chat-panel {
  background: var(--bg-base);
  border-left: 1px solid var(--border-base);
}

.chat-message-user {
  background: var(--bg-raised-hover);
  border-radius: var(--radius-lg);
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
}

.chat-message-assistant {
  background: none;
  padding: 10px 0;
  font-size: 13px;
  line-height: 1.5;
}

.chat-compose {
  border-top: 1px solid var(--border-base);
  padding: 12px 16px;
  background: var(--bg-surface);
}

.chat-compose textarea {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  min-height: 40px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-strong);
}
```

### 14. 编辑器标签页 & 编辑区（中间面板）

```css
.editor-tabs {
  height: 35px;
  background: var(--bg-raised);
  display: flex;
  border-bottom: 1px solid var(--border-base);
}
.editor-tab {
  padding: 0 16px;
  height: 35px;
  line-height: 35px;
  font-size: 13px;
  color: var(--text-weak);
  border-right: 1px solid var(--border-base);
  background: var(--bg-raised);
}
.editor-tab.is-active {
  background: var(--bg-base);
  color: var(--text-strong);
}

.editor-content textarea {
  background: var(--bg-base);
  color: var(--text-strong);
  border: none;
  padding: 12px 16px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
}
```

### 15. 三栏布局

```css
.workspace-layout {
  display: flex;
  height: calc(100vh - 38px);
  background: var(--bg-base);
}
.workspace-panel-left {
  width: 240px;
  min-width: 180px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-base);
  overflow-y: auto;
}
.workspace-panel-center {
  flex: 1;
  min-width: 300px;
  background: var(--bg-base);
  overflow: hidden;
}
.workspace-panel-right {
  width: 400px;
  min-width: 280px;
  background: var(--bg-base);
  border-left: 1px solid var(--border-base);
  overflow: hidden;
}
```

---

## 主题切换实现

### CSS 结构

```css
/* 1. 共享设计系统 */
:root {
  --font-ui: ...;
  --font-mono: ...;
  --space-1 到 --space-6: ...;
  --text-xs 到 --text-xl: ...;
  --radius-sm 到 --radius-dialog: ...;
  --shadow-dropdown: ...;
  --transition-fast: ...;
  --transition-base: ...;
  /* 注意：颜色变量不在 :root 定义 */
}

/* 2. Black 主题色板 */
[data-theme="black"] {
  --bg-base: #101010;
  ... 所有颜色变量 ...
}

/* 3. OC-2 主题色板（默认） */
[data-theme="oc2"] {
  --bg-base: #1C1C1C;
  ... 所有颜色变量 ...
}

/* 4. 全部组件样式（引用变量，不写死颜色） */
```

### React 切换逻辑

在 `App.tsx` 或设置中添加：

```tsx
// 持久化到 localStorage
const [theme, setTheme] = useState<'black' | 'oc2'>(
  () => (localStorage.getItem('theme') as 'black' | 'oc2') || 'oc2'
);

useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}, [theme]);
```

设置页添加切换控件：
```tsx
<div className="theme-switcher">
  <button
    className={theme === 'black' ? 'is-active' : ''}
    onClick={() => setTheme('black')}
  >Black</button>
  <button
    className={theme === 'oc2' ? 'is-active' : ''}
    onClick={() => setTheme('oc2')}
  >OC-2</button>
</div>
```

---

## 必须删除的旧样式

1. 删除 `--font-display` 变量及所有 `font-family: var(--font-display)` 引用
2. 删除 `--bg-canvas: #f5efe6`、`--bg-canvas-deep: #ebe0d1` 及所有暖色背景
3. 删除 `--accent-warm`、`--accent-hot`、`--accent-cool` — 仅保留 `--accent`
4. 删除所有 `rgba(199,120,51,...)` / `rgba(28,122,134,...)` 硬编码色值
5. 删除 `--radius-pill: 999px` 及所有引用
6. 删除 `--shadow-float`、`--shadow-inset`、`--shadow-lg`、`--shadow-soft`
7. 删除 `body::before`（网格纹理）和 `body::after`（光晕）
8. 删除 `.brand-mark` 渐变背景
9. 删除所有 `background: radial-gradient(...)` 和 `linear-gradient(...)` 装饰
10. 删除所有 `transform: translateY(-1px)` 悬浮弹起效果
11. 删除所有关键帧动画（浮动、弹跳）
12. 删除 `--text-display: clamp(2.4rem, 4vw, 3.6rem)`
13. 将所有 `var(--surface-strong)` / `var(--surface)` / `var(--surface-soft)` 替换为 `var(--bg-raised)` / `var(--bg-surface)` 等新变量

## 约束

- 保留所有现有 CSS 类名（React 组件引用它们）
- 所有组件样式只通过 `var(--xxx)` 引用颜色，不得写死 hex
- 两套主题色值以外不允许出现任何颜色硬编码
- 结果应该看起来像 Cursor IDE — 紧凑、专业、深色、代码聚焦
- 两套主题之间切换必须即时生效，不需要刷新页面
