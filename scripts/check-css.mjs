import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sourceText(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|html)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
}

function selectorInventory(css) {
  const selectors = [];
  const stack = [];
  let buffer = '';
  for (const character of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (character === '{') {
      const prelude = buffer.trim();
      buffer = '';
      if (prelude.startsWith('@')) stack.push({ kind: 'at-rule', name: prelude });
      else {
        const scope = stack
          .filter((entry) => entry.kind === 'at-rule')
          .map((entry) => entry.name)
          .join(' > ');
        for (const selector of splitSelectorList(prelude)) {
          if (!/^(?:from|to|\d+%)$/.test(selector)) selectors.push({ scope, selector });
        }
        stack.push({ kind: 'rule', name: prelude });
      }
    } else if (character === '}') {
      buffer = '';
      stack.pop();
    } else buffer += character;
  }
  return selectors;
}

function splitSelectorList(prelude) {
  const selectors = [];
  let current = '';
  let depth = 0;
  for (const character of prelude) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      if (current.trim()) selectors.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

const css = await readFile('src/styles.css', 'utf8');
const source = `${await sourceText('src')}\n${await readFile('index.html', 'utf8')}`;
const selectors = selectorInventory(css);
const occurrences = new Map();
for (const item of selectors) {
  const key = `${item.scope}\u0000${item.selector}`;
  occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
}
const duplicates = [...occurrences]
  .filter(([, count]) => count > 1)
  .map(([key, count]) => {
    const [scope, selector] = key.split('\u0000');
    return { scope, selector, count };
  });
const classes = [
  ...new Set(
    selectors.flatMap(({ selector }) =>
      [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]),
    ),
  ),
];
const unusedClasses = classes.filter((className) => !source.includes(className));
const summary = {
  selectorCount: selectors.length,
  classCount: classes.length,
  duplicateSelectorsInSameScope: duplicates,
  classesWithoutConsumers: unusedClasses,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/css-audit.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
if (duplicates.length || unusedClasses.length) {
  throw new Error(
    `CSS audit failed: ${duplicates.length} duplicate selectors and ${unusedClasses.length} classes without consumers.`,
  );
}
process.stdout.write(
  `CSS audit: ${selectors.length} selectors, ${classes.length} classes, no duplicates or unused classes.\n`,
);
