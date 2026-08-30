import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const composeUrl = new URL("../../docker-compose.production.yml", import.meta.url);
const gatewayConfigUrl = new URL("../../gateway/nginx.conf", import.meta.url);

test("keeps application containers isolated behind the local edge gateway", async () => {
  const compose = await readFile(composeUrl, "utf8");

  assert.match(compose, /frontend:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*\n\s*gateway:/);
  assert.match(compose, /gateway:[\s\S]*?127\.0\.0\.1:\${ECLIPSE_MEDIA_PORT:-8080}:8080/);
  assert.match(compose, /gateway:[\s\S]*?networks:\s*\n\s*- media_internal\s*\n\s*- media_edge/);
  assert.match(compose, /media_internal:\s*\n\s*internal: true/);
});

test("edge gateway has one fixed upstream and no dynamic routing", async () => {
  const config = await readFile(gatewayConfigUrl, "utf8");

  assert.match(config, /proxy_pass http:\/\/frontend:8080;/);
  assert.doesNotMatch(config, /\$request_uri|resolver|proxy_pass\s+\$/);
});
