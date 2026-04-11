/**
 * OrchestrationPage – Phase 7: Displays orchestration runs, node DAG summaries,
 * agent/skill/MCP bindings per node, node statuses, result summaries,
 * automation mode selection, project context editing, next Claude task display,
 * and structured handoff artifact display per node.
 */

import { useEffect, useState } from 'react';
import type {
  AgentProfile,
  AppState,
  CliAdapter,
  HandoffArtifact,
  McpServerDefinition,
  NextClaudeTaskState,
  OrchestrationNode,
  OrchestrationNodeStatus,
  OrchestrationRun,
  OrchestrationRunStatus,
  ProjectContextState,
  SkillDefinition,
  StartOrchestrationInput,
} from '../../shared/domain.js';
import { AGENT_ROLE_LABELS } from './copy.js';

interface OrchestrationPageProps {
  state: AppState;
  locale: 'en' | 'zh';
  enabledAdapters: CliAdapter[];
  onStartOrchestration: (input: StartOrchestrationInput) => void;
  onCancelOrchestration: (orchestrationRunId: string) => void;
  onSaveProjectContext: (summary: string) => Promise<void>;
}

const STATUS_COLORS: Record<OrchestrationRunStatus, string> = {
  planning: '#2196F3',
  executing: '#FF9800',
  aggregating: '#9C27B0',
  completed: '#4CAF50',
  failed: '#F44336',
  cancelled: '#9E9E9E',
};

const NODE_STATUS_COLORS: Record<OrchestrationNodeStatus, string> = {
  pending: '#9E9E9E',
  waiting_on_deps: '#607D8B',
  ready: '#2196F3',
  running: '#FF9800',
  completed: '#4CAF50',
  failed: '#F44336',
  skipped: '#795548',
  cancelled: '#9E9E9E',
};

const STATUS_LABELS: Record<OrchestrationRunStatus, string> = {
  planning: 'Planning',
  executing: 'Executing',
  aggregating: 'Aggregating',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const NODE_STATUS_LABELS: Record<OrchestrationNodeStatus, string> = {
  pending: 'Pending',
  waiting_on_deps: 'Waiting',
  ready: 'Ready',
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

function StatusBadge({
  status,
  colors,
  labels,
}: {
  status: string;
  colors: Record<string, string>;
  labels: Record<string, string>;
}): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#fff',
        backgroundColor: colors[status] ?? '#9E9E9E',
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Handoff Artifact Display
// ---------------------------------------------------------------------------

function HandoffArtifactSection({ artifact }: { artifact: HandoffArtifact }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '8px',
        backgroundColor: '#e8f5e9',
        borderRadius: '6px',
        border: '1px solid #c8e6c9',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#2e7d32' }}>Handoff Artifact</span>
        <button
          type="button"
          onClick={() => {
            setExpanded(!expanded);
          }}
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            cursor: 'pointer',
            border: '1px solid #a5d6a7',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: '#2e7d32',
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Always show summary line */}
      <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
        {artifact.changedFiles.length} changed file(s) · {artifact.status}
        {artifact.diffStat ? ` · ${artifact.diffStat}` : ''}
      </div>

      {expanded && (
        <div style={{ marginTop: '6px', fontSize: '12px' }}>
          {artifact.changedFiles.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: '2px' }}>Changed Files:</div>
              <div style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                {artifact.changedFiles.join('\n')}
              </div>
            </div>
          )}
          {artifact.diffStat && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: '2px' }}>Diff Stat:</div>
              <div style={{ color: '#555', fontFamily: 'monospace', fontSize: '11px' }}>{artifact.diffStat}</div>
            </div>
          )}
          {artifact.transcriptSummary && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: '2px' }}>Transcript Summary:</div>
              <div style={{ color: '#555', fontSize: '11px' }}>{artifact.transcriptSummary}</div>
            </div>
          )}
          {artifact.reviewNotes.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: '2px' }}>Review Notes:</div>
              <ul style={{ margin: '0', paddingLeft: '16px', color: '#555', fontSize: '11px' }}>
                {artifact.reviewNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#999' }}>
            Run: {artifact.runId} · Adapter: {artifact.adapterId}
            {artifact.model ? ` · Model: ${artifact.model}` : ''} · Generated:{' '}
            {new Date(artifact.generatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node Card
// ---------------------------------------------------------------------------

function NodeCard({
  node,
  agentProfiles,
  skills,
  mcpServers,
}: {
  node: OrchestrationNode;
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
}): React.JSX.Element {
  const profile = node.agentProfileId ? agentProfiles.find((p) => p.id === node.agentProfileId) : null;
  const matchedSkills = node.skillIds.map((id) => skills.find((s) => s.id === id)).filter(Boolean);
  const matchedMcp = node.mcpServerIds.map((id) => mcpServers.find((s) => s.id === id)).filter(Boolean);

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        backgroundColor: '#fafafa',
        borderLeft: `4px solid ${NODE_STATUS_COLORS[node.status]}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <strong style={{ fontSize: '14px' }}>{node.title}</strong>
        <StatusBadge status={node.status} colors={NODE_STATUS_COLORS} labels={NODE_STATUS_LABELS} />
      </div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
        Type: {node.taskType}
        {profile && (
          <>
            {' '}
            · Agent: {profile.name} ({profile.role})
          </>
        )}
        {node.adapterOverride && <> · Adapter: {node.adapterOverride}</>}
        {node.modelOverride && <> · Model: {node.modelOverride}</>}
        {node.retryCount > 0 && <> · Retries: {node.retryCount}</>}
      </div>
      {matchedSkills.length > 0 && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
          Skills: {matchedSkills.map((s) => s?.name).join(', ')}
        </div>
      )}
      {matchedMcp.length > 0 && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
          MCP: {matchedMcp.map((s) => s?.name).join(', ')}
        </div>
      )}
      {node.dependsOnNodeIds.length > 0 && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
          Depends on: {node.dependsOnNodeIds.length} node(s)
        </div>
      )}
      {node.resultSummary && (
        <div
          style={{
            fontSize: '12px',
            color: '#333',
            marginTop: '6px',
            padding: '6px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
          }}
        >
          {node.resultSummary}
        </div>
      )}
      {node.resultPayload && <HandoffArtifactSection artifact={node.resultPayload} />}
      <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
        {node.prompt.length > 120 ? `${node.prompt.slice(0, 120)}...` : node.prompt}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Context Section
// ---------------------------------------------------------------------------

function ProjectContextSection({
  projectContext,
  locale,
  onSave,
}: {
  projectContext: ProjectContextState;
  locale: 'en' | 'zh';
  onSave: (summary: string) => Promise<void>;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(projectContext.summary);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(projectContext.summary);
  }, [projectContext.summary]);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: '16px',
        border: '1px solid #d0d0d0',
        borderRadius: '8px',
        padding: '12px',
        backgroundColor: '#f9f9ff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>{locale === 'zh' ? '项目上下文' : 'Project Context'}</span>
        <button
          type="button"
          onClick={() => {
            setExpanded(!expanded);
          }}
          style={{
            fontSize: '12px',
            padding: '4px 10px',
            cursor: 'pointer',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'transparent',
          }}
        >
          {expanded ? (locale === 'zh' ? '收起' : 'Collapse') : locale === 'zh' ? '编辑' : 'Edit'}
        </button>
      </div>

      {!expanded && projectContext.summary && (
        <div style={{ fontSize: '12px', color: '#555' }}>
          {projectContext.summary.length > 200 ? `${projectContext.summary.slice(0, 200)}...` : projectContext.summary}
        </div>
      )}

      {!expanded && !projectContext.summary && (
        <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
          {locale === 'zh' ? '暂无项目上下文摘要。' : 'No project context summary set.'}
        </div>
      )}

      {projectContext.updatedAt && (
        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
          {locale === 'zh' ? '上次更新: ' : 'Last updated: '}
          {new Date(projectContext.updatedAt).toLocaleString()}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '8px' }}>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            placeholder={
              locale === 'zh'
                ? '输入项目级长期上下文摘要，用于指导未来的编排和自动化任务...'
                : 'Enter a persistent project context summary to guide future orchestration and automation tasks...'
            }
            rows={5}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '13px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={isSaving}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? (locale === 'zh' ? '保存中...' : 'Saving...') : locale === 'zh' ? '保存' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(projectContext.summary);
                setExpanded(false);
              }}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #ccc',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {locale === 'zh' ? '取消' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next Claude Task Display
// ---------------------------------------------------------------------------

function NextClaudeTaskSection({
  nextTask,
  locale,
}: {
  nextTask: NextClaudeTaskState;
  locale: 'en' | 'zh';
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (nextTask.status !== 'ready' || !nextTask.prompt) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: '16px',
        border: '1px solid #ffe0b2',
        borderRadius: '8px',
        padding: '12px',
        backgroundColor: '#fff8e1',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e65100' }}>
          {locale === 'zh' ? '下一个 Claude 任务' : 'Next Claude Task'}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              backgroundColor: '#ff9800',
              color: '#fff',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            {locale === 'zh' ? '就绪' : 'Ready'}
          </span>
          <button
            type="button"
            onClick={() => {
              setExpanded(!expanded);
            }}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              cursor: 'pointer',
              border: '1px solid #ffcc80',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: '#e65100',
            }}
          >
            {expanded ? (locale === 'zh' ? '收起' : 'Collapse') : locale === 'zh' ? '展开' : 'Expand'}
          </button>
        </div>
      </div>

      {!expanded && (
        <div style={{ fontSize: '12px', color: '#555' }}>
          {nextTask.prompt.length > 150 ? `${nextTask.prompt.slice(0, 150)}...` : nextTask.prompt}
        </div>
      )}

      {expanded && (
        <pre
          style={{
            fontSize: '12px',
            color: '#333',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            backgroundColor: '#fff3e0',
            padding: '8px',
            borderRadius: '6px',
            margin: '8px 0 0',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          {nextTask.prompt}
        </pre>
      )}

      {nextTask.generatedAt && (
        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
          {locale === 'zh' ? '生成于: ' : 'Generated: '}
          {new Date(nextTask.generatedAt).toLocaleString()}
          {nextTask.sourceOrchestrationRunId
            ? ` · ${locale === 'zh' ? '来源编排: ' : 'Source: '}${nextTask.sourceOrchestrationRunId}`
            : ''}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orchestration Run Card
// ---------------------------------------------------------------------------

function OrchestrationRunCard({
  run,
  nodes,
  agentProfiles,
  skills,
  mcpServers,
  onCancel,
}: {
  run: OrchestrationRun;
  nodes: OrchestrationNode[];
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  onCancel: (id: string) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isActive = run.status === 'planning' || run.status === 'executing' || run.status === 'aggregating';

  return (
    <div
      style={{
        border: '1px solid #d0d0d0',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '12px',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <StatusBadge status={run.status} colors={STATUS_COLORS} labels={STATUS_LABELS} />
          {run.automationMode === 'review_loop' && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                backgroundColor: '#e3f2fd',
                color: '#1565c0',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Review Loop
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#999' }}>{new Date(run.createdAt).toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isActive && (
            <button
              type="button"
              onClick={() => {
                onCancel(run.id);
              }}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                cursor: 'pointer',
                border: '1px solid #F44336',
                borderRadius: '4px',
                color: '#F44336',
                backgroundColor: 'transparent',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setExpanded(!expanded);
            }}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              cursor: 'pointer',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'transparent',
            }}
          >
            {expanded ? 'Collapse' : `Expand (${nodes.length} nodes)`}
          </button>
        </div>
      </div>

      <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
        {run.rootPrompt.length > 100 ? `${run.rootPrompt.slice(0, 100)}...` : run.rootPrompt}
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        Nodes: {nodes.filter((n) => n.status === 'completed').length}/{nodes.length} completed
        {run.currentIteration > 1 || run.maxIterations > 1 ? (
          <span style={{ marginLeft: '8px' }}>
            · Iteration {run.currentIteration}/{run.maxIterations}
          </span>
        ) : null}
        {run.stopReason && <span style={{ marginLeft: '8px', color: '#e65100' }}>· Stop: {run.stopReason}</span>}
        {run.finalSummary && (
          <span style={{ marginLeft: '8px' }}>
            · {run.finalSummary.slice(0, 80)}
            {run.finalSummary.length > 80 ? '...' : ''}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} agentProfiles={agentProfiles} skills={skills} mcpServers={mcpServers} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function OrchestrationPage({
  state,
  locale,
  enabledAdapters,
  onStartOrchestration,
  onCancelOrchestration,
  onSaveProjectContext,
}: OrchestrationPageProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [adapterOverride, setAdapterOverride] = useState('');
  const [automationMode, setAutomationMode] = useState<'standard' | 'review_loop'>('standard');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const agentProfiles = state.agentProfiles;
  const masterProfiles = agentProfiles.filter((p) => p.enabled);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsSubmitting(true);
    try {
      const input: StartOrchestrationInput = {
        prompt: prompt.trim(),
        automationMode,
        ...(selectedProfileId ? { masterAgentProfileId: selectedProfileId } : {}),
        ...(modelOverride.trim() ? { modelOverride: modelOverride.trim() } : {}),
        ...(adapterOverride ? { adapterOverride } : {}),
      };
      onStartOrchestration(input);
      setPrompt('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const orchestrationRuns = [...state.orchestrationRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        {locale === 'zh' ? '编排运行' : 'Orchestration Runs'}
      </h2>

      {/* Project Context */}
      <ProjectContextSection projectContext={state.projectContext} locale={locale} onSave={onSaveProjectContext} />

      {/* Next Claude Task */}
      <NextClaudeTaskSection nextTask={state.nextClaudeTask} locale={locale} />

      {/* New orchestration form */}
      <form
        onSubmit={(e) => {
          handleSubmit(e);
        }}
        style={{ marginBottom: '24px' }}
      >
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
            }}
            placeholder={locale === 'zh' ? '输入多步骤任务请求...' : 'Enter a multi-step task request...'}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !prompt.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              opacity: prompt.trim() ? 1 : 0.5,
            }}
          >
            {locale === 'zh' ? '开始编排' : 'Start'}
          </button>
        </div>

        {/* Agent / Mode / Adapter controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Automation mode */}
          <select
            value={automationMode}
            onChange={(e) => {
              setAutomationMode(e.target.value as 'standard' | 'review_loop');
            }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="standard">{locale === 'zh' ? '标准模式' : 'Standard'}</option>
            <option value="review_loop">{locale === 'zh' ? '评审循环' : 'Review Loop'}</option>
          </select>

          <select
            value={selectedProfileId}
            onChange={(e) => {
              setSelectedProfileId(e.target.value);
            }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="">{locale === 'zh' ? '自动选择代理' : 'Auto-select agents'}</option>
            {masterProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({AGENT_ROLE_LABELS[locale][p.role]}) — {p.adapterId}/{p.model}
              </option>
            ))}
          </select>

          <select
            value={adapterOverride}
            onChange={(e) => {
              setAdapterOverride(e.target.value);
            }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="">{locale === 'zh' ? '适配器 (跟随代理)' : 'Adapter (from profile)'}</option>
            {enabledAdapters.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setShowAdvanced(!showAdvanced);
            }}
            style={{
              padding: '6px 10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            {showAdvanced ? (locale === 'zh' ? '收起' : 'Less') : locale === 'zh' ? '模型选择' : 'Model'}
          </button>
        </div>

        {showAdvanced && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={modelOverride}
              onChange={(e) => {
                setModelOverride(e.target.value);
              }}
              placeholder={
                locale === 'zh'
                  ? '模型覆盖, 如 sonnet, gpt-5.4, o3-pro'
                  : 'Model override, e.g. sonnet, gpt-5.4, o3-pro'
              }
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
            />
          </div>
        )}
      </form>

      {/* Orchestration run list */}
      {orchestrationRuns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>
            {locale === 'zh' ? '暂无编排运行' : 'No orchestration runs yet'}
          </p>
          <p style={{ fontSize: '13px' }}>
            {locale === 'zh'
              ? '输入一个复杂请求，系统会将其分解为多个协作代理节点。'
              : 'Enter a complex request above, and the system will decompose it into multiple collaborating agent nodes.'}
          </p>
        </div>
      ) : (
        orchestrationRuns.map((run) => (
          <OrchestrationRunCard
            key={run.id}
            run={run}
            nodes={state.orchestrationNodes.filter((n) => n.orchestrationRunId === run.id)}
            agentProfiles={state.agentProfiles}
            skills={state.skills}
            mcpServers={state.mcpServers}
            onCancel={onCancelOrchestration}
          />
        ))
      )}
    </div>
  );
}
