#!/usr/bin/env node
/**
 * Collects a bounded single-day digest across Antigravity (Gemini), Claude Code,
 * and Codex transcripts for a given Australia/Brisbane (AEST, UTC+10) date.
 *
 *   node scripts/collect-day-context.mjs [--date YYYY-MM-DD]
 *
 * Output goes only to stdout. Never write raw conversation digests into the repo.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const AGY_BRAIN_DIR = join(HOME, '.gemini', 'antigravity-cli', 'brain');
const CLAUDE_PROJECTS_DIR = join(HOME, '.claude', 'projects');
const CODEX_HOME = process.env.CODEX_HOME ?? join(HOME, '.codex');

const MAX_ITEM_CHARS = 320;
const MAX_SECTION_CHARS = 5000;
const TIMEZONE = 'Australia/Brisbane';

function parseArgs(argv) {
  const idx = argv.indexOf('--date');
  if (idx === -1) {
    return { date: formatAestDate(new Date()) };
  }
  const value = argv[idx + 1];
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--date requires YYYY-MM-DD');
  }
  return { date: value };
}

function formatAestDate(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function formatAestTime(date) {
  return date.toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text, limit = MAX_ITEM_CHARS) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

const CLAUDE_PATH_PREFIXES = [
  '-Users-gordonbeeming-Developer-github-gordonbeeming-',
  '-Users-gordonbeeming-Developer-github-',
  '-Users-gordonbeeming-Developer-azdo-',
  '-Users-gordonbeeming-Developer-',
  '-Users-gordonbeeming-',
];

function claudeProjectLabel(dirName) {
  for (const prefix of CLAUDE_PATH_PREFIXES) {
    if (dirName.startsWith(prefix)) {
      const rest = dirName.slice(prefix.length);
      if (rest) return rest;
    }
  }
  return dirName;
}

const CLAUDE_INJECTED_PREFIXES = [
  'Base directory for this skill:',
  'Caveat: The messages below were generated',
  '<command-name>',
  '<command-message>',
  '<local-command-stdout>',
  'This session is being continued from a previous conversation',
  'Another Claude session sent a message:',
  '<teammate-message',
  '<task-notification>',
  '[Request interrupted by user]',
  '[Image:',
  'Stop hook feedback:',
  'A session-scoped Stop hook is now active',
  'Skill /',
  '(Re-invocation of',
];

function cleanClaudeText(content) {
  let raw = '';
  if (typeof content === 'string') {
    raw = content;
  } else if (Array.isArray(content)) {
    raw = content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function collectAntigravity(targetDate) {
  const items = [];
  let dirs = [];
  try {
    dirs = await readdir(AGY_BRAIN_DIR, { withFileTypes: true });
  } catch {
    return items;
  }

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const transcriptPath = join(AGY_BRAIN_DIR, dir.name, '.system_generated', 'logs', 'transcript.jsonl');
    let raw;
    try {
      raw = await readFile(transcriptPath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type !== 'USER_INPUT' || typeof rec.created_at !== 'string') continue;
      const at = new Date(rec.created_at);
      if (Number.isNaN(at.getTime()) || formatAestDate(at) !== targetDate) continue;

      const match = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/.exec(rec.content ?? '');
      const text = (match ? match[1] : rec.content ?? '').trim();
      if (!text) continue;
      if (text.includes('miles-journal') || text.includes('daily blog post')) continue;

      items.push({
        time: formatAestTime(at),
        text: truncate(text),
      });
    }
  }

  return items.sort((a, b) => a.time.localeCompare(b.time));
}

async function collectClaude(targetDate) {
  const byProject = new Map();
  let projectDirs = [];
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return byProject;
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const label = claudeProjectLabel(dir.name);
    if (label.includes('claudeblog') || label.includes('codexblog') || label.includes('geminiblog')) {
      continue;
    }

    const dirPath = join(CLAUDE_PROJECTS_DIR, dir.name);
    let files = [];
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      let raw;
      try {
        raw = await readFile(join(dirPath, file), 'utf8');
      } catch {
        continue;
      }

      let seenFirstUser = false;
      let scheduled = false;

      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let rec;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        if (rec.type !== 'user') continue;
        const text = cleanClaudeText(rec.message?.content);
        if (!seenFirstUser && text) {
          seenFirstUser = true;
          if (text.startsWith('<scheduled-task')) {
            scheduled = true;
            break;
          }
        }
        if (scheduled || !text) continue;
        if (CLAUDE_INJECTED_PREFIXES.some((p) => text.startsWith(p))) continue;
        if (typeof rec.timestamp !== 'string') continue;

        const at = new Date(rec.timestamp);
        if (Number.isNaN(at.getTime()) || formatAestDate(at) !== targetDate) continue;

        const list = byProject.get(label) ?? [];
        list.push({ time: formatAestTime(at), text: truncate(text) });
        byProject.set(label, list);
      }
    }
  }

  return byProject;
}

const CODEX_IGNORED_PREFIXES = [
  '# AGENTS.md instructions for ',
  '<environment_context>',
  '<recommended_plugins>',
  '<permissions instructions>',
];

async function findJsonlFiles(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return findJsonlFiles(full);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [full] : [];
    }),
  );
  return nested.flat();
}

async function collectCodex(targetDate) {
  const items = [];
  // Filter file paths roughly or scan sessions
  const [yr, mo, dy] = targetDate.split('-');
  // Codex stores sessions by YYYY/MM/DD under sessions/, plus archived_sessions/
  // Check target date dir and surrounding day dirs in UTC, plus archived_sessions
  const candidateDirs = [
    join(CODEX_HOME, 'sessions', yr, mo, dy),
    join(CODEX_HOME, 'sessions', yr, mo),
    join(CODEX_HOME, 'archived_sessions'),
  ];

  const seenPaths = new Set();
  const rolloutPaths = [];
  for (const d of candidateDirs) {
    for (const p of await findJsonlFiles(d)) {
      if (!seenPaths.has(p)) {
        seenPaths.add(p);
        rolloutPaths.push(p);
      }
    }
  }

  for (const rolloutPath of rolloutPaths) {
    let raw;
    try {
      raw = await readFile(rolloutPath, 'utf8');
    } catch {
      continue;
    }
    if (raw.includes('Automation ID: daily-codex-blog-journal')) continue;
    if (!raw.includes(yr)) continue;

    let cwdLabel = 'workspace';
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type === 'session_meta' && rec.payload?.cwd) {
        const parts = String(rec.payload.cwd).split('/').filter(Boolean);
        cwdLabel = parts[parts.length - 1] || 'workspace';
        if (cwdLabel === 'codexblog' || cwdLabel === 'claudeblog' || cwdLabel === 'geminiblog') {
          break;
        }
      }
      if (rec.type !== 'response_item' || typeof rec.timestamp !== 'string') continue;
      const at = new Date(rec.timestamp);
      if (Number.isNaN(at.getTime()) || formatAestDate(at) !== targetDate) continue;

      if (rec.payload?.type === 'message' && rec.payload?.role === 'user') {
        const texts = (rec.payload.content ?? [])
          .filter((c) => c.type === 'input_text' && typeof c.text === 'string')
          .map((c) => c.text)
          .filter((t) => !CODEX_IGNORED_PREFIXES.some((p) => t.startsWith(p)));
        for (const t of texts) {
          const cleaned = truncate(t);
          if (cleaned) {
            items.push({ time: formatAestTime(at), cwd: cwdLabel, text: cleaned });
          }
        }
      }
    }
  }

  return items.sort((a, b) => a.time.localeCompare(b.time));
}

function renderSection(title, lines, maxChars = MAX_SECTION_CHARS) {
  const out = [`## ${title}`];
  if (lines.length === 0) {
    out.push('No recorded prompts on this date.');
    return out.join('\n');
  }
  let budget = maxChars;
  let omitted = 0;
  for (const line of lines) {
    if (line.length > budget) {
      omitted += 1;
      continue;
    }
    budget -= line.length;
    out.push(line);
  }
  if (omitted > 0) {
    out.push(`(${omitted} additional lines omitted for context budget)`);
  }
  return out.join('\n');
}

async function main() {
  const { date } = parseArgs(process.argv.slice(2));
  const [agyItems, claudeMap, codexItems] = await Promise.all([
    collectAntigravity(date),
    collectClaude(date),
    collectCodex(date),
  ]);

  const agyLines = agyItems.map((i) => `[${i.time}] ${i.text}`);

  const claudeLines = [];
  const sortedClaude = [...claudeMap.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [proj, prompts] of sortedClaude) {
    claudeLines.push(`### ${proj} (${prompts.length})`);
    for (const p of prompts.sort((a, b) => a.time.localeCompare(b.time))) {
      claudeLines.push(`[${p.time}] ${p.text}`);
    }
  }

  const codexLines = codexItems.map((i) => `[${i.time}] (${i.cwd}) ${i.text}`);

  const output = [
    `# Daily Context Digest — ${date} (Australia/Brisbane AEST)`,
    '',
    renderSection(`Antigravity — ${agyItems.length} prompt(s)`, agyLines),
    '',
    renderSection(`Claude — ${sortedClaude.length} project(s)`, claudeLines),
    '',
    renderSection(`Codex — ${codexItems.length} message(s)`, codexLines),
  ];

  console.log(output.join('\n'));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
