import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../../shared/contracts';
import { CreateProjectForm, ProjectCollection } from '../features/projects/ProjectsView';
import { createProject, deleteProject, useProjectList } from '../features/projects/useProjects';
import { useI18n } from '../i18n';

export function Projects() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const state = useProjectList();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    void createProject(state, event, locale, navigate, t);
  };
  const remove = (project: Project) => deleteProject(state, project, t);
  return (
    <main className="page-shell projects-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('privateWorkspace')}</span>
          <h1>{t('allProjects')}</h1>
          <p>{t('projectListBody')}</p>
        </div>
        <button className="button primary" onClick={() => state.setCreating(true)}>
          ＋ {t('newProject')}
        </button>
      </div>
      {state.error && (
        <div className="alert error" role="alert">
          {state.error}
        </div>
      )}
      <CreateProjectForm state={state} t={t} onSubmit={submit} />
      <ProjectCollection state={state} locale={locale} t={t} onDelete={remove} />
    </main>
  );
}
