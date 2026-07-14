import { Link } from 'react-router-dom';
import type { Translator } from '../brief/meta';

function ProductPreview({ t }: { t: Translator }) {
  return (
    <div className="hero-product" aria-label={t('productPreview')}>
      <div className="preview-top">
        <span className="preview-dot" />
        <span>{t('previewTitle')}</span>
        <b>{t('previewInterview')}</b>
      </div>
      <div className="preview-question">
        <small>{t('previewClarification')}</small>
        <h2>{t('previewQuestion')}</h2>
        <div className="preview-input">
          {t('previewInput')}
          <button>{t('continueShort')} →</button>
        </div>
      </div>
      <div className="preview-confidence">
        <div>
          <strong>68%</strong>
          <span>{t('confidence')}</span>
        </div>
        <div className="mini-dimensions">
          <i className="full" />
          <i className="full" />
          <i className="full" />
          <i className="half" />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

export function Hero({ t }: { t: Translator }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">
          <i />
          {t('eyebrow')}
        </span>
        <h1>{t('hero')}</h1>
        <p>{t('heroBody')}</p>
        <div className="hero-actions">
          <Link className="button primary" to="/projects">
            {t('signIn')} <span>→</span>
          </Link>
          <span className="trust-line">{t('trustLine')}</span>
        </div>
      </div>
      <ProductPreview t={t} />
    </section>
  );
}

export function Principles({ t }: { t: Translator }) {
  return (
    <section className="principles">
      <div className="section-title">
        <span>01</span>
        <h2>{t('how')}</h2>
      </div>
      <div className="step-grid">
        {[t('step1'), t('step2'), t('step3')].map((step, index) => (
          <article key={step}>
            <b>0{index + 1}</b>
            <p>{step}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PrivacyBand({ t }: { t: Translator }) {
  return (
    <section className="privacy-band">
      <div className="privacy-icon">⌁</div>
      <div>
        <span className="eyebrow">{t('securityBehavior')}</span>
        <h2>{t('privacy')}</h2>
        <p>{t('privacyBody')}</p>
      </div>
    </section>
  );
}
