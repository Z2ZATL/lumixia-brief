import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DimensionKey, Project } from '../../shared/contracts';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { useI18n, type MessageKey } from '../i18n';
import { ApiError, projectApi } from '../lib/api';

interface PendingAnswer {
  clientAnswerId: string;
  question: string;
  dimension: DimensionKey;
  answer: string;
}

const answerStatusKeys: Record<Project['answers'][number]['status'], MessageKey> = {
  pending: 'answerStatusPending',
  processed: 'answerStatusProcessed',
  failed: 'answerStatusFailed',
};

const dimensionLabelKeys: Record<DimensionKey, MessageKey> = {
  problem: 'dimensionProblem',
  audience: 'dimensionAudience',
  outcome: 'dimensionOutcome',
  scope: 'dimensionScope',
  constraints: 'dimensionConstraints',
  timeline: 'dimensionTimeline',
  risks: 'dimensionRisks',
  successCriteria: 'dimensionSuccess',
};

export function Interview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingAnswer = useRef<PendingAnswer | null>(null);

  useEffect(() => {
    let active = true;
    projectApi
      .get(id)
      .then(({ project }) => {
        if (active) setProject(project);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!project?.currentQuestion || !answer.trim() || busy) return;
    setBusy(true);
    setError('');
    const submission =
      pendingAnswer.current ??
      ({
        clientAnswerId: crypto.randomUUID(),
        question: project.currentQuestion.text,
        dimension: project.currentQuestion.dimension,
        answer,
      } satisfies PendingAnswer);
    pendingAnswer.current = submission;
    try {
      const result = await projectApi.submitAnswer(project.id, submission);
      setProject(result.project);
      pendingAnswer.current = null;
      setAnswer('');
    } catch (error) {
      setError(
        error instanceof ApiError && error.code === 'MODEL_UNAVAILABLE'
          ? `${error.message} ${t('retry')}`
          : error instanceof Error
            ? error.message
            : t('requestFailed'),
      );
      try {
        const { project: recovered } = await projectApi.get(project.id);
        setProject(recovered);
        const persisted = recovered.answers.find(
          (item) => item.clientAnswerId === submission.clientAnswerId,
        );
        if (persisted?.status === 'processed') {
          pendingAnswer.current = null;
          setAnswer('');
        } else if (error instanceof ApiError && error.status < 500 && error.status !== 409) {
          pendingAnswer.current = null;
        }
      } catch (recoveryError) {
        setError(
          (current) =>
            `${current} ${recoveryError instanceof Error ? recoveryError.message : t('recoveryFailed')}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function retry(clientAnswerId: string) {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      const { project: next } = await projectApi.retryAnswer(project.id, clientAnswerId);
      setProject(next);
      if (pendingAnswer.current?.clientAnswerId === clientAnswerId) {
        pendingAnswer.current = null;
        setAnswer('');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : t('retryFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      await projectApi.generateBrief(project.id);
      void navigate(`/projects/${project.id}/brief`);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('generateFailed'));
      setBusy(false);
    }
  }

  if (!project) return <main className="center-stage">{error || <div className="spinner" />}</main>;
  const processed = project.answers.filter((item) => item.status === 'processed').length;
  const failed = project.answers.filter((item) => item.status === 'failed');
  const canGenerate =
    processed >= 5 && (project.analysis.shouldStop || project.answers.length >= 12);
  return (
    <main className="interview-page">
      <header className="project-context">
        <div>
          <Link to="/projects">← {t('projects')}</Link>
          <h1>{project.title}</h1>
        </div>
        <div className="interview-count">
          <span>{t('interview')}</span>
          <strong>
            {Math.min(project.answers.length + (project.currentQuestion ? 1 : 0), 12)}{' '}
            <small>/ 12</small>
          </strong>
        </div>
      </header>
      <div className="interview-layout">
        <section className="question-stage">
          <div className="progress-line">
            <i style={{ width: `${Math.max(8, (project.answers.length / 12) * 100)}%` }} />
          </div>
          {project.currentQuestion ? (
            <form onSubmit={submit} className="question-form">
              <span className="question-dimension">
                {t('nextClarification')} ·{' '}
                {t(dimensionLabelKeys[project.currentQuestion.dimension])}
              </span>
              <h2>{project.currentQuestion.text}</h2>
              <p className="rationale">
                {t('whyMatters')}: {project.currentQuestion.rationale}
              </p>
              <label>
                <span>{t('answer')}</span>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={7}
                  disabled={busy}
                  maxLength={10000}
                  placeholder={t('answerPlaceholder')}
                />
              </label>
              <div className="answer-actions">
                <span>{answer.length.toLocaleString()} / 10,000</span>
                <button className="button primary" disabled={!answer.trim() || busy}>
                  {busy ? t('thinking') : `${t('continue')} →`}
                </button>
              </div>
            </form>
          ) : (
            <div className="ready-card">
              <span>✓</span>
              <h2>
                {project.analysis.stopReason === 'max_questions'
                  ? t('questionLimit')
                  : t('enoughContext')}
              </h2>
              <p>
                {project.analysis.stopReason === 'max_questions'
                  ? t('questionLimitBody')
                  : t('enoughContextBody')}
              </p>
              <button className="button primary" onClick={generate} disabled={busy}>
                {t('generate')} →
              </button>
            </div>
          )}
          {error && <div className="alert error">{error}</div>}
          {failed.map((item) => (
            <button
              key={item.id}
              className="retry-card"
              onClick={() => retry(item.clientAnswerId)}
              disabled={busy}
            >
              <span>{t('answerSaved')}</span>
              <b>{t('retry')} →</b>
            </button>
          ))}
          {canGenerate && project.currentQuestion && (
            <div className="ready-strip">
              <span>
                <b>{t('briefThreshold')}</b> {t('thresholdBody')}
              </span>
              <button className="button small" onClick={generate} disabled={busy}>
                {t('generate')}
              </button>
            </div>
          )}
          {project.answers.length > 0 && (
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
                  <span className={`answer-status ${item.status}`}>
                    {t(answerStatusKeys[item.status])}
                  </span>
                </article>
              ))}
            </details>
          )}
        </section>
        <aside className="alignment-sidebar">
          <ConfidencePanel project={project} />
          <section className="evidence-card">
            <h3>
              {t('facts')} <span>{project.analysis.facts.length}</span>
            </h3>
            {project.analysis.facts.slice(-3).map((fact, index) => (
              <p key={index}>“{fact.statement}”</p>
            ))}
            {project.analysis.facts.length === 0 && <p className="muted">{t('evidenceEmpty')}</p>}
          </section>
          <section className="evidence-card assumptions">
            <h3>
              {t('assumptions')} <span>{project.analysis.assumptions.length}</span>
            </h3>
            {project.analysis.assumptions.slice(-3).map((item, index) => (
              <p key={index}>{item.statement}</p>
            ))}
            {project.analysis.assumptions.length === 0 && (
              <p className="muted">{t('assumptionsEmpty')}</p>
            )}
          </section>
          <section className="evidence-card contradictions">
            <h3>
              {t('contradictions')} <span>{project.analysis.contradictions.length}</span>
            </h3>
            {project.analysis.contradictions.slice(-3).map((item) => (
              <p key={item.id}>
                {item.statementA} ↔ {item.statementB}
                {item.resolved ? ' ✓' : item.blocking ? ` · ${t('blocking')}` : ''}
              </p>
            ))}
            {project.analysis.contradictions.length === 0 && (
              <p className="muted">{t('contradictionsEmpty')}</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
