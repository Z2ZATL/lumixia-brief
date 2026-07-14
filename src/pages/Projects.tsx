import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Project } from '../../shared/contracts';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { useI18n } from '../i18n';
import { projectApi } from '../lib/api';

const statusLabel: Record<Project['workflowStatus'], string> = {
  draft: 'Draft',
  interviewing: 'Interviewing',
  needs_review: 'Needs review',
  approved: 'Approved',
};

export function Projects() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    projectApi
      .list()
      .then(({ projects }) => setProjects(projects))
      .catch((error: Error) => setError(error.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      const { project } = await projectApi.create({
        title: String(data.get('title')),
        initialPrompt: String(data.get('initialPrompt')),
        locale,
      });
      await projectApi.startInterview(project.id);
      navigate(`/projects/${project.id}/interview`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create project.');
    }
  }

  return (
    <main className="page-shell projects-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRIVATE WORKSPACE</span>
          <h1>{t('allProjects')}</h1>
          <p>
            Each brief shows exactly where context is clear—and where a human decision is still
            needed.
          </p>
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
            <span>New alignment interview</span>
            <h2>What are you trying to build?</h2>
            <p>Start messy. Lumixia will help make the important parts explicit.</p>
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
                placeholder="e.g. Founder launch brief"
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
                placeholder="I want Codex to build a launch experience, but I’m not sure what the first version needs…"
              />
            </label>
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setCreating(false)}>
                {t('cancel')}
              </button>
              <button className="button primary">{t('create')} →</button>
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
              <Link to={href} className="project-card" key={project.id}>
                <div className="project-card-top">
                  <span className={`status ${project.workflowStatus}`}>
                    {statusLabel[project.workflowStatus]}
                  </span>
                  <span className="updated">
                    {new Date(project.updatedAt).toLocaleDateString(locale)}
                  </span>
                </div>
                <h2>{project.title}</h2>
                <p>{project.initialPrompt}</p>
                <ConfidencePanel project={project} compact />
                <div className="project-meta">
                  <span>{project.answers.length} interview answers</span>
                  <b>Open →</b>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
