# Multi-Agent / Skill / MCP Implementation Guide

## 1. Objective

The project already has a solid foundation: a desktop shell, local CLI adapters, a local planner, and single-run execution. However, it has not yet reached the stage where a master agent can coordinate multiple collaborating agents.

This document is intended to answer four questions:

1. What has already been built in this project.
2. What is still missing to support a master agent that splits work across multiple AIs.
3. How the system should evolve from the current codebase instead of being rebuilt from scratch.
4. Which files and stages should be prioritized during implementation.

---

## 2. What Has Already Been Built

### 2.1 Product Foundation

- The project is an Electron + TypeScript + React desktop application.
- The main process, preload layer, renderer, and shared domain boundaries are already clear.
- Local persistence already exists for app state, routing settings, and UI continuity state.

Relevant files:

- `src/main/main.ts`: main process bootstrapping and IPC registration.
- `src/main/persistence.ts`: local persistence, recovery, and normalization.
- `src/shared/domain.ts`: shared type definitions.
- `src/shared/ipc.ts`: IPC contracts.

### 2.2 Adapter Management Already Exists

The project already has a useful abstraction for local CLI adapters. This is important because multi-agent support does not need a brand-new execution layer.

Current capabilities include:

- Declarative adapter configuration via `config/adapters.json`.
- Separation between `user` and `internal` adapters.
- Local CLI discovery on the machine.
- Adapter availability, readiness, and health evaluation.
- Settings UI support for enable/disable, default model, and custom command override.

This is effectively the first version of an execution registry.

Relevant files:

- `config/adapters.json`
- `src/main/orchestratorService.ts:861`
- `src/main/orchestratorService.ts:1131`
- `src/main/orchestratorService.ts:1231`
- `src/renderer/src/SettingsPage.tsx:67`

### 2.3 A Local Planner and Task Segmentation Already Exist

The project can already split a user request into multiple task drafts. At the moment, though, those drafts are static planning output rather than an executable multi-agent plan.

The current planner already supports:

- Segmenting input by bullets, lines, sentences, and conjunctions.
- Limiting output to at most 3 planned tasks.
- Classifying task types such as `planning`, `code`, `frontend`, `research`, `git`, and `ops`.
- Explicit `@adapter` mentions.
- Adapter and model recommendation through task type rules and task profiles.

This is already the seed of a master-agent pre-planner.

Relevant files:

- `src/main/orchestratorService.ts:591`
- `src/main/orchestratorService.ts:712`
- `src/main/orchestratorService.ts:908`
- `src/shared/domain.ts:182`
- `src/shared/domain.ts:198`
- `src/renderer/src/LaunchPage.tsx:198`

### 2.4 A Single-Task Execution Pipeline Already Exists

The system can already turn a task into a real run and track the full lifecycle:

- Create task and run records.
- Generate command preview.
- Launch external CLI processes.
- Capture stdout and stderr.
- Record transcript entries.
- Support cancel and timeout.
- Broadcast results back to the UI.

This means multi-agent execution does not need a brand-new low-level executor. The current single-run model needs to be upgraded into orchestration runs plus node-level runs.

Relevant files:

- `src/main/orchestratorService.ts:943`
- `src/main/orchestratorService.ts:1364`
- `src/main/orchestratorService.ts:1697`

### 2.5 Routing Settings and Task Category Management Already Exist

The settings page already contains two valuable configuration layers:

- Adapter-level settings: enablement, default model, custom command.
- Task-profile-level settings: custom category, base task type mapping, default adapter, and model.

This is already close to later concepts such as:

- `Agent Profile`
- `Skill Bundle`
- `Execution Policy`

That means a future design should extend the current routing/profile model instead of introducing a completely separate configuration system.

Relevant files:

- `src/shared/domain.ts:278`
- `src/renderer/src/App.tsx:236`
- `src/renderer/src/App.tsx:428`
- `src/renderer/src/App.tsx:459`
- `src/renderer/src/SettingsPage.tsx:145`

### 2.6 Real History and Real Integration Traces Already Exist

All 6 phases in `plan.md` are checked off, which indicates the project has already completed:

- Real CLI validation
- Planner output aligned with user categories
- Improved settings UX
- Task category and conversation integration
- End-to-end device testing
- Release preparation

Also, `.cli-orchestrator/desktop-state.v1.json` contains real run history rather than just demo data:

- Codex smoke runs exist.
- Transcript data is persisted.
- Routing settings are persisted.
- Failure cases were recorded.

This also exposes an important fact: real CLI integration still has version-compatibility risks. For example, historical failures show `codex exec` argument incompatibilities. Those issues will become more visible in a multi-agent system, so the architecture must include adapter capability declarations and launch-time validation.

### 2.7 There Is Already a Testing Base

The project is not an empty prototype. Core capabilities already have tests:

- `src/main/orchestratorService.test.ts`
- `src/main/persistence.test.ts`
- `src/renderer/src/helpers.test.tsx`

Existing test coverage already includes:

- Adapter discovery
- Transcript persistence
- Readiness inference
- OpenCode failure detail handling
- Persistence recovery

This matters because multi-agent work will definitely touch `domain`, `persistence`, and `orchestratorService`.

---

## 3. What Is Still Missing

The following capabilities are required for real multi-agent collaboration, but they do not exist yet in the current project.

### 3.1 There Is No Real Master Agent Yet

The current `planner` only returns a `PlanDraft`. It does not create an executable task graph and does not behave as a persistent master agent.

Missing behavior:

- No dynamic replanning based on context.
- No waiting on child results before continuing.
- No retry, reassignment, or downgrade strategy on failure.
- No final answer synthesis across multiple agent outputs.

### 3.2 There Is No Child-Agent / Worker-Agent Abstraction

The current execution unit is `RunSession`, which is essentially "one adapter executed one command", not "an agent node with a role, context, and dependencies."

Missing behavior:

- No `agent role`.
- No `parentRunId / childRunId`.
- No DAG dependency model.
- No parallel execution control.
- No join or aggregation nodes.

### 3.3 There Is No Skill Management

The skill management you described has not yet been implemented in the project model.

Missing pieces:

- Skill registry
- Skill manifest
- Applicability conditions
- Skill prompt injection
- Skill-level MCP or tool dependencies
- Skill versioning and enable/disable management

### 3.4 There Is No MCP Management

The project currently has no MCP server registry and no MCP lifecycle management.

Missing pieces:

- MCP server definitions
- Startup method and transport definition
- Tool schema caching
- Health checks
- Environment variable references
- Agent-to-MCP authorization boundaries

### 3.5 There Is No Orchestration-Level Observability

The current project only has single-run transcripts. It does not provide orchestration-level visibility.

Missing pieces:

- Which nodes were created for one user request
- Which nodes are waiting on dependencies
- Which nodes are executing in parallel
- Which nodes are blocked by missing skills or MCP bindings
- How final output was synthesized from node results

### 3.6 There Is No Multi-Agent-Specific UI

The UI is still centered around "pick one adapter and launch one run," not "inspect a task graph or agent graph."

Missing pieces:

- Orchestration graph view
- Agent node statuses
- Skill match visualization
- MCP binding visualization
- Master agent decision logs

---

## 4. Recommended Direction of Evolution

The key recommendation is this: do not throw away the current `adapter + planner + run` architecture. Upgrade it into three layers.

### 4.1 Three-Layer Model

Layer 1: `Executor Layer`

- Reuse the current adapter system.
- Responsible for actual CLI execution.
- This layer only answers "how to execute," not "why to execute."

Layer 2: `Agent Runtime Layer`

- Introduce agent profiles, skill bundles, and MCP bindings.
- An agent node still ultimately runs through an adapter.
- This layer answers "which agent runs this, with which capabilities, and with access to which tools."

Layer 3: `Orchestration Layer`

- The master agent handles decomposition, dependency ordering, parallel dispatch, retries, and result aggregation.
- This layer answers "how the whole task gets completed."

In short:

- The current project has the Executor Layer plus a weak Planner.
- The target is to add the Agent Runtime Layer and the Orchestration Layer.

---

## 5. Recommended Data Model

The first structural change should happen in `src/shared/domain.ts`. The future capabilities need to be modeled explicitly before large feature work starts.

### 5.1 New Core Types

Recommended additions:

- `AgentRoleType`
  - `master`
  - `planner`
  - `researcher`
  - `coder`
  - `reviewer`
  - `tester`
  - `custom`

- `AgentProfile`
  - `id`
  - `name`
  - `role`
  - `adapterId`
  - `model`
  - `systemPrompt`
  - `enabledSkillIds`
  - `enabledMcpServerIds`
  - `maxParallelChildren`
  - `retryPolicy`
  - `timeoutMs`
  - `enabled`

- `SkillDefinition`
  - `id`
  - `name`
  - `description`
  - `trigger`
  - `promptTemplate`
  - `allowedTaskTypes`
  - `recommendedAgentRole`
  - `requiredMcpServerIds`
  - `inputSchema`
  - `enabled`
  - `version`

- `McpServerDefinition`
  - `id`
  - `name`
  - `transport`
  - `command`
  - `args`
  - `env`
  - `toolAllowlist`
  - `healthStatus`
  - `healthReason`
  - `enabled`

- `OrchestrationRun`
  - `id`
  - `conversationId`
  - `rootPrompt`
  - `status`
  - `masterAgentProfileId`
  - `planVersion`
  - `createdAt`
  - `updatedAt`
  - `finalSummary`

- `OrchestrationNode`
  - `id`
  - `orchestrationRunId`
  - `parentNodeId`
  - `dependsOnNodeIds`
  - `agentProfileId`
  - `skillIds`
  - `mcpServerIds`
  - `taskType`
  - `title`
  - `prompt`
  - `status`
  - `runId`
  - `resultSummary`
  - `resultPayload`
  - `retryCount`

### 5.2 Relationship to Existing Types

- `CliAdapter` should remain in place.
- `Task` can gradually become a UI compatibility layer and should likely be replaced long-term by `OrchestrationNode`.
- `RunSession` should remain as the low-level execution record.
- `PlanDraft` should remain, but be repositioned as a pre-step for generating an orchestration plan.

Recommended relationship:

- One `OrchestrationRun`
- Contains multiple `OrchestrationNode`
- Each `OrchestrationNode`
- Produces one `RunSession` when executed

---

## 6. Recommended Service Decomposition

`src/main/orchestratorService.ts` is currently too centralized. Before implementing multi-agent orchestration, service boundaries should be clarified.

Recommended additions:

- `src/main/services/adapterRegistryService.ts`
  - Reads `config/adapters.json`
  - Handles discovery, readiness, and custom command overrides

- `src/main/services/plannerService.ts`
  - Owns `segmentPlannerInput`
  - Owns `buildPlanTaskDraft`
  - Owns planner versioning

- `src/main/services/skillRegistryService.ts`
  - Owns skill manifest loading, validation, enablement, and matching

- `src/main/services/mcpRegistryService.ts`
  - Owns MCP server definitions, health checks, capability loading, and connection policy

- `src/main/services/agentRegistryService.ts`
  - Owns agent profile loading, validation, routing, and defaults

- `src/main/services/orchestrationPlannerService.ts`
  - Converts a user request into `OrchestrationRun + OrchestrationNode[]`
  - Decides which nodes can run in parallel and which must be serialized

- `src/main/services/orchestrationExecutionService.ts`
  - Schedules nodes
  - Maintains dependency state
  - Starts, cancels, and retries nodes
  - Reacts to node completion and unlocks downstream nodes

- `src/main/services/resultAggregationService.ts`
  - Aggregates outputs from child agents
  - Produces final summary output
  - Handles partial-failure-but-continue policies

Short term, these do not all need to be split into separate files immediately, but the logic boundaries should follow this shape.

---

## 7. How Skill Management Should Work

### 7.1 What a Skill Should Mean

A skill should not be just a label. It should be a reusable task-handling template.

At minimum, each skill should define three things:

1. When it should trigger.
2. How it should rewrite or enrich the prompt.
3. What tool or MCP capabilities it requires.

Examples:

- `code-implementation`
- `bug-debugging`
- `frontend-polish`
- `repo-research`
- `test-writing`
- `code-review`

### 7.2 How Skills Should Be Stored

Recommended configuration file:

- `config/skills.json`

Each skill definition should include:

- Metadata
- Trigger keywords or task types
- Prompt template
- Applicable agent roles
- Whether it requires serialized execution
- Whether it requires MCP

After the master agent splits a request, it should perform two decisions per node:

1. Which agent role should execute this node.
2. Which skills should be attached to this node.

### 7.3 Skill Injection Strategy

Skills should not be frontend-only labels. They must enter the execution context.

Recommended prompt assembly order:

1. Global system instruction
2. `AgentProfile.systemPrompt`
3. `SkillDefinition.promptTemplate`
4. Original user task segment
5. Upstream node result summaries
6. MCP tool instructions
7. Output format constraints

That is what makes skills actually change agent behavior.

---

## 8. How MCP Management Should Work

### 8.1 What MCP Should Mean

MCP should not be treated as part of adapters.

- Adapters answer "which model or CLI executes this."
- MCP answers "which tools are accessible during execution."

Those are different concerns and should be modeled separately.

### 8.2 Recommended Configuration

Recommended file:

- `config/mcp-servers.json`

Each server should include at least:

- `id`
- `name`
- `transport`
- `command`
- `args`
- `env`
- `toolAllowlist`
- `enabled`

### 8.3 Required Runtime Capabilities

At minimum:

- Manual enable/disable and start/stop
- Health checks
- Tool list caching
- Connection failure diagnostics
- Agent-profile MCP bindings
- Skill-level MCP dependencies

Recommended policy:

- The master agent should not automatically inherit every MCP server.
- `AgentProfile` defines the default MCP set.
- `SkillDefinition.requiredMcpServerIds` adds required MCP dependencies.
- Before execution, the node computes the actual effective binding set from those constraints.

This gives proper control and avoids giving every agent access to every tool by default.

---

## 9. Master Agent Orchestration Flow

Recommended high-level flow:

### 9.1 Request Intake

After the user submits input, the flow should no longer be only `createPlanDraft -> apply -> startRun`.

Instead:

1. Create `OrchestrationRun`
2. Call `orchestrationPlannerService`
3. Generate multiple `OrchestrationNode`
4. Assign dependencies, recommended agent profiles, skills, and MCP requirements

### 9.2 Planning Phase

The master agent should initially output an execution graph rather than a final answer.

Example:

- Node A: clarification / task decomposition
- Node B: codebase research
- Node C: implementation
- Node D: testing
- Node E: aggregation

Possible dependency behavior:

- B and C may be serialized
- research and solution planning may run in parallel
- the aggregation node must wait for all required upstream nodes

### 9.3 Execution Phase

The executor should pick nodes whose dependencies are satisfied:

- Nodes with no dependencies can run immediately.
- Nodes whose dependencies are complete become ready.
- Once `maxParallelChildren` is reached, no more child dispatch should happen until capacity frees up.

When a node starts:

1. Resolve the agent profile
2. Assemble skill prompts
3. Bind MCP servers
4. Build the final prompt
5. Execute through the underlying adapter

### 9.4 Aggregation Phase

The master agent should not simply dump raw node outputs. It should execute a final aggregation node:

- Gather node summaries
- Mark success, failure, and skipped states
- Produce the final answer
- List unfinished items and risks

---

## 10. Recommended UI Changes

The current LaunchPage and SessionsPage work for single-run workflows. To support multi-agent workflows, the UI should evolve incrementally.

### 10.1 Launch Page

Add a mode switch:

- `Single Run`
- `Orchestration Run`

This preserves the existing direct adapter launch workflow.

### 10.2 Add an Orchestration View

Recommended new page:

- `src/renderer/src/OrchestrationPage.tsx`

Suggested contents:

- Master agent summary
- Node list or DAG summary
- Agent / skill / MCP binding per node
- Node statuses
- Node result summaries

### 10.3 Settings Page

Add three settings sections:

1. `Agent Profiles`
2. `Skills`
3. `MCP Servers`

The existing SettingsPage already has the right interaction style through adapter settings and task profiles, so this should extend the current design rather than replace it.

---

## 11. Recommended Implementation Order

Do not try to build everything at once. A staged rollout is safer.

### Phase 1: Extend Domain and Persistence First

Goal:

- Make the data model support orchestration before building UI.

Work items:

- Extend `src/shared/domain.ts`
- Extend `src/shared/ipc.ts`
- Extend `src/main/persistence.ts`
- Add normalization and recovery logic for the new schema

Done when:

- `AgentProfile`, `SkillDefinition`, and `McpServerDefinition` can be persisted
- `OrchestrationRun` and `OrchestrationNode` can be persisted

### Phase 2: Upgrade Planner from PlanDraft to Execution Plan

Goal:

- Make the planner output executable nodes rather than a display-only draft.

Work items:

- Extract `segmentPlannerInput` and `buildPlanTaskDraft` into a dedicated service
- Add `buildExecutionPlan`
- Make the planner assign agent roles, skills, and MCP needs

Done when:

- A complex request can produce 2 to 5 nodes with dependency relationships

### Phase 3: Upgrade Run Execution into an Orchestration Scheduler

Goal:

- Keep `RunSession`, but add orchestration-level scheduling above it.

Work items:

- Add orchestration run state machine
- Schedule ready nodes
- Trigger downstream nodes when upstream nodes finish
- Support cancellation of the entire orchestration

Done when:

- One user request can trigger multiple low-level runs
- Each run can be mapped back to its owning node

### Phase 4: Introduce the Skill Registry

Goal:

- Route nodes with skill context, not just task type.

Work items:

- Add `config/skills.json`
- Add skill matching and prompt injection
- Record matched skills on orchestration nodes

Done when:

- The same code task produces meaningfully different final prompts with and without a `debugging` skill attached

### Phase 5: Introduce the MCP Registry

Goal:

- Give agents access to tools on demand instead of globally.

Work items:

- Add `config/mcp-servers.json`
- Add server health checks
- Add agent-profile-to-MCP and skill-to-MCP bindings

Done when:

- A research agent can use search-oriented MCP
- A coder agent can use repo/file MCP
- A reviewer agent can be read-only

### Phase 6: Expand the UI

Goal:

- Let users understand what the master agent actually did.

Work items:

- Add orchestration page
- Add Agent Profiles / Skills / MCP Servers settings sections
- Add node detail drawer or panel

Done when:

- A user can inspect all nodes and statuses for one request

### Phase 7: Add Stability and Evaluation

Goal:

- Move the system from "can run" to "maintainable."

Work items:

- Retry strategy
- Fallback adapter strategy
- Node-level timeout policy
- Metrics and telemetry
- Replay testing

Done when:

- Multi-agent failure chains can be reproduced
- Common failure points can be observed by task type

---

## 12. First Files to Change

If implementation starts immediately, these should be the first files to modify:

- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/main/persistence.ts`
- `src/main/orchestratorService.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/LaunchPage.tsx`
- `src/renderer/src/SettingsPage.tsx`

Recommended new files:

- `src/main/services/plannerService.ts`
- `src/main/services/agentRegistryService.ts`
- `src/main/services/skillRegistryService.ts`
- `src/main/services/mcpRegistryService.ts`
- `src/main/services/orchestrationPlannerService.ts`
- `src/main/services/orchestrationExecutionService.ts`
- `src/main/services/resultAggregationService.ts`
- `src/renderer/src/OrchestrationPage.tsx`

Recommended new configuration files:

- `config/skills.json`
- `config/mcp-servers.json`
- Optional later: `config/agents.json`

---

## 13. Overall Assessment

This project is not at "0 to 1" for multi-agent support. It is closer to "0.45 to 1."

Why:

- The adapter abstraction already exists
- A planner seed already exists
- The run execution chain already exists
- Settings and persistence already exist
- A testing base already exists

What is truly missing is not low-level CLI execution. What is missing is:

- An orchestration data model
- Master-agent and child-agent abstractions
- A skill registry
- An MCP registry
- Orchestration-level UI and state management

So the most reasonable path is not to rewrite the project. It is to evolve `orchestratorService` from a single-task dispatcher into an orchestration kernel.

---

## 14. Recommended Next Steps

If implementation starts now, the recommended order is:

1. Extend `domain.ts` and `persistence.ts` first so the model is stable.
2. Extract planner logic and make it output an execution plan before enabling true parallel execution.
3. Add an orchestration entry point alongside `startRun` so one request can generate multiple nodes.
4. Add `skills.json` and `mcp-servers.json`.
5. Build orchestration UI last.

The reasoning is straightforward:

- If UI comes first, the data model will be rewritten repeatedly.
- If parallel execution comes first without a stable plan model, the system will get messy fast.
- If skills and MCP are tied directly to adapters too early, the system will need a refactor later.

The best sequence is:

- Model first
- Then planning
- Then execution
- Then capability management
- Then visualization
