import type { Locale } from '../../../shared/domain.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface ConfigPageHeroProps {
  locale: Locale;
}

export function ConfigPageHero({ locale }: ConfigPageHeroProps): React.JSX.Element {
  const copy = CONFIG_PAGE_COPY[locale];

  return (
    <section className="section-panel inlay-card page-hero">
      <div className="section-heading page-hero-heading">
        <div>
          <p className="section-label">{copy.heroEyebrow}</p>
          <h2>{copy.heroTitle}</h2>
          <p className="muted">{copy.heroCopy}</p>
        </div>
      </div>
    </section>
  );
}
