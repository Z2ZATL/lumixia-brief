import { describe, expect, it, vi } from 'vitest';
import { emptyBriefSections } from '../../shared/contracts.js';
import { emptyAssessments } from '../../server/domain/confidence.js';
import {
  DisabledModelProvider,
  ModelProviderError,
  OpenAIModelProvider,
  type ModelResponseClient,
} from '../../server/providers/model.js';
import { makeProject } from '../ui/fixtures.js';

const analysis = {
  facts: [],
  assumptions: [],
  contradictions: [],
  dimensionAssessments: emptyAssessments(),
  nextQuestion: null,
  shouldStop: false,
  stopReason: 'continue' as const,
};

describe('OpenAI provider contract without a live request', () => {
  it('sends store:false, low reasoning, the configured model, and an AbortSignal', async () => {
    const parse = vi
      .fn<ModelResponseClient['parse']>()
      .mockResolvedValue({ output_parsed: analysis });
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    const controller = new AbortController();
    const project = makeProject();
    project.locale = 'th';
    project.initialPrompt = 'ทดสอบข้อมูลภาษาไทย';

    await expect(provider.analyzeInterview(project, controller.signal)).resolves.toEqual(analysis);
    const [request, options] = parse.mock.calls[0]!;
    expect(request).toMatchObject({
      model: 'gpt-test',
      store: false,
      reasoning: { effort: 'low' },
    });
    expect(JSON.stringify(request)).toContain('ทดสอบข้อมูลภาษาไทย');
    expect(options).toEqual({ signal: controller.signal });
  });

  it('uses medium reasoning for a structured brief', async () => {
    const output = { title: 'Decision-ready brief', sections: emptyBriefSections };
    const parse = vi
      .fn<ModelResponseClient['parse']>()
      .mockResolvedValue({ output_parsed: output });
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    await expect(provider.generateBrief(makeProject())).resolves.toEqual(output);
    expect(parse.mock.calls[0]![0]).toMatchObject({
      model: 'gpt-test',
      store: false,
      reasoning: { effort: 'medium' },
    });
  });

  it('retries one 429/5xx and maps malformed output without leaking provider details', async () => {
    const retryable = Object.assign(new Error('quota detail'), { status: 429 });
    const parse = vi
      .fn<ModelResponseClient['parse']>()
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce({ output_parsed: analysis });
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    await expect(provider.analyzeInterview(makeProject())).resolves.toEqual(analysis);
    expect(parse).toHaveBeenCalledTimes(2);

    const malformed = new OpenAIModelProvider('unused', 'gpt-test', {
      parse: vi
        .fn<ModelResponseClient['parse']>()
        .mockResolvedValue({ output_parsed: { unexpected: true } }),
    });
    await expect(malformed.analyzeInterview(makeProject())).rejects.toMatchObject({
      code: 'MODEL_INVALID_RESPONSE',
    });
  });

  it('maps refusal or max-token truncation to an invalid structured response', async () => {
    const parse = vi.fn<ModelResponseClient['parse']>().mockResolvedValue({ output_parsed: null });
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    await expect(provider.analyzeInterview(makeProject())).rejects.toMatchObject({
      code: 'MODEL_INVALID_RESPONSE',
    });
    expect(parse).toHaveBeenCalledOnce();
  });

  it('retries one 5xx and maps exhausted or timeout failures to unavailable', async () => {
    const serviceFailure = Object.assign(new Error('provider detail'), { status: 503 });
    const parse = vi.fn<ModelResponseClient['parse']>().mockRejectedValue(serviceFailure);
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    await expect(provider.generateBrief(makeProject())).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    expect(parse).toHaveBeenCalledTimes(2);

    const timeout = vi
      .fn<ModelResponseClient['parse']>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(
      new OpenAIModelProvider('unused', 'gpt-test', { parse: timeout }).generateBrief(
        makeProject(),
      ),
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(timeout).toHaveBeenCalledOnce();
  });

  it('does not retry a non-retryable failure and never uses the network when disabled', async () => {
    const parse = vi
      .fn<ModelResponseClient['parse']>()
      .mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    const provider = new OpenAIModelProvider('unused', 'gpt-test', { parse });
    await expect(provider.generateBrief(makeProject())).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    expect(parse).toHaveBeenCalledTimes(1);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const disabled = new DisabledModelProvider();
    await expect(disabled.analyzeInterview(makeProject())).rejects.toEqual(
      new ModelProviderError('MODEL_NOT_CONFIGURED'),
    );
    await expect(disabled.generateBrief(makeProject())).rejects.toMatchObject({
      code: 'MODEL_NOT_CONFIGURED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
