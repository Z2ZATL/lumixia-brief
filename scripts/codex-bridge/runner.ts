import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { z, type ZodType } from 'zod';
import {
  generatedBriefSchema,
  interviewAnalysisSchema,
  type GeneratedBrief,
  type InterviewAnalysis,
  type Project,
} from '../../shared/contracts.js';
import { briefPrompt, interviewPrompt } from './prompts.js';

const maxOutputBytes = 512 * 1024;
const require = createRequire(import.meta.url);

export class CodexBridgeExecutionError extends Error {
  constructor(readonly code: 'CODEX_CANCELLED' | 'CODEX_FAILED' | 'CODEX_INVALID_OUTPUT') {
    super(code);
    this.name = 'CodexBridgeExecutionError';
  }
}

interface RunnerWorkspace {
  directory: string;
  interviewSchema: string;
  briefSchema: string;
}

export class CodexLocalRunner {
  private constructor(
    readonly model: string,
    private readonly timeoutMs: number,
    private readonly workspace: RunnerWorkspace,
  ) {}

  static async create(model: string, timeoutMs: number): Promise<CodexLocalRunner> {
    return new CodexLocalRunner(model, timeoutMs, await createWorkspace());
  }

  async close(): Promise<void> {
    await rm(this.workspace.directory, { recursive: true, force: true });
  }

  async analyzeInterview(
    project: Project,
    clientAnswerId: string,
    answer: string,
    signal?: AbortSignal,
  ): Promise<InterviewAnalysis> {
    return this.execute(
      interviewPrompt(project, clientAnswerId, answer),
      this.workspace.interviewSchema,
      interviewAnalysisSchema,
      'low',
      signal,
    );
  }

  async generateBrief(project: Project, signal?: AbortSignal): Promise<GeneratedBrief> {
    return this.execute(
      briefPrompt(project),
      this.workspace.briefSchema,
      generatedBriefSchema,
      'medium',
      signal,
    );
  }

  private async execute<T>(
    prompt: string,
    schemaPath: string,
    schema: ZodType<T>,
    effort: 'low' | 'medium',
    signal?: AbortSignal,
  ): Promise<T> {
    const output = await executeCodex({
      prompt,
      schemaPath,
      model: this.model,
      effort,
      cwd: this.workspace.directory,
      timeoutMs: this.timeoutMs,
      ...(signal ? { signal } : {}),
    });
    try {
      return schema.parse(JSON.parse(output));
    } catch {
      throw new CodexBridgeExecutionError('CODEX_INVALID_OUTPUT');
    }
  }
}

async function createWorkspace(): Promise<RunnerWorkspace> {
  const directory = await mkdtemp(path.join(tmpdir(), 'lumixia-codex-bridge-'));
  const interviewSchema = path.join(directory, 'interview.schema.json');
  const briefSchema = path.join(directory, 'brief.schema.json');
  await Promise.all([
    writeFile(interviewSchema, JSON.stringify(z.toJSONSchema(interviewAnalysisSchema))),
    writeFile(briefSchema, JSON.stringify(z.toJSONSchema(generatedBriefSchema))),
  ]);
  return { directory, interviewSchema, briefSchema };
}

interface ExecuteInput {
  prompt: string;
  schemaPath: string;
  model: string;
  effort: 'low' | 'medium';
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

function executeCodex(input: ExecuteInput): Promise<string> {
  const entry = require.resolve('@openai/codex/bin/codex.js');
  const args = codexArguments(entry, input);
  const child = spawn(process.execPath, args, {
    cwd: input.cwd,
    env: { ...process.env, NO_COLOR: '1' },
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return collectOutput(child, input);
}

function codexArguments(entry: string, input: ExecuteInput): string[] {
  return [
    entry,
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    '-c',
    `model_reasoning_effort="${input.effort}"`,
    '--model',
    input.model,
    '--cd',
    input.cwd,
    '--output-schema',
    input.schemaPath,
    '--color',
    'never',
    '-',
  ];
}

function collectOutput(
  child: ChildProcessWithoutNullStreams,
  input: ExecuteInput,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    let diagnosticsBytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(output.trim());
    };
    const cancel = () => {
      child.kill();
      finish(new CodexBridgeExecutionError('CODEX_CANCELLED'));
    };
    const timer = setTimeout(cancel, input.timeoutMs);
    input.signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > maxOutputBytes) cancel();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      diagnosticsBytes += chunk.length;
      if (diagnosticsBytes > maxOutputBytes) cancel();
    });
    child.once('error', () => finish(new CodexBridgeExecutionError('CODEX_FAILED')));
    child.once('exit', (code) => {
      if (code === 0 && output.trim()) finish();
      else finish(new CodexBridgeExecutionError('CODEX_FAILED'));
    });
    child.stdin.end(input.prompt);
  });
}
