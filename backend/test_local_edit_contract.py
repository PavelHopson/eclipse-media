import copy
from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError, replace
import json
import unittest

from local_edit_contract import (
    APPROVAL_TTL_SECONDS, EditContractError, EditPlan, ExportAuthorization,
    LocalExportGate, MAX_PLAN_BYTES, MAX_SOURCE_BYTES, PROFILE, RunScope,
    SourceSnapshot, parse_edit_plan,
)


def uid(index):
    return f"00000000-0000-4000-8000-{index:012d}"


class LocalEditContractTests(unittest.TestCase):
    def setUp(self):
        self.scope = RunScope(uid(1), uid(2), uid(3), uid(4), 1)
        self.source = SourceSnapshot(uid(5), uid(1), uid(2), "a" * 64, 1024, 10000)
        self.plan = EditPlan(uid(5), "a" * 64, 1000, 5000)
        self.now = 100.0
        self.gate = LocalExportGate(self.scope, clock=lambda: self.now)

    def approve(self, plan=None):
        return self.gate.approve(plan or self.plan, self.source, self.scope,
                                 approved_by=self.scope.user_id, rights_confirmed=True)

    def parse(self, value):
        return parse_edit_plan(json.dumps(value), self.source, self.scope)

    def test_round_trip_and_canonical_plan_digest(self):
        raw = json.dumps(self.plan.as_dict(), indent=4)
        parsed = parse_edit_plan(raw, self.source, self.scope)
        self.assertEqual(parsed, self.plan)
        self.assertEqual(parsed.digest, self.plan.digest)
        self.assertEqual(len(parsed.digest), 64)
        with self.assertRaises(FrozenInstanceError):
            parsed.start_ms = 0

    def test_only_typed_trim_profile_and_asset_refs_are_accepted(self):
        for key, value in (("outputPath", "../private.mp4"), ("ffmpeg", ["-y"]),
                           ("url", "http://localhost"), ("approved", True),
                           ("workspaceId", uid(99)), ("publish", True)):
            item = self.plan.as_dict()
            item[key] = value
            with self.subTest(key=key), self.assertRaises(EditContractError):
                self.parse(item)
        item = self.plan.as_dict()
        item["source"]["path"] = "C:/private/file.mp4"
        with self.assertRaises(EditContractError):
            self.parse(item)

    def test_malformed_oversize_duplicate_deep_and_nonfinite_json_fail_closed(self):
        raw = json.dumps(self.plan.as_dict())
        cases = [None, "", "[]", "null", "{" , " " * (MAX_PLAN_BYTES + 1),
                 "[" * 1100 + "]" * 1100, '"\\ud800"', "1" * 5000,
                 raw.replace('"startMs": 1000', '"startMs": 1000, "startMs": 2000'),
                 raw.replace('"startMs": 1000', '"startMs": NaN')]
        for value in cases:
            with self.subTest(value=str(value)[:40]), self.assertRaises(EditContractError):
                parse_edit_plan(value, self.source, self.scope)

    def test_strict_millisecond_limits(self):
        for start, end in ((True, 5000), (1.0, 5000), ("1", 5000), (-1, 5000),
                           (5000, 5000), (6000, 5000), (0, 60001), (0, 10001)):
            item = self.plan.as_dict()
            item["trim"] = {"startMs": start, "endMs": end}
            with self.subTest(start=start, end=end), self.assertRaises(EditContractError):
                self.parse(item)

    def test_source_paths_urls_and_fake_profile_cannot_enter_plan(self):
        for asset in ("../video", "https://example.com/video", "C:\\private", uid(5).upper() + "/"):
            item = self.plan.as_dict()
            item["source"]["assetId"] = asset
            with self.subTest(asset=asset), self.assertRaises(EditContractError):
                self.parse(item)
        item = self.plan.as_dict()
        item["outputProfile"] = PROFILE + " -y"
        with self.assertRaises(EditContractError):
            self.parse(item)

    def test_source_snapshot_is_bounded_and_mp4_only(self):
        for changes in ({"size_bytes": 0}, {"size_bytes": MAX_SOURCE_BYTES + 1},
                        {"size_bytes": True}, {"duration_ms": 300001},
                        {"media_type": "text/html"}, {"sha256": "fake"}):
            with self.subTest(changes=changes), self.assertRaises(EditContractError):
                replace(self.source, **changes)

    def test_foreign_workspace_owner_and_replaced_source_are_rejected(self):
        for changes in ({"workspace_id": uid(9)}, {"owner_id": uid(9)},
                        {"asset_id": uid(9)}, {"sha256": "b" * 64}):
            with self.subTest(changes=changes), self.assertRaises(EditContractError):
                parse_edit_plan(json.dumps(self.plan.as_dict()), replace(self.source, **changes), self.scope)

    def test_export_needs_separate_trusted_human_approval_and_rights(self):
        for actor, rights in ((uid(9), True), (self.scope.user_id, False),
                              (self.scope.user_id, 1), (self.scope.user_id, "true")):
            with self.subTest(actor=actor, rights=rights), self.assertRaises(EditContractError):
                self.gate.approve(self.plan, self.source, self.scope, approved_by=actor, rights_confirmed=rights)

    def test_approval_is_exact_one_time_and_not_a_publication_permission(self):
        grant = self.approve()
        authorized = self.gate.authorize(grant.token, self.plan, self.source, self.scope)
        self.gate.assert_active(authorized, self.plan, self.source, self.scope)
        self.assertIsInstance(authorized, ExportAuthorization)
        self.assertNotIn(grant.token, repr(grant))
        self.assertNotIn(authorized.nonce, repr(authorized))
        self.assertFalse(hasattr(authorized, "publish"))
        with self.assertRaises(EditContractError):
            self.gate.authorize(grant.token, self.plan, self.source, self.scope)
        with self.assertRaises(EditContractError):
            self.approve()

    def test_scope_change_in_any_dimension_rejects_approval_reuse(self):
        grant = self.approve()
        for changes in ({"workspace_id": uid(9)}, {"user_id": uid(9)},
                        {"employee_id": uid(9)}, {"run_id": uid(9)}, {"capability_revision": 2}):
            with self.subTest(changes=changes), self.assertRaises(EditContractError):
                self.gate.authorize(grant.token, self.plan, self.source, replace(self.scope, **changes))
        self.gate.authorize(grant.token, self.plan, self.source, self.scope)

    def test_plan_or_snapshot_change_requires_new_approval(self):
        grant = self.approve()
        changed_plan = replace(self.plan, start_ms=0)
        with self.assertRaises(EditContractError):
            self.gate.authorize(grant.token, changed_plan, self.source, self.scope)
        for changes in ({"sha256": "b" * 64}, {"size_bytes": 2048}, {"duration_ms": 20000}):
            with self.subTest(changes=changes), self.assertRaises(EditContractError):
                self.gate.authorize(grant.token, self.plan, replace(self.source, **changes), self.scope)

    def test_approval_expires_at_exact_boundary(self):
        grant = self.approve()
        self.now += APPROVAL_TTL_SECONDS
        with self.assertRaisesRegex(EditContractError, "EXPIRED_APPROVAL"):
            self.gate.authorize(grant.token, self.plan, self.source, self.scope)

    def test_invalid_clock_cannot_issue_or_consume_approval(self):
        grant = self.approve()
        self.now = float("nan")
        with self.assertRaises(EditContractError):
            self.gate.authorize(grant.token, self.plan, self.source, self.scope)
        with self.assertRaises(EditContractError):
            self.approve()

    def test_new_preview_rotates_approval(self):
        first = self.approve()
        revised = replace(self.plan, start_ms=0)
        second = self.approve(revised)
        with self.assertRaises(EditContractError):
            self.gate.authorize(first.token, revised, self.source, self.scope)
        self.gate.authorize(second.token, revised, self.source, self.scope)

    def test_cancel_or_revoke_before_export_is_terminal(self):
        for operation in ("cancel", "revoke"):
            self.setUp()
            grant = self.approve()
            getattr(self.gate, operation)()
            with self.subTest(operation=operation), self.assertRaises(EditContractError):
                self.gate.authorize(grant.token, self.plan, self.source, self.scope)
            with self.assertRaises(EditContractError):
                self.approve()

    def test_cancel_or_revoke_after_authorization_blocks_finalization(self):
        for operation in ("cancel", "revoke"):
            self.setUp()
            grant = self.approve()
            auth = self.gate.authorize(grant.token, self.plan, self.source, self.scope)
            getattr(self.gate, operation)()
            with self.subTest(operation=operation), self.assertRaises(EditContractError):
                self.gate.assert_active(auth, self.plan, self.source, self.scope)

    def test_changed_scope_source_or_forged_authorization_cannot_finalize(self):
        grant = self.approve()
        auth = self.gate.authorize(grant.token, self.plan, self.source, self.scope)
        with self.assertRaises(EditContractError):
            self.gate.assert_active(replace(auth, nonce="fake"), self.plan, self.source, self.scope)
        with self.assertRaises(EditContractError):
            self.gate.assert_active(auth, replace(self.plan, start_ms=0), self.source, self.scope)
        with self.assertRaises(EditContractError):
            self.gate.assert_active(auth, self.plan, self.source, replace(self.scope, capability_revision=2))
        with self.assertRaises(EditContractError):
            self.gate.assert_active(auth, self.plan, replace(self.source, size_bytes=2048), self.scope)

    def test_parallel_double_click_consumes_only_once(self):
        grant = self.approve()
        def attempt(_):
            try:
                self.gate.authorize(grant.token, self.plan, self.source, self.scope)
                return True
            except EditContractError:
                return False
        with ThreadPoolExecutor(max_workers=8) as executor:
            outcomes = list(executor.map(attempt, range(16)))
        self.assertEqual(sum(outcomes), 1)

    def test_untrusted_context_tokens_and_errors_never_echo_input(self):
        grant = self.approve()
        for token in (None, {}, "секрет" * 1000, "x" * 43):
            with self.subTest(type=type(token).__name__), self.assertRaises(EditContractError) as error:
                self.gate.authorize(token, self.plan, self.source, self.scope)
            self.assertEqual(str(error.exception), "INVALID_APPROVAL")
        with self.assertRaises(EditContractError):
            LocalExportGate(copy.copy(self.scope.__dict__))


if __name__ == "__main__":
    unittest.main()
