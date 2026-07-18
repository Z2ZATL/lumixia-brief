import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  codexBriefDraftInputSchema,
  codexCreateProjectInputSchema,
  codexInterviewTurnInputSchema,
  type Project,
} from '../../shared/contracts.js';
import { HttpError } from '../http.js';
import type { RequestIdentity } from '../routes/request.js';
import { BriefService } from '../services/briefs.js';
import { InterviewService } from '../services/interview.js';
import { ProjectService } from '../services/projects.js';

const resultSchema = { result: z.unknown() };
const oauthScheme = [{ type: 'oauth2', scopes: ['openid'] }] as const;
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
const idempotentWrite = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

interface CodexTools {
  projects: ProjectService;
  interview: InterviewService;
  briefs: BriefService;
}

export function createLumixiaMcpServer(identity: RequestIdentity, tools: CodexTools) {
  const server = new McpServer(
    { name: 'lumixia-brief', version: '0.1.0' },
    {
      instructions:
        'Interview one question at a time. Treat the server currentQuestion as authoritative. ' +
        'Separate facts, assumptions, contradictions, and human decisions. The server computes ' +
        'confidence and stop rules. Never approve or sync a brief; the user must do that in Lumixia.',
    },
  );
  registerProjectTools(server, identity, tools);
  registerInterviewTools(server, identity, tools);
  registerBriefTools(server, identity, tools);
  return server;
}

function registerProjectTools(server: McpServer, identity: RequestIdentity, tools: CodexTools) {
  server.registerTool(
    'list_projects',
    descriptor('List Lumixia projects', "List the current user's project summaries.", {}, readOnly),
    () => safeCall(async () => (await tools.projects.list(identity)).map(projectSummary)),
  );
  server.registerTool(
    'get_project_context',
    descriptor(
      'Get interview context',
      'Read one owned project, its evidence, current question, and brief versions.',
      { projectId: z.string().uuid() },
      readOnly,
    ),
    (raw) => {
      const { projectId } = z.object({ projectId: z.string().uuid() }).parse(raw);
      return safeCall(async () => projectContext(await tools.projects.get(identity, projectId)));
    },
  );
  server.registerTool(
    'create_project',
    descriptor(
      'Create Lumixia project',
      'Create an idempotent project from a vague idea. Use a stable UUID for clientProjectId.',
      codexCreateProjectInputSchema.shape,
      idempotentWrite,
    ),
    (raw) => {
      const input = codexCreateProjectInputSchema.parse(raw);
      return safeCall(async () => {
        const result = await tools.projects.createFromCodex(identity, input);
        return { ...result, project: projectContext(result.project) };
      });
    },
  );
}

function registerInterviewTools(server: McpServer, identity: RequestIdentity, tools: CodexTools) {
  server.registerTool(
    'record_interview_turn',
    descriptor(
      'Record analyzed interview turn',
      'Save one user answer plus structured evidence analysis. Evidence IDs must use answer IDs from context; use clientAnswerId for the new answer. Server overrides stop and next-question decisions.',
      codexInterviewTurnInputSchema.shape,
      idempotentWrite,
    ),
    (raw) => {
      const { projectId, ...input } = codexInterviewTurnInputSchema.parse(raw);
      return safeCall(async () => {
        const result = await tools.interview.submitFromCodex(identity, projectId, input);
        return { ...result, project: projectContext(result.project) };
      });
    },
  );
}

function registerBriefTools(server: McpServer, identity: RequestIdentity, tools: CodexTools) {
  server.registerTool(
    'save_brief_draft',
    descriptor(
      'Save structured brief draft',
      'Save a structured draft only when the server interview threshold is met. Human approval and Notion sync remain in the Lumixia web app.',
      codexBriefDraftInputSchema.shape,
      idempotentWrite,
    ),
    (raw) => {
      const { projectId, brief } = codexBriefDraftInputSchema.parse(raw);
      return safeCall(async () => {
        const result = await tools.briefs.generateFromCodex(identity, projectId, brief);
        return {
          ...result,
          project: projectContext(result.project),
          brief: briefForCodex(result.brief),
        };
      });
    },
  );
}

function descriptor(
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodType>,
  annotations: typeof readOnly | typeof idempotentWrite,
) {
  return {
    title,
    description,
    inputSchema,
    outputSchema: resultSchema,
    annotations,
    _meta: { securitySchemes: oauthScheme },
  };
}

async function safeCall(operation: () => Promise<unknown>) {
  try {
    return toolResult(await operation());
  } catch (error) {
    const message =
      error instanceof HttpError
        ? `${error.code}: ${error.message}`
        : 'LUMIXIA_OPERATION_FAILED: The operation could not be completed safely.';
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  }
}

function toolResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: { result },
  };
}

function projectSummary(project: Project) {
  return {
    id: project.id,
    revision: project.revision,
    title: project.title,
    locale: project.locale,
    workflowStatus: project.workflowStatus,
    syncStatus: project.syncStatus,
    answerCount: project.answers.length,
    updatedAt: project.updatedAt,
  };
}

function projectContext(project: Project) {
  return {
    id: project.id,
    revision: project.revision,
    title: project.title,
    initialPrompt: project.initialPrompt,
    locale: project.locale,
    workflowStatus: project.workflowStatus,
    syncStatus: project.syncStatus,
    answers: project.answers,
    analysis: project.analysis,
    initialAssessments: project.initialAssessments,
    currentQuestion: project.currentQuestion,
    briefVersions: project.briefVersions.map(briefForCodex),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function briefForCodex(brief: Project['briefVersions'][number]) {
  const safeBrief: Partial<typeof brief> = { ...brief };
  delete safeBrief.approvedBy;
  return safeBrief;
}
