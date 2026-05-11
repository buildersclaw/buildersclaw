#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB_API_ROOT = path.join(ROOT, "apps/web/src/app/api/v1");

const ALLOWLIST = new Set([
  "GET /api/v1/submissions/:subId/preview",
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function toPath(file) {
  let route = file.replace(WEB_API_ROOT, "").replace(/\/route\.ts$/, "");
  if (!route) route = "/";
  route = route.replace(/\[([^\]]+)\]/g, ":$1");
  return `/api/v1${route === "/" ? "" : route}`;
}

const violations = [];

for (const file of walk(WEB_API_ROOT).filter((candidate) => candidate.endsWith("/route.ts"))) {
  const source = fs.readFileSync(file, "utf8");
  const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map((match) => match[1]);
  for (const method of methods) {
    const route = `${method} ${toPath(file)}`;
    if (!ALLOWLIST.has(route)) {
      violations.push({ route, file: path.relative(ROOT, file) });
    }
  }
}

if (violations.length > 0) {
  console.error("apps/web contains non-allowlisted backend API routes:");
  for (const violation of violations) {
    console.error(`- ${violation.route} (${violation.file})`);
  }
  console.error("\nMove backend logic to apps/api or add a temporary allowlist entry with a migration note.");
  process.exit(1);
}

console.log("No non-allowlisted web API routes found.");

