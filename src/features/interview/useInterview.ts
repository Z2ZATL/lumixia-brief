import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { DimensionKey, Project } from '../../../shared/contracts';
import type { Translator } from '../brief/meta';
import { ApiError, projectApi, systemApi } from '../../lib/api';
import {
  analyzeWithCodexBridge,
  CodexBridgeError,
  codexBridgeStatus,
  generateWithCodexBridge,
} from '../../lib/codexBridge';

type ProcessingMode = 'model' | 'codex-local' | 'unavailable';

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
  processingMode: ProcessingMode;
  processingModel: string | null;
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
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('unavailable');
  const [processingModel, setProcessingModel] = useState<string | null>(null);
  const pendingAnswer = useRef<PendingAnswer | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void Promise.all([
        projectApi.get(id, controller.signal),
        systemApi.capabilities(controller.signal),
        codexBridgeStatus(controller.signal),
      ])
        .then(([{ project }, capabilities, bridge]) => {
          const localReady = capabilities.codexLocal.available && bridge?.ready;
          setProject(project);
          setModelAvailable(Boolean(localReady || capabilities.model.available));
          setProcessingMode(
            localReady ? 'codex-local' : capabilities.model.available ? 'model' : 'unavailable',
          );
          setProcessingModel(localReady ? bridge.model : null);
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
    processingMode,
    processingModel,
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
  if (caught instanceof CodexBridgeError) return t('codexBridgeProcessingFailed');
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
    const result = await submitAnswer(session, submission);
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

async function submitAnswer(session: InterviewSession, submission: PendingAnswer) {
  const project = session.project!;
  if (session.processingMode !== 'codex-local') {
    return projectApi.submitAnswer(project.id, submission);
  }
  const analysis = await analyzeWithCodexBridge(
    project,
    submission.clientAnswerId,
    submission.answer,
  );
  return projectApi.submitCodexAnswer(project.id, {
    clientAnswerId: submission.clientAnswerId,
    answer: submission.answer,
    analysis,
  });
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
    const result =
      session.processingMode === 'codex-local'
        ? await retryWithCodex(session, clientAnswerId)
        : await projectApi.retryAnswer(session.project.id, clientAnswerId);
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

async function retryWithCodex(session: InterviewSession, clientAnswerId: string) {
  const project = session.project!;
  const answer = project.answers.find((item) => item.clientAnswerId === clientAnswerId);
  if (!answer) throw new Error('ANSWER_NOT_FOUND');
  const analysis = await analyzeWithCodexBridge(project, clientAnswerId, answer.text);
  return projectApi.submitCodexAnswer(project.id, {
    clientAnswerId,
    answer: answer.text,
    analysis,
  });
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
    if (session.processingMode === 'codex-local') {
      const brief = await generateWithCodexBridge(session.project);
      await projectApi.generateCodexBrief(session.project.id, { brief });
    } else {
      await projectApi.generateBrief(session.project.id);
    }
    void navigate(`/projects/${session.project.id}/brief`);
  } catch (caught) {
    session.setError(requestError(caught, t));
    session.setBusy(false);
  }
}
