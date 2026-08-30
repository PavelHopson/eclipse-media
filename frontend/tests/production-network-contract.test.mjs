import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const composeUrl = new URL("../../docker-compose.production.yml", import.meta.url);

test("binds the frontend to host loopback while keeping internal API routing", async () => {
  const compose = await readFile(composeUrl, "utf8");

  assert.match(compose, /frontend:[\s\S]*?127\.0\.0\.1:\${ECLIPSE_MEDIA_PORT:-8080}:8080/);
  assert.match(compose, /frontend:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*- media_edge/);
  assert.match(compose, /backend:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*- media_egress/);
  assert.match(compose, /media_internal:\s*\n\s*internal: true/);
});
