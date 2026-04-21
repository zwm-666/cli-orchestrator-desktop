import { Link } from 'react-router-dom';
import type { Locale } from '../../../shared/domain.js';

interface WorkbenchHeroProps {
  locale: Locale;
  selectedTargetKind: 'provider' | 'adapter';
  targetLabel: string | null;
  targetModel: string;
  providerReady: boolean;
}

export function WorkbenchHero(props: WorkbenchHeroProps): React.JSX.Element {
  const { locale, selectedTargetKind, targetLabel, targetModel, providerReady } = props;

  return (
    <section className="section-panel inlay-card page-hero">
      <div className="section-heading page-hero-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '统一工作台' : 'Unified workbench'}</p>
          <h2>{locale === 'zh' ? '在同一页面切换模型与工具，并沿用同一份任务清单持续推进' : 'Switch tools on one page and continue from one shared checklist'}</h2>
          <p className="muted">
            {locale === 'zh'
              ? '工作开始先生成任务清单，之后所有模型服务与本地工具都围绕这份清单继续。切换目标时会自动生成连续工作提示词。'
              : 'Start by generating a shared task list, then continue across providers and adapters from the same checklist. Target switches automatically regenerate a continuity prompt.'}
          </p>
        </div>
        <div className="hero-badge-row">
          <span className="status-pill">{selectedTargetKind === 'provider' ? (locale === 'zh' ? '模型服务' : 'Hosted Provider') : locale === 'zh' ? '本地工具' : 'Local Adapter'}</span>
          <span className="status-pill">{targetLabel ?? (locale === 'zh' ? '未选择' : 'Not selected')}</span>
          <span className="status-pill">{targetModel || (locale === 'zh' ? '未指定模型' : 'No model')}</span>
        </div>
      </div>

      {selectedTargetKind === 'provider' && !providerReady ? (
        <div className="status-banner status-error">
          <p>
            {locale === 'zh'
              ? <><span>当前模型服务还不能直接使用。请先前往 </span><Link to="/config">配置页</Link><span> 保存 API 密钥、服务地址与模型。</span></>
              : <><span>No usable provider is configured yet. Go to </span><Link to="/config">Config</Link><span> to save an API key, base URL, and model.</span></>}
          </p>
        </div>
      ) : null}
    </section>
  );
}
