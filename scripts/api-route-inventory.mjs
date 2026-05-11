#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function toWebPath(file) {
  let route = file
    .replace(path.join(ROOT, "apps/web/src/app/api/v1"), "")
    .replace(/\/route\.ts$/, "");
  if (!route) route = "/";
  route = route.replace(/\[([^\]]+)\]/g, ":$1");
  return `/api/v1${route === "/" ? "" : route}`;
}

function webMethods(file) {
  const source = fs.readFileSync(file, "utf8");
  const matches = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)];
  return matches.map((match) => match[1]);
}

function normalize(route) {
  return route.replace(/:tid\b/g, ":teamId");
}

const webRoutes = walk(path.join(ROOT, "apps/web/src/app/api/v1"))
  .filter((file) => file.endsWith("/route.ts"))
  .flatMap((file) => webMethods(file).map((method) => ({
    owner: "web",
    method,
    path: toWebPath(file),
    file: path.relative(ROOT, file),
  })));

const fastifyRoutes = walk(path.join(ROOT, "apps/api/src/routes"))
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return [...source.matchAll(/fastify\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((match) => ({
      owner: "fastify",
      method: match[1].toUpperCase(),
      path: match[2],
      file: path.relative(ROOT, file),
    }));
  });

const webKeys = new Set(webRoutes.map((route) => normalize(`${route.method} ${route.path}`)));
const fastifyKeys = new Set(fastifyRoutes.map((route) => normalize(`${route.method} ${route.path}`)));

const rows = [
  ...webRoutes.map((route) => ({
    ...route,
    status: fastifyKeys.has(normalize(`${route.method} ${route.path}`)) ? "duplicated" : "web-only",
  })),
  ...fastifyRoutes
    .filter((route) => !webKeys.has(normalize(`${route.method} ${route.path}`)))
    .map((route) => ({ ...route, status: "fastify-only" })),
].sort((a, b) => `${a.path} ${a.method} ${a.owner}`.localeCompare(`${b.path} ${b.method} ${b.owner}`));

for (const row of rows) {
  console.log(`${row.status.padEnd(13)} ${row.method.padEnd(6)} ${row.path.padEnd(52)} ${row.file}`);
}

