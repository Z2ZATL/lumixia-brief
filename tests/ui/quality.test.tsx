import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DimensionKey, Project } from '../../shared/contracts';
import { I18nProvider } from '../../src/i18n';
import { Brief } from '../../src/pages/Brief';
import { Interview } from '../../src/pages/Interview';
import { Projects } from '../../src/pages/Projects';
import { Settings } from '../../src/pages/Settings';
import { makeProject } from './fixtures';

interface AnswerSubmission {
  clientAnswerId: string;
  question: string;
  dimension: DimensionKey;
  answer: string;
}

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  capabilities: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  startInterview: vi.fn(),
  submitAnswer: vi.fn<(id: string, input: AnswerSubmission) => Promise<{ project: Project }>>(),
  submitCodexAnswer: vi.fn(),
  retryAnswer: vi.fn(),
  generateBrief: vi.fn(),
  generateCodexBrief: vi.fn(),
  editBrief: vi.fn(),
  approveBrief: vi.fn(),
  requestChanges: vi.fn(),
  selectNotionParent: vi.fn(),
  syncNotion: vi.fn(),
  bridgeStatus: vi.fn(),
  bridgeAnalyze: vi.fn(),
  bridgeGenerate: vi.fn(),
  bridgeConnect: vi.fn(),
  bridgeClear: vi.fn(),
}));

vi.mock('../../src/lib/codexBridge', () => ({
  CodexBridgeError: class CodexBridgeError extends Error {},
  codexBridgeStatus: mocks.bridgeStatus,
  analyzeWithCodexBridge: mocks.bridgeAnalyze,
  generateWithCodexBridge: mocks.bridgeGenerate,
  connectCodexBridge: mocks.bridgeConnect,
  clearCodexBridgeSession: mocks.bridgeClear,
}));

vi.mock('../../src/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/api')>();
  return {
    ...original,
    api: mocks.api,
    projectApi: {
      list: mocks.list,
      get: mocks.get,
      create: mocks.create,
      remove: mocks.remove,
      startInterview: mocks.startInterview,
      submitAnswer: mocks.submitAnswer,
      submitCodexAnswer: mocks.submitCodexAnswer,
      retryAnswer: mocks.retryAnswer,
      generateBrief: mocks.generateBrief,
      generateCodexBrief: mocks.generateCodexBrief,
      editBrief: mocks.editBrief,
      approveBrief: mocks.approveBrief,
      requestChanges: mocks.requestChanges,
      selectNotionParent: mocks.selectNotionParent,
      syncNotion: mocks.syncNotion,
    },
    systemApi: {
      capabilities: mocks.capabilities,
    },
  };
});

function renderRoute(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route
            path={path.includes('/brief') ? '/projects/:id/brief' : '/projects/:id/interview'}
            element={element}
          />
          <Route path="/projects" element={<div>Projects destination</div>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('quality regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.list.mockResolvedValue({ projects: [] });
    mocks.api.mockResolvedValue({ connected: false });
    mocks.bridgeStatus.mockResolvedValue(null);
    mocks.capabilities.mockResolvedValue({
      model: { mode: 'mock', available: true },
      notion: { mode: 'mock', available: true },
      codex: { mode: 'enabled', available: true },
      codexLocal: { mode: 'enabled', available: true },
    });
    mocks.startInterview.mockImplementation(async (id: string) => ({
      project: { ...makeProject(), id },
    }));
  });

  it('blocks duplicate project creation while the first request is pending', async () => {
    const project = makeProject();
    let resolveCreate: ((value: { project: typeof project }) => void) | undefined;
    mocks.create.mockImplementation(
      () =>
        new Promise<{ project: typeof project }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <I18nProvider>
          <Projects />
        </I18nProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /new project/i }));
    await user.type(screen.getByLabelText(/project name/i), project.title);
    await user.type(screen.getByLabelText(/rough idea/i), project.initialPrompt);
    const form = screen
      .getByRole('button', { name: /create and begin interview/i })
      .closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    resolveCreate?.({ project });
    await waitFor(() => expect(mocks.startInterview).toHaveBeenCalledTimes(1));
  }, 10_000);

  it('reuses the client answer ID after an ambiguous network failure', async () => {
    const project = makeProject();
    mocks.get.mockResolvedValue({ project });
    mocks.submitAnswer.mockRejectedValue(new TypeError('Network request failed'));
    renderRoute(`/projects/${project.id}/interview`, <Interview />);
    const user = userEvent.setup();
    const answer = await screen.findByLabelText(/your answer/i);
    await user.type(answer, 'Founders preparing an implementation brief for Codex.');
    await user.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(mocks.submitAnswer).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(mocks.submitAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.submitAnswer.mock.calls[1]?.[1].clientAnswerId).toBe(
      mocks.submitAnswer.mock.calls[0]?.[1].clientAnswerId,
    );
    expect(mocks.submitAnswer.mock.calls[1]?.[1].answer).toBe(
      mocks.submitAnswer.mock.calls[0]?.[1].answer,
    );
  });

  it('shows the intentional unavailable state and prevents AI submissions', async () => {
    const project = makeProject();
    mocks.get.mockResolvedValue({ project });
    mocks.capabilities.mockResolvedValue({
      model: { mode: 'disabled', available: false },
      notion: { mode: 'live', available: true },
      codex: { mode: 'enabled', available: true },
      codexLocal: { mode: 'enabled', available: true },
    });
    renderRoute(`/projects/${project.id}/interview`, <Interview />);
    expect(await screen.findByRole('status')).toHaveTextContent(/local Codex demo bridge/i);
    expect(screen.getByLabelText(/your answer/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save answer/i })).toBeDisabled();
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
  });

  it('routes website answers through the paired local Codex bridge', async () => {
    const project = makeProject();
    const processed = structuredClone(project);
    let resolveAnalysis: ((value: Project['analysis']) => void) | undefined;
    processed.answers.push({
      id: '77777777-7777-4777-8777-777777777777',
      clientAnswerId: '77777777-7777-4777-8777-777777777777',
      question: project.currentQuestion!.text,
      dimension: project.currentQuestion!.dimension,
      text: 'Founders preparing a brief for Codex.',
      status: 'processed',
      errorCode: null,
      createdAt: project.createdAt,
      processedAt: project.updatedAt,
    });
    mocks.get.mockResolvedValue({ project });
    mocks.capabilities.mockResolvedValue({
      model: { mode: 'disabled', available: false },
      notion: { mode: 'live', available: true },
      codex: { mode: 'enabled', available: true },
      codexLocal: { mode: 'enabled', available: true },
    });
    mocks.bridgeStatus.mockResolvedValue({ ready: true, model: 'gpt-5.6-sol' });
    mocks.bridgeAnalyze.mockImplementation(
      () =>
        new Promise<Project['analysis']>((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    mocks.submitCodexAnswer.mockResolvedValue({ project: processed, status: 'processed' });
    renderRoute(`/projects/${project.id}/interview`, <Interview />);
    const user = userEvent.setup();
    expect(await screen.findByRole('status')).toHaveTextContent(/ready for your next answer/i);
    await user.type(
      await screen.findByLabelText(/your answer/i),
      'Founders preparing a brief for Codex.',
    );
    await user.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(mocks.bridgeAnalyze).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent(/checking alignment/i);
    await act(async () => resolveAnalysis?.(project.analysis));
    expect(mocks.submitCodexAnswer).toHaveBeenCalledTimes(1);
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/gpt-5.6-sol/);
  });

  it('stops approval when saving a dirty brief fails and skips Notion pages when disconnected', async () => {
    const project = makeProject(true);
    mocks.get.mockResolvedValue({ project });
    mocks.editBrief.mockRejectedValue(new Error('Save failed safely.'));
    renderRoute(`/projects/${project.id}/brief`, <Brief />);
    const user = userEvent.setup();
    const title = await screen.findByLabelText(/brief title/i);
    await user.clear(title);
    await user.type(title, 'Updated brief title');
    await user.click(screen.getByRole('button', { name: /approve snapshot/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed safely.');
    expect(mocks.approveBrief).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledWith('/notion/status');
    expect(mocks.api).not.toHaveBeenCalledWith('/notion/pages', expect.anything());
  });

  it('initializes the document language before user interaction', async () => {
    localStorage.setItem('lumixia-locale', 'th');
    render(
      <I18nProvider>
        <span>localized</span>
      </I18nProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'th'));
  });

  it('opens Notion authorization in a new tab without replacing Lumixia', async () => {
    const replace = vi.fn();
    const close = vi.fn();
    const popup = {
      opener: window,
      location: { replace },
      close,
    } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/notion/connect') return { authorizationUrl: 'https://api.notion.test/oauth' };
      return { connected: false, workspaceName: null };
    });
    window.history.replaceState({}, '', '/settings');
    render(
      <MemoryRouter>
        <I18nProvider>
          <Settings />
        </I18nProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /connect notion/i }));
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.opener).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://api.notion.test/oauth'));
    expect(window.location.pathname).toBe('/settings');
    open.mockRestore();
  });

  it('handles a blocked Notion authorization tab without starting OAuth', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mocks.api.mockResolvedValue({ connected: false, workspaceName: null });
    render(
      <MemoryRouter>
        <I18nProvider>
          <Settings />
        </I18nProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /connect notion/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/open a new tab/i);
    expect(mocks.api).not.toHaveBeenCalledWith('/notion/connect');
    open.mockRestore();
  });

  it('does not show a false disconnected state while Notion status is loading', async () => {
    let resolveStatus:
      ((status: { connected: boolean; workspaceName: string | null }) => void) | undefined;
    mocks.api.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          if (path !== '/notion/status') throw new Error(`Unexpected request: ${path}`);
          resolveStatus = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <I18nProvider>
          <Settings />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Checking connection…');
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect notion/i })).not.toBeInTheDocument();
    await act(async () => {
      resolveStatus?.({ connected: true, workspaceName: 'Synthetic workspace' });
    });
    expect(await screen.findByText(/Connected · Synthetic workspace/)).toBeVisible();
  });

  it('refreshes the original tab when the Notion callback reports success', async () => {
    let listener: EventListener = () => undefined;
    class TestBroadcastChannel {
      constructor(readonly name: string) {}
      addEventListener(_type: string, nextListener: EventListener) {
        listener = nextListener;
      }
      removeEventListener() {}
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    let statusRequests = 0;
    mocks.api.mockImplementation(async (path: string) => {
      if (path !== '/notion/status') throw new Error(`Unexpected request: ${path}`);
      statusRequests += 1;
      return {
        connected: statusRequests > 1,
        workspaceName: statusRequests > 1 ? 'Synthetic workspace' : null,
      };
    });
    render(
      <MemoryRouter>
        <I18nProvider>
          <Settings />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Not connected')).toBeVisible();
    listener(
      new MessageEvent('message', {
        data: { type: 'lumixia:notion-oauth-result', result: 'connected' },
      }),
    );
    expect(await screen.findByText(/Connected · Synthetic workspace/)).toBeVisible();
    expect(statusRequests).toBe(2);
    vi.unstubAllGlobals();
  });

  it('closes the revision dialog with Escape', async () => {
    const project = makeProject(true);
    mocks.get.mockResolvedValue({ project });
    renderRoute(`/projects/${project.id}/brief`, <Brief />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /reject & revise/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
