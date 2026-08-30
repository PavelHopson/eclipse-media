import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const composeUrl = new URL("../../docker-compose.production.yml", import.meta.url);
const viteUrl = new URL("../vite.config.ts", import.meta.url);

test("binds the frontend to host loopback while keeping internal API routing", async () => {
  const compose = await readFile(composeUrl, "utf8");

  assert.match(compose, /frontend:[\s\S]*?127\.0\.0\.1:\${ECLIPSE_MEDIA_PORT:-8080}:8080/);
  assert.match(compose, /frontend:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*- media_edge/);
  assert.match(compose, /backend:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*- media_egress/);
  assert.match(compose, /media_internal:\s*\n\s*internal: true/);
  assert.match(compose, /ECLIPSE_MEDIA_RENDER_QUEUE_ENABLED: "false"/);
});

test("strips the local renderer and its jobs from the production web artifact", async () => {
  const vite = await readFile(viteUrl, "utf8");
  assert.match(vite, /eclipse-strip-local-render-runtime/);
  assert.match(vite, /productionBuild \? \{ publicDir: false \}/);
  assert.match(vite, /'studio', 'eclipse-release', 'node_modules'/);
  assert.match(vite, /'studio', 'eclipse-release', 'queue'/);
  assert.match(vite, /cpSync\(publicDirectory, outputDirectory/);
});
