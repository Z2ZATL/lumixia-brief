import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Project } from '../../../shared/contracts';
import { ConfidencePanel } from '../../components/ConfidencePanel';
import type { Translator } from '../brief/meta';
import type { ProjectListState } from './useProjects';

const workflowLabels = {
  draft: 'statusDraft',
  interviewing: 'statusInterviewing',
  needs_review: 'statusNeedsReview',
  approved: 'statusApproved',
} as const;
const syncLabels = {
  not_synced: 'syncNotSynced',
  syncing: 'syncSyncing',
  synced: 'syncSynced',
  error: 'syncError',
} as const;

export function CreateProjectForm({
  state,
  t,
  onSubmit,
}: {
  state: ProjectListState;
  t: Translator;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!state.creating) return null;
  return (
    <section className="create-card">
      <div className="create-intro">
        <span>{t('newAlignmentInterview')}</span>
        <h2>{t('newInterviewTitle')}</h2>
        <p>{t('newInterviewBody')}</p>
      </div>
      <form onSubmit={onSubmit}>
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
            onClick={() => state.setCreating(false)}
            disabled={state.submitting}
          >
            {t('cancel')}
          </button>
          <button className="button primary" disabled={state.submitting}>
            {state.submitting ? t('thinking') : `${t('create')} →`}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProjectCard({
  project,
  state,
  locale,
  t,
  onDelete,
}: {
  project: Project;
  state: ProjectListState;
  locale: string;
  t: Translator;
  onDelete: (project: Project) => Promise<void>;
}) {
  const briefReady =
    project.workflowStatus === 'needs_review' || project.workflowStatus === 'approved';
  const href = briefReady ? `/projects/${project.id}/brief` : `/projects/${project.id}/interview`;
  return (
    <article className="project-card">
      <Link to={href} className="project-card-link">
        <div className="project-card-top">
          <span className={`status ${project.workflowStatus}`}>
            {t(workflowLabels[project.workflowStatus])}
          </span>
          <span className="updated">{new Date(project.updatedAt).toLocaleDateString(locale)}</span>
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
          {t(syncLabels[project.syncStatus])}
        </span>
        <button
          type="button"
          className="delete-project"
          onClick={() => void onDelete(project)}
          disabled={state.deletingId === project.id}
          aria-label={`${t('delete')} ${project.title}`}
        >
          {state.deletingId === project.id ? '…' : t('delete')}
        </button>
      </div>
    </article>
  );
}

export function ProjectCollection({
  state,
  locale,
  t,
  onDelete,
}: {
  state: ProjectListState;
  locale: string;
  t: Translator;
  onDelete: (project: Project) => Promise<void>;
}) {
  if (state.loading)
    return (
      <div className="skeleton-grid">
        <i />
        <i />
        <i />
      </div>
    );
  if (!state.projects.length && !state.creating) {
    return (
      <div className="empty-state">
        <span>✦</span>
        <h2>{t('empty')}</h2>
        <button className="button primary" onClick={() => state.setCreating(true)}>
          {t('newProject')}
        </button>
      </div>
    );
  }
  return (
    <section className="project-grid">
      {state.projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          state={state}
          locale={locale}
          t={t}
          onDelete={onDelete}
        />
      ))}
    </section>
  );
}
