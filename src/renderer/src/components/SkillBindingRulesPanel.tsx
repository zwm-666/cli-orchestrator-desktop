import type { Locale, SkillDefinition, WorkbenchSkillBinding, WorkbenchTargetKind } from '../../../shared/domain.js';
import { TARGET_KIND_LABELS } from '../workConfigCopy.js';

interface SkillBindingRulesPanelProps {
  locale: Locale;
  skills: SkillDefinition[];
  bindings: WorkbenchSkillBinding[];
  addBinding: () => void;
  updateBinding: (bindingId: string, updates: Partial<WorkbenchSkillBinding>) => void;
  removeBinding: (bindingId: string) => void;
  toggleBindingSkill: (bindingId: string, skillId: string, enabled: boolean) => void;
  getTargetOptions: (targetKind: WorkbenchTargetKind) => { id: string; label: string }[];
}

export function SkillBindingRulesPanel(props: SkillBindingRulesPanelProps): React.JSX.Element {
  const { locale, skills, bindings, addBinding, updateBinding, removeBinding, toggleBindingSkill, getTargetOptions } = props;

  return (
    <div className="config-skill-rules subdued-row">
      <div className="section-heading workspace-pane-heading config-subsection-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '绑定规则' : 'Binding rules'}</p>
          <h3>{locale === 'zh' ? '按工具和模型启用技能' : 'Enable skills by tool and model'}</h3>
        </div>
        <button type="button" className="secondary-button" onClick={addBinding}>
          {locale === 'zh' ? '新增绑定' : 'Add binding'}
        </button>
      </div>

      <div className="settings-stack">
        {bindings.length === 0 ? (
          <p className="empty-state">{locale === 'zh' ? '还没有绑定规则。新增一条后，不同模型服务、本地工具或模型会启用不同技能。' : 'No binding rules yet. Add one to vary enabled skills by provider, local tool, or model.'}</p>
        ) : null}

        {bindings.map((binding) => (
          <section key={binding.id} className="task-routing-row subdued-row">
            <div className="settings-grid compact-settings-grid">
              <label className="field">
                <span>{locale === 'zh' ? '目标类型' : 'Target type'}</span>
                <select
                  value={binding.targetKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as WorkbenchTargetKind;
                    const nextTargetId = getTargetOptions(nextKind)[0]?.id ?? '';
                    updateBinding(binding.id, { targetKind: nextKind, targetId: nextTargetId });
                  }}
                >
                  <option value="provider">{TARGET_KIND_LABELS[locale].provider}</option>
                  <option value="adapter">{TARGET_KIND_LABELS[locale].adapter}</option>
                </select>
              </label>

              <label className="field">
                <span>{locale === 'zh' ? '目标' : 'Target'}</span>
                <select
                  value={binding.targetId}
                  onChange={(event) => {
                    updateBinding(binding.id, { targetId: event.target.value });
                  }}
                >
                  <option value="">{locale === 'zh' ? '请选择目标' : 'Choose target'}</option>
                  {getTargetOptions(binding.targetKind).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>{locale === 'zh' ? '模型匹配' : 'Model pattern'}</span>
                <input
                  value={binding.modelPattern}
                  placeholder="*"
                  onChange={(event) => {
                    updateBinding(binding.id, { modelPattern: event.target.value });
                  }}
                />
              </label>
            </div>

            <div className="provider-skill-checklist">
              {skills.map((skill) => (
                <label key={`${binding.id}-${skill.id}`} className="toggle-field provider-skill-toggle">
                  <input
                    type="checkbox"
                    checked={binding.enabledSkillIds.includes(skill.id)}
                    onChange={(event) => {
                      toggleBindingSkill(binding.id, skill.id, event.target.checked);
                    }}
                  />
                  <span>{skill.name}</span>
                </label>
              ))}
            </div>

            <div className="card-actions">
              <button type="button" className="secondary-button" onClick={() => { removeBinding(binding.id); }}>
                {locale === 'zh' ? '删除绑定' : 'Delete binding'}
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
