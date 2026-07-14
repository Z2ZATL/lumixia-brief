import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Project } from '../../shared/contracts';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { useI18n } from '../i18n';
import { ApiError, projectApi } from '../lib/api';

export function Interview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    projectApi
      .get(id)
      .then(({ project }) => setProject(project))
      .catch((error: Error) => setError(error.message));
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!project?.currentQuestion || !answer.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectApi.submitAnswer(project.id, {
        clientAnswerId: crypto.randomUUID(),
        question: project.currentQuestion.text,
        dimension: project.currentQuestion.dimension,
        answer,
      });
      setProject(result.project);
      setAnswer('');
    } catch (error) {
      setError(
        error instanceof ApiError && error.code === 'MODEL_UNAVAILABLE'
          ? `${error.message} ${t('retry')}`
          : error instanceof Error
            ? error.message
            : 'Request failed.',
      );
      projectApi.get(project.id).then(({ project }) => setProject(project));
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Retry failed.');
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
      navigate(`/projects/${project.id}/brief`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate brief.');
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
                NEXT CLARIFICATION · {project.currentQuestion.dimension.replace(/([A-Z])/g, ' $1')}
              </span>
              <h2>{project.currentQuestion.text}</h2>
              <p className="rationale">Why this matters: {project.currentQuestion.rationale}</p>
              <label>
                <span>{t('answer')}</span>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={7}
                  disabled={busy}
                  maxLength={10000}
                  placeholder="Be specific, or say what is still undecided…"
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
                  ? 'Question limit reached'
                  : 'Enough context to draft'}
              </h2>
              <p>
                {project.analysis.stopReason === 'max_questions'
                  ? 'The brief will clearly mark what still needs clarification.'
                  : 'The core dimensions are supported and no blocking contradiction remains.'}
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
              <span>Answer saved safely</span>
              <b>{t('retry')} →</b>
            </button>
          ))}
          {canGenerate && project.currentQuestion && (
            <div className="ready-strip">
              <span>
                <b>Brief threshold reached.</b> You can draft now or answer one more question.
              </span>
              <button className="button small" onClick={generate} disabled={busy}>
                {t('generate')}
              </button>
            </div>
          )}
          {project.answers.length > 0 && (
            <details className="answer-history">
              <summary>Interview history · {project.answers.length}</summary>
              {project.answers.map((item, index) => (
                <article key={item.id}>
                  <b>
                    {index + 1}. {item.question}
                  </b>
                  <p>{item.text}</p>
                  <span className={`answer-status ${item.status}`}>{item.status}</span>
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
            {project.analysis.facts.length === 0 && (
              <p className="muted">Evidence will appear as you answer.</p>
            )}
          </section>
          <section className="evidence-card assumptions">
            <h3>
              {t('assumptions')} <span>{project.analysis.assumptions.length}</span>
            </h3>
            {project.analysis.assumptions.slice(-3).map((item, index) => (
              <p key={index}>{item.statement}</p>
            ))}
            {project.analysis.assumptions.length === 0 && (
              <p className="muted">No unsupported assumptions surfaced yet.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
