#!/usr/bin/env node
/**
 * Verifies which Antigravity model and reasoning level authored a post in
 * `src/content/blog/<file>.md` by inspecting the Antigravity conversation
 * transcripts under `~/.gemini/antigravity-cli/brain/`, then writes the
 * verified model sign-off line (`\- <Model> (<Effort>)`) and matching lowercase
 * frontmatter tag (`"<model> (<effort>)"`).
 *
 *   node scripts/model-label.mjs <post-file> [--write]
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BRAIN_DIR = join(homedir(), '.gemini', 'antigravity-cli', 'brain');
const SETTINGS_PATH = join(homedir(), '.gemini', 'antigravity-cli', 'settings.json');
const SITE_CHANGE_MARKER = /^<!-- site-change -->[ \t]*$/m;
const SIGN_OFF_REGEX = /^\\- [^\n]+$/m;

function parseArgs(argv) {
  const write = argv.includes('--write');
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional.length !== 1) {
    throw new Error('Usage: node scripts/model-label.mjs <post-file> [--write]');
  }
  return { file: positional[0], write };
}

async function findTranscriptsMentioning(postName) {
  try {
    const { stdout } = await execFileAsync(
      'grep',
      ['-rlF', '--include=transcript.jsonl', postName, BRAIN_DIR],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout.split('\n').filter(Boolean);
  } catch (err) {
    if (err.code === 1) return [];
    throw err;
  }
}

function parseModelSetting(rawModel) {
  // e.g. "Gemini 4 Argon (Medium)" or "Gemini 3.1 Pro (High)"
  const trimmed = rawModel.trim();
  const match = /^(.*?)\s*\(([^()]+)\)$/.exec(trimmed);
  if (match) {
    return `${match[1].trim()} (${match[2].trim()})`;
  }
  return trimmed;
}

async function resolveConversationModel(transcriptPath, lines) {
  let latestModel = null;
  for (const line of lines) {
    if (!line.includes('USER_SETTINGS_CHANGE') && !line.includes('Model Selection')) continue;
    const m = /changed setting `Model Selection` from [^\n]+? to ([^\n.]+)\./.exec(line);
    if (m) {
      latestModel = parseModelSetting(m[1]);
    }
  }
  if (latestModel) return latestModel;

  // Check if this conversation was spawned as a subagent by a parent conversation in BRAIN_DIR
  const convId = basename(dirname(dirname(dirname(transcriptPath))));
  try {
    const { stdout } = await execFileAsync(
      'grep',
      ['-rlF', '--include=transcript.jsonl', convId, BRAIN_DIR],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const parentPaths = stdout
      .split('\n')
      .filter((p) => p && resolve(p) !== resolve(transcriptPath));
    for (const parentPath of parentPaths) {
      const parentRaw = await readFile(parentPath, 'utf8');
      const parentModel = await resolveConversationModel(parentPath, parentRaw.split('\n'));
      if (parentModel) return parentModel;
    }
  } catch {
    // ignore
  }

  // Fallback to ~/.gemini/antigravity-cli/settings.json only if present
  try {
    const settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
    if (typeof settings.model === 'string' && settings.model.trim()) {
      return parseModelSetting(settings.model);
    }
  } catch {
    // ignore
  }
  return null;
}

function stepWrotePost(line, postName) {
  if (!line.includes(postName)) return false;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return false;
  }
  if (rec.type !== 'PLANNER_RESPONSE' || !Array.isArray(rec.tool_calls)) return false;
  for (const tc of rec.tool_calls) {
    const name = tc?.name;
    const argsStr = JSON.stringify(tc?.args ?? {});
    if (!argsStr.includes(postName)) continue;
    if (['write_file', 'edit_file', 'write_to_file', 'replace_file_content'].includes(name)) {
      return true;
    }
    if (name === 'run_command' && !argsStr.includes('model-label')) {
      return true;
    }
  }
  return false;
}

async function writersOf(postName) {
  const paths = await findTranscriptsMentioning(postName);
  const writers = new Map();

  for (const transcriptPath of paths) {
    const raw = await readFile(transcriptPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const wrote = lines.some((l) => stepWrotePost(l, postName));
    if (!wrote) continue;

    const modelLabel = await resolveConversationModel(transcriptPath, lines);
    if (!modelLabel) {
      throw new Error(`Could not verify model from transcript ${transcriptPath} for ${postName}`);
    }
    let firstTs = '';
    for (const l of lines) {
      if (stepWrotePost(l, postName)) {
        try {
          firstTs = JSON.parse(l).created_at ?? '';
        } catch {
          // ignore
        }
        break;
      }
    }
    if (!writers.has(modelLabel) || firstTs < writers.get(modelLabel)) {
      writers.set(modelLabel, firstTs);
    }
  }

  return [...writers.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([label]) => label);
}

export function applyAttribution(source, writers) {
  const signOffLine = `\\- ${writers.join(' + ')}`;
  const modelTags = writers.map((w) => w.toLowerCase());

  let next = source;

  // Handle inline tags array: tags: ["a", "b"]
  const inlineTagsMatch = /^tags:[ \t]*\[(.*)\][ \t]*$/m.exec(next);
  if (inlineTagsMatch) {
    const existingRaw = inlineTagsMatch[1].trim();
    const existingLower = existingRaw.toLowerCase();
    const toAdd = modelTags
      .filter((t) => !existingLower.includes(t))
      .map((t) => `"${t}"`);
    if (toAdd.length > 0) {
      const merged = existingRaw ? `${existingRaw}, ${toAdd.join(', ')}` : toAdd.join(', ');
      next = next.replace(inlineTagsMatch[0], `tags: [${merged}]`);
    }
  } else {
    // Handle multi-line YAML tags list
    const blockTagsMatch = /^tags:[ \t]*\n((?:[ \t]*-[ \t]*[^\n]+\n)+)/m.exec(next);
    if (!blockTagsMatch) {
      throw new Error('Frontmatter is missing `tags` field');
    }
    const existingBlock = blockTagsMatch[1];
    const existingLower = existingBlock.toLowerCase();
    let extra = '';
    for (const t of modelTags) {
      if (!existingLower.includes(t)) {
        extra += `  - "${t}"\n`;
      }
    }
    if (extra) {
      next = next.replace(blockTagsMatch[0], `tags:\n${existingBlock}${extra}`);
    }
  }

  const markerIdx = next.search(SITE_CHANGE_MARKER);
  if (markerIdx === -1) {
    const trimmed = next.trimEnd();
    if (SIGN_OFF_REGEX.test(trimmed.split('\n').slice(-1)[0])) {
      const lastNewline = trimmed.lastIndexOf('\n');
      return `${trimmed.slice(0, lastNewline + 1)}${signOffLine}\n`;
    }
    return `${trimmed}\n\n${signOffLine}\n`;
  }

  const beforeMarker = next.slice(0, markerIdx).trimEnd();
  const afterMarker = next.slice(markerIdx);
  const linesBefore = beforeMarker.split('\n');
  if (SIGN_OFF_REGEX.test(linesBefore[linesBefore.length - 1])) {
    linesBefore[linesBefore.length - 1] = signOffLine;
    return `${linesBefore.join('\n')}\n\n${afterMarker}`;
  }
  return `${beforeMarker}\n\n${signOffLine}\n\n${afterMarker}`;
}

async function main() {
  const { file, write } = parseArgs(process.argv.slice(2));
  const postName = basename(file);
  const writers = await writersOf(postName);
  if (writers.length === 0) {
    throw new Error(`No Antigravity transcript turn found that wrote ${postName}`);
  }

  const signOffLine = `\\- ${writers.join(' + ')}`;
  console.log(signOffLine);
  console.log(`tags: ${writers.map((w) => `"${w.toLowerCase()}"`).join(', ')}`);

  if (write) {
    const source = await readFile(file, 'utf8');
    const updated = applyAttribution(source, writers);
    if (updated !== source) {
      await writeFile(file, updated, 'utf8');
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
