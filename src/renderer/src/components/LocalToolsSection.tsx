import { useState } from 'react';
import type { CustomCliAdapterDefinition, Locale, RoutingSettings } from '../../../shared/domain.js';
import type { AppState } from '../../../shared/domain.js';
import { LocalToolCard } from './LocalToolCard.js';
import { getDraftAdapterSetting } from '../configPageShared.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface LocalToolsSectionProps {
  locale: Locale;
  userFacingAdapters: AppState['adapters'];
  draftRoutingSettings: RoutingSettings;
  updateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
  updateDiscoveryRoots: (roots: string[]) => void;
  addCustomAdapter: (adapter: CustomCliAdapterDefinition) => void;
  removeCustomAdapter: (adapterId: string) => void;
}

const createCustomAdapterId = (label: string): string => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 32);
  return `custom-${slug || crypto.randomUUID()}`;
};

export function LocalToolsSection(props: LocalToolsSectionProps): React.JSX.Element {
  const { locale, userFacingAdapters, draftRoutingSettings, updateAdapterSetting, updateDiscoveryRoots, addCustomAdapter, removeCustomAdapter } = props;
  const copy = CONFIG_PAGE_COPY[locale];
  const [customLabel, setCustomLabel] = useState('');
  const [customCommand, setCustomCommand] = useState('');
  const [customArgs, setCustomArgs] = useState('{{prompt}}');
  const [customModel, setCustomModel] = useState('');

  return (
    <section id="config-local-tools" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.localToolsSectionEyebrow}</p>
          <h3>{copy.localToolsSectionTitle}</h3>
        </div>
        <span className="status-pill">{userFacingAdapters.length}</span>
      </div>

      <div className="settings-grid compact-settings-grid">
        <label className="field">
          <span>{locale === 'zh' ? '额外工具目录（每行一个）' : 'Extra tool folders (one per line)'}</span>
          <textarea
            rows={3}
            value={draftRoutingSettings.discoveryRoots.join('\n')}
            placeholder={locale === 'zh' ? '例如：D:\\ai_models' : 'Example: D:\\ai_models'}
            onChange={(event) => { updateDiscoveryRoots(event.target.value.split(/\r?\n/u)); }}
          />
        </label>
        <div className="status-banner">
          {locale === 'zh'
            ? '这些目录会参与 CLI 检测和本地工具扫描。保存后点击“刷新本地工具检测”即可生效。'
            : 'These folders are used for CLI detection and local tool scanning. Save, then refresh local tool detection.'}
        </div>
      </div>

      <div className="section-panel inlay-card provider-card provider-card-add">
        <div className="section-heading provider-card-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '自定义工具' : 'Custom tool'}</p>
            <h3>{locale === 'zh' ? '添加任意本地 CLI 工具' : 'Add any local CLI tool'}</h3>
          </div>
        </div>
        <div className="settings-grid compact-settings-grid">
          <label className="field">
            <span>{locale === 'zh' ? '名称' : 'Name'}</span>
            <input value={customLabel} placeholder="My CLI" onChange={(event) => { setCustomLabel(event.target.value); }} />
          </label>
          <label className="field">
            <span>{locale === 'zh' ? '命令或完整路径' : 'Command or full path'}</span>
            <input value={customCommand} placeholder={locale === 'zh' ? 'my-cli 或 D:\\ai_models\\my-cli.exe' : 'my-cli or D:\\ai_models\\my-cli.exe'} onChange={(event) => { setCustomCommand(event.target.value); }} />
          </label>
          <label className="field">
            <span>{locale === 'zh' ? '参数（每行一个，使用 {{prompt}} 放入提示词）' : 'Args (one per line, use {{prompt}} for the prompt)'}</span>
            <textarea rows={3} value={customArgs} onChange={(event) => { setCustomArgs(event.target.value); }} />
          </label>
          <label className="field">
            <span>{locale === 'zh' ? '默认模型（可选）' : 'Default model (optional)'}</span>
            <input value={customModel} placeholder="model-name" onChange={(event) => { setCustomModel(event.target.value); }} />
          </label>
        </div>
        <div className="provider-card-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!customLabel.trim() || !customCommand.trim()}
            onClick={() => {
              const defaultModel = customModel.trim();
              addCustomAdapter({
                id: createCustomAdapterId(customLabel),
                displayName: customLabel.trim(),
                command: customCommand.trim(),
                args: customArgs.split(/\r?\n/u).map((arg) => arg.trim()).filter((arg) => arg.length > 0),
                promptTransport: 'arg',
                description: locale === 'zh' ? `自定义本地 CLI：${customLabel.trim()}` : `Custom local CLI: ${customLabel.trim()}`,
                capabilities: ['local execution'],
                defaultTimeoutMs: null,
                defaultModel,
                supportedModels: defaultModel ? [defaultModel] : [],
                enabled: true,
              });
              setCustomLabel('');
              setCustomCommand('');
              setCustomArgs('{{prompt}}');
              setCustomModel('');
            }}
          >
            {locale === 'zh' ? '添加工具' : 'Add tool'}
          </button>
        </div>
        {draftRoutingSettings.customAdapters.length > 0 ? (
          <div className="adapter-meta-list">
            {draftRoutingSettings.customAdapters.map((adapter) => (
              <div key={adapter.id} className="provider-toggle-row">
                <span>{adapter.displayName} · {adapter.command}</span>
                <button type="button" className="secondary-button secondary-button-compact" onClick={() => { removeCustomAdapter(adapter.id); }}>
                  {locale === 'zh' ? '删除' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="provider-card-grid provider-card-grid-wide">
        {userFacingAdapters.map((adapter) => {
          const adapterSetting = getDraftAdapterSetting(adapter, draftRoutingSettings.adapterSettings[adapter.id]);

          return (
            <LocalToolCard
              key={adapter.id}
              locale={locale}
              adapter={adapter}
              adapterSetting={adapterSetting}
              updateAdapterSetting={updateAdapterSetting}
            />
          );
        })}
      </div>
    </section>
  );
}
