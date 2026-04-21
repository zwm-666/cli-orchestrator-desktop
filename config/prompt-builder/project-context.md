# 项目上下文

## 项目定位
这是一个 Electron + React + TypeScript 桌面应用，用于统一编排本地 AI CLI 工具与 Hosted Provider，并提供 Work / Config 两页工作流。

## 技术栈
- Electron
- React 18
- Vite
- TypeScript
- Node built-in test runner (`node:test`)

## 运行边界
- `src/main/`：主进程 / 后端服务 / 文件与系统能力
- `src/preload/`：IPC bridge，保持轻薄
- `src/renderer/`：前端 UI
- `src/shared/`：共享类型与 IPC 合同

## 当前主要页面
- Work 页面：统一工作台
- Config 页面：配置中心

## 当前已有能力
- Hosted Provider 配置
- Local Tools / Adapters 配置
- Skills 项目级管理
- Workbench 共享任务清单
- Continuity Prompt 自动生成
- 本地工具运行摘要 / Provider 摘要
- Windows 本地工具 discovery 修复基础能力

## 当前工作原则
- 不推倒重来
- 优先在现有结构基础上继续演进
- 优先修复、补齐、拆分、收尾
- 保持行为稳定

## 当前代码组织倾向
- 页面文件负责组装
- 复杂状态和业务逻辑放到 hooks / controller
- 展示区块拆成独立组件
- shared / main / preload / renderer 边界明确
