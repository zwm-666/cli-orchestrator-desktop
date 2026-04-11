# 调试复查与修改优化建议（已更新）

> 上次更新：2026-04-11，最终主控复核完成（lint 清零，工程版可用）

## 1. 结论摘要

经过四轮修复、自动闭环 MVP 实现、自动闭环增强（真实 diff / changed files 捕获、最小 stop policy、附加测试）、自动生成 next Claude task、模型下拉，以及本轮切换为 WSL Ubuntu Claude 启动路径后，项目已经从桌面版 Claude 手工接力模式切换到可直接执行的 Ubuntu Claude 路径。

**当前状态：**

- `npx tsc --noEmit`（全量 typecheck，含 main + renderer + preload + shared）：通过，0 errors
- `npx tsc -p tsconfig.main.json`（main + shared）：通过，0 errors
- 测试：`orchestratorService.phase3.test.ts` — 14/14 通过
- 测试：`stripAnsi.test.ts` + `localizeCliMessage.test.ts` — 10/10 通过
- 测试：`persistence.test.ts` — 6/6 通过
- 测试：`orchestratorService.test.ts` — 7/10 通过（3 个 OpenCode 环境依赖测试在 WSL 中失败，属已知前置问题）
- `npm run build`：通过
- `npm run test:all`：通过
- `npm run lint`：通过，0 errors
- 模型选择：adapter-aware 模型下拉已接入
- Claude：已切换为 `wsl.exe -d Ubuntu-24.04 -- claude -p ...` 启动方式

**本轮新增/补齐：**

- `resultPayload` 持久化：`normalizeOrchestrationNode()` 已正确调用 `normalizeHandoffArtifact()`，handoff artifact 重启后不再丢失
- `adapterOverride` / `modelOverride` 持久化：`normalizeOrchestrationNode()` 现在保留可选覆盖字段
- persistence 测试扩展到 6 个，新增 adapterOverride/modelOverride 保留测试
- OrchestrationPage UI 已完整暴露：automation mode 选择、project context 编辑/保存、nextClaudeTask 展示、handoff artifact 结构化展示
- 主控复核确认：`npm run build` 与 `npm run test:all` 在当前工作树上均已通过，先前文档中的 WSL build/test 失败记录已过时
- 第十二轮 lint 收敛已产生实效：最新 `eslint .` 从 201 errors 降至 187 errors
- 第十三轮 lint 收敛继续有效：最新 `eslint .` 从 187 errors 进一步降至 122 errors
- 第十四轮 lint 收敛继续有效：最新 `eslint .` 从 122 errors 进一步降至 39 errors
- 最终主控本地修复收尾后：`eslint .` 已降至 **0 errors**

**已验证修复清单（sandbox 内确认）：**

- `orchestrationExecutionService.ts`：cancel 返回 runningRunIds、advanceOrchestration 循环修复、timeout 传播、`??` 语义修复
- `orchestratorService.ts`：projectContext 状态初始化、cancel 返回值解构、真实 handoff artifact 捕获、changedFiles / diffStat 采集
- `persistence.ts`：projectContext 持久化、automationMode/projectContextSummary/currentIteration/maxIterations/stopReason 归一化、resultPayload 默认值、nextClaudeTask 持久化
- `orchestratorService.ts`：review 节点完成后自动提炼 next Claude task
- `domain.ts`：ProjectContextState、HandoffArtifact、automationMode 等新类型（由用户本地开发添加）

**已知约束：**

- sandbox 文件系统对挂载文件有字节大小上限（等于 git commit 时的文件大小），编辑不能使文件增长
- 外部 formatter 可能添加 trailing commas 导致文件超出上限后被截断
- lint 修复（void→undefined、void operator wrap）因增加字节而无法在 sandbox 中持久化，需本地应用
- 剩余工作：lint 收尾 + 真正多轮自动继续（基于 nextClaudeTask 自动追加 revise/review 节点）

**建议验证命令：**

```bash
npm run typecheck && npm run build && npm run test:all && npm run lint
```

---

## 2. 已完成修复摘要

### 第十轮前主控复查结论（当前最新）

本轮重新对照 `debug-review-and-optimization-plan.md`、`optimization-results.md` 与实际代码后，确认项目已经具备 review-loop / handoff artifact / `nextClaudeTask` / WSL Claude 启动路径的主链路，但**文档描述与当前实现存在两处关键错位**：

#### R1. `OrchestrationPage.tsx` 的实际 UI 能力落后于文档描述

- 文档声称 orchestration 页面已支持：
  - `review_loop` / `standard` 模式切换
  - 项目级长期上下文编辑 / 保存
  - artifact 可视化
- 但当前 `src/renderer/src/OrchestrationPage.tsx` 实际仍只提供：
  - prompt 输入
  - master profile 选择
  - adapter / model override
  - start / cancel orchestration
  - 基础节点列表展示
- **缺失内容：**
  - `automationMode` 控件
  - `projectContext` 读取 / 编辑 / 保存
  - `nextClaudeTask` 展示
  - handoff artifact 的结构化展示（changed files / diff stat / review notes / transcript summary）

#### R2. `resultPayload` 的持久化存在真实缺口

- `src/main/orchestratorService.ts` 会在 review / handoff 完成后写入 node `resultPayload`
- 但 `src/main/persistence.ts` 的 `normalizeOrchestrationNode()` 当前固定返回：
  - `resultPayload: null`
- 这意味着 app 重启后 handoff artifact 会丢失
- 该问题会直接削弱：
  - artifact 可视化
  - 未来多轮自动继续
  - 基于最新 review 结果的恢复能力

#### R3. `nextClaudeTask` 生成逻辑仍耦合固定 node title

- 当前 `deriveReviewNotes()` 与 `deriveNextClaudeTask()` 都依赖：
  - `node.title === 'Review and write handoff'`
- 这在短期内可工作，但属于脆弱实现
- 由于本轮目标是增量收敛，不建议立即做大范围 planner 重构；可先保留此行为，待 UI / persistence 对齐后再最小化去耦

#### 当前建议优先级（第十一轮复核后更新）

1. ~~**补 renderer 实际可用性缺口**~~ ✅ 已完成
   - OrchestrationPage 现在暴露 review-loop / project context / next task / handoff artifact
2. ~~**补 `resultPayload` 持久化与测试**~~ ✅ 已完成
   - `normalizeHandoffArtifact()` 正确归一化，adapterOverride/modelOverride 也被保留
3. **评估 true auto-continue**
   - 基于当前 `nextClaudeTask` 自动追加 revise/review 节点
4. ~~**清理 lint（当前最高阻塞项）**~~ ✅ 已完成
   - 主控复核已确认 `npm run lint` 当前为 0 errors

#### 第十二轮 Claude 任务方向（已确定）

下一轮不再重复修 review-loop UI / persistence；这些已完成并经主控复核通过。

下一轮 Claude 只处理 **高收益 lint 收敛**，优先覆盖以下高频文件与规则：

1. `src/main/main.ts`
   - `no-floating-promises`
   - `no-misused-promises`
   - `no-confusing-void-expression`
2. `src/renderer/src/App.tsx`
   - 事件处理器 async/void 包装
   - `no-misused-promises`
   - `no-confusing-void-expression`
3. `src/renderer/src/LaunchPage.tsx`
4. `src/renderer/src/OrchestrationPage.tsx`
5. `src/renderer/src/SettingsPage.tsx`
6. `src/renderer/src/SessionsPage.tsx`
7. `src/renderer/src/Sidebar.tsx`
8. `src/shared/ipc.ts`
   - `void` 类型改为 `undefined`
9. 测试文件中的 `no-floating-promises`
   - `src/main/localizeCliMessage.test.ts`
   - `src/main/stripAnsi.test.ts`
   - `src/main/persistence.test.ts`
   - `src/main/orchestratorService.test.ts`
   - `src/main/orchestratorService.phase3.test.ts`

要求：

- 只做 lint 收敛，不做无关重构
- 每轮优先消除高频 / 机械型 lint 问题
- 修完后必须重新跑：
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:all`
  - `npm run lint`

#### 第十二轮执行结果（主控复核）

- 本轮 Claude 调用虽超时，但工作树中已产生有效增量修改
- 主控重新验证结果：
  - `npm run typecheck`：PASS
  - `npm run build`：PASS
  - `npm run test:all`：PASS
  - `npm run lint`：FAIL，**187 errors**
- 说明：
  - 这一轮已实质性降低 lint 数量（201 → 187）
  - 但仍未达到停止条件，必须继续后续 lint 收敛

#### 第十三轮 Claude 任务方向（最新）

下一轮继续只做 lint 收敛，不碰已完成的 review-loop / persistence / artifact UI 能力。

优先处理当前剩余的高频热点：

1. **测试文件的 `no-floating-promises`**
   - `src/main/localizeCliMessage.test.ts`
   - `src/main/stripAnsi.test.ts`
   - `src/main/persistence.test.ts`
   - `src/main/orchestratorService.test.ts`
   - `src/main/orchestratorService.phase3.test.ts`
2. **`src/main/main.ts`**
   - `no-confusing-void-expression`
   - `no-floating-promises`
   - `no-misused-promises`
3. **renderer 页面事件处理 lint**
   - `src/renderer/src/App.tsx`
   - `src/renderer/src/LaunchPage.tsx`
   - `src/renderer/src/OrchestrationPage.tsx`
4. **`src/renderer/src/SettingsPage.tsx`**
   - 重点处理 `no-meaningless-void-operator`
5. **其余小型安全收敛项**
   - `src/shared/ipc.ts`
   - `src/preload/preload.ts`
   - `src/renderer/src/main.tsx`

#### 第十三轮执行结果（主控复核）

- 第十三轮 Claude 同样在 shell 层超时，但留下了有效增量修改
- 主控复核后发现其一度引入 `src/main/persistence.test.ts` 的严格空值检查回归
- 已由主控做最小修复：
  - 为 `recovered.appData` 增加显式 `assert.ok(...)` 收窄
- 修复后当前验证结果：
  - `npm run typecheck`：PASS
  - `npm run build`：PASS
  - `npm run test:all`：PASS
  - `npm run lint`：FAIL，**122 errors**

#### 第十四轮 Claude 任务方向（最新）

继续只做 lint 收敛，禁止碰已完成主功能。

当前剩余热点按优先级排序：

1. **服务层/主进程安全 lint**
   - `src/main/orchestratorService.ts`
   - `src/main/persistence.ts`
   - `src/main/services/orchestrationExecutionService.ts`
   - `src/main/services/plannerService.ts`
   - `src/main/services/agentRegistryService.ts`
   - `src/main/services/mcpRegistryService.ts`
   - `src/main/services/skillRegistryService.ts`
2. **renderer 剩余页面 lint**
   - `src/renderer/src/LaunchPage.tsx`
   - `src/renderer/src/OrchestrationPage.tsx`
   - `src/renderer/src/SettingsPage.tsx`
   - `src/renderer/src/SessionsPage.tsx`
   - `src/renderer/src/App.tsx`
3. **小型孤立项**
   - `src/preload/preload.ts`
   - `src/renderer/src/main.tsx`
   - `src/renderer/src/ErrorBoundary.tsx`
   - `src/renderer/src/ErrorBoundary.test.tsx`

#### 第十四轮执行结果（主控复核）

- 第十四轮 Claude 依然在 shell 层超时，但留下了有效增量修改
- 主控复核结果：
  - `npm run typecheck`：PASS
  - `npm run build`：PASS
  - `npm run test:all`：PASS
  - `npm run lint`：FAIL，**39 errors**

#### 第十五轮 Claude 任务方向（最新）

下一轮继续只做 lint 收尾，范围缩到当前剩余文件：

1. `src/main/orchestratorService.ts`
   - 1 个 `no-non-null-assertion`
2. `src/main/persistence.ts`
   - 1 个 `no-unused-vars`
3. `src/main/services/orchestrationExecutionService.ts`
   - 少量 `no-non-null-assertion` / `prefer-optional-chain`
4. `src/renderer/src/OrchestrationPage.tsx`
   - 1 个 `no-meaningless-void-operator`
5. `src/renderer/src/SessionsPage.tsx`
   - 少量 `no-unused-vars` / `no-confusing-void-expression` / `prefer-nullish-coalescing`
6. `src/renderer/src/SettingsPage.tsx`
   - 仍是最大残余点，主要是：
     - `no-meaningless-void-operator`
     - `no-confusing-void-expression`
     - `no-unnecessary-condition`

### 最终主控收尾（不再委托 Claude review）

根据最新用户要求，最终 review/验收由主控直接完成，不再把 review intent 交给 Claude。

主控本地完成了最后一批残余 lint 修复，涉及：

- `src/main/orchestratorService.ts`
- `src/main/persistence.ts`
- `src/main/services/orchestrationExecutionService.ts`
- `src/renderer/src/OrchestrationPage.tsx`
- `src/renderer/src/SessionsPage.tsx`
- `src/renderer/src/SettingsPage.tsx`

修复类型主要包括：

- 去除残余非空断言
- 去除无意义 `void` operator
- 将 JSX 简写事件处理器改为 block body
- 将局部 `||` / 条件表达式收敛为更符合 lint 规则的写法
- 去除未使用变量

### 最终验证结果

- `npm run typecheck`：PASS
- `npm run build`：PASS
- `npm run test:all`：PASS
- `npm run lint`：PASS

### 停止条件判定

1. `typecheck` 通过 ✅
2. `build` 通过 ✅
3. `test:all` 通过 ✅
4. 文档中不再有高优先级剩余问题 ✅
5. 主控判断项目已达到“最终可用工程版” ✅
6. lint 不再阻塞（已清零） ✅

### 最终结论

项目已达到当前目标定义下的“最终可用工程版”，本轮闭环结束。

### 第一轮：阶段 A / B / C

#### A1. `src/shared/stripAnsi.ts` — 正则重写

- 将正则字面量中的控制字符改为 `new RegExp()` + `String.fromCharCode()` 构造
- 消除 `noControlCharactersInRegex` 警告

#### A2. `src/shared/ipc.ts` + `src/preload/preload.ts` — 删除类返回值契约

- `IpcResponseMap` 和 `DesktopApi` 中 delete 操作返回值从 `void` 改为 `undefined`
- 消除 `no-invalid-void-type` 报错

#### A3. `src/main/main.ts` — 异步回调修复

- `app.whenReady().then(...)` 前添加 `void` 标记
- `activate` 事件改为同步包装 + `void createMainWindow()`
- 消除部分 `no-floating-promises` / `no-misused-promises` 报错

#### A4. Renderer 页面异步事件处理

- `App.tsx`：多处异步回调改为同步包装或 async handler
- `LaunchPage.tsx`：`onPlanDraft` / `onLaunchRun` 改为同步包装
- `OrchestrationPage.tsx`：`handleSubmit` 从 fire-and-forget 逐步改到 await 语义
- `SessionsPage.tsx`：`onCancelRun` 改为同步包装

#### B1. 服务层 `||` → `??`

- `orchestratorService.ts`：回退链修复
- `orchestrationExecutionService.ts`：adapterId / model 覆盖链修复

#### B2. 服务层非空断言 → null 守卫

- `mcpRegistryService.ts`、`agentRegistryService.ts`、`skillRegistryService.ts`

#### C1. `eslint.config.js` — 配置对齐

- 将 type-checked 规则限定到 `src/**/*.{ts,tsx}` 和 `vite.config.ts`

### 第二轮：残留问题清理

#### D1-D4. 额外 `??`、非空断言、biome.json 配置

- `orchestratorService.ts`、`orchestrationExecutionService.ts`、`plannerService.ts` 修复
- `biome.json` 新增

### 第三轮：运行时风险修复 + 测试补强

#### E1. `orchestrationExecutionService.ts` — cancel 返回 runningRunIds

#### E2. `orchestratorService.ts` — cancel 终止 child runs

#### E3. `OrchestrationPage.tsx` — async prop 类型 + await

#### E4. `App.tsx` — orchestration handler 改为 async

#### E5. `main.ts` — 窗口创建错误本地收口

#### E6. `orchestrationExecutionService.ts` — advanceOrchestration 循环修复

#### E7. 新增 7 个测试

### 第四轮：残留风险修复 + 测试扩展 + lint 修复

#### F1. `orchestrationExecutionService.ts` — timeout 传播（风险 3.5）

- `dispatchReadyNodes()` 中 `onRunStart` 调用新增 `timeoutMs: agentProfile?.timeoutMs ?? null`
- 子 run 现在正确继承 AgentProfile 上的超时设置

#### F2. `orchestratorService.ts` — override 归一化（风险 3.6）

- `startOrchestration()` 中 override 判断从 `input.modelOverride ?? input.adapterOverride`（truthy check）改为 `input.modelOverride != null || input.adapterOverride != null`（显式 null 检查）
- spread 条件也改为 `hasAdapterOverride` / `hasModelOverride` 布尔变量
- 空字符串 override 现在被正确传播到所有节点

#### F3. `orchestratorService.ts` — fallback cancel 路径状态一致性（风险 3.7）

- fallback cancel 路径（orchestration 不在 active map 中时）现在同时标记所有非终态节点为 `cancelled`
- 使用 `terminalStatuses` Set 来跳过已完成/失败/跳过/取消的节点

#### F4. `OrchestrationPage.tsx` — filter(Boolean) 类型安全

- `.filter(Boolean)` 改为带类型谓词的 `.filter((s): s is SkillDefinition => s !== undefined)`
- 消除后续 `s?.name` 的可选链（改为 `s.name`），类型更精确

#### F5. `orchestratorService.phase3.test.ts` — 测试扩展至 11 个

新增 4 个测试：

8. **timeout 从 AgentProfile 传播到子 run**
9. **null timeout 正确传递**
10. **空字符串 adapterOverride 被正确使用**
11. **fallback cancel 路径返回 null 且已完成 orchestration 保持原状**

#### F6. 测试文件 lint 修复

- 消除 unsafe `as` 类型断言，改用完整的 stub 对象（`stubRunSession`、`stubTask`）
- `StartRunInput` 类型化 dispatched input 而非 anonymous object casts
- Optional 属性访问改用 `?? null` 规范化

### 第五轮：自动闭环 MVP（项目级长期上下文 + handoff artifact + review loop）

#### G1. `src/shared/domain.ts`

- 新增 `ProjectContextState`
- 新增 `HandoffArtifact`
- 为 `AppState` 增加 `projectContext`
- 为 `OrchestrationRun` 增加：
  - `automationMode`
  - `projectContextSummary`
- 为 `StartOrchestrationInput` 增加 `automationMode`

#### G2. `src/main/persistence.ts`

- 持久化 `projectContext`
- 归一化 `HandoffArtifact`
- 让项目级上下文在未来会话中自动保留

#### G3. `src/main/orchestratorService.ts`

- 新增 `getProjectContext()` / `saveProjectContext()`
- `startOrchestration()` 支持 `automationMode`
- orchestration 启动时将项目长期上下文摘要注入计划构建
- run 结束后捕获基础 handoff artifact 并写入 orchestration node

#### G4. `src/main/services/plannerService.ts`

- 新增 `review_loop` 模式
- 在该模式下生成固定链路：
  1. `Implement requested changes`
  2. `Review and write handoff`
  3. `Revise from review handoff`

#### G5. `src/main/services/orchestrationExecutionService.ts`

- 下游 prompt 现在会注入 upstream artifact 细节，而不只是 `resultSummary`

#### G6. `src/shared/ipc.ts` / `src/preload/preload.ts` / `src/main/main.ts`

- 增加项目上下文的 IPC 读写接口

#### G7. `src/renderer/src/App.tsx` / `src/renderer/src/OrchestrationPage.tsx`

- orchestration 页面新增：
  - 项目级长期上下文摘要编辑区
  - 保存按钮
  - `review_loop` / `standard` 模式切换

#### G8. 测试与验证

- `persistence.test.ts`：补项目上下文持久化测试
- `orchestratorService.phase3.test.ts`：补 review loop 计划生成测试
- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run test:all`：通过

### 第六轮：自动闭环增强（真实 diff + stop policy + 新测试）

#### H1. `src/main/orchestratorService.ts`

- run 结束后捕获真实 handoff artifact
- 使用 `git status --short --untracked-files=all` 生成 `changedFiles`
- 使用 `git diff --stat` 生成 `diffStat`
- artifact 自动回写到对应 orchestration node

#### H2. `src/main/services/orchestrationExecutionService.ts`

- 下游 prompt 现在会消费 upstream handoff artifact
- 新增 artifact 注入内容：
  - transcript summary
  - diff stat
  - changed files
  - review notes
- review-loop 达到最大迭代数时写入 `stopReason`

#### H3. `src/shared/domain.ts`

- 为 `OrchestrationRun` 补 iteration/stop policy 字段：
  - `currentIteration`
  - `maxIterations`
  - `stopReason`

#### H4. `src/main/services/plannerService.ts`

- `review_loop` 默认种子值：
  - `currentIteration = 1`
  - `maxIterations = 2`
  - `stopReason = null`

#### H5. `src/main/persistence.ts`

- 持久化 iteration/stop policy 字段
- 恢复后仍能保留 projectContext + handoff artifact + iteration metadata

#### H6. `src/main/orchestratorService.phase3.test.ts`

- 测试扩展到 13 个场景
- 新增：12. review-loop 达到 iteration limit 时写入 `stopReason` 13. planner 为 review-loop 种下默认 iteration policy

#### H7. 本轮验证结果

- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run test:all`：通过
- `lsp_diagnostics`：`.ts` / `.tsx` 均为 0 diagnostics

### 第七轮：根据 review/debug 自动生成 next Claude task

#### I1. `src/shared/domain.ts`

- 新增 / 启用 `NextClaudeTaskState`
- `AppState` 现在显式包含 `nextClaudeTask`

#### I2. `src/main/persistence.ts`

- `nextClaudeTask` 现在会持久化到本地状态文件
- 项目再次打开时不会丢失上一轮自动提炼出的 Claude 后续任务

#### I3. `src/main/orchestratorService.ts`

- review/handoff 节点结束后自动生成 `reviewNotes`
- 根据：
  - 原始目标
  - changed files
  - diff stat
  - review transcript 摘要
  - debug/optimization 文件约束
    自动生成下一轮 Claude prompt

#### I4. `src/shared/ipc.ts` / `src/preload/preload.ts` / `src/main/main.ts`

- 新增对 `projectContext` 和 `nextClaudeTask` 的访问通道

#### I5. 测试与验证

- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run test:all`：通过
- `orchestratorService.phase3.test.ts`：扩展到 14/14 通过

### 第八轮：模型下拉 + Claude 启动路径基础改造

#### J1. `config/adapters.json`

- 所有 adapter 新增：
  - `launchMode`
  - `supportedModels`
- Claude 适配器改为：
  - `command: wsl.exe`
  - `args: ["-d", "Ubuntu-24.04", "--", "claude", "-p", ...]`

#### J2. `src/shared/domain.ts`

- `CliAdapter` 新增：
  - `launchMode`
  - `supportedModels`

#### J3. `src/main/orchestratorService.ts`

- 适配器配置解析支持 `launchMode` 与 `supportedModels`
- 继续按 `cli` 模式走 discovery / launch

#### J4. `src/renderer/src/LaunchPage.tsx`

- 选中 adapter 后，如果该 adapter 提供 `supportedModels`，模型字段改为下拉
- 没有模型列表时仍退回文本输入

#### J5. `src/renderer/src/App.tsx`

- 切换 adapter 时，自动使用 adapter 的默认模型或首个支持模型回填 launch form

#### J6. 本轮验证结果

- `npm run typecheck`：通过
- `npm run build`：通过
- `lsp_diagnostics`：`.ts` / `.tsx` 均为 0 diagnostics

### 第九轮：切换到 WSL Ubuntu Claude 路径

#### K1. `config/adapters.json`

- 删除 `claude-desktop` 手工接力路径
- Claude 改为 WSL Ubuntu 启动：
  - `wsl.exe -d Ubuntu-24.04 -- claude -p --output-format text --model {{model}} {{prompt}}`

#### K2. `src/renderer/src/LaunchPage.tsx` / `src/renderer/src/OrchestrationPage.tsx` / `src/renderer/src/copy.ts`

- 删除 Claude Desktop 手工接力相关 UI 与提示
- 保留模型下拉能力

#### K3. 本轮验证结果

- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run test:all`：通过

### 第十一轮：review-loop UI 对齐 + persistence 收口

#### L1. `src/main/persistence.ts`

- `normalizeOrchestrationNode()` 已正确调用 `normalizeHandoffArtifact(value.resultPayload)`
- 新增 `adapterOverride` / `modelOverride` 可选字段归一化
- handoff artifact 重启后不再丢失

#### L2. `src/main/persistence.test.ts`

- 测试从 5 个扩展到 6 个
- 新增：`preserves adapterOverride and modelOverride on orchestration nodes`
- 验证有覆盖字段的节点恢复后保留值，无覆盖字段的节点恢复后为 `undefined`

#### L3. `src/renderer/src/OrchestrationPage.tsx`

- 已完整实现（工作树中已有）：
  - `automation mode` 选择控件（`standard` / `review_loop`）
  - `ProjectContextSection`：项目上下文读取 / 编辑 / 保存
  - `NextClaudeTaskSection`：nextClaudeTask 展示与展开
  - `HandoffArtifactSection`：structured handoff artifact 展示（changed files / diff stat / review notes / transcript summary）
  - `OrchestrationRunCard`：显示 iteration info / stop reason / review_loop badge

#### L4. `src/renderer/src/App.tsx`

- 已完整实现（工作树中已有）：
  - `onSaveProjectContext` async 回调传递到 OrchestrationPage
  - `onStartOrchestration` / `onCancelOrchestration` async 回调

#### L5. 本轮验证结果

- `npm run typecheck`：通过（0 errors）
- `npm run build:main`：通过
- `npm run build`：FAIL（`@rollup/rollup-linux-x64-gnu` 缺失，WSL 环境前置问题）
- persistence 测试：6/6 通过
- phase3 测试：14/14 通过
- orchestratorService 测试：7/10 通过（3 个 OpenCode 环境依赖测试在 WSL 中失败，属已知前置问题）
- stripAnsi + localizeCliMessage 测试：10/10 通过

---

## 3. 运行时风险状态

| 编号 | 位置                                                          | 风险                           | 状态                |
| ---- | ------------------------------------------------------------- | ------------------------------ | ------------------- |
| 3.1  | `orchestrationExecutionService.ts` + `orchestratorService.ts` | cancel 后 child runs 未终止    | ✅ 已修复           |
| 3.2  | `OrchestrationPage.tsx` + `App.tsx`                           | 重复提交窗口                   | ✅ 已修复           |
| 3.3  | `main.ts`                                                     | 窗口创建 fire-and-forget       | ✅ 已修复           |
| 3.4  | `orchestrationExecutionService.ts`                            | dep-skip 后 orchestration 卡住 | ✅ 已修复           |
| 3.5  | `orchestrationExecutionService.ts`                            | child runs 未继承 timeout 设置 | ✅ 已修复（第四轮） |
| 3.6  | `orchestratorService.ts`                                      | 空字符串 override IPC 归一化   | ✅ 已修复（第四轮） |
| 3.7  | `orchestratorService.ts`                                      | fallback cancel 节点状态不一致 | ✅ 已修复（第四轮） |

---

## 4. 测试覆盖状态

| 编号 | 场景                                        | 状态      |
| ---- | ------------------------------------------- | --------- |
| 1    | cancelOrchestration 返回 running runIds     | ✅ 已覆盖 |
| 2    | cancel 保留已完成节点                       | ✅ 已覆盖 |
| 3    | resultPayload (handoff artifact) 持久化保留 | ✅ 已覆盖 |
| 4    | 畸形 resultPayload 归一化为 null            | ✅ 已覆盖 |
| 5    | adapterOverride / modelOverride 持久化保留  | ✅ 已覆盖 |
