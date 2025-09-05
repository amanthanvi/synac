#!/usr/bin/env node
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const pExecFile = promisify(execFile);

const CWD = process.cwd();

async function getSourceDateEpoch() {
  const envVal = process.env.SOURCE_DATE_EPOCH;
  if (envVal && /^\d+$/.test(envVal)) {
    return envVal;
  }
  try {
    const { stdout } = await pExecFile('git', ['log', '-1', '--pretty=%ct'], { cwd: CWD });
    const ts = stdout.trim();
    if (ts && /^\d+$/.test(ts)) return ts;
  } catch (err) {
    // ignore
  }
  return undefined;
}

async function run(cmd, args, env) {
  const { stdout, stderr } = await pExecFile(cmd, args, {
    cwd: CWD,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function walk(dir) {
  const out = [];
  async function rec(d) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      // Exclude hidden files (starting with ".") and known system files
      if (ent.name.startsWith('.')) continue;
      // Add more system file checks here if needed, e.g.:
      // if (ent.name === 'Thumbs.db') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        await rec(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  await rec(dir);
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function sha256File(p) {
  const buf = await fs.readFile(p);
  const h = createHash('sha256').update(buf).digest('hex');
  return h;
}

async function computeChecksums(distDir, outFile) {
  const files = await walk(distDir);
  const rel = files.map((f) => {
    const rp = toPosix(path.relative(distDir, f));
    return rp;
  });
  rel.sort((a, b) => a.localeCompare(b));
  const lines = [];
  for (const rp of rel) {
    const abs = path.join(distDir, rp);
    const hash = await sha256File(abs);
    lines.push(`${hash}  ${rp}`);
  }
  await ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, lines.join('\n') + '\n', 'utf8');
}

async function runBuildAndHash(iter, envPinned) {
  const dist = path.join(CWD, 'dist');
  const outFile = path.join(CWD, '.determinism', `checksums${iter}.txt`);
  await rmrf(dist);
  await run('npm', ['run', 'build'], envPinned);
  await computeChecksums(dist, outFile);
  return outFile;
}

async function diffFiles(a, b) {
  try {
    const { stdout } = await pExecFile('git', ['diff', '--no-index', '--unified=3', a, b], {
      cwd: CWD,
    });
    return stdout;
  } catch (err) {
    // git diff returns exit code 1 when files differ; still capture stdout
    if (err && err.stdout) return err.stdout.toString();
    return '';
  }
}

async function main() {
  const sde = await getSourceDateEpoch();
  const envPinned = {
    ...process.env,
    NODE_ENV: 'production',
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
    ASTRO_TELEMETRY_DISABLED: '1',
    ...(sde ? { SOURCE_DATE_EPOCH: sde } : {}),
  };

  const c1 = await runBuildAndHash(1, envPinned);
  const c2 = await runBuildAndHash(2, envPinned);

  const [t1, t2] = await Promise.all([fs.readFile(c1, 'utf8'), fs.readFile(c2, 'utf8')]);

  if (t1 === t2) {
    console.log('Deterministic: OK');
    process.exit(0);
  }

  console.error(
    'Deterministic: FAILED — checksum differences detected between two consecutive builds.\n',
  );
  const diff = await diffFiles(c1, c2);
  if (diff && diff.trim()) {
    console.error(diff.trim());
  } else {
    console.error('Checksums differ but no unified diff available (git not found?).');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
