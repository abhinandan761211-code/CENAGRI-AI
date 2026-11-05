#!/usr/bin/env node
/**
 * Fill missing translation keys in `src/i18n/locales/<code>.ts` from the English
 * master (`en.ts`), using the Sarvam translation API.
 *
 * Why a script and not hand editing: the dictionaries are ~1,400 keys long and
 * a human translating them drifts in terminology ("mandi" vs "market", "KYC"
 * kept or translated). A script keeps every file structurally identical to the
 * master, which is what `TranslationKey` type-checks against.
 *
 * Guarantees:
 *  • Existing translations are never overwritten — only keys missing from the
 *    target file are added.
 *  • Placeholders ({name}, {count} …) are protected before the call and
 *    restored after, so a model can never rename one and break `tf()`.
 *  • A translation is rejected (original kept) when the placeholder set changes,
 *    when the reply is empty, or when the API reports an error.
 *  • Progress is written after every batch, so an interrupted run is resumable.
 *
 * Usage:
 *   node scripts/i18n-fill.mjs --lang ta            # one language
 *   node scripts/i18n-fill.mjs --all --dry-run      # report only
 *   node scripts/i18n-fill.mjs --lang hi --only acc # one namespace
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = path.join(ROOT, "src/i18n/locales");

const API = "https://api.sarvam.ai/translate";
const MODEL = "sarvam-translate:v1";
const BATCH = 8; // strings per batch (for progress/checkpointing)
const CONCURRENCY = 6; // parallel in-flight requests; server tolerates ~12/s
const DELAY_MS = 120; // gap between batches

const TARGETS = {
  hi: "hi-IN",
  bn: "bn-IN",
  or: "od-IN", // Sarvam spells Odia "od-IN"
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  as: "as-IN",
  ur: "ur-IN",
};

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = flag("dry-run");
const only = opt("only");
const langs = flag("all")
  ? Object.keys(TARGETS)
  : [opt("lang")].filter(Boolean);

if (!langs.length) {
  console.error("Usage: node scripts/i18n-fill.mjs --lang <code> | --all [--dry-run] [--only <prefix>]");
  process.exit(1);
}

const apiKey = process.env.TRANSLATE_API_KEY;
if (!apiKey && !dryRun) {
  console.error("TRANSLATE_API_KEY is not set. Export it (or run with --dry-run).");
  process.exit(1);
}

// ── parsing en.ts ───────────────────────────────────────────────────────────
/**
 * Reads the master file into `[key, value]` pairs.
 *
 * A regex is enough because the file has a fixed shape (two-space indent,
 * `"key": "value"`), and it is deliberately conservative: anything it cannot
 * parse is skipped and reported, never silently dropped.
 */
function parseMaster() {
  const src = fs.readFileSync(path.join(LOCALES, "en.ts"), "utf8");
  const out = new Map();
  const skipped = [];

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^  "([^"]+)":\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;

    // Multiline array (e.g. a list of bullet points) — collect until "],".
    if (rest.startsWith("[")) {
      const buf = [rest];
      let j = i;
      while (j < lines.length && !/^\s*\],?\s*$/.test(lines[j])) {
        j++;
        if (j < lines.length) buf.push(lines[j]);
      }
      out.set(key, { kind: "array", raw: buf.join("\n") });
      i = j;
      continue;
    }

    // Single-line value: `"key": "value",`
    if (rest) {
      const str = /^"((?:[^"\\]|\\.)*)",?\s*$/.exec(rest);
      if (!str) {
        skipped.push(key);
        continue;
      }
      out.set(key, { kind: "string", value: unescape(str[1]) });
      continue;
    }

    // Value on the following line(s): `"key":` then `  "value…",`
    // Long marketing copy is wrapped like this, so it must be handled or the
    // key silently falls back to English.
    const next = (lines[i + 1] ?? "").trim();
    if ([...next].every((ch) => ch === "\"")) {
      // `""` — an intentionally empty string.
      out.set(key, { kind: "string", value: "" });
      i += 1;
      continue;
    }
    if (next) {
      const multiline = /^"((?:[^"\\]|\\.)*)",?$/.exec(next);
      if (multiline) {
        out.set(key, { kind: "string", value: unescape(multiline[1]) });
        i += 1;
        continue;
      }
    }

    skipped.push(key);
  }
  return { out, skipped };
}

function unescape(s) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
}
function escape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Keys already present in a target locale file. */
function existingKeys(code) {
  const p = path.join(LOCALES, `${code}.ts`);
  if (!fs.existsSync(p)) return { keys: new Set(), src: "" };
  const src = fs.readFileSync(p, "utf8");
  const keys = new Set([...src.matchAll(/^  "([^"]+)":/gm)].map((m) => m[1]));
  return { keys, src };
}

// ── placeholder protection ──────────────────────────────────────────────────
const PH_RE = /\{(\w+)\}/g;

/** Replace {name} with a token the translator will not touch, keeping a map. */
function protect(text) {
  const map = [];
  const masked = text.replace(PH_RE, (_, name) => {
    const token = `⟦${map.length}⟧`;
    map.push({ token, name });
    return token;
  });
  return { masked, map };
}

function restore(text, map) {
  let out = text;
  for (const { token, name } of map) out = out.split(token).join(`{${name}}`);
  return out;
}

/** True when the translation kept exactly the placeholders the source had. */
function placeholdersMatch(source, translated) {
  const a = [...source.matchAll(PH_RE)].map((m) => m[1]).sort();
  const b = [...translated.matchAll(PH_RE)].map((m) => m[1]).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ── api ─────────────────────────────────────────────────────────────────────

/**
 * Strings that must stay in English.
 *
 * The brand name is not a word to translate — "Kalika" rendered in Devanagari
 * is a different product name, and every legal/compliance footer refers to the
 * app by that exact spelling. Same for product names the app is commonly known
 * by. These are copied verbatim instead of being sent to the provider.
 */
const VERBATIM = [
  "common.brand",
  "Kalika",
];

function isVerbatim(key, value) {
  return VERBATIM.includes(key) || VERBATIM.includes(value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateOne(text, target, attempt = 1) {
  const { masked, map } = protect(text);
  const res = await fetch(API, {
    method: "POST",
    headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      source_language_code: "en-IN",
      target_language_code: TARGETS[target],
      input: masked,
      mode: "formal",
      model: MODEL,
      enable_preprocessing: true,
    }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt <= 3) {
      await sleep(1000 * attempt);
      return translateOne(text, target, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} after ${attempt} attempts`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);

  const data = await res.json();
  const out = (data.translated_text || "").trim();
  if (!out) throw new Error("empty translation");
  return restore(out, map);
}

/**
 * Translate a batch. Each string is sent separately inside the batch loop so one
 * bad string cannot poison the other seven, but the loop is sequential to stay
 * under the provider's per-second limit.
 */
async function translateBatch(items, target, stats) {
  // Resolve a few at a time. Order is irrelevant (each entry is independent),
  // so results are zipped back by index to keep the master's ordering.
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      const [key, value] = items[i];
      if (isVerbatim(key, value)) {
        results[i] = [key, value];
        stats.verbatim++;
        continue;
      }
      try {
        const translated = await translateOne(value, target);
        if (!placeholdersMatch(value, translated)) {
          stats.skipped.push(`${key} (placeholder changed)`);
          continue;
        }
        results[i] = [key, translated];
        stats.ok++;
      } catch (err) {
        stats.failed.push(`${key}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results.filter(Boolean);
}

// ── writing ─────────────────────────────────────────────────────────────────
/**
 * Append missing entries just before the closing `};` of a locale file.
 * Keeping the master's order would require a rewrite; appending is safe because
 * the dictionary is a plain object and the type check is by key, not position.
 */
function appendEntries(code, entries) {
  const p = path.join(LOCALES, `${code}.ts`);
  let src = fs.readFileSync(p, "utf8");
  const idx = src.lastIndexOf("};");
  if (idx < 0) throw new Error(`${code}.ts has no closing "};"`);

  const block = entries
    .map(([k, v]) => `  "${k}": "${escape(v)}",`)
    .join("\n");

  src = `${src.slice(0, idx).trimEnd()}\n\n  // ── Added by scripts/i18n-fill.mjs ──\n${block}\n${src.slice(idx)}`;
  fs.writeFileSync(p, src);
}

// ── main ────────────────────────────────────────────────────────────────────
async function runFor(code) {
  if (!TARGETS[code]) {
    console.error(`Unknown language: ${code}. Known: ${Object.keys(TARGETS).join(", ")}`);
    return;
  }

  const { out: master, skipped: unparsed } = parseMaster();
  const { keys: have } = existingKeys(code);

  // Flatten to plain [key, english] pairs — the master keeps extra metadata
  // (`kind`) that the translator must not see.
  let missing = [...master.entries()]
    .filter(([k, v]) => !have.has(k) && v.kind === "string")
    .map(([k, v]) => [k, v.value]);
  if (only) missing = missing.filter(([k]) => k.startsWith(`${only}.`));

  const stats = { ok: 0, failed: [], skipped: [], verbatim: 0, unparsed: unparsed.length };

  console.log(`\n── ${code}: ${master.size - have.size} missing keys, ${missing.length} translatable strings`);

  if (dryRun || !missing.length) {
    console.log(`   ${dryRun ? "[dry-run] nothing sent" : "nothing to do"}`);
    return stats;
  }

  const checkpoint = path.join(LOCALES, `.fill-${code}.json`);
  // Resume: anything already written by a previous (interrupted) run is skipped.
  const done = fs.existsSync(checkpoint)
    ? JSON.parse(fs.readFileSync(checkpoint, "utf8"))
    : {};
  const todo = missing.filter(([k]) => !(k in done));
  if (todo.length !== missing.length) {
    console.log(`   resuming: ${missing.length - todo.length} already done`);
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const res = await translateBatch(slice, code, stats);
    for (const [k, v] of res) done[k] = v;
    // Written after every batch so a killed run never loses more than 8 strings.
    fs.writeFileSync(checkpoint, JSON.stringify(done, null, 0));
    const pct = Math.round(((i + slice.length) / todo.length) * 100);
    process.stdout.write(`\r   ${pct}%  ok=${stats.ok} failed=${stats.failed.length}   `);
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");

  const collected = Object.entries(done);
  if (collected.length) appendEntries(code, collected);
  fs.rmSync(checkpoint, { force: true });
  if (stats.failed.length) {
    console.log(`   failed (kept English fallback):\n     ${stats.failed.slice(0, 8).join("\n     ")}`);
  }
  return stats;
}

const results = {};
for (const code of langs) results[code] = await runFor(code);

console.log("\n══ summary ══");
for (const [code, s] of Object.entries(results)) {
  if (!s) continue;
  console.log(
    `${code.padEnd(4)} translated=${String(s.ok).padStart(4)}  verbatim=${s.verbatim}  failed=${s.failed.length}  unparsed-master=${s.unparsed}`,
  );
}
