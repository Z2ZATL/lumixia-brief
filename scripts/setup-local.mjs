import { copyFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists('.env.local'))) {
  await copyFile('.env.example', '.env.local');
  process.stdout.write('Created .env.local from the safe local template.\n');
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['install'], { stdio: 'inherit', shell: false });
child.on('exit', (code) => process.exit(code ?? 1));
