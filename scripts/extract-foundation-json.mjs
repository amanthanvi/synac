import fs from "node:fs";
import path from "node:path";

/**
 * This script extracts the embedded JSON from scripts/add-foundation-terms.mjs.
 * It relies on the presence of a template literal assigned to 'const entries' and parsed via JSON.parse.
 * If the assignment or formatting changes, this extraction may fail.
 * Please update the regex or extraction logic if the code pattern in add-foundation-terms.mjs changes.
 */
const src = fs.readFileSync("scripts/add-foundation-terms.mjs", "utf8");

// More flexible regex: allows for whitespace, line breaks, and variations in assignment formatting
const m = src.match(/const\s+entries\s*=\s*JSON\.parse\(\s*`([\s\S]*?)`\s*\)/m);

if (!m) {
  console.error("Could not locate embedded JSON in add-foundation-terms.mjs. Please ensure the code pattern matches the expected assignment to 'const entries'.");
  process.exit(1);
}
const json = m[1];
try {
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("foundation terms payload is not an array");
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(path.join("data","foundation-terms.json"), JSON.stringify(arr, null, 2) + "\n");
  console.log("Extracted", arr.length, "entries to data/foundation-terms.json");
} catch (e) {
  console.error("Failed to parse embedded JSON:", e?.message || String(e));
  process.exit(1);
}
