import { Link } from 'react-router-dom';
import type { BriefVersion, Project } from '../../../shared/contracts';
import type { Translator } from './meta';

interface BriefHeaderProps {
  project: Project;
  latest: BriefVersion;
  title: string;
  approved: boolean;
  busy: boolean;
  t: Translator;
  onTitleChange: (title: string) => void;
  onApprove: () => Promise<void>;
  onReject: () => void;
  onCreateRevision: () => Promise<void>;
}

function HeaderActions(props: BriefHeaderProps) {
  if (props.approved) {
    return (
      <button className="button ghost" onClick={props.onCreateRevision} disabled={props.busy}>
        {props.t('review')} v{props.latest.version + 1}
      </button>
    );
  }
  return (
    <>
      <button className="button ghost danger" onClick={props.onReject}>
        {props.t('reject')}
      </button>
      <button className="button primary" onClick={props.onApprove} disabled={props.busy}>
        {props.t('approve')}
      </button>
    </>
  );
}

export function BriefHeader(props: BriefHeaderProps) {
  const { project, latest, approved, t } = props;
  return (
    <header className="brief-header">
      <div>
        <Link to="/projects">← {t('projects')}</Link>
        <div className="brief-title-line">
          <input
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
            disabled={approved}
            aria-label={t('briefTitle')}
          />
          <span className={`status ${project.workflowStatus}`}>
            {approved ? t('statusApproved') : t('statusNeedsReview')}
          </span>
          {latest.clarificationLabel === 'needs_clarification' && (
            <span className="clarification-label">{t('needsClarification')}</span>
          )}
        </div>
        <p>
          {t('version')} {latest.version} · {t('generatedFrom')} {project.answers.length}{' '}
          {t('interviewAnswers')}
        </p>
      </div>
      <div className="brief-actions">
        <HeaderActions {...props} />
      </div>
    </header>
  );
}
