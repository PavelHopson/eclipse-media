import assert from "node:assert/strict";
import test from "node:test";
import { MEDIA_ASSET_SCHEMA, parseMediaAssetJson } from "../src/services/mediaAssetContract.ts";

function fixture() {
  return {
    schemaVersion: MEDIA_ASSET_SCHEMA,
    asset: {
      kind: "image",
      fileName: "text2image-safe.png",
      mimeType: "image/png",
      prompt: "Moonlit forge",
      enhancedPrompt: "Detailed moonlit forge",
      style: "digital-art",
      aspectRatio: "16:9",
      provider: "ollama",
      model: "local-model",
      createdAt: "2026-08-13T00:00:00.000Z",
      rightsStatus: "unconfirmed",
      approvalRequired: true,
    },
  };
}

test("parses a strict local-only Media Asset sidecar", () => {
  assert.deepEqual(parseMediaAssetJson(JSON.stringify(fixture())), fixture());
});

test("rejects URLs, paths, unknown fields and missing approval", () => {
  assert.throws(() => parseMediaAssetJson(JSON.stringify({ ...fixture(), remoteUrl: "https://example.com/a.png" })), /unknown fields/);
  assert.throws(() => parseMediaAssetJson(JSON.stringify({ ...fixture(), asset: { ...fixture().asset, fileName: "../a.png" } })), /local image filename/);
  assert.throws(() => parseMediaAssetJson(JSON.stringify({ ...fixture(), asset: { ...fixture().asset, approvalRequired: false } })), /manual rights approval/);
});
