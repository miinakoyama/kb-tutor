import fs from "node:fs";
import path from "node:path";

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted && character === '"' && raw[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const root = process.cwd();
const csvPath = path.join(root, "src/data/short-answer/kc_table.csv");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260711000000_bkt_catalog_mappings.sql",
);
const rows = parseCsv(fs.readFileSync(csvPath, "utf8")).slice(1);
const orderByStandard = new Map();
const values = [];
for (const row of rows) {
  const [module, unit, standardId, shortCode, statement, vocabulary = ""] = row;
  void module;
  void unit;
  if (!standardId || !shortCode || !statement) continue;
  const order = (orderByStandard.get(standardId) ?? 0) + 1;
  orderByStandard.set(standardId, order);
  const numeric = shortCode.replaceAll(/[^0-9]/g, "");
  const code = `${standardId}${numeric}`;
  const terms = vocabulary
    .split(/[;,]/)
    .map((term) => term.trim())
    .filter(Boolean);
  const vocabularySql = `ARRAY[${terms.map(sqlString).join(", ")}]::text[]`;
  values.push(
    `  (${sqlString(code)}, ${sqlString(standardId)}, ${sqlString(shortCode)}, ${sqlString(statement)}, ${vocabularySql}, ${order})`,
  );
}

if (values.length !== 106) {
  throw new Error(`Expected 106 KCs, found ${values.length}`);
}

const startMarker = "-- KC_CATALOG_SEED_START";
const endMarker = "-- KC_CATALOG_SEED_END";
const input = fs.readFileSync(migrationPath, "utf8");
const startIndex = input.indexOf(startMarker);
const endIndex = input.indexOf(endMarker);
if (startIndex < 0 || endIndex <= startIndex) {
  throw new Error("KC seed markers are missing from the catalog migration");
}
const prefix = input.slice(0, startIndex + startMarker.length).trimEnd();
const suffix = input.slice(endIndex + endMarker.length).trimStart();
const seed = `

INSERT INTO public.knowledge_components (
  code, standard_id, short_code, statement, vocabulary, catalog_order
) VALUES
${values.join(",\n")}
ON CONFLICT (code) DO UPDATE SET
  standard_id = EXCLUDED.standard_id,
  short_code = EXCLUDED.short_code,
  statement = EXCLUDED.statement,
  vocabulary = EXCLUDED.vocabulary,
  catalog_order = EXCLUDED.catalog_order,
  updated_at = now();

${endMarker}
${suffix}
`;
fs.writeFileSync(migrationPath, `${prefix}${seed}`, "utf8");
console.log(`Wrote ${values.length} KC seed rows to ${migrationPath}`);
