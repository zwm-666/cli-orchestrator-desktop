# CLI Orchestrator 六阶段实施计划

## 第 1 阶段：真实 CLI 联调

- [x] 1.1 检查本机 claude / codex / opencode 是否已安装，记录实际路径
- [x] 1.2 逐个验证 adapters.json 中的非交互参数是否正确
- [x] 1.3 修复 Windows 下 spawn 兼容问题（shell: false + .cmd 扩展名）
- [x] 1.4 处理模板空值问题（model 为空时不传 --model 参数）
- [x] 1.5 改进输出解析，给失败 run 添加人话提示
- [x] 1.6 用 node smoke adapter 验证进程管理链路无误
- [x] 1.7 用真实 CLI 各跑一条任务，确认 exit code / stdout / stderr 正确采集

## 第 2 阶段：规划结果贴近用户类别

- [x] 2.1 给 PlanTaskDraft 增加 matchedProfileId + displayCategory 字段
- [x] 2.2 createPlanDraft 路由逻辑中匹配 profile 时填充自定义 label
- [x] 2.3 前端 plan card 优先显示 displayCategory，fallback 到 base type

## 第 3 阶段：设置体验完善

- [x] 3.1 给 CliAdapter 增加 discoveryReason 字段，记录发现/未发现原因
- [x] 3.2 refreshAdapters 返回每个适配器的诊断信息
- [x] 3.3 适配器设置增加 customCommand 字段，允许手动覆盖路径
- [x] 3.4 UI 中"未发现工具"处显示原因 + 手动路径输入框

## 第 4 阶段：会话与类别打通

- [x] 4.1 Task 增加 taskType / profileId 字段
- [x] 4.2 新增查询逻辑：按类别聚合最近 N 次 run 的 adapter/model/status
- [x] 4.3 新增 IPC channel getRecentRunsByCategory
- [x] 4.4 在 settings profile 或类别视图中展示历史记录摘要

## 第 5 阶段：端到端真机调试

- [x] 5.1 完整跑通"规划 → 启动 → 切换会话 → 查看输出 → 结束"
- [x] 5.2 修复链路中发现的阻塞问题
- [x] 5.3 清理控制台错误噪音

## 第 6 阶段：发布准备

- [x] 6.1 清理开发临时文件和噪音
- [x] 6.2 确认默认配置在新环境可用
- [x] 6.3 确认项目打开方式（npm run dev 即可启动）
