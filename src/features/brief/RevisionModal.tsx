import { useEffect, type FormEvent } from 'react';
import { dimensionKeys } from '../../../shared/domain';
import { briefSections, dimensionLabelKeys, type Translator } from './meta';

interface RevisionModalProps {
  busy: boolean;
  t: Translator;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function RevisionModal({ busy, t, onClose, onSubmit }: RevisionModalProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="reject-modal" onSubmit={onSubmit}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label={t('closeRevision')}
          autoFocus
        >
          ×
        </button>
        <span className="eyebrow">{t('focusedRevision')}</span>
        <h2>{t('reject')}</h2>
        <p>{t('revisionBody')}</p>
        <label>
          {t('briefSection')}
          <select name="section" required>
            {briefSections.map((item) => (
              <option key={item.key} value={item.key}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('alignmentDimension')}
          <select name="dimension" required>
            {dimensionKeys.map((item) => (
              <option key={item} value={item}>
                {t(dimensionLabelKeys[item])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('whyChange')}
          <textarea name="reason" minLength={5} maxLength={1500} required rows={4} />
        </label>
        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {t('askFocused')} →
          </button>
        </div>
      </form>
    </div>
  );
}
