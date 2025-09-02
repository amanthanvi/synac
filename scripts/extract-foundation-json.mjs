import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync("scripts/add-foundation-terms.mjs","utf8");
const m = src.match(/const entries = JSON\.parse\(`([\s\S]*?)`\);/);
if (!m) {
  console.error("Could not locate embedded JSON in add-foundation-terms.mjs");
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
