import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("studio navigation and safe edit keep a usable layout through tablet and phone widths", async () => {
  const css = await readFile(new URL("../src/studio.css", import.meta.url), "utf8");

    assert.match(css, /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.app-header > \.workspace-switch[\s\S]*?overflow-x: auto/);
  assert.match(css, /@media \(max-width: 840px\)\s*\{[\s\S]*?\.safe-edit__steps\s*\{\s*grid-template-columns: repeat\(2/);
  assert.match(css, /@media \(max-width: 420px\)\s*\{[\s\S]*?\.safe-edit__steps\s*\{\s*grid-template-columns: 1fr/);
  assert.match(css, /\.safe-edit__workspace, \.safe-edit__approval, \.safe-edit__hero > div, \.safe-edit__steps li\s*\{\s*min-width: 0/);
});
