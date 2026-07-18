import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { projectSchema } from '../../shared/contracts.js';
import { CodexBridgeExecutionError, type CodexLocalRunner } from './runner.js';

const interviewRequestSchema = z
  .object({
    project: projectSchema,
    clientAnswerId: z.string().uuid(),
    answer: z.string().trim().min(1).max(10_000),
  })
  .strict();
const briefRequestSchema = z.object({ project: projectSchema }).strict();

export interface BridgeServerOptions {
  runner: Pick<CodexLocalRunner, 'analyzeInterview' | 'generateBrief' | 'model'>;
  token?: string;
  allowedOrigins: ReadonlySet<string>;
}

export function createCodexBridgeApp(options: BridgeServerOptions) {
  const token = options.token ?? randomBytes(32).toString('base64url');
  const app = express();
  let busy = false;
  app.disable('x-powered-by');
  app.use(responseHeaders);
  app.get('/pair', pairingPage(options.allowedOrigins, token, options.runner.model));
  app.use(cors(options.allowedOrigins));
  app.use(requireToken(token));
  app.use(express.json({ limit: '256kb', strict: true }));
  app.get('/health', (_req, res) => {
    res.json({ ready: true, model: options.runner.model });
  });
  app.post(
    '/v1/interview',
    asyncHandler(async (req, res) => {
      if (busy) return sendBusy(res);
      busy = true;
      const controller = requestController(req);
      try {
        const input = interviewRequestSchema.parse(req.body);
        const result = await options.runner.analyzeInterview(
          input.project,
          input.clientAnswerId,
          input.answer,
          controller.signal,
        );
        return res.json({ result, model: options.runner.model });
      } finally {
        busy = false;
      }
    }),
  );
  app.post(
    '/v1/brief',
    asyncHandler(async (req, res) => {
      if (busy) return sendBusy(res);
      busy = true;
      const controller = requestController(req);
      try {
        const input = briefRequestSchema.parse(req.body);
        const result = await options.runner.generateBrief(input.project, controller.signal);
        return res.json({ result, model: options.runner.model });
      } finally {
        busy = false;
      }
    }),
  );
  app.use(errorHandler);
  return app;
}

function responseHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  next();
}

function cors(allowedOrigins: ReadonlySet<string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('origin');
    if (!origin || isLoopbackSelfOrigin(req, origin)) {
      next();
      return;
    }
    if (!allowedOrigins.has(origin)) {
      res.status(403).json({ error: { code: 'BRIDGE_ORIGIN_DENIED' } });
      return;
    }
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') res.status(204).end();
    else next();
  };
}

function isLoopbackSelfOrigin(req: Request, origin: string): boolean {
  const host = req.get('host') ?? '';
  return /^127\.0\.0\.1:\d+$/.test(host) && origin === `http://${host}`;
}

function pairingPage(allowedOrigins: ReadonlySet<string>, token: string, model: string) {
  return (req: Request, res: Response): void => {
    const origin = typeof req.query['origin'] === 'string' ? req.query['origin'] : '';
    if (!allowedOrigins.has(origin)) {
      res.status(403).type('text').send('Pairing origin denied.');
      return;
    }
    const nonce = randomBytes(18).toString('base64');
    res.set(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'`,
    );
    res.type('html').send(pairingHtml(origin, token, model, nonce));
  };
}

function pairingHtml(origin: string, token: string, model: string, nonce: string): string {
  const readyMessage = JSON.stringify({ type: 'lumixia:codex-bridge:ready', model });
  const openerOrigin = JSON.stringify(origin);
  const bearerToken = JSON.stringify(token);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Lumixia Codex Bridge</title></head><body><p>Local Codex is connected. Keep this window open during the Lumixia demo.</p><script nonce="${nonce}">const openerOrigin=${openerOrigin};const token=${bearerToken};const active=new Map();const reply=(value)=>{if(window.opener){window.opener.postMessage(value,openerOrigin);}};const errorCode=(body)=>body&&typeof body==='object'&&body.error&&typeof body.error.code==='string'?body.error.code:'BRIDGE_OPERATION_FAILED';reply(${readyMessage});window.addEventListener('message',async(event)=>{if(event.origin!==openerOrigin||event.source!==window.opener||!event.data||typeof event.data!=='object'){return;}const message=event.data;if(message.type==='lumixia:codex-bridge:cancel'&&typeof message.id==='string'){active.get(message.id)?.abort();return;}if(message.type!=='lumixia:codex-bridge:request'||typeof message.id!=='string'){return;}const route=message.action==='health'?'/health':message.action==='interview'?'/v1/interview':message.action==='brief'?'/v1/brief':null;if(!route){reply({type:'lumixia:codex-bridge:response',id:message.id,ok:false,code:'BRIDGE_INVALID_REQUEST'});return;}const controller=new AbortController();active.set(message.id,controller);try{const hasBody=message.action!=='health';const response=await fetch(route,{method:hasBody?'POST':'GET',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token,...(hasBody?{'Content-Type':'application/json'}:{})},...(hasBody?{body:JSON.stringify(message.payload??{})}:{}),signal:controller.signal});const body=await response.json().catch(()=>null);if(response.ok){reply({type:'lumixia:codex-bridge:response',id:message.id,ok:true,body});}else{reply({type:'lumixia:codex-bridge:response',id:message.id,ok:false,code:errorCode(body)});}}catch(error){reply({type:'lumixia:codex-bridge:response',id:message.id,ok:false,code:error&&error.name==='AbortError'?'BRIDGE_CANCELLED':'BRIDGE_UNAVAILABLE'});}finally{active.delete(message.id);}});</script></body></html>`;
}

function requireToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      res.status(401).json({ error: { code: 'BRIDGE_AUTH_REQUIRED' } });
      return;
    }
    next();
  };
}

function requestController(req: Request): AbortController {
  const controller = new AbortController();
  req.once('aborted', () => controller.abort());
  return controller;
}

function sendBusy(res: Response) {
  return res.status(409).json({ error: { code: 'BRIDGE_BUSY' } });
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<Response>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: { code: 'BRIDGE_INVALID_REQUEST' } });
    return;
  }
  const code = error instanceof CodexBridgeExecutionError ? error.code : 'BRIDGE_OPERATION_FAILED';
  res.status(code === 'CODEX_CANCELLED' ? 504 : 502).json({ error: { code } });
}
