import { Link } from 'react-router-dom';
import { LocaleSwitch, Logo } from '../components/Layout';
import { useI18n } from '../i18n';

export function Landing() {
  const { t } = useI18n();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <LocaleSwitch />
      </header>
      <main>
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
              <span className="trust-line">Google + TOTP · Private workspace</span>
            </div>
          </div>
          <div className="hero-product" aria-label="Product preview">
            <div className="preview-top">
              <span className="preview-dot" />
              <span>Founder launch brief</span>
              <b>Interview 4 / 12</b>
            </div>
            <div className="preview-question">
              <small>NEXT CLARIFICATION · SUCCESS CRITERIA</small>
              <h2>What observable result would prove this launch is working?</h2>
              <div className="preview-input">
                We’ll know it works when…<button>Continue →</button>
              </div>
            </div>
            <div className="preview-confidence">
              <div>
                <strong>68%</strong>
                <span>Alignment confidence</span>
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
        </section>
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
        <section className="privacy-band">
          <div className="privacy-icon">⌁</div>
          <div>
            <span className="eyebrow">SECURITY IS PRODUCT BEHAVIOR</span>
            <h2>{t('privacy')}</h2>
            <p>{t('privacyBody')}</p>
          </div>
        </section>
      </main>
      <footer>
        <Logo />
        <span>Built with Codex + GPT-5.6 for OpenAI Build Week</span>
      </footer>
    </div>
  );
}
