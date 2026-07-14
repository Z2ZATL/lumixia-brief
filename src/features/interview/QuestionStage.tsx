import type { FormEvent } from 'react';
import type { Project } from '../../../shared/contracts';
import type { Translator } from '../brief/meta';
import type { InterviewSession } from './useInterview';

interface QuestionStageProps {
  session: InterviewSession;
  t: Translator;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: (clientAnswerId: string) => Promise<void>;
  onGenerate: () => Promise<void>;
}

const dimensionLabels = {
  problem: 'dimensionProblem',
  audience: 'dimensionAudience',
  outcome: 'dimensionOutcome',
  scope: 'dimensionScope',
  constraints: 'dimensionConstraints',
  timeline: 'dimensionTimeline',
  risks: 'dimensionRisks',
  successCriteria: 'dimensionSuccess',
} as const;

const answerStatus = {
  pending: 'answerStatusPending',
  processed: 'answerStatusProcessed',
  failed: 'answerStatusFailed',
} as const;

function QuestionForm(props: QuestionStageProps) {
  const { project, answer, busy, setAnswer } = props.session;
  if (!project?.currentQuestion) return null;
  return (
    <form onSubmit={props.onSubmit} className="question-form">
      <span className="question-dimension">
        {props.t('nextClarification')} ·{' '}
        {props.t(dimensionLabels[project.currentQuestion.dimension])}
      </span>
      <h2>{project.currentQuestion.text}</h2>
      <p className="rationale">
        {props.t('whyMatters')}: {project.currentQuestion.rationale}
      </p>
      <label>
        <span>{props.t('answer')}</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={7}
          disabled={busy}
          maxLength={10000}
          placeholder={props.t('answerPlaceholder')}
        />
      </label>
      <div className="answer-actions">
        <span>{answer.length.toLocaleString()} / 10,000</span>
        <button className="button primary" disabled={!answer.trim() || busy}>
          {busy ? props.t('thinking') : `${props.t('continue')} →`}
        </button>
      </div>
    </form>
  );
}

function ReadyCard(props: QuestionStageProps) {
  const reason = props.session.project?.analysis.stopReason;
  const limit = reason === 'max_questions';
  return (
    <div className="ready-card">
      <span>✓</span>
      <h2>{limit ? props.t('questionLimit') : props.t('enoughContext')}</h2>
      <p>{limit ? props.t('questionLimitBody') : props.t('enoughContextBody')}</p>
      <button className="button primary" onClick={props.onGenerate} disabled={props.session.busy}>
        {props.t('generate')} →
      </button>
    </div>
  );
}

function AnswerHistory({ project, t }: { project: Project; t: Translator }) {
  if (!project.answers.length) return null;
  return (
    <details className="answer-history">
      <summary>
        {t('interviewHistory')} · {project.answers.length}
      </summary>
      {project.answers.map((item, index) => (
        <article key={item.id}>
          <b>
            {index + 1}. {item.question}
          </b>
          <p>{item.text}</p>
          <span className={`answer-status ${item.status}`}>{t(answerStatus[item.status])}</span>
        </article>
      ))}
    </details>
  );
}

function RetryAndGenerate(props: QuestionStageProps) {
  const project = props.session.project!;
  const failed = project.answers.filter((item) => item.status === 'failed');
  const processed = project.answers.filter((item) => item.status === 'processed').length;
  const canGenerate =
    processed >= 5 && (project.analysis.shouldStop || project.answers.length >= 12);
  return (
    <>
      {props.session.error && <div className="alert error">{props.session.error}</div>}
      {failed.map((item) => (
        <button
          key={item.id}
          className="retry-card"
          onClick={() => props.onRetry(item.clientAnswerId)}
          disabled={props.session.busy}
        >
          <span>{props.t('answerSaved')}</span>
          <b>{props.t('retry')} →</b>
        </button>
      ))}
      {canGenerate && project.currentQuestion && (
        <div className="ready-strip">
          <span>
            <b>{props.t('briefThreshold')}</b> {props.t('thresholdBody')}
          </span>
          <button className="button small" onClick={props.onGenerate} disabled={props.session.busy}>
            {props.t('generate')}
          </button>
        </div>
      )}
    </>
  );
}

export function QuestionStage(props: QuestionStageProps) {
  const project = props.session.project!;
  return (
    <section className="question-stage">
      <div className="progress-line">
        <i style={{ width: `${Math.max(8, (project.answers.length / 12) * 100)}%` }} />
      </div>
      {project.currentQuestion ? <QuestionForm {...props} /> : <ReadyCard {...props} />}
      <RetryAndGenerate {...props} />
      <AnswerHistory project={project} t={props.t} />
    </section>
  );
}
