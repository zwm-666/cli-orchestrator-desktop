import type { Locale, SkillDefinition } from '../../../shared/domain.js';

interface SkillsCatalogPanelProps {
  locale: Locale;
  skills: SkillDefinition[];
  onSaveSkill: (skill: SkillDefinition) => void;
}

export function SkillsCatalogPanel({ locale, skills, onSaveSkill }: SkillsCatalogPanelProps): React.JSX.Element {
  return (
    <div className="provider-card-grid provider-card-grid-wide">
      {skills.map((skill) => (
        <article key={skill.id} className="section-panel inlay-card provider-card">
          <div className="section-heading provider-card-heading">
            <div>
              <p className="section-label">{skill.name}</p>
              <h3>{skill.description}</h3>
            </div>
            <label className="toggle-field provider-toggle-row">
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={(event) => {
                  onSaveSkill({ ...skill, enabled: event.target.checked });
                }}
              />
              <span>{skill.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
            </label>
          </div>
          <p className="mini-meta">{skill.id}</p>
          <p className="muted">{locale === 'zh' ? '允许任务类型：' : 'Allowed task types: '}{skill.allowedTaskTypes.join(', ') || (locale === 'zh' ? '不限' : 'Any')}</p>
        </article>
      ))}
    </div>
  );
}
