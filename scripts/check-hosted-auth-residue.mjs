import { mkdir, writeFile } from 'node:fs/promises';
import { findForbiddenRuntimeResidues } from './auth-residue-policy.mjs';

const appOrigin = readOrigin(process.env.APP_ORIGIN);
const expectedSha = readExpectedSha(process.env.DEPLOYMENT_SHA);
const [healthResponse, readyResponse, protectedResponse, pageResponse] = await Promise.all([
  fetchWithRetry(new URL('/api/health', appOrigin)),
  fetchWithRetry(new URL('/api/ready', appOrigin)),
  fetchWithRetry(new URL('/api/projects', appOrigin)),
  fetchWithRetry(appOrigin),
]);

const health = await readJson(healthResponse);
const ready = await readJson(readyResponse);
const html = await pageResponse.text();
const assetUrls = findAssetUrls(appOrigin, html);
const forbiddenResidues = findForbiddenRuntimeResidues('index.html', html);
const assetFailures = [];

for (const assetUrl of assetUrls) {
  const response = await fetchWithRetry(assetUrl);
  if (response.status !== 200) {
    assetFailures.push(assetUrl.pathname.split('/').at(-1) ?? 'unknown-asset');
    continue;
  }
  forbiddenResidues.push(
    ...findForbiddenRuntimeResidues(
      assetUrl.pathname.split('/').at(-1) ?? 'unknown-asset',
      await response.text(),
    ),
  );
}

const csp = pageResponse.headers.get('content-security-policy') ?? '';
const summary = {
  healthStatus: healthResponse.status,
  readinessStatus: readyResponse.status,
  protectedStatus: protectedResponse.status,
  rootStatus: pageResponse.status,
  shaVerified: health?.sha === expectedSha,
  ready: ready?.ready === true,
  assetCount: assetUrls.length,
  assetFailureCount: assetFailures.length,
  forbiddenResidues,
  clerkInCsp: /clerk/i.test(csp),
  credentialsHeaderPresent: pageResponse.headers.has('access-control-allow-credentials'),
};

await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/hosted-auth-residue.json',
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

const failures = [];
if (summary.healthStatus !== 200) failures.push('health status');
if (summary.readinessStatus !== 200 || !summary.ready) failures.push('database readiness');
if (summary.protectedStatus !== 401) failures.push('signed-out protection');
if (summary.rootStatus !== 200) failures.push('landing status');
if (!summary.shaVerified) failures.push('deployed SHA');
if (summary.assetCount === 0 || summary.assetFailureCount > 0) failures.push('client assets');
if (summary.forbiddenResidues.length > 0) failures.push('legacy authentication residue');
if (summary.clerkInCsp) failures.push('legacy CSP domain');
if (summary.credentialsHeaderPresent) failures.push('credential-bearing CORS header');

if (failures.length > 0) {
  throw new Error(`Hosted deployment verification failed: ${failures.join(', ')}.`);
}

process.stdout.write(
  `Hosted deployment verification passed for ${summary.assetCount} JavaScript assets.\n`,
);

function readOrigin(value) {
  if (!value) throw new Error('APP_ORIGIN is required.');
  const origin = new URL(value);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without credentials.');
  }
  origin.pathname = '/';
  origin.search = '';
  origin.hash = '';
  return origin;
}

function readExpectedSha(value) {
  if (!value || !/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error('DEPLOYMENT_SHA must be a full Git commit SHA.');
  }
  return value;
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status < 500 || attempt === 3) return response;
      lastError = new Error(`Provider returned ${response.status} for ${url.pathname}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error('Hosted request failed.');
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function findAssetUrls(origin, html) {
  const paths = [...html.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g)].map((match) => match[1]);
  return [...new Set(paths)]
    .map((path) => new URL(path, origin))
    .filter((url) => url.origin === origin.origin && url.pathname.startsWith('/assets/'));
}
