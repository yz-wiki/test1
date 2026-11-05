#!/usr/bin/env node
/**
 * Xuting (formerly Skald) — interactive multi-target build orchestrator.
 *
 * Why this exists: `tauri build` can only be told "these bundle formats" via a
 * CLI flag that differs per platform, and the portable (green) Windows build is
 * not a Tauri bundle target at all — it is a zip of the release directory. A
 * release therefore needs two different Tauri invocations plus a packaging step,
 * which is exactly the kind of thing that gets done by hand and forgotten. This
 * script makes the target choice explicit and reproducible.
 *
 * Usage
 *   node scripts/build.mjs                     # interactive checklist
 *   node scripts/build.mjs --all               # everything valid on this host
 *   node scripts/build.mjs --targets nsis,msi  # explicit
 *   node scripts/build.mjs --targets deb --ci  # CI (no prompts, hard failure)
 *
 * Targets
 *   portable   Windows green build — folder + zip, no installer
 *   nsis       Windows .exe installer (recommended for end users)
 *   msi        Windows .msi package (for GPO/enterprise deployment)
 *   appimage   Linux portable single-file AppImage
 *   deb        Linux Debian/Ubuntu package
 *   rpm        Linux Fedora/RHEL/openSUSE package
 *
 * The script never guesses: an unsupported target on the current host is a hard
 * error in --ci mode and a skip (with an explanation) interactively.
 */

import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

const TARGETS = [
  { id: 'portable', label: 'Windows green build (folder + .zip, no installer)', platform: 'win32', kind: 'portable' },
  { id: 'nsis', label: 'Windows installer (.exe, NSIS)', platform: 'win32', kind: 'bundle' },
  { id: 'msi', label: 'Windows package (.msi, WiX)', platform: 'win32', kind: 'bundle' },
  { id: 'appimage', label: 'Linux AppImage (single file)', platform: 'linux', kind: 'bundle' },
  { id: 'deb', label: 'Linux Debian/Ubuntu package (.deb)', platform: 'linux', kind: 'bundle' },
  { id: 'rpm', label: 'Linux Fedora/RHEL package (.rpm)', platform: 'linux', kind: 'bundle' },
];

// ─── Small console helpers ───────────────────────────────────────────────────

const c = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
};
const paint = (color, text) => (process.stdout.isTTY ? `${color}${text}${c.reset}` : text);
const log = (...args) => console.log(...args);
const step = (msg) => log(`\n${paint(c.cyan, '▸')} ${msg}`);
const ok = (msg) => log(`  ${paint(c.green, '✓')} ${msg}`);
const warn = (msg) => log(`  ${paint(c.yellow, '!')} ${msg}`);
const fail = (msg) => log(`  ${paint(c.red, '✗')} ${msg}`);

function die(msg) {
  log(`\n${paint(c.red, 'build failed:')} ${msg}\n`);
  process.exit(1);
}

// ─── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = { targets: [], all: false, ci: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all' || arg === '-a') options.all = true;
    else if (arg === '--ci' || arg === '--yes' || arg === '-y') options.ci = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--targets=')) {
      options.targets.push(...arg.slice('--targets='.length).split(',').map(s => s.trim()).filter(Boolean));
    } else if (arg === '--targets' || arg === '-t') {
      const next = argv[++i];
      if (!next) die('--targets requires a value, e.g. --targets nsis,deb');
      options.targets.push(...next.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      die(`unknown argument: ${arg} (try --help)`);
    }
  }
  return options;
}

function usage() {
  log(`
${paint(c.bold, 'Xuting build')}

  node scripts/build.mjs [options]

${paint(c.bold, 'Options')}
  -t, --targets <list>   Comma-separated targets (see below)
  -a, --all              Build every target supported on this host
  -y, --ci               Non-interactive; fail instead of skipping
  -h, --help             Show this help

${paint(c.bold, 'Targets')}
${TARGETS.map(t => `  ${t.id.padEnd(10)} ${t.label} ${paint(c.dim, `[${t.platform}]`)}`).join('\n')}

${paint(c.bold, 'Examples')}
  node scripts/build.mjs --targets portable,nsis
  node scripts/build.mjs --all
  node scripts/build.mjs --targets deb,rpm --ci
`);
}

// ─── Target selection ────────────────────────────────────────────────────────

function supportedHere(target) {
  return target.platform === process.platform;
}

function resolveSelection(options) {
  const byId = new Map(TARGETS.map(t => [t.id, t]));

  if (options.all) {
    return TARGETS.filter(supportedHere);
  }

  if (options.targets.length > 0) {
    const unknown = options.targets.filter(id => !byId.has(id));
    if (unknown.length) die(`unknown target(s): ${unknown.join(', ')}`);
    const picked = options.targets.map(id => byId.get(id));
    const wrongPlatform = picked.filter(t => !supportedHere(t));
    if (wrongPlatform.length) {
      const names = wrongPlatform.map(t => `${t.id} (${t.platform})`).join(', ');
      if (options.ci) die(`cannot build on ${process.platform}: ${names}`);
      warn(`skipping targets that cannot be built on ${process.platform}: ${names}`);
    }
    const usable = picked.filter(supportedHere);
    if (!usable.length) die('none of the requested targets can be built on this host');
    return usable;
  }

  return null; // caller prompts
}

async function promptSelection() {
  const available = TARGETS.filter(supportedHere);
  log(`\n${paint(c.bold, 'Select build targets')} ${paint(c.dim, `(host: ${process.platform}-${process.arch})`)}`);
  available.forEach((target, index) => {
    log(`  ${paint(c.bold, String(index + 1))}. ${target.label}`);
  });
  log(`  ${paint(c.bold, 'a')}. all of the above`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`\nNumbers separated by commas, or "a" for all [1]: `)).trim();
    if (!answer || answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
      return answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all' ? available : [available[0]];
    }
    const picked = [];
    for (const piece of answer.split(',')) {
      const index = Number.parseInt(piece.trim(), 10);
      if (!Number.isInteger(index) || index < 1 || index > available.length) {
        die(`invalid selection: "${piece.trim()}"`);
      }
      const target = available[index - 1];
      if (!picked.includes(target)) picked.push(target);
    }
    return picked;
  } finally {
    rl.close();
  }
}

// ─── Process helper ──────────────────────────────────────────────────────────

function run(command, args, label) {
  step(label ?? `${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      // Node cannot spawn .cmd/.ps1 shims directly on Windows without a shell.
      shell: IS_WINDOWS,
      env: { ...process.env, CI: process.env.CI ?? '' },
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

// ─── Version / artifact discovery ────────────────────────────────────────────

async function readVersion() {
  const raw = await readFile(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8');
  const match = raw.match(/"version"\s*:\s*"([^"]+)"/);
  if (!match) die('cannot read "version" from src-tauri/tauri.conf.json');
  return match[1];
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function bundleDir() {
  return path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');
}

/** Reports where each requested artifact landed, so a CI log is self-documenting. */
async function reportArtifacts(version, selections) {
  const results = [];
  const bdir = bundleDir();

  if (selections.some(t => t.kind === 'portable')) {
    const zip = path.join(ROOT, 'dist', `Skald_${version}_portable_win-x64.zip`);
    results.push({ target: 'portable', path: zip, found: await exists(zip) });
  }
  const bundleMap = { nsis: 'nsis', msi: 'msi', appimage: 'appimage', deb: 'deb', rpm: 'rpm' };
  for (const selection of selections.filter(t => t.kind === 'bundle')) {
    results.push({
      target: selection.id,
      path: path.join(bdir, bundleMap[selection.id] ?? selection.id),
      found: await exists(path.join(bdir, bundleMap[selection.id] ?? selection.id)),
    });
  }

  log(`\n${paint(c.bold, 'Artifacts')}`);
  for (const result of results) {
    if (result.found) ok(`${result.target.padEnd(9)} ${path.relative(ROOT, result.path)}`);
    else warn(`${result.target.padEnd(9)} not found at ${path.relative(ROOT, result.path)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }

  if (!IS_WINDOWS && !IS_LINUX) {
    die(`unsupported host platform: ${process.platform}. Xuting builds on Windows and Linux.`);
  }

  let selections = resolveSelection(options);
  if (!selections) {
    if (!process.stdin.isTTY) die('no targets given and stdin is not a TTY — pass --targets or --all');
    selections = await promptSelection();
  }
  if (!selections.length) die('no targets selected');

  const version = await readVersion();

  log('');
  log(paint(c.bold, `Xuting ${version} — ${process.platform}-${process.arch}`));
  log(paint(c.dim, `targets: ${selections.map(t => t.id).join(', ')}`));

  const bundleTargets = selections.filter(t => t.kind === 'bundle').map(t => t.id);
  const wantsPortable = selections.some(t => t.kind === 'portable');

  try {
    if (bundleTargets.length > 0) {
      await run('pnpm', ['tauri', 'build', '--bundles', bundleTargets.join(',')],
        `Building bundle(s): ${bundleTargets.join(', ')}`);
    }

    if (wantsPortable) {
      // The portable layout is the release directory itself (build.rs stages the
      // VLC runtime next to the binary), so a --no-bundle build is enough when
      // portable is the only target; otherwise reuse what the bundler just built.
      if (bundleTargets.length === 0) {
        await run('pnpm', ['tauri', 'build', '--no-bundle'], 'Building release binary (no installer)');
      }
      await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/package-portable.ps1'],
        'Packaging portable zip');
    }
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }

  await reportArtifacts(version, selections);
  log(`\n${paint(c.green, 'Done.')}\n`);
}

main().catch(error => die(error instanceof Error ? error.stack ?? error.message : String(error)));
