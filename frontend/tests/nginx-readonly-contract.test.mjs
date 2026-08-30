import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("nginx writes every runtime temp file into the writable tmpfs", async () => {
  const config = await readFile(new URL("../nginx.conf", import.meta.url), "utf8");
  const directives = [
    "client_body_temp_path /tmp/client_temp;",
    "proxy_temp_path /tmp/proxy_temp;",
    "fastcgi_temp_path /tmp/fastcgi_temp;",
    "uwsgi_temp_path /tmp/uwsgi_temp;",
    "scgi_temp_path /tmp/scgi_temp;",
  ];

  for (const directive of directives) {
    assert.ok(config.includes(directive), `missing read-only runtime directive: ${directive}`);
  }

  assert.ok(!config.includes("_temp_path /var/cache/nginx"));
});
