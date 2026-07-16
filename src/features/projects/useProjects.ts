import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Project } from '../../../shared/contracts';
import type { Translator } from '../brief/meta';
import { projectApi } from '../../lib/api';

export interface ProjectListState {
  projects: Project[];
  loading: boolean;
  creating: boolean;
  submitting: boolean;
  deletingId: string | null;
  error: string;
  submittingRef: MutableRefObject<boolean>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setCreating: (creating: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  setDeletingId: (id: string | null) => void;
  setError: (error: string) => void;
}

export function useProjectList(): ProjectListState {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    projectApi
      .list(controller.signal)
      .then(({ projects }) => {
        if (!controller.signal.aborted) setProjects(projects);
      })
      .catch((caught: Error) => {
        if (!controller.signal.aborted) setError(caught.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  return {
    projects,
    loading,
    creating,
    submitting,
    deletingId,
    error,
    submittingRef,
    setProjects,
    setCreating,
    setSubmitting,
    setDeletingId,
    setError,
  };
}

export async function createProject(
  state: ProjectListState,
  event: FormEvent<HTMLFormElement>,
  locale: 'en' | 'th',
  navigate: NavigateFunction,
  t: Translator,
) {
  event.preventDefault();
  if (state.submittingRef.current) return;
  const data = new FormData(event.currentTarget);
  const title = data.get('title');
  const initialPrompt = data.get('initialPrompt');
  if (typeof title !== 'string' || typeof initialPrompt !== 'string') return;
  state.submittingRef.current = true;
  state.setSubmitting(true);
  state.setError('');
  try {
    const { project } = await projectApi.create({ title, initialPrompt, locale });
    await projectApi.startInterview(project.id);
    void navigate(`/projects/${project.id}/interview`);
  } catch (caught) {
    state.setError(caught instanceof Error ? caught.message : t('createFailed'));
    state.submittingRef.current = false;
    state.setSubmitting(false);
  }
}

export async function deleteProject(state: ProjectListState, project: Project, t: Translator) {
  if (!window.confirm(`${t('deleteConfirm')}\n${project.title}`)) return;
  state.setDeletingId(project.id);
  state.setError('');
  try {
    await projectApi.remove(project.id);
    state.setProjects((current) => current.filter((item) => item.id !== project.id));
  } catch (caught) {
    state.setError(caught instanceof Error ? caught.message : t('deleteFailed'));
  } finally {
    state.setDeletingId(null);
  }
}
