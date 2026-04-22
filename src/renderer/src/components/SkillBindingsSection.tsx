import type { Locale, SkillDefinition, WorkbenchSkillBinding, WorkbenchTargetKind } from '../../../shared/domain.js';
import { SkillsCatalogPanel } from './SkillsCatalogPanel.js';
import { SkillBindingRulesPanel } from './SkillBindingRulesPanel.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface SkillBindingsSectionProps {
  locale: Locale;
  skills: SkillDefinition[];
  bindings: WorkbenchSkillBinding[];
  onSaveSkill: (skill: SkillDefinition) => void;
  addBinding: () => void;
  updateBinding: (bindingId: string, updates: Partial<WorkbenchSkillBinding>) => void;
  removeBinding: (bindingId: string) => void;
  toggleBindingSkill: (bindingId: string, skillId: string, enabled: boolean) => void;
  getTargetOptions: (targetKind: WorkbenchTargetKind) => { id: string; label: string }[];
}

export function SkillBindingsSection(props: SkillBindingsSectionProps): React.JSX.Element {
  const { locale, skills, bindings, onSaveSkill, addBinding, updateBinding, removeBinding, toggleBindingSkill, getTargetOptions } = props;
  const copy = CONFIG_PAGE_COPY[locale];

  return (
    <section id="config-skills" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.skillsSectionEyebrow}</p>
          <h3>{copy.skillsSectionTitle}</h3>
        </div>
        <span className="status-pill">{skills.length}</span>
      </div>

      <SkillsCatalogPanel locale={locale} skills={skills} onSaveSkill={onSaveSkill} />

      <SkillBindingRulesPanel
        locale={locale}
        skills={skills}
        bindings={bindings}
        addBinding={addBinding}
        updateBinding={updateBinding}
        removeBinding={removeBinding}
        toggleBindingSkill={toggleBindingSkill}
        getTargetOptions={getTargetOptions}
      />

      <p className="muted">
        {locale === 'zh'
          ? 'MCP 仍保留为项目底层能力；这轮先不在新配置页中展开，后续需要时再补充。'
          : 'MCP stays available underneath as project capability. This round does not expose a new MCP UI yet; it can be added later.'}
      </p>
    </section>
  );
}
