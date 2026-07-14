import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Project } from '../../shared/contracts';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { useI18n, type MessageKey } from '../i18n';
import { projectApi } from '../lib/api';

const statusLabel: Record<Project['workflowStatus'], MessageKey> = {
  draft: 'statusDraft',
  interviewing: 'statusInterviewing',
  needs_review: 'statusNeedsReview',
  approved: 'statusApproved',
};

const syncLabel: Record<Project['syncStatus'], MessageKey> = {
  not_synced: 'syncNotSynced',
  syncing: 'syncSyncing',
  synced: 'syncSynced',
  error: 'syncError',
};

export function Projects() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    projectApi
      .list()
      .then(({ projects }) => {
        if (active) setProjects(projects);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const data = new FormData(event.currentTarget);
    const rawTitle = data.get('title');
    const rawInitialPrompt = data.get('initialPrompt');
    if (typeof rawTitle !== 'string' || typeof rawInitialPrompt !== 'string') return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const { project } = await projectApi.create({
        title: rawTitle,
        initialPrompt: rawInitialPrompt,
        locale,
      });
      await projectApi.startInterview(project.id);
      void navigate(`/projects/${project.id}/interview`);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('createFailed'));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`${t('deleteConfirm')}\n${project.title}`)) return;
    setDeletingId(project.id);
    setError('');
    try {
      await projectApi.remove(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="page-shell projects-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('privateWorkspace')}</span>
          <h1>{t('allProjects')}</h1>
          <p>{t('projectListBody')}</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          ＋ {t('newProject')}
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {creating && (
        <section className="create-card">
          <div className="create-intro">
            <span>{t('newAlignmentInterview')}</span>
            <h2>{t('newInterviewTitle')}</h2>
            <p>{t('newInterviewBody')}</p>
          </div>
          <form onSubmit={submit}>
            <label>
              {t('title')}
              <input
                name="title"
                minLength={2}
                maxLength={120}
                required
                autoFocus
                placeholder={t('titlePlaceholder')}
              />
            </label>
            <label>
              {t('initialIdea')}
              <textarea
                name="initialPrompt"
                minLength={10}
                maxLength={10000}
                required
                rows={6}
                placeholder={t('promptPlaceholder')}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setCreating(false)}
                disabled={submitting}
              >
                {t('cancel')}
              </button>
              <button className="button primary" disabled={submitting}>
                {submitting ? t('thinking') : `${t('create')} →`}
              </button>
            </div>
          </form>
        </section>
      )}
      {loading ? (
        <div className="skeleton-grid">
          <i />
          <i />
          <i />
        </div>
      ) : projects.length === 0 && !creating ? (
        <div className="empty-state">
          <span>✦</span>
          <h2>{t('empty')}</h2>
          <button className="button primary" onClick={() => setCreating(true)}>
            {t('newProject')}
          </button>
        </div>
      ) : (
        <section className="project-grid">
          {projects.map((project) => {
            const href =
              project.workflowStatus === 'needs_review' || project.workflowStatus === 'approved'
                ? `/projects/${project.id}/brief`
                : `/projects/${project.id}/interview`;
            return (
              <article className="project-card" key={project.id}>
                <Link to={href} className="project-card-link">
                  <div className="project-card-top">
                    <span className={`status ${project.workflowStatus}`}>
                      {t(statusLabel[project.workflowStatus])}
                    </span>
                    <span className="updated">
                      {new Date(project.updatedAt).toLocaleDateString(locale)}
                    </span>
                  </div>
                  <h2>{project.title}</h2>
                  <p>{project.initialPrompt}</p>
                  <ConfidencePanel project={project} compact />
                  <div className="project-meta">
                    <span>
                      {project.answers.length} {t('interviewAnswers')}
                    </span>
                    <b>{t('open')} →</b>
                  </div>
                </Link>
                <div className="project-card-actions">
                  <span className={`sync-status ${project.syncStatus}`}>
                    {t(syncLabel[project.syncStatus])}
                  </span>
                  <button
                    type="button"
                    className="delete-project"
                    onClick={() => void removeProject(project)}
                    disabled={deletingId === project.id}
                    aria-label={`${t('delete')} ${project.title}`}
                  >
                    {deletingId === project.id ? '…' : t('delete')}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
