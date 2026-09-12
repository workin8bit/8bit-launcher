#!/usr/bin/env node
/**
 * D09 §77, §146 — No `any` enforcement
 * Scans src/ for forbidden `any` usages
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SRC = path.join(ROOT, "src");

const IGNORE = [/node_modules/, /dist/, /\.arena/, /\.git/, /__tests__/, /\.test\.ts$/];

let violations = [];
let scanned = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (IGNORE.some(r => r.test(rel))) continue;
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith(".ts")) {
      scanned++;
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        // Skip comments that mention "any" innocently
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        // Detect `: any`, `as any`, `<any>`, `Array<any>`, `any[]`
        const anyRegex = /:\s*any\b|as\s+any\b|<\s*any\s*>|Array\s*<\s*any\s*>|\bany\s*\[\s*\]/g;
        let match;
        while ((match = anyRegex.exec(line)) !== null) {
          // Allow `// allow-any` escape hatch for transport boundaries (must be justified)
          if (line.includes("allow-any")) continue;
          violations.push({ file: rel, line: idx + 1, col: match.index + 1, text: line.trim().slice(0, 120), rule: "no-any" });
        }
      });
    }
  }
}

walk(SRC);

if (violations.length === 0) {
  console.log(`✅ no-any: PASS — scanned ${scanned} files, 0 violations`);
  process.exit(0);
} else {
  console.log(`❌ no-any: FAIL — ${violations.length} violation(s) in ${scanned} files`);
  console.log("");
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}:${v.col}  ${v.text}`);
    console.log(`    → fix: use \`unknown\` + narrowing, or typed ` + "`Result<T,E>` / `ApplicationError`");
  }
  console.log("\n  D09 §77: `any` is forbidden — all cross-boundary data must be typed.");
  process.exit(1);
}
