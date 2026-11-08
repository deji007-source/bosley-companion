import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [sourcePath, packagedPath, label = "platform"] = process.argv.slice(2);
if (!sourcePath || !packagedPath) {
  throw new Error("Usage: node scripts/check-ui-parity.mjs <shared-index.html> <packaged-index.html> [label]");
}
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceHash = digest(sourcePath);
const packagedHash = digest(packagedPath);
if (sourceHash !== packagedHash) {
  throw new Error(`${label} UI differs from the shared website source. Source: ${sourceHash}; packaged: ${packagedHash}`);
}
console.log(`${label} UI matches the shared website source (${sourceHash}).`);
