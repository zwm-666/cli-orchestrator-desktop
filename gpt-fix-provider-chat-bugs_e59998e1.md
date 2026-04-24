# GPT 修复指令：Provider/Model 切换失效 + Agent 无法回复

## 项目路径
`cli-orchestrator-desktop`，Electron + React 18 + TypeScript

## Bug 1: Provider 切换和 Model 输入被循环覆盖

### 文件: `src/renderer/src/hooks/useWorkbenchController.ts`

**问题**：第 114-119 行的 `useEffect` 把 `selectedProviderId` 列为依赖，同时又在内部 set 它，导致用户切换 provider 后立刻被覆盖回 `aiConfig.active_provider`。model 同理。

**修复**：删除这个 effect，改为仅在 `aiConfig` 首次加载时同步：

```typescript
// 删除第 114-119 行的整个 useEffect

// 将第 76 行改为：初始化时直接从 aiConfig 取值，之后不再自动同步
const [selectedProviderId, setSelectedProviderId] = useState<string>(aiConfig.active_provider ?? '');
const [targetModel, setTargetModel] = useState(aiConfig.active_model);
// 这两行已经存在，保持不动。关键是删除那个 useEffect。
```

**同时修复 `handleProviderChange`**（第 222-227 行），切换 provider 时应使用该 provider 的 modelSuggestions 而不是全局 active_model：

```typescript
const handleProviderChange = (nextProviderId: string): void => {
  setSelectedProviderId(nextProviderId);
  if (!nextProviderId) {
    setTargetModel('');
    return;
  }
  const definition = getProviderDefinition(nextProviderId as Parameters<typeof getProviderDefinition>[0]);
  // 优先用该 provider 的默认模型，而不是全局 active_model
  setTargetModel(definition.modelSuggestions[0] || '');
};
```

同理修复 `handleTargetKindChange`（第 208-220 行）：

```typescript
const handleTargetKindChange = (nextKind: WorkbenchTargetKind): void => {
  setSelectedTargetKind(nextKind);
  if (nextKind === 'provider') {
    // 保持当前 selectedProviderId 不变，不要覆盖回 aiConfig.active_provider
    if (!selectedProviderId && aiConfig.active_provider) {
      setSelectedProviderId(aiConfig.active_provider);
    }
    // 只有当 targetModel 为空时才设默认值
    if (!targetModel && aiConfig.active_model) {
      setTargetModel(aiConfig.active_model);
    }
    return;
  }
  if (availableAdapters[0]) {
    setSelectedAdapterId((current) => current || availableAdapters[0]?.id || '');
    setTargetModel(selectedAdapter?.defaultModel ?? availableAdapters[0].defaultModel ?? '');
  }
};
```

---

## Bug 2: Agent 不回复 — Chat 输入框被 continuity prompt 持续覆盖

### 文件: `src/renderer/src/hooks/useWorkbenchController.ts`

**问题**：第 180-182 行：
```typescript
useEffect(() => {
  setTargetPrompt(continuityPrompt);
}, [continuityPrompt]);
```

`continuityPrompt` 是一个由 `useMemo` 生成的完整上下文文档（包含目标、任务清单、文件上下文等），依赖十几个变量。任何依赖变化都会重新生成 prompt 并覆盖用户在输入框里的编辑。

用户输入 → `setTargetPrompt` 更新 → 某个依赖变化 → `continuityPrompt` 重算 → `setTargetPrompt(continuityPrompt)` 覆盖用户输入。

**修复思路**：将 continuity prompt 作为 system message 的一部分自动注入，而不是作为用户可编辑的输入框内容。Chat 输入框应该是用户自由输入的消息。

### 步骤 1: 修改 `useWorkbenchController.ts`

删除第 180-182 行的 `useEffect`。

新增一个独立的 `userInput` state 给用户自由输入：

```typescript
// 在第 79 行 targetPrompt 下面添加
const [userInput, setUserInput] = useState('');
```

将 `continuityPrompt` 作为上下文但不放进输入框。在 return 对象中添加：

```typescript
return {
  ...existingReturn,
  userInput,
  setUserInput,
  continuityPrompt, // 暴露给 UI 显示但不作为输入值
};
```

### 步骤 2: 修改 `useWorkbenchProviderFlow.ts`

在 input 接口中添加 `continuityPrompt: string` 字段（替代 `targetPrompt` 的上下文注入功能）。

修改 `handleProviderSend`：
- `targetPrompt` 改名为 `userInput`（用户实际输入的内容）
- `continuityPrompt` 作为 system message 注入

```typescript
const handleProviderSend = async (): Promise<void> => {
  // ... validation ...

  const trimmedInput = userInput.trim();  // 用户的实际输入
  if (!trimmedInput) {
    setChatError(locale === 'zh' ? '请输入消息。' : 'Please enter a message.');
    return;
  }

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmedInput,  // 只显示用户输入的内容
  };

  setChatMessages((current) => [...current, userMessage]);
  setIsSending(true);
  setChatError(null);

  try {
    const response = await sendProviderChat(
      selectedProviderDefinition.id,
      selectedProviderConfig,
      targetModel,
      [
        {
          role: 'system',
          content: continuityPrompt + (skillPrompt ? `\n\n${skillPrompt}` : ''),  // 上下文注入到 system
        },
        ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
        {
          role: 'user',
          content: trimmedInput + selectedFileContext,  // 用户消息
        },
      ],
    );
    // ... 后续不变 ...
  }
};
```

### 步骤 3: 修改 `WorkPage.tsx` 和 `ChatPanel.tsx`

WorkPage.tsx 中 ChatPanel 的 props：

```tsx
<ChatPanel
  locale={locale}
  messages={chatMessages}
  inputValue={userInput}           // 改为 userInput
  isSending={isSending}
  canSend={providerReady}
  isProviderReady={providerReady}
  includeSelection={Boolean(selectedFile)}
  errorMessage={chatError}
  selectedFilePath={selectedFile?.relativePath ?? null}
  providerLabel={selectedProviderDefinition?.label ?? null}
  modelLabel={targetModel || null}
  onInputChange={setUserInput}     // 改为 setUserInput
  onIncludeSelectionChange={() => {}}
  onSubmit={() => { void handleProviderSend(); }}
/>
```

ChatPanel.tsx 中输入框 placeholder 改为更自然的聊天提示：

```tsx
placeholder={locale === 'zh' ? '输入消息...' : 'Type a message...'}
```

### 步骤 4: 发送后清空用户输入

在 `useWorkbenchProviderFlow.ts` 的 `handleProviderSend` 成功后，清空用户输入。

在 input 接口新增 `setUserInput: (value: string) => void`。

在 `setChatMessages` 添加 assistant response 之后：

```typescript
setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: cleanedResponse || response }]);
setUserInput('');  // 清空输入框
```

---

## Bug 3: Provider 未配置时静默失败

### 文件: `src/renderer/src/hooks/useWorkbenchProviderFlow.ts`

**问题**：第 54-56 行：
```typescript
if (!selectedProviderId || !selectedProviderConfig || !selectedProviderDefinition) {
  return;  // 静默返回，用户无反馈
}
```

**修复**：给用户提示：

```typescript
if (!selectedProviderId || !selectedProviderConfig || !selectedProviderDefinition) {
  setChatError(locale === 'zh' ? '请先选择一个模型服务。' : 'Please select a provider first.');
  return;
}
```

---

## 总结：需要改动的文件

| 文件 | 改动 |
|------|------|
| `src/renderer/src/hooks/useWorkbenchController.ts` | 删除 L114-119 的 useEffect；删除 L180-182 的 useEffect；新增 `userInput` state；修复 `handleProviderChange` 和 `handleTargetKindChange` |
| `src/renderer/src/hooks/useWorkbenchProviderFlow.ts` | input 新增 `continuityPrompt` 和 `setUserInput`；`handleProviderSend` 使用 `userInput` 替代 `targetPrompt`；成功后清空输入；静默失败改为显示错误 |
| `src/renderer/src/pages/WorkPage.tsx` | ChatPanel 的 `inputValue` 改绑 `userInput`，`onInputChange` 改绑 `setUserInput` |
| `src/renderer/src/components/ChatPanel.tsx` | placeholder 文案调整（可选） |

修改后的行为：
1. 用户在 dialog 里切 provider → 立即生效，不被覆盖
2. 用户输入 model 名 → 立即生效，不被覆盖
3. Chat 输入框显示用户自己的消息，不再被 continuity prompt 填充
4. Continuity prompt 自动注入到 system message，用户无感
5. 发送后输入框自动清空，assistant 回复正常显示
6. 未选 provider 时点发送会提示错误而非静默失败
