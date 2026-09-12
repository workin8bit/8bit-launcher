#!/usr/bin/env node
/**
 * D09 Architecture Lint — Dependency Direction & Boundary Enforcement
 *
 * Enforces: UI → ViewModel → Facade → Service → Adapter → Authority (D09 §4, §27, §66-68, §105)
 * Catches before feature modules grow — prevents architecture drift
 *
 * Rules:
 *  1. Dependency direction matrix
 *  2. Forbidden import patterns (UI→infra, VM→repo, etc.)
 *  3. Public boundary (features may only import facade barrel)
 *  4. DI-only construction
 *  5. No circular dependencies
 *  6. Authority ownership
 *  7. No-any is handled by check-no-any.mjs (called separately)
 */

import fs from "fs";
import path from "path";
import { LAYERS, ALLOWED_IMPORTS, FORBIDDEN_IMPORT_PATTERNS, PUBLIC_BOUNDARY, DI_ONLY, SCAN_GLOBS, IGNORE_PATTERNS } from "./config.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const VERBOSE = process.argv.includes("--verbose");
const violations = [];

// ── helpers ──────────────────────────────────────────────────────────────
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, "/"); }

function getLayer(fileRel) {
  if (LAYERS.shared.pattern.test(fileRel)) return "shared";
  for (const [name, cfg] of Object.entries(LAYERS)) {
    if (name === "shared") continue;
    if (cfg.pattern.test(fileRel)) return name;
  }
  return null; // e.g. docs, scripts, features scaffolding not yet — treat as neutral
}

function getLayerLabel(l) { return LAYERS[l]?.label ?? l; }

function resolveImportToRel(importPath, fromFileRel) {
  // Only care about relative/absolute src imports — ignore external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/") && !importPath.startsWith("src/") && !importPath.startsWith("@/") && !importPath.startsWith("@application/")) return null;
  let resolved = importPath;
  if (importPath.startsWith("@/")) resolved = "src/" + importPath.slice(2);
  if (importPath.startsWith("@application/")) resolved = "src/core/application/" + importPath.slice("@application/".length);
  if (importPath.startsWith(".")) {
    const dir = path.dirname(fromFileRel);
    resolved = path.join(dir, importPath);
  }
  resolved = path.normalize(resolved).replace(/\\/g, "/");
  // Strip .ts/.js extension for matching, add implicit .ts
  resolved = resolved.replace(/\.(ts|js|mjs)$/, "");
  // If resolved has no extension and no trailing slash, try to keep as-is for pattern matching
  return resolved;
}

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel(full);
    if (IGNORE_PATTERNS.some(p => p.test(r))) continue;
    if (e.isDirectory()) collectFiles(full, out);
    else if (e.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
  }
  return out;
}

function extractImports(content) {
  const imports = [];
  // ESM: import ... from "xxx"  / import "xxx"
  const importRe = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  // dynamic import("xxx")
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // require("xxx")
  const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // export ... from "xxx"
  const exportRe = /export\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(content)) !== null) imports.push({ raw: m[1], index: m.index });
  while ((m = dynRe.exec(content)) !== null) imports.push({ raw: m[1], index: m.index });
  while ((m = reqRe.exec(content)) !== null) imports.push({ raw: m[1], index: m.index });
  while ((m = exportRe.exec(content)) !== null) imports.push({ raw: m[1], index: m.index });
  return imports;
}

// ── scan ─────────────────────────────────────────────────────────────────
const srcRoot = path.join(ROOT, "src");
const files = collectFiles(srcRoot);
if (VERBOSE) console.log(`Scanning ${files.length} files under src/...`);

const graph = new Map(); // fileRel -> Set<resolvedRel>
const fileContents = new Map();

for (const full of files) {
  const r = rel(full);
  const content = fs.readFileSync(full, "utf8");
  fileContents.set(r, content);
  const imports = extractImports(content);
  const deps = new Set();
  for (const imp of imports) {
    const resolved = resolveImportToRel(imp.raw, r);
    if (resolved) deps.add(resolved);
    // Also keep raw for forbidden pattern matching (raw may contain `src/...`)
    // We'll match both raw and resolved
    imp.resolved = resolved;
  }
  graph.set(r, { deps, imports, content });
}

// ── Rule 1: Dependency direction ────────────────────────────────────────
for (const [fileRel, { deps, imports }] of graph.entries()) {
  const fromLayer = getLayer(fileRel);
  if (!fromLayer) continue;
  if (fromLayer === "shared") continue; // shared can import shared only — already checked below
  const allowed = ALLOWED_IMPORTS[fromLayer] ?? [];
  for (const imp of imports) {
    const targetRaw = imp.raw;
    const resolved = imp.resolved;
    if (!resolved) continue; // external package — ignore
    // Determine target layer from resolved path
    const toLayer = getLayer(resolved) ?? getLayer(resolved + ".ts") ?? getLayer(resolved + "/index.ts");
    if (!toLayer) continue; // e.g., importing authority file directly that doesn't match layer pattern — will be caught by forbidden patterns
    if (toLayer === "shared") continue; // always allowed
    if (fromLayer === toLayer) continue; // same layer allowed
    // Check if toLayer is in allowed list
    if (!allowed.includes(toLayer)) {
      violations.push({
        file: fileRel,
        rule: "dependency-direction",
        message: `${getLayerLabel(fromLayer)} → ${getLayerLabel(toLayer)} is not allowed (D09 §66-68). Allowed from ${getLayerLabel(fromLayer)}: ${allowed.map(l=>getLayerLabel(l)).join(", ") || "shared only"}`,
        import: targetRaw,
        hint: `Move logic to allowed layer or use Facade → Service → Adapter chain`,
      });
    }
  }
}

// ── Rule 2: Forbidden import patterns ───────────────────────────────────
for (const [fileRel, { imports }] of graph.entries()) {
  const fromLayer = getLayer(fileRel);
  if (!fromLayer) continue;
  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.from !== fromLayer) continue;
    for (const imp of imports) {
      const target = `${imp.raw} ${imp.resolved ?? ""}`;
      if (pattern.forbidden.test(target) || pattern.forbidden.test(imp.raw)) {
        violations.push({
          file: fileRel,
          rule: "forbidden-import",
          message: pattern.msg,
          import: imp.raw,
        });
      }
    }
  }
}

// ── Rule 2b: Cross-feature Store Access (D10 §12.2, D10A §28) ───────────────
// Feature tidak boleh membaca Store feature lain — hanya via Facade
for (const [fileRel, { imports }] of graph.entries()) {
  const fromFeatureMatch = fileRel.match(/^src\/features\/([^/]+)\//);
  if (!fromFeatureMatch) continue;
  const fromFeature = fromFeatureMatch[1];
  for (const imp of imports) {
    const resolved = imp.resolved;
    if (!resolved) continue;
    const toFeatureMatch = resolved.match(/^src\/features\/([^/]+)\//);
    if (!toFeatureMatch) continue;
    const toFeature = toFeatureMatch[1];
    if (fromFeature === toFeature) continue; // same feature allowed
    // Allow import of public barrel? No — cross-feature must go via Facade, not barrel.
    // Even barrel is forbidden for Store access — so any cross-feature import is FAIL
    // But we allow cross-feature interaction via Facade/shared — those imports don't start with src/features
    // So any src/features/A → src/features/B is suspicious
    // We specifically forbid Stores, but for D10A we forbid all cross-feature stores/viewmodels coupling
    if (/\/stores\//.test(resolved) || /\/viewmodels\//.test(resolved) || /\/ui\//.test(resolved)) {
      violations.push({
        file: fileRel,
        rule: "forbidden-import",
        message: `Cross-feature Store/ViewModel access is FORBIDDEN — ${fromFeature} → ${toFeature} must go via Facade → Event/Command (D10A §28, D10 §12.2)`,
        import: imp.raw,
      });
    }
  }
}

// ── Rule 2c: Forbidden Event Mutation (D10A §29) ────────────────────────
for (const [fileRel, { content }] of graph.entries()) {
  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("if (event.payload")) return;
    // Detect event.payload mutation: event.payload = ... or event.payload.xxx = ... (single =, not ==/===/!==)
    const mutationPattern = /event\.payload(\.\w+)?\s*=(?!=)/;
    if (mutationPattern.test(line)) {
      violations.push({
        file: `${fileRel}:${idx + 1}`,
        rule: "forbidden-import",
        message: `Event mutation is FORBIDDEN — events are immutable (D10A §29) — only Store may mutate projection`,
        import: line.trim().slice(0, 100),
      });
    }
  });
}

// ── Rule 3: Public boundary ─────────────────────────────────────────────
// If a file under src/features/... imports internal application layers, flag
for (const [fileRel, { imports }] of graph.entries()) {
  const isFeatureConsumer = fileRel.startsWith("src/features/") || fileRel.startsWith("src/ui/") || fileRel.startsWith("src/app/");
  if (!isFeatureConsumer) continue;
  for (const imp of imports) {
    const resolved = imp.resolved;
    if (!resolved) continue;
    for (const internal of PUBLIC_BOUNDARY.internalPatterns) {
      if (internal.test(resolved) || internal.test(imp.raw)) {
        // Allow if imported via public barrel
        const isPublic = PUBLIC_BOUNDARY.allowedEntryPoints.some(ep => resolved.includes(ep.replace("src/core/application/","")) || imp.raw.includes("src/core/application/index") || imp.raw.includes("@application") && imp.raw.endsWith("/index"));
        // Simpler: if raw is `src/core/application` or `@application` barrel, allow
        const isBarrel = imp.raw === "src/core/application" || imp.raw === "src/core/application/index" || imp.raw === "@application" || imp.raw === "@application/index";
        if (isBarrel) continue;
        // Also allow `src/core/application/facade/ApplicationFacade` and bootstrap/di — these are public
        const isAllowedEntry = PUBLIC_BOUNDARY.allowedEntryPoints.some(ep => resolved.startsWith(ep.replace(/\.ts$/,"")) || imp.raw.includes(ep));
        if (isAllowedEntry) continue;
        violations.push({
          file: fileRel,
          rule: "public-boundary",
          message: `Feature/UI must import via public boundary (src/core/application/index or ApplicationFacade), not internal ${resolved} (D09 §71-72)`,
          import: imp.raw,
        });
      }
    }
  }
}

// ── Rule 4: DI-only construction ───────────────────────────────────────
for (const [fileRel, { content }] of graph.entries()) {
  // Skip allowed locations
  if (DI_ONLY.allowedNewLocations.some(p => p.test(fileRel))) continue;
  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    for (const rule of DI_ONLY.forbiddenNewPatterns) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: `${fileRel}:${idx + 1}`,
          rule: "di-only",
          message: rule.msg,
          import: line.trim().slice(0, 100),
        });
      }
    }
  });
}

// ── Rule 5: No circular dependencies ────────────────────────────────────
// Only flag cross-layer cycles — internal cycles within same authority (e.g., src/core/execution/types/*) are excluded,
// because D07's type-only mutual references are intentional and not drift
function isCrossLayerCycle(cycle) {
  const layers = cycle.map(n => getLayer(n)).filter(Boolean);
  const uniqueLayers = new Set(layers);
  if (uniqueLayers.size <= 1) return false; // same layer → ignore (e.g., execution types ↔ execution types)
  // Even if layers same, check if all nodes share same directory prefix (same authority module)
  const prefixes = cycle.map(n => n.split("/").slice(0, 4).join("/")); // e.g., src/core/execution
  if (new Set(prefixes).size === 1) return false;
  return true;
}

function detectCycles() {
  const visited = new Set();
  const stack = new Set();
  const pathStack = [];

  function dfs(node) {
    if (stack.has(node)) {
      const cycleStart = pathStack.indexOf(node);
      const cycle = pathStack.slice(cycleStart).concat(node);
      if (!isCrossLayerCycle(cycle)) return;
      violations.push({
        file: cycle[0],
        rule: "no-circular",
        message: `Circular dependency detected: ${cycle.join(" → ")} (D09 §27 — circular imports break DI and layering)`,
        import: cycle.join(" → "),
      });
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    pathStack.push(node);
    const entry = graph.get(node);
    if (entry) {
      for (const dep of entry.deps) {
        // Resolve dep to actual file key — try exact, then .ts, then /index.ts
        let target = null;
        if (graph.has(dep)) target = dep;
        else if (graph.has(dep + ".ts")) target = dep + ".ts";
        else if (graph.has(dep + "/index.ts")) target = dep + "/index.ts";
        else {
          // fuzzy: find any file that starts with dep
          for (const k of graph.keys()) {
            if (k.startsWith(dep)) { target = k; break; }
          }
        }
        if (target) dfs(target);
      }
    }
    stack.delete(node);
    pathStack.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }
}
detectCycles();

// ── Rule 6: Authority ownership — lint file contents for forbidden reimplementations ──
import { AUTHORITY_OWNERSHIP } from "./config.mjs";
for (const [fileRel, { content }] of graph.entries()) {
  for (const rule of AUTHORITY_OWNERSHIP.forbiddenReimplementations) {
    if (rule.pattern.test(content) && !rule.allowedPath.test(fileRel)) {
      violations.push({
        file: fileRel,
        rule: "authority-ownership",
        message: rule.msg,
        import: content.match(rule.pattern)?.[0] ?? "",
      });
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const byRule = violations.reduce((acc, v) => { acc[v.rule] = (acc[v.rule]||0)+1; return acc; }, {});

if (violations.length === 0) {
  console.log(`✅ arch-lint: PASS — scanned ${files.length} files, 0 violations`);
  console.log(`   Layers checked: ${Object.values(LAYERS).map(l=>l.label).join(", ")}`);
  console.log(`   Rules: dependency-direction, forbidden-import, public-boundary, di-only, no-circular, authority-ownership`);
  if (VERBOSE) console.log(`   Files: ${files.map(f=>rel(f)).join(", ")}`);
  process.exit(0);
} else {
  console.log(`❌ arch-lint: FAIL — ${violations.length} violation(s) in ${files.length} files`);
  console.log("");
  // Group by file
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile.entries()) {
    console.log(`  ${file}`);
    for (const v of list) {
      console.log(`    [${v.rule}] ${v.message}`);
      if (v.import) console.log(`      import: "${v.import}"`);
    }
    console.log("");
  }
  console.log("  Summary by rule:");
  for (const [rule, count] of Object.entries(byRule)) {
    console.log(`    ${rule}: ${count}`);
  }
  console.log("\n  Fix: follow canonical chain UI → ViewModel → Facade → Service → Adapter → Authority (D09 §4, §66-68)");
  console.log("  Docs: src/core/application/README.md, Dokumen-09-Frontend-Application-Contract.md §66-68, §105");
  process.exit(1);
}
