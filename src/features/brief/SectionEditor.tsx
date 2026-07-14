import type { BriefSections } from '../../../shared/contracts';
import { briefSections, type Translator } from './meta';

interface SectionEditorProps {
  version: number;
  sections: BriefSections;
  approved: boolean;
  dirty: boolean;
  busy: boolean;
  saved: boolean;
  t: Translator;
  onChange: (key: keyof BriefSections, value: string, mode: 'text' | 'list') => void;
  onSave: () => Promise<void>;
}

function SaveBar(props: SectionEditorProps) {
  const status = props.dirty
    ? props.t('unsavedEdits')
    : props.saved
      ? props.t('allChangesSaved')
      : props.t('structuredDraft');
  return (
    <div className="sticky-save">
      <span>{status}</span>
      <button
        className="button primary"
        onClick={props.onSave}
        disabled={!props.dirty || props.busy}
      >
        {props.t('save')}
      </button>
    </div>
  );
}

export function SectionEditor(props: SectionEditorProps) {
  return (
    <article className="brief-document">
      <div className="document-kicker">
        <span>{props.t('structuredBrief')}</span>
        <span>v{props.version}</span>
      </div>
      {briefSections.map(({ key, labelKey, mode }, index) => {
        const value = props.sections[key];
        return (
          <section className="brief-section" key={key}>
            <div className="section-number">{String(index + 1).padStart(2, '0')}</div>
            <div>
              <label htmlFor={`section-${key}`}>{props.t(labelKey)}</label>
              <textarea
                id={`section-${key}`}
                rows={
                  mode === 'text' ? 4 : Math.max(3, Array.isArray(value) ? value.length + 1 : 3)
                }
                value={Array.isArray(value) ? value.join('\n') : value}
                onChange={(event) => props.onChange(key, event.target.value, mode)}
                disabled={props.approved}
              />
              <small>
                {mode === 'list' ? props.t('oneItemPerLine') : props.t('decisionReadyProse')}
              </small>
            </div>
          </section>
        );
      })}
      {!props.approved && <SaveBar {...props} />}
    </article>
  );
}
