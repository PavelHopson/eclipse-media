export const MEDIA_ASSET_SCHEMA = "eclipse.media-asset.v1" as const;
export const MAX_MEDIA_ASSET_BYTES = 32 * 1024;

export type MediaAssetSidecar = {
  schemaVersion: typeof MEDIA_ASSET_SCHEMA;
  asset: {
    kind: "image";
    fileName: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    prompt: string;
    enhancedPrompt: string;
    style: string;
    aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
    provider: string;
    model: string;
    createdAt: string;
    rightsStatus: "unconfirmed";
    approvalRequired: true;
  };
};

const EXACT_ASSET_KEYS = [
  "kind", "fileName", "mimeType", "prompt", "enhancedPrompt", "style", "aspectRatio",
  "provider", "model", "createdAt", "rightsStatus", "approvalRequired",
];
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);
// eslint-disable-next-line no-control-regex -- imported labels must remove C0/C1 controls before preview
const MISLEADING_TEXT_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new Error("Media Asset contains a non-text field.");
  const clean = value.replace(MISLEADING_TEXT_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
  if (!clean) throw new Error("Media Asset contains an empty required field.");
  return clean;
}

export function parseMediaAssetJson(raw: string): MediaAssetSidecar {
  if (new TextEncoder().encode(raw).byteLength > MAX_MEDIA_ASSET_BYTES) {
    throw new Error("Media Asset exceeds 32 KB.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Media Asset contains invalid JSON.");
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, ["schemaVersion", "asset"])) {
    throw new Error("Media Asset has unknown fields or an incomplete structure.");
  }
  if (parsed.schemaVersion !== MEDIA_ASSET_SCHEMA || !isRecord(parsed.asset) || !hasExactKeys(parsed.asset, EXACT_ASSET_KEYS)) {
    throw new Error("Expected a strict eclipse.media-asset.v1 sidecar.");
  }

  const asset = parsed.asset;
  const fileName = cleanText(asset.fileName, 180);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|jpg|jpeg|webp)$/i.test(fileName)) {
    throw new Error("Media Asset fileName must be a local image filename without a path.");
  }
  if (!MIME_TYPES.has(String(asset.mimeType)) || !ASPECT_RATIOS.has(String(asset.aspectRatio))) {
    throw new Error("Media Asset has an unsupported image format or aspect ratio.");
  }
  if (asset.kind !== "image" || asset.rightsStatus !== "unconfirmed" || asset.approvalRequired !== true) {
    throw new Error("Media Asset must require manual rights approval.");
  }
  const createdAt = cleanText(asset.createdAt, 40);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Media Asset has an invalid createdAt date.");

  return {
    schemaVersion: MEDIA_ASSET_SCHEMA,
    asset: {
      kind: "image",
      fileName,
      mimeType: asset.mimeType as MediaAssetSidecar["asset"]["mimeType"],
      prompt: cleanText(asset.prompt, 2000),
      enhancedPrompt: cleanText(asset.enhancedPrompt, 4000),
      style: cleanText(asset.style, 80),
      aspectRatio: asset.aspectRatio as MediaAssetSidecar["asset"]["aspectRatio"],
      provider: cleanText(asset.provider, 80),
      model: cleanText(asset.model, 160),
      createdAt,
      rightsStatus: "unconfirmed",
      approvalRequired: true,
    },
  };
}
