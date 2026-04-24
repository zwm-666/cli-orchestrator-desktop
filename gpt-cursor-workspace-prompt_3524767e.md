## Goal

Transform the app flow into: **Select Folder → Create Task → Plan → Enter Cursor-like Workspace Page**.

The workspace page has 3 panels:

* **Left**: File tree (Cursor-style, with expand/collapse, icons, search)
* **Middle**: File editor (view + edit files, with save capability)
* **Right**: Agent chat panel + multi-agent discussion mode

## Tasks

### Task 1: Folder Selection Entry Page

**File**: `src/renderer/src/pages/FolderSelectPage.tsx` (new)
**Route**: `/` (default route, replaces current direct `/work` routing)

Requirements:

* Show a centered card with "Open Project Folder" button
* Button calls a new IPC method `selectProjectFolder` which opens Electron's `dialog.showOpenDialog({ properties: \['openDirectory'] })`
* Display recent folders list (persist in continuity state as `recentFolders: string\[]`, max 5)
* Clicking a recent folder or selecting a new one saves the `projectRoot` to persistence and navigates to `/work`
* Show folder name + path for each recent entry, with a remove button

**IPC additions**:

* `src/preload/preload.ts`: Add `selectProjectFolder: () => ipcRenderer.invoke('selectProjectFolder')` to desktopApi
* `src/main/main.ts`: Add handler `ipcMain.handle('selectProjectFolder', async () => { const result = await dialog.showOpenDialog({ properties: \['openDirectory'] }); return result.canceled ? null : result.filePaths\[0]; })`
* `src/shared/ipc.ts`: Add `selectProjectFolder` to DesktopApi type

**State changes**:

* `src/main/persistence.ts`: Add `recentFolders: string\[]` to ContinuityState, normalize with `normalizeRecentFolders()`
* When a folder is selected, push it to front of `recentFolders` (dedup, cap at 5), update `projectRoot`, reload AppState

**Routing**:

* `src/renderer/src/App.tsx`: Add route `/` → `FolderSelectPage`, keep `/work` → `WorkPage`, `/config` → `ConfigPage`
* If no `projectRoot` is set in persisted state, redirect to `/`
* After folder selection, navigate to `/work`

\---

### Task 2: Task Creation + Plan Review Page

**File**: `src/renderer/src/pages/PlanPage.tsx` (new)
**Route**: `/plan`

Requirements:

* After entering `/work` for the first time (or clicking "New Task"), show a task creation form:

  * Objective textarea (what do you want to accomplish?)
  * Optional: select which agents/adapters to use
  * "Generate Plan" button → calls `createPlanDraft(objective)`
* After plan is generated, display the plan as an editable checklist:

  * Each task item: title, detail (editable), status toggle
  * Reorder via drag or up/down buttons
  * Add/remove task items
  * Assign agent profile per task (dropdown)
* "Enter Workspace" button → saves plan to `WorkbenchState.taskItems`, navigates to `/work`

**Hook**: `src/renderer/src/hooks/usePlanPageController.ts` (new)

* Manages objective input, plan generation, task editing
* Calls `window.desktopApi.createPlanDraft()` for plan generation
* Calls `window.desktopApi.saveWorkbenchState()` to persist before navigation

**State flow**:

* `WorkbenchState.objective` ← user's objective text
* `WorkbenchState.taskItems` ← approved plan checklist
* On entering `/work`, the task board panel shows these pre-filled tasks

\---

### Task 3: File Editor (Middle Panel)

**File**: `src/renderer/src/components/FileEditor.tsx` (new)
Replace `FilePreview.tsx` usage in `WorkPage.tsx` with `FileEditor.tsx`.

Requirements:

* Display file content in a `<textarea>` with monospace font, line numbers gutter
* Track dirty state (modified vs saved)
* "Save" button (or Ctrl+S keyboard shortcut) → calls new IPC `writeWorkspaceFile`
* Show file path breadcrumb at top
* Show file size + language indicator
* For binary/unsupported files, fall back to read-only preview with message
* Truncation: if file was truncated on load, show warning banner "File truncated at 256KB — edits will only affect loaded content"

**IPC additions**:

* `writeWorkspaceFile` channel: `{ relativePath: string, content: string }` → writes to `path.join(projectRoot, relativePath)`, returns `{ success: boolean, error?: string }`
* Add to preload, main handler, and ipc types
* Validate path doesn't escape projectRoot (no `..` traversal)

**Integration**:

* `WorkPage.tsx`: Replace `<FilePreview>` with `<FileEditor>` in the middle panel
* When user saves, refresh the file entry in workspace browse result (update size/mtime)
* Include saved file content in continuity prompt (already handled by `useWorkbenchWorkspace`)

\---

### Task 4: Enhanced File Tree (Left Panel)

**File**: Modify `src/renderer/src/components/FileExplorer.tsx`

Requirements:

* Convert flat directory listing to a **tree view** with expand/collapse:

  * Click directory → expand inline (don't navigate away), show children indented
  * Track expanded directories in local state: `expandedPaths: Set<string>`
  * Lazy-load children on first expand via `browseWorkspace`
* Add file type icons (folder icon, code file icon, config icon, image icon — use Unicode or simple CSS)
* Highlight currently open file
* Right-click context menu: "Open", "Copy Path", "Copy Relative Path"
* Recursive search: when search query is entered, call a new IPC `searchWorkspaceFiles` that does recursive filename matching
* Collapse all / Expand all buttons in header

**IPC addition** (optional but recommended):

* `searchWorkspaceFiles`: `{ query: string, maxResults: number }` → returns `WorkspaceEntry\[]` matching filename pattern recursively
* Implementation: recursive `fs.readdir` with ignore rules, match against query, cap results

\---

### Task 5: Agent Chat Panel Improvements (Right Panel)

**File**: Modify `src/renderer/src/components/ChatPanel.tsx`

Requirements:

* **In-conversation provider switching**: Add a dropdown at the top of the chat panel to switch provider/model without leaving the page. Messages retain metadata `{ providerId, model }` per message so history shows which model answered.
* **Message streaming**: Use `ReadableStream` or SSE for OpenAI-compatible providers. For Anthropic, use their streaming format. Add `streamProviderChat()` to `providerApi.ts` that yields chunks. Update ChatPanel to render partial assistant messages.
* **Multi-file context**: Allow selecting multiple files from FileExplorer (checkbox mode). Inject all selected files into continuity prompt under `<SELECTED\_FILES>` section.
* **Copy/retry actions on messages**: Each assistant message gets "Copy" and "Retry" buttons on hover.

**Type changes**:

* `ChatMessage` in `workbenchControllerShared.ts`: Add `providerId?: AiProviderId`, `model?: string` fields

\---

### Task 6: Multi-Agent Discussion Mode

**File**: `src/renderer/src/components/DiscussionPanel.tsx` (new)
**Hook**: `src/renderer/src/hooks/useDiscussionMode.ts` (new)

Requirements:

* Toggle between "Chat" and "Discussion" tabs in the right panel
* Discussion mode setup:

  * Select 2-5 agent profiles to participate
  * Set a discussion topic/objective
  * Choose round limit (default 5 rounds)
  * Optional: set consensus keywords that end discussion early
* Execution:

  * Round-robin: each agent sends a message in order
  * Each agent sees full conversation history + its own system prompt (from AgentProfile)
  * Use the agent's assigned provider/model for each turn
  * After each round, check for consensus keywords in latest messages
  * Show which agent is "speaking" with a label/avatar
* Display:

  * Thread view with agent name + role badge on each message
  * Pause/Resume/Stop controls
  * "Summarize Discussion" button → sends full transcript to active provider with summarization prompt
* State: Discussion state persisted in `WorkbenchState.discussions: DiscussionSession\[]`

**Type additions** in `domain.ts`:

```typescript
interface DiscussionSession {
  id: string;
  topic: string;
  participantProfileIds: string\[];
  rounds: DiscussionRound\[];
  status: 'setup' | 'running' | 'paused' | 'completed';
  maxRounds: number;
  consensusKeywords: string\[];
  createdAt: string;
}

interface DiscussionRound {
  roundNumber: number;
  messages: DiscussionMessage\[];
}

interface DiscussionMessage {
  agentProfileId: string;
  agentRole: AgentRoleType;
  providerId: AiProviderId;
  model: string;
  content: string;
  timestamp: string;
}
```

\---

### Task 7: Layout \& Routing Integration

**File**: Modify `src/renderer/src/pages/WorkPage.tsx`

Requirements:

* 3-panel resizable layout:

  * Left panel: `FileExplorer` (tree mode), width \~250px, collapsible
  * Middle panel: `FileEditor`, flex-grow
  * Right panel: `ChatPanel` / `DiscussionPanel` (tabbed), width \~400px, collapsible
  * Use CSS `resize` or a drag handle between panels
* Top bar: Show current project folder name, breadcrumb, and "Change Folder" link (→ `/`)
* Bottom status bar: Active provider/model, connection status, task progress count

**File**: Modify `src/renderer/src/App.tsx`

Routes:

```
/          → FolderSelectPage (no sidebar)
/plan      → PlanPage (no sidebar)
/work      → WorkPage (3-panel layout, sidebar optional)
/config    → ConfigPage (with sidebar)
/sessions  → SessionsPage (with sidebar)
```

Guard: If `projectRoot` is empty/null, redirect all routes except `/` to `/`.

\---

### Task 8: CSS Layout

**File**: Modify `src/renderer/src/styles.css`

Add classes:

```css
/\* 3-panel workspace layout \*/
.workspace-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.workspace-panel-left {
  width: 260px;
  min-width: 180px;
  max-width: 400px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  resize: horizontal;
}

.workspace-panel-center {
  flex: 1;
  min-width: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workspace-panel-right {
  width: 400px;
  min-width: 280px;
  max-width: 600px;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  resize: horizontal;
}

/\* File tree styles \*/
.file-tree-node { padding-left: calc(var(--depth) \* 16px); }
.file-tree-node.is-directory > .file-tree-label { font-weight: 500; }
.file-tree-node.is-selected { background: var(--selection-bg); }
.file-tree-toggle { width: 16px; cursor: pointer; }

/\* Editor styles \*/
.file-editor-area {
  flex: 1;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
  border: none;
  resize: none;
  tab-size: 2;
}

.file-editor-dirty-indicator { color: var(--warning-color); }

/\* Discussion mode \*/
.discussion-message { border-left: 3px solid var(--agent-color); padding-left: 12px; }
.discussion-agent-badge { font-size: 11px; font-weight: 600; text-transform: uppercase; }
```

\---

## Execution Order

1. Task 1 (Folder Selection) — foundational, gates everything else
2. Task 7 (Routing) — wire up the page flow
3. Task 4 (File Tree) — left panel
4. Task 3 (File Editor) — middle panel
5. Task 5 (Chat Improvements) — right panel basics
6. Task 2 (Plan Page) — optional intermediate step
7. Task 6 (Discussion Mode) — advanced feature
8. Task 8 (CSS) — polish throughout

## Constraints

* Do not break existing orchestration or adapter functionality
* All new IPC channels must have path traversal protection
* File writes must validate content size (reject > 10MB)
* Discussion mode must respect per-agent provider/model assignments
* Maintain bilingual support (zh/en) for all new UI strings using existing `locale` pattern
* All new state must be normalized in `persistence.ts` with safe defaults
* Use existing hook architecture pattern — low-level hooks composed by high-level controller

