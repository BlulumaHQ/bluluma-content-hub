#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, copyFileSync, rmSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = process.cwd();
const distDir = resolve(root, "dist");
const clientDir = join(distDir, "client");
const serverDir = join(distDir, "server");

function log(msg) {
  console.log(`[static-build] ${msg}`);
}

function fail(msg) {
  console.error(`[static-build] ERROR: ${msg}`);
  process.exit(1);
}

// 1. Verify build output
if (!existsSync(clientDir)) fail(`Missing ${clientDir}. Run 'vite build' first.`);
if (!existsSync(serverDir)) fail(`Missing ${serverDir}. Run 'vite build' first.`);

// 2. Alias dist/server/index.js -> dist/server/server.js
const serverIndex = join(serverDir, "index.js");
const serverAlias = join(serverDir, "server.js");
if (existsSync(serverIndex) && !existsSync(serverAlias)) {
  copyFileSync(serverIndex, serverAlias);
  log("Aliased dist/server/index.js -> dist/server/server.js");
} else if (!existsSync(serverIndex)) {
  fail(`Missing ${serverIndex}; cannot create server.js alias.`);
}

// 3. Spawn vite preview
const port = 4910;
log(`Starting 'vite preview' on port ${port}...`);
const preview = spawn("npx", ["vite", "preview", "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
});

preview.stdout?.on("data", (d) => process.stdout.write(`[preview] ${d}`));
preview.stderr?.on("data", (d) => process.stderr.write(`[preview] ${d}`));

let prerenderedHtml = null;
let exitCode = 0;

try {
  // 4. Poll until 200
  const url = `http://localhost:${port}/`;
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  if (!ready) throw new Error(`Preview server did not respond 200 within 30s at ${url}`);

  log("Preview server ready. Fetching index HTML...");

  // 5. Fetch /
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  prerenderedHtml = await res.text();
  log(`Fetched ${prerenderedHtml.length} bytes of HTML`);
} catch (err) {
  exitCode = 1;
  console.error(`[static-build] Prerender failed: ${err.message}`);
} finally {
  // 6. Kill preview cleanly
  preview.kill("SIGTERM");
  await sleep(500);
  if (!preview.killed) {
    preview.kill("SIGKILL");
  }
}

if (exitCode !== 0 || !prerenderedHtml) {
  process.exit(exitCode || 1);
}

// Write prerendered HTML
const { writeFileSync } = await import("node:fs");
writeFileSync(join(clientDir, "index.html"), prerenderedHtml, "utf8");
log("Wrote prerendered dist/client/index.html");

// 7. Flatten dist/client/* into dist/
log("Flattening dist/client/* into dist/...");
const entries = readdirSync(clientDir);
for (const entry of entries) {
  const src = join(clientDir, entry);
  const dst = join(distDir, entry);
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true, force: true });
  }
  renameSync(src, dst);
}
rmSync(clientDir, { recursive: true, force: true });

// 8. Delete dist/server/
rmSync(serverDir, { recursive: true, force: true });
log("Removed dist/server/");

// 9. Ensure dist/_redirects exists
const distRedirects = join(distDir, "_redirects");
const publicRedirects = join(root, "public", "_redirects");
if (!existsSync(distRedirects)) {
  if (!existsSync(publicRedirects)) fail("public/_redirects missing; cannot create dist/_redirects.");
  copyFileSync(publicRedirects, distRedirects);
  log("Copied public/_redirects -> dist/_redirects");
}

// 10. Verify and log
function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) count += countFiles(full);
    else count++;
  }
  return count;
}

const total = countFiles(distDir);
log(`SUCCESS: dist/ now contains ${total} files.`);
log(`dist/ root: ${readdirSync(distDir).join(", ")}`);
