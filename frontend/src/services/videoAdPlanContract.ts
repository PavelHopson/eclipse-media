export type VideoAdPlan = { schemaVersion: 'eclipse.video-ad-plan.v1'; plan: { id: string; title: string; format: '16:9' | '9:16' | '1:1'; duration: 15; referenceBoardId: string; claimsRequireReview: true; publishRequiresApproval: true; scenes: Array<{ id: 'hook' | 'proof' | 'action'; start: number; duration: 5; purpose: 'hook' | 'proof' | 'action'; copy: string; referenceIds: string[] }> } };
const FORMATS = new Set(['16:9', '9:16', '1:1']);
const IDS = ['hook', 'proof', 'action'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const clean = (value: unknown, max: number) => {
  if (typeof value !== 'string') throw new Error('Video ad plan contains a non-text field.');
  const result = [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  if (!result || result.length > max) throw new Error('Video ad plan text is empty or exceeds its limit.');
  return result;
};
export function parseVideoAdPlan(raw: string): VideoAdPlan {
  if (new TextEncoder().encode(raw).byteLength > 64 * 1024) throw new Error('Video ad plan exceeds 64 KB.');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('Video ad plan JSON is invalid.'); }
  if (!record(value) || !exact(value, ['schemaVersion', 'plan']) || value.schemaVersion !== 'eclipse.video-ad-plan.v1' || !record(value.plan)) throw new Error('Expected strict eclipse.video-ad-plan.v1.');
  const plan = value.plan;
  if (!exact(plan, ['id', 'title', 'format', 'duration', 'referenceBoardId', 'claimsRequireReview', 'publishRequiresApproval', 'scenes'])) throw new Error('Video ad plan has unknown or missing fields.');
  if (!FORMATS.has(String(plan.format)) || plan.duration !== 15 || plan.claimsRequireReview !== true || plan.publishRequiresApproval !== true || !Array.isArray(plan.scenes) || plan.scenes.length !== 3) throw new Error('Video ad plan safety or timeline contract is invalid.');
  const scenes = plan.scenes.map((item, index) => {
    if (!record(item) || !exact(item, ['id', 'start', 'duration', 'purpose', 'copy', 'referenceIds']) || item.id !== IDS[index] || item.purpose !== IDS[index] || item.start !== index * 5 || item.duration !== 5 || !Array.isArray(item.referenceIds) || item.referenceIds.length > 24) throw new Error(`Video ad scene ${index + 1} is invalid.`);
    return { id: IDS[index], start: index * 5, duration: 5 as const, purpose: IDS[index], copy: clean(item.copy, 180), referenceIds: item.referenceIds.map((id) => clean(id, 80)) };
  });
  return { schemaVersion: 'eclipse.video-ad-plan.v1', plan: { id: clean(plan.id, 80), title: clean(plan.title, 90), format: plan.format as VideoAdPlan['plan']['format'], duration: 15, referenceBoardId: clean(plan.referenceBoardId, 80), claimsRequireReview: true, publishRequiresApproval: true, scenes } };
}
export function approveVideoAdPreview(plan: VideoAdPlan, checks: { referencesMatched: boolean; claimsReviewed: boolean; noSensitiveData: boolean }) {
  if (!checks.referencesMatched || !checks.claimsReviewed || !checks.noSensitiveData) throw new Error('Complete all manual preview checks before render handoff.');
  return { planId: plan.plan.id, approvedAt: new Date().toISOString(), renderMayBePrepared: true as const, publishStillRequiresApproval: true as const };
}
