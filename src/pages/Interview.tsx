import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EvidenceSidebar } from '../features/interview/EvidenceSidebar';
import { QuestionStage } from '../features/interview/QuestionStage';
import {
  generateInterviewBrief,
  retryInterviewAnswer,
  submitInterviewAnswer,
  useInterviewSession,
} from '../features/interview/useInterview';
import { useI18n } from '../i18n';

export function Interview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const session = useInterviewSession(id);
  if (!session.project) {
    return <main className="center-stage">{session.error || <div className="spinner" />}</main>;
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitInterviewAnswer(session, t);
  };
  const retry = (clientAnswerId: string) => retryInterviewAnswer(session, clientAnswerId, t);
  const generate = () => generateInterviewBrief(session, navigate, t);
  return (
    <main className="interview-page">
      <header className="project-context">
        <div>
          <Link to="/projects">← {t('projects')}</Link>
          <h1>{session.project.title}</h1>
        </div>
        <div className="interview-count">
          <span>{t('interview')}</span>
          <strong>
            {Math.min(
              session.project.answers.length + (session.project.currentQuestion ? 1 : 0),
              12,
            )}{' '}
            <small>/ 12</small>
          </strong>
        </div>
      </header>
      <div className="interview-layout">
        <QuestionStage
          session={session}
          t={t}
          onSubmit={submit}
          onRetry={retry}
          onGenerate={generate}
        />
        <EvidenceSidebar project={session.project} t={t} />
      </div>
    </main>
  );
}
