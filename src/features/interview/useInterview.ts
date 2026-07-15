import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { DimensionKey, Project } from '../../../shared/contracts';
import type { Translator } from '../brief/meta';
import { ApiError, projectApi, systemApi } from '../../lib/api';

export interface PendingAnswer {
  clientAnswerId: string;
  question: string;
  dimension: DimensionKey;
  answer: string;
}

export interface InterviewSession {
  project: Project | null;
  answer: string;
  busy: boolean;
  error: string;
  modelAvailable: boolean;
  pendingAnswer: MutableRefObject<PendingAnswer | null>;
  setProject: (project: Project) => void;
  setAnswer: (answer: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | ((current: string) => string)) => void;
}

export function useInterviewSession(id: string): InterviewSession {
  const [project, setProject] = useState<Project | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modelAvailable, setModelAvailable] = useState(true);
  const pendingAnswer = useRef<PendingAnswer | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void Promise.all([
        projectApi.get(id, controller.signal),
        systemApi.capabilities(controller.signal),
      ])
        .then(([{ project }, capabilities]) => {
          setProject(project);
          setModelAvailable(capabilities.model.available);
        })
        .catch((caught: Error) => {
          if (!controller.signal.aborted) setError(caught.message);
        });
    });
    return () => {
      controller.abort();
    };
  }, [id]);
  return {
    project,
    answer,
    busy,
    error,
    modelAvailable,
    pendingAnswer,
    setProject,
    setAnswer,
    setBusy,
    setError,
  };
}

export function prepareSubmission(
  project: Project,
  answer: string,
  pending: PendingAnswer | null,
  idFactory: () => string = () => crypto.randomUUID(),
): PendingAnswer {
  if (pending) return pending;
  if (!project.currentQuestion) throw new Error('QUESTION_REQUIRED');
  return {
    clientAnswerId: idFactory(),
    question: project.currentQuestion.text,
    dimension: project.currentQuestion.dimension,
    answer,
  };
}

export function recoveryOutcome(project: Project, submission: PendingAnswer, error: unknown) {
  const persisted = project.answers.find(
    (item) => item.clientAnswerId === submission.clientAnswerId,
  );
  if (persisted?.status === 'processed') return 'complete' as const;
  if (error instanceof ApiError && error.status < 500 && error.status !== 409) {
    return 'discard' as const;
  }
  return 'retain' as const;
}

function requestError(caught: unknown, t: Translator) {
  if (caught instanceof ApiError && caught.code === 'MODEL_NOT_CONFIGURED') {
    return t('modelNotConfigured');
  }
  if (caught instanceof ApiError && caught.code === 'MODEL_UNAVAILABLE') {
    return `${caught.message} ${t('retry')}`;
  }
  return caught instanceof Error ? caught.message : t('requestFailed');
}

async function recover(
  session: InterviewSession,
  submission: PendingAnswer,
  caught: unknown,
  t: Translator,
) {
  if (!session.project) return;
  try {
    const { project } = await projectApi.get(session.project.id);
    session.setProject(project);
    const outcome = recoveryOutcome(project, submission, caught);
    if (outcome === 'complete') session.setAnswer('');
    if (outcome !== 'retain') session.pendingAnswer.current = null;
  } catch (recoveryError) {
    const message = recoveryError instanceof Error ? recoveryError.message : t('recoveryFailed');
    session.setError((current) => `${current} ${message}`);
  }
}

export async function submitInterviewAnswer(session: InterviewSession, t: Translator) {
  if (!session.project?.currentQuestion || !session.answer.trim() || session.busy) return;
  session.setBusy(true);
  session.setError('');
  const submission = prepareSubmission(
    session.project,
    session.answer,
    session.pendingAnswer.current,
  );
  session.pendingAnswer.current = submission;
  try {
    const result = await projectApi.submitAnswer(session.project.id, submission);
    session.setProject(result.project);
    session.pendingAnswer.current = null;
    session.setAnswer('');
  } catch (caught) {
    session.setError(requestError(caught, t));
    await recover(session, submission, caught, t);
  } finally {
    session.setBusy(false);
  }
}

export async function retryInterviewAnswer(
  session: InterviewSession,
  clientAnswerId: string,
  t: Translator,
) {
  if (!session.project) return;
  session.setBusy(true);
  session.setError('');
  try {
    const result = await projectApi.retryAnswer(session.project.id, clientAnswerId);
    session.setProject(result.project);
    if (session.pendingAnswer.current?.clientAnswerId === clientAnswerId) {
      session.pendingAnswer.current = null;
      session.setAnswer('');
    }
  } catch (caught) {
    session.setError(caught instanceof Error ? caught.message : t('retryFailed'));
  } finally {
    session.setBusy(false);
  }
}

export async function generateInterviewBrief(
  session: InterviewSession,
  navigate: NavigateFunction,
  t: Translator,
) {
  if (!session.project) return;
  session.setBusy(true);
  session.setError('');
  try {
    await projectApi.generateBrief(session.project.id);
    void navigate(`/projects/${session.project.id}/brief`);
  } catch (caught) {
    session.setError(requestError(caught, t));
    session.setBusy(false);
  }
}
