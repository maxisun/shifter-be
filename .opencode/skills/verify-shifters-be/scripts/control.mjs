#!/usr/bin/env node
// Verification control for shifters-be.
//
// Builds and launches the API on an isolated port, checks that the running
// instance is worth driving, issues real HTTP requests, and writes evidence.
// Dependency-free: Node's global fetch plus the POSIX tools on macOS.
//
// Run `control.mjs --help` for the command list.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

function findRoot() {
  let dir = import.meta.dirname;
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        if (JSON.parse(readFileSync(pkgPath, 'utf8')).name === 'shifters-be') {
          return dir;
        }
      } catch {
        // Not a readable package manifest; keep walking.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `cannot find the shifters-be repo root above ${import.meta.dirname}`,
  );
}

const ROOT = findRoot();
const STATE_DIR = path.join(ROOT, '.verify');
const CURRENT_FILE = path.join(STATE_DIR, 'current');
const RUNS_DIR = path.join(STATE_DIR, 'runs');
const DEFAULT_PORT = Number(process.env.VERIFY_PORT ?? 3311);
const READY_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;
const READY_POLL_MS = 100;
const PROBE_TIMEOUT_MS = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};

const runDir = (id) => path.join(RUNS_DIR, id);

async function readCurrentId(explicit) {
  if (explicit) return explicit;
  try {
    return (await fs.readFile(CURRENT_FILE, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

async function resolveRun(explicit) {
  const id = await readCurrentId(explicit);
  if (!id) return null;
  try {
    const run = JSON.parse(
      await fs.readFile(path.join(runDir(id), 'run.json'), 'utf8'),
    );
    return { id, run };
  } catch {
    return null;
  }
}

async function writeRun(run) {
  await fs.writeFile(
    path.join(runDir(run.id), 'run.json'),
    `${JSON.stringify(run, null, 2)}\n`,
  );
}

const isAlive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const commandOf = (pid) => {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
};

const isOurApp = (pid) => commandOf(pid).includes('dist/main.js');

function listenersOn(port) {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8' },
    ).trim();
    return out ? out.split('\n').map(Number) : [];
  } catch {
    return [];
  }
}

async function probe(url, method = 'GET') {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const body = await response.text();
    const headers = {};
    for (const [name, value] of response.headers) headers[name] = value;
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return { ok: false, error: error.cause?.code ?? error.message };
  }
}

const newestSource = async (dir) => {
  let newest = { file: null, mtimeMs: 0 };
  const walk = async (current) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const { mtimeMs } = await fs.stat(full);
        if (mtimeMs > newest.mtimeMs) newest = { file: full, mtimeMs };
      }
    }
  };
  await walk(dir);
  return newest;
};

const tail = async (file, lines = 25) => {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text
      .replace(/\u001b\[[0-9;]*m/g, '')
      .trimEnd()
      .split('\n')
      .slice(-lines)
      .join('\n');
  } catch {
    return '(no log)';
  }
};

function newRunId(port) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  return `${stamp}-p${port}`;
}

async function launch(options) {
  const port = Number(options.port ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`invalid port ${JSON.stringify(options.port)}`);
  }

  const previous = await resolveRun();
  if (previous && isAlive(previous.run.pid)) {
    fail(
      `run "${previous.id}" is still active (pid ${previous.run.pid}, port ${previous.run.port}). Stop it first: control.mjs stop`,
    );
  }

  const owners = listenersOn(port);
  if (owners.length > 0) {
    fail(
      `port ${port} is already in use by pid ${owners.join(', ')}. Pass --port with a free port.`,
    );
  }

  const id = options['run-id'] ?? newRunId(port);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    fail(`invalid run id ${JSON.stringify(id)}; use letters, digits, dot, dash, underscore`);
  }

  const dir = runDir(id);
  await fs.mkdir(path.join(dir, 'artifacts'), { recursive: true });
  await fs.writeFile(CURRENT_FILE, `${id}\n`);

  const run = {
    id,
    port,
    root: ROOT,
    pid: null,
    status: 'starting',
    startedAt: new Date().toISOString(),
    node: process.version,
    nodeEnv: 'production',
    build: options['skip-build'] ? 'skipped' : 'rebuilt',
    appLog: path.join(dir, 'app.log'),
    artifacts: path.join(dir, 'artifacts'),
  };

  if (!options['skip-build']) {
    const log = await fs.open(path.join(dir, 'build.log'), 'w');
    let built;
    try {
      built = spawnSync('pnpm', ['run', 'build'], {
        cwd: ROOT,
        stdio: ['ignore', log.fd, log.fd],
      });
    } catch (error) {
      await log.close();
      run.status = 'build-failed';
      await writeRun(run);
      fail(
        `could not run pnpm build (${error.message}). See ${path.join(dir, 'build.log')}`,
      );
    }
    await log.close();
    if (built.status !== 0) {
      run.status = 'build-failed';
      await writeRun(run);
      fail(`build exited ${built.status}. See ${path.join(dir, 'build.log')}`);
    }
  }

  const entry = path.join(ROOT, 'dist', 'main.js');
  try {
    await fs.access(entry);
  } catch {
    run.status = 'missing-build';
    await writeRun(run);
    fail(`missing ${entry}. Launch without --skip-build.`);
  }

  const appLog = await fs.open(run.appLog, 'w');
  let child;
  try {
    child = spawn(process.execPath, [entry], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      detached: true,
      stdio: ['ignore', appLog.fd, appLog.fd],
    });
  } catch (error) {
    await appLog.close();
    run.status = 'spawn-failed';
    await writeRun(run);
    fail(`could not start ${entry}: ${error.message}`);
  }
  child.unref();
  await appLog.close();

  run.pid = child.pid;
  await writeRun(run);

  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    if (!isAlive(child.pid)) {
      run.status = 'died';
      await writeRun(run);
      console.error(
        `FAIL the app exited before it was ready. Log:\n${await tail(run.appLog)}`,
      );
      process.exit(1);
    }
    last = await probe(url);
    if (last.ok) break;
    await sleep(READY_POLL_MS);
  }

  if (!last?.ok) {
    run.status = 'not-ready';
    await writeRun(run);
    fail(
      `no HTTP response from ${url} within ${READY_TIMEOUT_MS / 1000}s. Log:\n${await tail(run.appLog)}`,
    );
  }

  run.status = 'ready';
  run.readyAt = new Date().toISOString();
  run.readyStatus = last.status;
  await writeRun(run);

  console.log(`run    ${id}`);
  console.log(`pid    ${child.pid}`);
  console.log(`url    ${url}`);
  console.log(`node   ${process.version} (NODE_ENV=production)`);
  console.log(`log    ${run.appLog}`);
  console.log(`proof  ${run.artifacts}`);
  console.log(`ready  HTTP ${last.status} after ${last.ms}ms`);
  console.log('');
  console.log('Next: control.mjs doctor');
}

async function doctor(options) {
  const active = await resolveRun(options['run-id']);
  if (!active) {
    fail('no verification run found. Launch one first: control.mjs launch');
  }
  const { id, run } = active;
  const results = [];
  const add = (level, message) => results.push({ level, message });

  if (!isAlive(run.pid)) {
    add('FAIL', `pid ${run.pid} is not running`);
  } else if (!isOurApp(run.pid)) {
    add(
      'FAIL',
      `pid ${run.pid} is not this app: "${commandOf(run.pid).slice(0, 120)}"`,
    );
  } else {
    add('PASS', `pid ${run.pid} is running dist/main.js`);
  }

  const owners = listenersOn(run.port);
  if (owners.length === 0) {
    add('FAIL', `nothing is listening on port ${run.port}`);
  } else if (!owners.includes(run.pid)) {
    add(
      'FAIL',
      `port ${run.port} is owned by pid ${owners.join(', ')}, not ${run.pid}`,
    );
  } else {
    add('PASS', `port ${run.port} is owned by pid ${run.pid}`);
  }

  const distMain = path.join(ROOT, 'dist', 'main.js');
  try {
    const built = await fs.stat(distMain);
    const newest = await newestSource(path.join(ROOT, 'src'));
    if (newest.mtimeMs > built.mtimeMs) {
      add(
        'FAIL',
        `dist/main.js is older than ${path.relative(ROOT, newest.file)}; relaunch to rebuild`,
      );
    } else {
      add('PASS', 'dist/main.js is newer than every src/**/*.ts');
    }
  } catch {
    add('FAIL', 'dist/main.js is missing; relaunch without --skip-build');
  }

  try {
    const pinned = (await fs.readFile(path.join(ROOT, '.nvmrc'), 'utf8')).trim();
    const launched = (run.node ?? process.version).replace(/^v/, '');
    if (launched === pinned || launched.startsWith(`${pinned}.`)) {
      add('PASS', `the app runs on node v${launched}, matching .nvmrc ${pinned}`);
    } else {
      add(
        'WARN',
        `the app runs on node v${launched}, not .nvmrc ${pinned}; it still runs, record it`,
      );
    }
  } catch {
    add('WARN', 'cannot read .nvmrc; node version was not checked');
  }

  const url = `http://127.0.0.1:${run.port}/`;
  const response = await probe(url);
  if (!response.ok) {
    add('FAIL', `GET ${url} did not answer (${response.error})`);
  } else {
    add(
      'PASS',
      `GET ${url} answered HTTP ${response.status} in ${response.ms}ms (feature correctness is the journey's job)`,
    );
  }

  console.log(`run     ${id}`);
  console.log(`url     ${url}`);
  console.log(`log     ${run.appLog}`);
  console.log(`proof   ${run.artifacts}`);
  console.log('');
  for (const { level, message } of results) {
    console.log(`${level.padEnd(4)} ${message}`);
  }

  const failed = results.filter((r) => r.level === 'FAIL').length;
  console.log('');
  console.log(failed === 0 ? 'Doctor: drivable' : `Doctor: ${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

async function stop(options) {
  const active = await resolveRun(options['run-id']);
  if (!active) {
    fail('no verification run found. Nothing to stop.');
  }
  const { id, run } = active;

  if (!isAlive(run.pid)) {
    run.status = 'already-stopped';
    run.stoppedAt = new Date().toISOString();
    await writeRun(run);
    console.log(`run ${id}: pid ${run.pid} was already gone`);
  } else if (!isOurApp(run.pid)) {
    fail(
      `refusing to kill pid ${run.pid}: its command is not dist/main.js. Stop it yourself if it is yours.`,
    );
  } else {
    process.kill(run.pid, 'SIGTERM');
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (Date.now() < deadline && isAlive(run.pid)) await sleep(100);
    if (isAlive(run.pid)) {
      process.kill(run.pid, 'SIGKILL');
      await sleep(200);
    }
    run.status = 'stopped';
    run.stoppedAt = new Date().toISOString();
    await writeRun(run);
    console.log(`run ${id}: stopped pid ${run.pid}`);
  }

  const leftover = listenersOn(run.port);
  if (leftover.length > 0) {
    console.log(`port ${run.port} still has listeners: ${leftover.join(', ')}`);
  } else {
    console.log(`port ${run.port} is free`);
  }
  console.log(`proof kept at ${run.artifacts}`);
}

function render(request, response, at) {
  const lines = [
    `# ${request.method} ${request.url}`,
    `# at ${at}`,
    `# duration ${response.ms}ms`,
  ];
  if (!response.ok) {
    lines.push(`# ERROR ${response.error}`);
    return lines.join('\n');
  }
  lines.push(`HTTP/1.1 ${response.status} ${response.statusText}`);
  for (const [name, value] of Object.entries(response.headers)) {
    lines.push(`${name}: ${value}`);
  }
  lines.push('');
  lines.push(response.body);
  return lines.join('\n');
}

async function get(options, positionals) {
  const target = positionals[0];
  if (!target?.startsWith('/')) {
    fail('usage: control.mjs get <path> [--method GET] [--save name]');
  }

  const active = await resolveRun(options['run-id']);
  const base = (
    options.base ?? (active ? `http://127.0.0.1:${active.run.port}` : '')
  ).replace(/\/+$/, '');
  if (!base) {
    fail(
      'no verification run and no --base. Launch first, or pass --base http://host:port',
    );
  }

  const artifactsDir =
    active?.run.artifacts ?? path.join(STATE_DIR, 'artifacts');
  const method = (options.method ?? 'GET').toUpperCase();
  const url = `${base}${target}`;
  const at = new Date().toISOString();
  const response = await probe(url, method);
  const text = render({ method, url }, response, at);

  console.log(text);
  console.log('');

  const checks = [];
  if (options['expect-status'] !== undefined) {
    const want = Number(options['expect-status']);
    checks.push({
      label: `status ${want}`,
      ok: response.ok && response.status === want,
      got: response.ok ? String(response.status) : response.error,
    });
  }
  if (options['expect-body'] !== undefined) {
    checks.push({
      label: 'exact body',
      ok: response.ok && response.body === options['expect-body'],
      got: response.ok ? JSON.stringify(response.body) : response.error,
    });
  }
  if (options['expect-body-contains'] !== undefined) {
    checks.push({
      label: `body contains ${JSON.stringify(options['expect-body-contains'])}`,
      ok: response.ok && response.body.includes(options['expect-body-contains']),
      got: response.ok ? JSON.stringify(response.body) : response.error,
    });
  }
  for (const raw of options['expect-header'] ?? []) {
    const separator = raw.indexOf('=');
    if (separator < 1) {
      fail(`--expect-header must be NAME=VALUE, got ${JSON.stringify(raw)}`);
    }
    const name = raw.slice(0, separator).trim().toLowerCase();
    const want = raw.slice(separator + 1);
    const got = response.ok ? response.headers[name] : response.error;
    checks.push({
      label: `header ${name}: ${want}`,
      ok: response.ok && got === want,
      got,
    });
  }

  if (options.save) {
    const name = String(options.save).replace(/[^a-zA-Z0-9._-]/g, '-');
    await fs.mkdir(artifactsDir, { recursive: true });
    const file = path.join(artifactsDir, `${name}.http.txt`);
    await fs.writeFile(file, `${text}\n`);
    console.log(`saved ${file}`);
  }

  let failed = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`PASS ${check.label}`);
    } else {
      failed += 1;
      console.log(`FAIL ${check.label} (got ${check.got})`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    port: { type: 'string' },
    'run-id': { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    method: { type: 'string' },
    base: { type: 'string' },
    save: { type: 'string' },
    'expect-status': { type: 'string' },
    'expect-body': { type: 'string' },
    'expect-body-contains': { type: 'string' },
    'expect-header': { type: 'string', multiple: true, default: [] },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const command = positionals.shift();

if (values.help || !command) {
  console.log(`control.mjs — drive the shifters-be API and capture proof

  launch [--port ${DEFAULT_PORT}] [--skip-build] [--run-id ID]
      Build, start dist/main.js detached on the port, wait until it answers.
  doctor [--run-id ID]
      Read-only: pid, port ownership, dist freshness, node version, HTTP.
  get <path> [--method GET] [--base http://host:port] [--save NAME]
             [--expect-status N] [--expect-body TEXT] [--expect-body-contains TEXT]
             [--expect-header NAME=VALUE ...]
      Real request; prints it, optionally writes artifacts/<NAME>.http.txt.
      Without --base it targets the launched run; with it, any reachable URL.
  stop [--run-id ID]
      SIGTERM the pid this run started, after checking its command line.

State and evidence live under .verify/runs/<run-id>/ and survive stop.

Run under the repo's Node: source ~/.nvm/nvm.sh && nvm use`);
  process.exit(values.help ? 0 : 1);
}

const handlers = { launch, doctor, stop, get };
const handler = handlers[command];
if (!handler) fail(`unknown command "${command}". See control.mjs --help`);

await handler(values, positionals);
