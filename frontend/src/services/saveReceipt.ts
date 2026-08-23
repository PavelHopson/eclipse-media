const PATH_OR_WINDOWS_RESERVED = /[\\/:*?"<>|]/;

function hasControlOrBidi(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f
      || codePoint === 0x7f
      || (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069);
  });
}

export function getSafeSuggestedName(value: string | null, fallback: string): string {
  const candidate = value?.normalize('NFC').trim() ?? '';
  if (
    !candidate
    || candidate === '.'
    || candidate === '..'
    || candidate.length > 240
    || hasControlOrBidi(candidate)
    || PATH_OR_WINDOWS_RESERVED.test(candidate)
  ) {
    return fallback;
  }
  return candidate;
}

export function getReceiptDisplayName(value: string | null, fallback: string): string {
  return getSafeSuggestedName(value, fallback);
}
