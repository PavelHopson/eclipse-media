import assert from 'node:assert/strict';
import test from 'node:test';
import { approveVideoAdPreview, parseVideoAdPlan } from '../src/services/videoAdPlanContract.ts';
const plan = { schemaVersion: 'eclipse.video-ad-plan.v1', plan: { id: 'ad-1', title: 'Launch', format: '9:16', duration: 15, referenceBoardId: 'rb-1', claimsRequireReview: true, publishRequiresApproval: true, scenes: ['hook', 'proof', 'action'].map((id, index) => ({ id, start: index * 5, duration: 5, purpose: id, copy: `Scene ${index + 1}`, referenceIds: ['ref-1'] })) } };
test('accepts deterministic preview plan and keeps publication gated', () => {
  const parsed = parseVideoAdPlan(JSON.stringify(plan));
  const approval = approveVideoAdPreview(parsed, { referencesMatched: true, claimsReviewed: true, noSensitiveData: true });
  assert.equal(approval.renderMayBePrepared, true); assert.equal(approval.publishStillRequiresApproval, true);
});
test('rejects unknown fields and incomplete approval', () => {
  const changed = JSON.parse(JSON.stringify(plan)); changed.plan.publishRequiresApproval = false;
  assert.throws(() => parseVideoAdPlan(JSON.stringify(changed)), /safety/i);
  assert.throws(() => approveVideoAdPreview(parseVideoAdPlan(JSON.stringify(plan)), { referencesMatched: true, claimsReviewed: false, noSensitiveData: true }), /manual preview/i);
});
