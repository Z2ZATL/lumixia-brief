import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { BriefSections, BriefVersion, Project } from '../../../shared/contracts';
import { api, projectApi } from '../../lib/api';
import type { BriefSectionMeta, Translator } from './meta';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface BriefState {
  project: Project | null;
  latest: BriefVersion | undefined;
  title: string;
  sections: BriefSections | null;
  busy: boolean;
  error: string;
  saved: boolean;
  parentId: string;
  notionPages: Array<{ id: string; title: string }>;
  notionConnected: boolean;
  dirty: boolean;
  setProject: Setter<Project | null>;
  setTitle: Setter<string>;
  setSections: Setter<BriefSections | null>;
  setBusy: Setter<boolean>;
  setError: Setter<string>;
  setSaved: Setter<boolean>;
  setParentId: Setter<string>;
}

export function useBriefState(id: string, navigate: NavigateFunction): BriefState {
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<BriefSections | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [parentId, setParentId] = useState('');
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([]);
  const [notionConnected, setNotionConnected] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await projectApi.get(id);
        const brief = result.project.briefVersions.at(-1);
        if (!active) return;
        if (!brief) return void navigate(`/projects/${id}/interview`, { replace: true });
        setProject(result.project);
        setTitle(brief.title);
        setSections(structuredClone(brief.sections));
        setParentId(result.project.notionParentId ?? '');
        const status = await api<{ connected: boolean }>('/notion/status');
        if (!active) return;
        setNotionConnected(status.connected);
        if (!status.connected) return;
        const pages = await api<{ pages: Array<{ id: string; title: string }> }>(
          '/notion/pages',
          {},
        );
        if (active) setNotionPages(pages.pages);
      } catch (caught) {
        if (active && caught instanceof Error) setError(caught.message);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, navigate]);
  const latest = project?.briefVersions.at(-1);
  const dirty = useMemo(
    () =>
      Boolean(
        latest &&
        sections &&
        (title !== latest.title || JSON.stringify(sections) !== JSON.stringify(latest.sections)),
      ),
    [latest, sections, title],
  );
  return {
    project,
    latest,
    title,
    sections,
    busy,
    error,
    saved,
    parentId,
    notionPages,
    notionConnected,
    dirty,
    setProject,
    setTitle,
    setSections,
    setBusy,
    setError,
    setSaved,
    setParentId,
  };
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

export function useBriefActions(state: BriefState, t: Translator) {
  async function save() {
    if (!state.project || !state.latest || !state.sections) return;
    state.setBusy(true);
    state.setError('');
    try {
      const result = await projectApi.editBrief(state.project.id, {
        expectedVersion: state.latest.version,
        title: state.title,
        sections: state.sections,
      });
      state.setProject(result.project);
      state.setSaved(true);
    } catch (caught) {
      state.setError(errorMessage(caught, t('saveFailed')));
    } finally {
      state.setBusy(false);
    }
  }
  async function approve() {
    if (!state.project || !state.latest || !state.sections) return;
    state.setBusy(true);
    state.setError('');
    try {
      if (state.dirty) {
        const saved = await projectApi.editBrief(state.project.id, {
          expectedVersion: state.latest.version,
          title: state.title,
          sections: state.sections,
        });
        state.setProject(saved.project);
        state.setSaved(true);
      }
      const result = await projectApi.approveBrief(state.project.id);
      state.setProject(result.project);
      state.setSaved(true);
    } catch (caught) {
      state.setError(errorMessage(caught, t('approvalFailed')));
    } finally {
      state.setBusy(false);
    }
  }
  async function createRevision() {
    if (!state.project || !state.latest || !state.sections) return;
    state.setBusy(true);
    state.setError('');
    try {
      const result = await projectApi.editBrief(state.project.id, {
        expectedVersion: state.latest.version,
        title: state.title,
        sections: state.sections,
      });
      state.setProject(result.project);
      state.setSaved(true);
    } catch (caught) {
      state.setError(errorMessage(caught, t('revisionFailed')));
    } finally {
      state.setBusy(false);
    }
  }
  return { save, approve, createRevision };
}

export function useNotionActions(state: BriefState, t: Translator) {
  async function setNotionParent() {
    if (!state.project || !state.parentId.trim()) return;
    state.setBusy(true);
    state.setError('');
    try {
      const result = await projectApi.selectNotionParent(state.project.id, state.parentId.trim());
      state.setProject(result.project);
    } catch (caught) {
      state.setError(errorMessage(caught, t('parentFailed')));
    } finally {
      state.setBusy(false);
    }
  }
  async function sync() {
    if (!state.project) return;
    state.setBusy(true);
    state.setError('');
    try {
      const result = await projectApi.syncNotion(state.project.id);
      state.setProject(result.project);
    } catch (caught) {
      state.setError(errorMessage(caught, t('syncFailed')));
    } finally {
      state.setBusy(false);
    }
  }
  return { setNotionParent, sync };
}

export function updateBriefSection(
  state: BriefState,
  key: keyof BriefSections,
  value: string,
  mode: BriefSectionMeta['mode'],
) {
  if (!state.sections) return;
  const next =
    mode === 'list'
      ? value
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
      : value;
  state.setSaved(false);
  state.setSections({ ...state.sections, [key]: next });
}

export function useRevisionRequest(state: BriefState, navigate: NavigateFunction, t: Translator) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.project) return;
    const data = new FormData(event.currentTarget);
    state.setBusy(true);
    state.setError('');
    try {
      await projectApi.requestChanges(state.project.id, {
        section: data.get('section'),
        dimension: data.get('dimension'),
        reason: data.get('reason'),
      });
      void navigate(`/projects/${state.project.id}/interview`);
    } catch (caught) {
      state.setError(errorMessage(caught, t('changesFailed')));
      state.setBusy(false);
    }
  };
}
