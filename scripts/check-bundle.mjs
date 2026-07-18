import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findForbiddenRuntimeResidues } from './auth-residue-policy.mjs';

const assetDirectory = 'dist/assets';
const files = (await readdir(assetDirectory)).filter((file) => file.endsWith('.js'));
const assets = [];
const forbiddenResidues = [];
for (const file of files) {
  const content = await readFile(join(assetDirectory, file));
  assets.push({ file, rawBytes: content.byteLength, gzipBytes: gzipSync(content).byteLength });
  forbiddenResidues.push(...findForbiddenRuntimeResidues(file, content.toString('utf8')));
}
const html = await readFile('dist/index.html', 'utf8');
forbiddenResidues.push(...findForbiddenRuntimeResidues('index.html', html));
const entryFiles = [...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)].map(
  (match) => match[1],
);
const initialAssets = assets.filter((asset) => entryFiles.includes(asset.file));
const totals = initialAssets.reduce(
  (result, asset) => ({
    rawBytes: result.rawBytes + asset.rawBytes,
    gzipBytes: result.gzipBytes + asset.gzipBytes,
  }),
  { rawBytes: 0, gzipBytes: 0 },
);
const limits = { rawBytes: 450_000, gzipBytes: 135_000 };
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/bundle-summary.json',
  `${JSON.stringify({ initialAssets, deferredAssets: assets.filter((asset) => !entryFiles.includes(asset.file)), totals, limits, forbiddenResidues }, null, 2)}\n`,
  'utf8',
);
if (forbiddenResidues.length > 0) {
  throw new Error(
    `Client bundle contains forbidden authentication residue: ${forbiddenResidues
      .map((residue) => `${residue.policy} in ${residue.file}`)
      .join(', ')}.`,
  );
}
if (totals.rawBytes > limits.rawBytes || totals.gzipBytes > limits.gzipBytes) {
  throw new Error(
    `Client bundle ${totals.rawBytes} raw / ${totals.gzipBytes} gzip exceeds the BL-007 ceiling.`,
  );
}
