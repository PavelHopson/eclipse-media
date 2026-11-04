import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("studio navigation and safe edit keep a usable layout through tablet and phone widths", async () => {
  const css = await readFile(new URL("../src/studio.css", import.meta.url), "utf8");
  const indexCss = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /workspace-menu-toggle/);
  assert.match(app, /workspace-menu-toggle__label/);
  assert.match(app, /activeWorkspaceLabel/);
  assert.match(app, /aria-expanded=\{mobileMenuOpen\}/);
  assert.match(app, /setMobileMenuOpen\(false\)/);
  assert.match(css, /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.app-header > \.workspace-menu-toggle\s*\{\s*display: inline-flex/);
  assert.match(css, /\.app-header > \.workspace-switch\.is-open\s*\{\s*display: flex/);
  assert.match(indexCss, /@media \(max-width: 900px\)\s*\{[\s\S]*?\.download-hero\s*\{\s*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 840px\)\s*\{[\s\S]*?\.safe-edit__steps\s*\{\s*grid-template-columns: repeat\(2/);
  assert.match(css, /@media \(max-width: 420px\)\s*\{[\s\S]*?\.safe-edit__steps\s*\{\s*grid-template-columns: 1fr/);
  assert.match(css, /\.safe-edit__workspace, \.safe-edit__approval, \.safe-edit__hero > div, \.safe-edit__steps li\s*\{\s*min-width: 0/);
});
