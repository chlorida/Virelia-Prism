import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'src-tauri', 'target', 'release', 'virelia-prism.exe');

if (!existsSync(exe)) {
  console.error('[Virelia] Release exe not found. Run: npm run tauri:build');
  process.exit(1);
}

console.log('[Virelia] Launching', exe);
const child = spawn(exe, [], {
  cwd: path.dirname(exe),
  detached: true,
  stdio: 'ignore',
});
child.unref();
