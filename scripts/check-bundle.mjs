import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const assetDirectory = 'dist/assets';
const files = (await readdir(assetDirectory)).filter((file) => file.endsWith('.js'));
const assets = [];
for (const file of files) {
  const content = await readFile(join(assetDirectory, file));
  assets.push({ file, rawBytes: content.byteLength, gzipBytes: gzipSync(content).byteLength });
}
const html = await readFile('dist/index.html', 'utf8');
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
  `${JSON.stringify({ initialAssets, deferredAssets: assets.filter((asset) => !entryFiles.includes(asset.file)), totals, limits }, null, 2)}\n`,
  'utf8',
);
if (totals.rawBytes > limits.rawBytes || totals.gzipBytes > limits.gzipBytes) {
  throw new Error(
    `Client bundle ${totals.rawBytes} raw / ${totals.gzipBytes} gzip exceeds the BL-007 ceiling.`,
  );
}
