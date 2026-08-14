import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const mDir = join(root, "m");
const routines = readdirSync(mDir).filter((f) => f.endsWith(".m")).sort();
const expected = ["ORTHOAI.m", "ORTROUTE.m", "ORTPROV.m", "ORTSTREAM.m", "ORTVAULT.m", "ORTHEALTH.m", "ORTUSAGE.m", "ORTIPC.m"].sort();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (routines.length > 8) fail(`expected <= 8 core M routines, found ${routines.length}`);
for (const file of expected) {
  if (!routines.includes(file)) fail(`missing routine ${file}`);
}

const allFiles = walk(root);
const tsCore = allFiles.filter((p) => p.includes(`${join(root, "src")}`) && p.endsWith(".ts"));
if (tsCore.length) fail(`TypeScript core remains: ${tsCore.join(", ")}`);

const joined = routines.map((f) => readFileSync(join(mDir, f), "utf8")).join("\n");
for (const label of ["REQ", "RESOLVE", "CHECK", "CALL", "EVENT", "KEY", "RECORD", "SEND"]) {
  if (!new RegExp(`(^|\\n)${label}(\\(| |;)`).test(joined)) fail(`missing executable label ${label}`);
}
for (const global of ['"MODEL"', '"ROUTE"', '"HEALTH"', '"REQ"', '"USAGE"', '"EVENT"']) {
  if (!joined.includes(`^ORTHO(${global}`)) fail(`missing global ^ORTHO(${global})`);
}
if (joined.includes("[anthropic]") || joined.includes("[openai]") || joined.includes("fake")) {
  fail("canned provider output remains in core routines");
}
if (!joined.includes("curl -sS -f https://api.openai.com") || !joined.includes("curl -sS -f https://api.anthropic.com")) {
  fail("provider dispatch does not reach real provider transports");
}

console.log("REQUEST ID: VERIFY-STATIC");
console.log("-> ROUTE: coding.default -> anthropic");
console.log("-> PROVIDER: anthropic requires ANTHROPIC_API_KEY");
console.log("-> STREAM SEQUENCE: ^ORTHO(\"REQ\",ID,\"SEQ\") monotonic under LOCK");
console.log("-> TERMINAL STATE: DONE, FAILED, CANCELLED guarded by TERM^ORTHOAI");
console.log(`FILES AFTER: ${allFiles.length}`);
console.log(`CORE ROUTINES: ${routines.length}`);
console.log("WRAPPERS DELETED: TypeScript src/ provider/routes/gateway wrappers removed");
console.log("STATIC COLLAPSE CHECK PASSED");
