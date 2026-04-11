import { useState } from 'react';
import type {
  AgentProfile,
  AgentRoleType,
  AppState,
  CliAdapter,
  Locale,
  RoutingSettings,
  TaskRoutingProfile,
  TaskType,
} from '../../shared/domain.js';
import { DEFAULT_RETRY_POLICY, TASK_TYPES } from '../../shared/domain.js';
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLES,
  COPY,
  type NewTaskProfileDraft,
  DEFAULT_NEW_TASK_PROFILE,
  HEALTH_LABELS,
  READINESS_BADGE_CLASSES,
  READINESS_LABELS,
  RUN_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './copy.js';
import { renderAdapterMetaLine } from './helpers.js';

interface SettingsPageProps {
  locale: Locale;
  state: AppState;
  routingSettings: RoutingSettings;
  userFacingAdapters: CliAdapter[];
  visibleAdapters: CliAdapter[];
  adapterById: Map<string, CliAdapter>;
  taskProfiles: TaskRoutingProfile[];
  onUpdateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
  onUpdateTaskRoutingRule: (taskType: TaskType, updates: Partial<RoutingSettings['taskTypeRules'][TaskType]>) => void;
  onUpdateTaskProfile: (profileId: string, updates: Partial<TaskRoutingProfile>) => void;
  onAddTaskProfile: (draft: NewTaskProfileDraft) => void;
  onRemoveTaskProfile: (profileId: string) => void;
  onSaveAgentProfile: (profile: AgentProfile) => void;
  onDeleteAgentProfile: (profileId: string) => void;
}

export function SettingsPage(props: SettingsPageProps): React.JSX.Element {
  const {
    locale,
    state,
    routingSettings,
    userFacingAdapters,
    visibleAdapters,
    adapterById,
    taskProfiles,
    onUpdateAdapterSetting,
    onUpdateTaskRoutingRule,
    onUpdateTaskProfile,
    onAddTaskProfile,
    onRemoveTaskProfile,
    onSaveAgentProfile,
    onDeleteAgentProfile,
  } = props;

  const copy = COPY[locale];
  const [newTaskProfile, setNewTaskProfile] = useState(DEFAULT_NEW_TASK_PROFILE);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [newProfileDraft, setNewProfileDraft] = useState({
    name: '',
    role: 'coder' as AgentRoleType,
    adapterId: '',
    model: '',
  });

  const getSupportedModels = (adapterId: string | null | undefined): string[] => {
    if (!adapterId) {
      return [];
    }

    return adapterById.get(adapterId)?.supportedModels ?? [];
  };

  const getDefaultModelForAdapter = (adapterId: string | null | undefined): string => {
    if (!adapterId) {
      return '';
    }

    return adapterById.get(adapterId)?.defaultModel ?? '';
  };

  const renderModelField = (
    value: string,
    adapterId: string | null | undefined,
    onChange: (value: string) => void,
  ): React.JSX.Element => {
    const supportedModels = getSupportedModels(adapterId);

    if (supportedModels.length > 0) {
      return (
        <select
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <option value="">{copy.useAdapterDefault}</option>
          {supportedModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        value={value}
        placeholder={copy.modelPlaceholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  };

  const handleAddTaskProfile = (): void => {
    onAddTaskProfile(newTaskProfile);
    setNewTaskProfile(DEFAULT_NEW_TASK_PROFILE);
  };

  const agentProfiles = state.agentProfiles;

  const handleAddAgentProfile = (): void => {
    const name = newProfileDraft.name.trim();
    if (!name) return;
    const profile: AgentProfile = {
      id: `profile-${crypto.randomUUID()}`,
      name,
      role: newProfileDraft.role,
      adapterId: newProfileDraft.adapterId || visibleAdapters[0]?.id || '',
      model: newProfileDraft.model,
      systemPrompt: '',
      enabledSkillIds: [],
      enabledMcpServerIds: [],
      maxParallelChildren: newProfileDraft.role === 'master' ? 3 : 1,
      retryPolicy: { ...DEFAULT_RETRY_POLICY },
      timeoutMs: null,
      enabled: true,
    };
    onSaveAgentProfile(profile);
    setNewProfileDraft({ name: '', role: 'coder', adapterId: '', model: '' });
  };

  const handleUpdateAgentProfile = (profileId: string, updates: Partial<AgentProfile>): void => {
    const existing = agentProfiles.find((p) => p.id === profileId);
    if (!existing) return;
    onSaveAgentProfile({ ...existing, ...updates });
  };

  return (
    <section className="page-layout settings-page-layout">
      <div className="page-column">
        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.adapterSettingsTitle}</h3>
            <span className="mini-meta">{userFacingAdapters.length}</span>
          </div>

          <div className="settings-stack">
            {userFacingAdapters.map((adapter) => {
              const adapterSetting = routingSettings.adapterSettings[adapter.id] ?? {
                enabled: true,
                defaultModel: adapter.defaultModel ?? '',
                customCommand: '',
              };

              return (
                <section key={adapter.id} className={`adapter-settings-row ${adapter.enabled ? '' : 'is-muted'}`}>
                  <div className="settings-row-topline">
                    <div>
                      <strong>{adapter.displayName}</strong>
                      <p>{adapter.description}</p>
                    </div>
                    <label className="toggle-field">
                      <input
                        type="checkbox"
                        checked={adapterSetting.enabled}
                        onChange={(event) => {
                          onUpdateAdapterSetting(adapter.id, { enabled: event.target.checked });
                        }}
                        disabled={adapter.availability !== 'available'}
                      />
                      <span>{adapterSetting.enabled ? copy.enabled : copy.disabled}</span>
                    </label>
                  </div>
                  <div className="badge-pair">
                    <span
                      className={`state-badge ${adapter.availability === 'available' ? 'state-succeeded' : 'state-cancelled'}`}
                    >
                      {adapter.availability === 'available' ? copy.available : copy.unavailable}
                    </span>
                    <span className={`state-badge ${READINESS_BADGE_CLASSES[adapter.readiness]}`}>
                      {READINESS_LABELS[locale][adapter.readiness]}
                    </span>
                  </div>
                  <div className="adapter-meta-list">
                    {renderAdapterMetaLine(copy.discoveryReasonLabel, adapter.discoveryReason)}
                    {renderAdapterMetaLine(copy.readinessReasonLabel, adapter.readinessReason)}
                  </div>
                  <div className="settings-grid compact-settings-grid">
                    <label className="field">
                      <span>{copy.modelLabel}</span>
                      <input
                        value={adapterSetting.defaultModel}
                        placeholder={copy.modelPlaceholder}
                        onChange={(event) => {
                          onUpdateAdapterSetting(adapter.id, { defaultModel: event.target.value });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>{copy.customCommandLabel}</span>
                      <input
                        value={adapterSetting.customCommand}
                        placeholder={copy.customCommandPlaceholder}
                        onChange={(event) => {
                          onUpdateAdapterSetting(adapter.id, { customCommand: event.target.value });
                        }}
                      />
                    </label>
                    <div className="brief-block compact-brief-block">
                      <p className="eyebrow">{copy.capabilities}</p>
                      <div className="pill-row">
                        {adapter.capabilities.map((capability) => (
                          <span key={capability} className="capability-pill">
                            {capability}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <div>
              <h3>{copy.taskProfilesTitle}</h3>
              <p className="panel-copy">{copy.taskProfilesCopy}</p>
            </div>
            <span className="mini-meta">{taskProfiles.length}</span>
          </div>

          <div className="settings-stack">
            <section className="task-profile-creator">
              <div className="settings-grid compact-settings-grid">
                <label className="field">
                  <span>{copy.taskProfileNameLabel}</span>
                  <input
                    value={newTaskProfile.label}
                    placeholder={copy.taskProfileNameLabel}
                    onChange={(event) => {
                      setNewTaskProfile((current) => ({ ...current, label: event.target.value }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{copy.taskProfileBaseTypeLabel}</span>
                  <select
                    value={newTaskProfile.taskType}
                    onChange={(event) => {
                      setNewTaskProfile((current) => ({ ...current, taskType: event.target.value as TaskType }));
                    }}
                  >
                    {TASK_TYPES.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {TASK_TYPE_LABELS[locale][taskType]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.adapterLabel}</span>
                  <select
                    value={newTaskProfile.adapterId}
                    onChange={(event) => {
                      const adapterId = event.target.value;
                      setNewTaskProfile((current) => ({
                        ...current,
                        adapterId,
                        model: getDefaultModelForAdapter(adapterId),
                      }));
                    }}
                  >
                    <option value="">{copy.useAdapterDefault}</option>
                    {visibleAdapters.map((adapter) => (
                      <option key={adapter.id} value={adapter.id}>
                        {adapter.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.modelLabel}</span>
                  {renderModelField(newTaskProfile.model, newTaskProfile.adapterId, (model) => {
                    setNewTaskProfile((current) => ({ ...current, model }));
                  })}
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={handleAddTaskProfile}>
                  {copy.taskProfileAddAction}
                </button>
              </div>
            </section>

            {taskProfiles.length === 0 ? <p className="empty-state compact">{copy.taskProfileEmpty}</p> : null}

            {taskProfiles.map((profile) => (
              <section key={profile.id} className="task-routing-row">
                <div className="settings-row-topline">
                  <div>
                    <strong>{profile.label}</strong>
                    <p>{TASK_TYPE_LABELS[locale][profile.taskType]}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      onRemoveTaskProfile(profile.id);
                    }}
                  >
                    {copy.taskProfileDelete}
                  </button>
                </div>
                <div className="settings-grid compact-settings-grid">
                  <label className="field">
                    <span>{copy.taskProfileNameLabel}</span>
                    <input
                      value={profile.label}
                      onChange={(event) => {
                        onUpdateTaskProfile(profile.id, { label: event.target.value });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{copy.taskProfileBaseTypeLabel}</span>
                    <select
                      value={profile.taskType}
                      onChange={(event) => {
                        onUpdateTaskProfile(profile.id, { taskType: event.target.value as TaskType });
                      }}
                    >
                      {TASK_TYPES.map((taskType) => (
                        <option key={taskType} value={taskType}>
                          {TASK_TYPE_LABELS[locale][taskType]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{copy.adapterLabel}</span>
                    <select
                      value={profile.adapterId ?? ''}
                      onChange={(event) => {
                        const adapterId = event.target.value || null;
                        onUpdateTaskProfile(profile.id, {
                          adapterId,
                          model: getDefaultModelForAdapter(adapterId),
                        });
                      }}
                    >
                      <option value="">{copy.useAdapterDefault}</option>
                      {visibleAdapters.map((adapter) => (
                        <option key={adapter.id} value={adapter.id}>
                          {adapter.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{copy.modelLabel}</span>
                    {renderModelField(profile.model, profile.adapterId, (model) => {
                      onUpdateTaskProfile(profile.id, { model });
                    })}
                  </label>
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={profile.enabled}
                      onChange={(event) => {
                        onUpdateTaskProfile(profile.id, { enabled: event.target.checked });
                      }}
                    />
                    <span>{profile.enabled ? copy.enabled : copy.disabled}</span>
                  </label>
                </div>
                {(() => {
                  const recentRuns = state.runs
                    .filter((run) => {
                      const task = state.tasks.find((t) => t.runId === run.id);
                      return task?.taskType === profile.taskType;
                    })
                    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                    .slice(0, 3);
                  if (recentRuns.length === 0) return null;
                  return (
                    <div className="profile-recent-runs">
                      <p className="eyebrow">{locale === 'zh' ? '最近运行' : 'Recent runs'}</p>
                      <div className="mini-run-list">
                        {recentRuns.map((run) => (
                          <span
                            key={run.id}
                            className={`state-badge state-${run.status === 'succeeded' ? 'succeeded' : run.status === 'running' ? 'running' : 'cancelled'}`}
                          >
                            {adapterById.get(run.adapterId)?.displayName ?? run.adapterId}
                            {' · '}
                            {RUN_STATUS_LABELS[locale][run.status]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </section>
            ))}
          </div>
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.taskRoutingTitle}</h3>
            <span className="mini-meta">{TASK_TYPES.length}</span>
          </div>

          <div className="settings-stack">
            {TASK_TYPES.map((taskType) => {
              const rule = routingSettings.taskTypeRules[taskType];

              return (
                <section key={taskType} className="task-routing-row subdued-row">
                  <div className="settings-row-topline">
                    <div>
                      <strong>{TASK_TYPE_LABELS[locale][taskType]}</strong>
                      <p>{copy.plannerTaskType}</p>
                    </div>
                  </div>
                  <div className="settings-grid compact-settings-grid">
                    <label className="field">
                      <span>{copy.adapterLabel}</span>
                      <select
                        value={rule.adapterId ?? ''}
                        onChange={(event) => {
                          const adapterId = event.target.value || null;
                          onUpdateTaskRoutingRule(taskType, {
                            adapterId,
                            model: getDefaultModelForAdapter(adapterId),
                          });
                        }}
                      >
                        <option value="">{copy.useAdapterDefault}</option>
                        {visibleAdapters.map((adapter) => (
                          <option key={adapter.id} value={adapter.id}>
                            {adapter.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{copy.modelLabel}</span>
                      {renderModelField(rule.model, rule.adapterId, (model) => {
                        onUpdateTaskRoutingRule(taskType, { model });
                      })}
                    </label>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <div>
              <h3>{locale === 'zh' ? '代理配置' : 'Agent Profiles'}</h3>
              <p className="panel-copy">
                {locale === 'zh'
                  ? '为编排节点配置代理角色、适配器绑定和执行策略。'
                  : 'Configure agent roles, adapter bindings, and execution policies for orchestration nodes.'}
              </p>
            </div>
            <span className="mini-meta">{agentProfiles.length}</span>
          </div>

          <div className="settings-stack">
            <section className="task-profile-creator">
              <div className="settings-grid compact-settings-grid">
                <label className="field">
                  <span>{locale === 'zh' ? '名称' : 'Name'}</span>
                  <input
                    value={newProfileDraft.name}
                    placeholder={locale === 'zh' ? '例如 My Coder' : 'e.g. My Coder'}
                    onChange={(e) => {
                      setNewProfileDraft((c) => ({ ...c, name: e.target.value }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{locale === 'zh' ? '角色' : 'Role'}</span>
                  <select
                    value={newProfileDraft.role}
                    onChange={(e) => {
                      setNewProfileDraft((c) => ({ ...c, role: e.target.value as AgentRoleType }));
                    }}
                  >
                    {AGENT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {AGENT_ROLE_LABELS[locale][role]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.adapterLabel}</span>
                  <select
                    value={newProfileDraft.adapterId}
                    onChange={(e) => {
                      const adapterId = e.target.value;
                      setNewProfileDraft((c) => ({
                        ...c,
                        adapterId,
                        model: getDefaultModelForAdapter(adapterId),
                      }));
                    }}
                  >
                    <option value="">{copy.useAdapterDefault}</option>
                    {visibleAdapters.map((adapter) => (
                      <option key={adapter.id} value={adapter.id}>
                        {adapter.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.modelLabel}</span>
                  {renderModelField(newProfileDraft.model, newProfileDraft.adapterId, (model) => {
                    setNewProfileDraft((current) => ({ ...current, model }));
                  })}
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={handleAddAgentProfile}>
                  {locale === 'zh' ? '新增代理' : 'Add profile'}
                </button>
              </div>
            </section>

            {agentProfiles.length === 0 ? (
              <p className="empty-state compact">
                {locale === 'zh'
                  ? '还没有代理配置。新增一个以启用多代理编排。'
                  : 'No agent profiles yet. Add one to enable multi-agent orchestration.'}
              </p>
            ) : null}

            {agentProfiles.map((profile) => {
              const isExpanded = expandedProfileId === profile.id;
              return (
                <section key={profile.id} className="task-routing-row">
                  <div className="settings-row-topline">
                    <div>
                      <strong>{profile.name}</strong>
                      <p>
                        {AGENT_ROLE_LABELS[locale][profile.role]} ·{' '}
                        {adapterById.get(profile.adapterId)?.displayName ?? profile.adapterId}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <label className="toggle-field">
                        <input
                          type="checkbox"
                          checked={profile.enabled}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, { enabled: e.target.checked });
                          }}
                        />
                        <span>{profile.enabled ? copy.enabled : copy.disabled}</span>
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setExpandedProfileId(isExpanded ? null : profile.id);
                        }}
                      >
                        {isExpanded ? (locale === 'zh' ? '收起' : 'Collapse') : locale === 'zh' ? '编辑' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          onDeleteAgentProfile(profile.id);
                        }}
                      >
                        {copy.taskProfileDelete}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="settings-grid compact-settings-grid" style={{ marginTop: '8px' }}>
                      <label className="field">
                        <span>{locale === 'zh' ? '名称' : 'Name'}</span>
                        <input
                          value={profile.name}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, { name: e.target.value });
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>{locale === 'zh' ? '角色' : 'Role'}</span>
                        <select
                          value={profile.role}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, { role: e.target.value as AgentRoleType });
                          }}
                        >
                          {AGENT_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {AGENT_ROLE_LABELS[locale][role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>{copy.adapterLabel}</span>
                        <select
                          value={profile.adapterId}
                          onChange={(e) => {
                            const adapterId = e.target.value;
                            handleUpdateAgentProfile(profile.id, {
                              adapterId,
                              model: getDefaultModelForAdapter(adapterId),
                            });
                          }}
                        >
                          {visibleAdapters.map((adapter) => (
                            <option key={adapter.id} value={adapter.id}>
                              {adapter.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>{copy.modelLabel}</span>
                        {renderModelField(profile.model, profile.adapterId, (model) => {
                          handleUpdateAgentProfile(profile.id, { model });
                        })}
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}>
                        <span>{locale === 'zh' ? '系统提示词' : 'System prompt'}</span>
                        <textarea
                          rows={3}
                          value={profile.systemPrompt}
                          placeholder={locale === 'zh' ? '代理行为指引...' : 'Agent behavioral instructions...'}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, { systemPrompt: e.target.value });
                          }}
                          style={{
                            width: '100%',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            padding: '6px 8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>{locale === 'zh' ? '最大并行数' : 'Max parallel'}</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={profile.maxParallelChildren}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, { maxParallelChildren: Number(e.target.value) || 1 });
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>{locale === 'zh' ? '最大重试次数' : 'Max retries'}</span>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          value={profile.retryPolicy.maxRetries}
                          onChange={(e) => {
                            handleUpdateAgentProfile(profile.id, {
                              retryPolicy: { ...profile.retryPolicy, maxRetries: Number(e.target.value) || 0 },
                            });
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>{locale === 'zh' ? '超时 (ms)' : 'Timeout (ms)'}</span>
                        <input
                          type="number"
                          min={0}
                          value={profile.timeoutMs ?? ''}
                          placeholder={copy.noTimeout}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            handleUpdateAgentProfile(profile.id, { timeoutMs: val ? Number(val) : null });
                          }}
                        />
                      </label>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="page-sidebar">
        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.adaptersTitle}</h3>
          </div>

          <div className="stack-list rail-scroll">
            {userFacingAdapters.map((adapter) => (
              <section key={adapter.id} className={`list-card adapter-card ${adapter.enabled ? '' : 'is-muted'}`}>
                <div className="list-topline">
                  <h3>{adapter.displayName}</h3>
                  <div className="badge-pair">
                    <span className={`state-badge state-${adapter.health}`}>
                      {HEALTH_LABELS[locale][adapter.health]}
                    </span>
                    <span
                      className={`state-badge ${adapter.availability === 'available' ? 'state-succeeded' : 'state-cancelled'}`}
                    >
                      {adapter.availability === 'available' ? copy.available : copy.unavailable}
                    </span>
                    <span className={`state-badge ${READINESS_BADGE_CLASSES[adapter.readiness]}`}>
                      {READINESS_LABELS[locale][adapter.readiness]}
                    </span>
                    <span className={`state-badge ${adapter.enabled ? 'state-succeeded' : 'state-cancelled'}`}>
                      {adapter.enabled ? copy.enabled : copy.disabled}
                    </span>
                  </div>
                </div>
                <p>{adapter.description}</p>
                <div className="adapter-meta-list">
                  {renderAdapterMetaLine(copy.discoveryReasonLabel, adapter.discoveryReason)}
                  {renderAdapterMetaLine(copy.readinessReasonLabel, adapter.readinessReason)}
                </div>
                <code>{adapter.command}</code>
                <div className="mini-meta-row">
                  <span>{copy.modelLabel}</span>
                  <span>{adapter.defaultModel || copy.useAdapterDefault}</span>
                </div>
                <div className="pill-row">
                  {adapter.capabilities.map((capability) => (
                    <span key={capability} className="capability-pill">
                      {capability}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
