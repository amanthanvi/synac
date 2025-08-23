/**
 * scripts/fetch-mitre.mjs
 * Scaffold to fetch/normalize MITRE datasets:
 *  - ATT&CK (STIX/TAXII or repo JSON) → data/ingest/attack.json
 *  - CWE (download JSON) → data/ingest/cwe.json
 *  - CAPEC (download JSON) → data/ingest/capec.json
 *
 * Notes:
 * - Endpoints/formats change over time; pin via env vars for stability.
 * - If network unavailable, set *_FILE env vars to point to local JSON exports.
 * - We only extract stable identifiers/labels to support mappings in TermEntry.
 *
 * Outputs:
 * attack.json:
 *   {
 *     "techniques": [{ "id": "T1059", "name": "Command and Scripting Interpreter", "tactics": ["execution", ...] }, ...],
 *     "tactics": [{ "id": "TA0002", "name": "Execution" }, ...]
 *   }
 *
 * cwe.json:
 *   { "CWE-79": "Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')", ... }
 *
 * capec.json:
 *   { "CAPEC-63": "Cross-Site Scripting", ... }
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJsonPinned } from './_http.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = join(__dirname, '..', 'data', 'ingest');

// Environment-configurable sources
const ATTACK_STIX_URL =
  process.env.ATTACK_STIX_URL ||
  'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
const CWE_JSON_URL = process.env.CWE_JSON_URL || 'https://cwe.mitre.org/data/json/cwe.json';
const CAPEC_JSON_URL = process.env.CAPEC_JSON_URL || 'https://capec.mitre.org/data/json/capec.json';

const ATTACK_STIX_FILE = process.env.ATTACK_STIX_FILE; // optional local file for ATT&CK
const CWE_JSON_FILE = process.env.CWE_JSON_FILE; // local file override
const CAPEC_JSON_FILE = process.env.CAPEC_JSON_FILE; // local file override


async function readLocalJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

function normalizeAttack(stix) {
  // STIX bundle with objects (technique, tactic/attack-pattern/x-mitre-tactic)
  const objs = Array.isArray(stix?.objects) ? stix.objects : [];
  const techniques = [];
  const tactics = [];

  const tacticById = new Map();

  for (const o of objs) {
    // tactics are x-mitre-tactic or similar
    if (
      o?.type === 'x-mitre-tactic' ||
      (o?.x_mitre_deprecated === false && /tactic/i.test(o?.type || ''))
    ) {
      const tId = (o?.external_references || []).find((r) =>
        /^TA\d{4}/.test(r?.external_id || ''),
      )?.external_id;
      const name = o?.name;
      if (tId && name) {
        tacticById.set(o?.id, { id: tId, name });
        tactics.push({ id: tId, name });
      }
    }
  }

  for (const o of objs) {
    if (o?.type === 'attack-pattern') {
      const ext = (o?.external_references || []).find((r) => /^T\d{4}/.test(r?.external_id || ''));
      const tId = ext?.external_id;
      const name = o?.name;
      if (!tId || !name) continue;

      // collect tactics via kill_chain_phases
      const tacts = [];
      for (const phase of o?.kill_chain_phases || []) {
        // Some bundles include phase_name matching known tactics names; we map by name if possible
        const phaseName = (phase?.phase_name || '').toLowerCase();
        // attempt map by name if present in tacticById set
        const matched = [...tacticById.values()].find(
          (t) => (t.name || '').toLowerCase() === phaseName,
        );
        if (matched) tacts.push(matched.name.toLowerCase());
        else if (phaseName) tacts.push(phaseName);
      }

      techniques.push({ id: tId, name, tactics: Array.from(new Set(tacts)) });
    }
  }

  // Deduplicate tactics by id
  const uniqTactics = Object.values(Object.fromEntries(tactics.map((t) => [t.id, t])));

  return { techniques, tactics: uniqTactics };
}

function normalizeCwe(json) {
  // CWE JSON has varied shapes across releases; best-effort flatten of ID -> Name
  const map = {};
  const items =
    json?.Weakness_Catalog?.Weaknesses?.Weakness || json?.weaknesses || json?.items || [];
  for (const w of items) {
    const id = w?.ID || w?.id || w?.Name?.ID || w?.cwe_id;
    const name = w?.Name || w?.name || w?.Title || w?.title;
    if (id && name) map[`CWE-${String(id)}`] = String(name);
  }
  return map;
}

function normalizeCapec(json) {
  // CAPEC JSON also varies; map ID -> Name
  const map = {};
  const items =
    json?.Attack_Pattern_Catalog?.Attack_Patterns?.Attack_Pattern ||
    json?.attack_patterns ||
    json?.items ||
    [];
  for (const ap of items) {
    const id = ap?.ID || ap?.id || ap?.Name?.ID || ap?.capec_id;
    const name = ap?.Name || ap?.name || ap?.Title || ap?.title;
    if (id && name) map[`CAPEC-${String(id)}`] = String(name);
  }
  return map;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // ATT&CK
  let stix;
  if (ATTACK_STIX_FILE) {
    console.log(`[mitre] Reading ATT&CK local: ${ATTACK_STIX_FILE}`);
    stix = await readLocalJson(ATTACK_STIX_FILE);
  } else {
    console.log(`[mitre] Fetching ATT&CK STIX: ${ATTACK_STIX_URL}`);
    try {
      stix = await fetchJsonPinned(ATTACK_STIX_URL);
    } catch (e) {
      console.error(`[mitre] Failed to fetch ATT&CK: ${e.message}`);
      stix = null;
    }
  }
  if (stix) {
    const attack = normalizeAttack(stix);
    await writeFile(join(OUT_DIR, 'attack.json'), JSON.stringify(attack, null, 2), 'utf8');
    console.log(
      `[mitre] attack.json written (${attack.techniques.length} techniques, ${attack.tactics.length} tactics)`,
    );
  }

  // CWE
  let cwe;
  if (CWE_JSON_FILE) {
    console.log(`[mitre] Reading CWE local: ${CWE_JSON_FILE}`);
    cwe = await readLocalJson(CWE_JSON_FILE);
  } else {
    console.log(`[mitre] Fetching CWE: ${CWE_JSON_URL}`);
    try {
      cwe = await fetchJsonPinned(CWE_JSON_URL);
    } catch (e) {
      console.error(`[mitre] Failed to fetch CWE: ${e.message}`);
      cwe = null;
    }
  }
  if (cwe) {
    const cweMap = normalizeCwe(cwe);
    await writeFile(join(OUT_DIR, 'cwe.json'), JSON.stringify(cweMap, null, 2), 'utf8');
    console.log(`[mitre] cwe.json written (${Object.keys(cweMap).length} entries)`);
  }

  // CAPEC
  let capec;
  if (CAPEC_JSON_FILE) {
    console.log(`[mitre] Reading CAPEC local: ${CAPEC_JSON_FILE}`);
    capec = await readLocalJson(CAPEC_JSON_FILE);
  } else {
    console.log(`[mitre] Fetching CAPEC: ${CAPEC_JSON_URL}`);
    try {
      capec = await fetchJsonPinned(CAPEC_JSON_URL);
    } catch (e) {
      console.error(`[mitre] Failed to fetch CAPEC: ${e.message}`);
      capec = null;
    }
  }
  if (capec) {
    const capecMap = normalizeCapec(capec);
    await writeFile(join(OUT_DIR, 'capec.json'), JSON.stringify(capecMap, null, 2), 'utf8');
    console.log(`[mitre] capec.json written (${Object.keys(capecMap).length} entries)`);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
