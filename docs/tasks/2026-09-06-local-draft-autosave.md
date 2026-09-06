# Local draft autosave

Updated: 2026-09-06. Scope: local implementation verified; production publication authorized, release in progress.

## Checkout and authority

- E:/projects/eclipse-media, existing branch master, starting HEAD ed2a3b6; starting tree clean.
- User asked to continue after the proposed autosave step, then explicitly approved publication. Release uses existing master; desktop installer, machine configuration and external integrations remain out of scope.
- Previous production receipt remains [local research release](2026-09-06-local-research-direction.md). It is not proof of publication for this new change.

## Delivered

- Separate research and beat-map/direction drafts in native IndexedDB; no new dependencies.
- Schema eclipse.local-draft.v1, 2 MiB per workspace, strict bounded decoding, unknown-field rejection, partial editable fields preserved. Existing export contracts unchanged.
- 250 ms typing coalescence, queued writes survive component unmount, transactional compare-and-write revisions, explicit conflict resolution, empty deletion revisions to prevent resurrection from a stale tab.
- Save status only after transaction completion; quota/read/corruption states, explicit retry and memory-only fallback.
- Per-workspace clear and autosave-off confirmation. Turning off purges persisted content, not the open form; preference survives reload.
- Source reads are cancellable by component lifecycle; failed replacement audio no longer clears the previous plan. New source atomically resets only its matching direction/research draft.
- Query intakeMode=research preserves the selected planning mode after reload. No raw file data is added to URLs.
- Durable behavior and privacy limits: [contract](../local-research-direction.md#хранение-и-ограничения).

## Design and security

- The Taste applied contextually to an existing dense operational form: variance 3, motion 1, density 7. Kept current tokens, typography, navigation and export actions; added only a compact status row. Restored original grid spacing after introducing disabled fieldsets.
- Applied conducting-api-security-testing proportionally to persisted untrusted input, data boundaries, failure handling and network non-interference; no external scanning or API mutation.
- Critical / High: no findings in the reviewed changed surface. Authentication, server API, CI/CD, production config and dependency graph unchanged.
- Medium residual: subtitles, notes and consent references persist in this browser profile without application encryption. UI explains local retention, provides off/clear; do not put secrets in drafts. Same-origin script access and browser-profile compromise are not prevented by this feature.
- Low residual: browser eviction/crash may lose drafts; this is not backup or cross-device sync. Explicit transaction errors and browser leave warning reduce but do not eliminate loss.
- Incoming drafts are treated as data, never instructions or HTML; IDs, limits, finite numbers, intervals, enums and fields validated. Restored URLs stay behind existing safe link/export rules. BroadcastChannel carries only workspace name, never contents.
- No credentials, full conversation exports, downloaded models, third-party skills or opaque binaries were added.

## Verification

- Frontend typecheck/build/lint: PASS. 58 unit/contract tests: PASS, including 10 new draft tests.
- Local isolated Edge autosave QA: 7 scenario groups PASS at 1440/390/320 widths, reload and navigation, partial fields, scoped clear, off purge, real IndexedDB, cross-tab conflict, corrupted record, simulated quota and blocked storage.
- Large-file regression: 2000 segments / 376008 UTF-8 bytes restored correctly. A burst of 40 typed characters produced one write, with zero observed long tasks (>50 ms) in this synthetic local run; not a hardware-independent performance guarantee. Restored hostile-looking HTML remained literal text without element creation or requests.
- Existing research/direction browser regression: 7 scenario groups PASS including real decoding of generated 8-second PCM WAV, consent gates, original exports, safe literal HTML and responsiveness.
- Both browser suites: zero page errors, HTTP errors, external request attempts and non-GET/HEAD mutation attempts.
- Backend: backend/.venv/Scripts/python.exe -m unittest discover -s . -p test_*.py -q, 70/70 PASS. Frontend npm audit --json: 0 reported advisories across all dependencies. No packages installed or updated.
- Final changed-file check: 14 files, zero credential-pattern matches; 10 changed runtime files, zero network/unsafe-HTML-sink pattern matches. Reviewed controller transactions and lifecycle; git diff --check PASS (only existing CRLF conversion notices).
- Desktop beat-map and mobile research screenshots inspected; original layout spacing corrected and QA repeated.
- Browser harness: scripts/qa-local-drafts.cjs. Evidence: .runtime/draft-autosave-20260906/ and .runtime/news-pilot-20260906/ (ignored, synthetic fixtures only).
- Vite reports four font resolution warnings at transform time; established closeBundle copies these fonts, all font files exist in dist and browser suites observe no HTTP failures. No font pipeline changes made.
- Lighthouse is not installed in the configured runtime; no Lighthouse score claimed and no dependency installed just for scoring.

## Next safe action

- Production permission received. Repeat preflight, commit the scoped change on master, run the existing manual deploy workflow, then verify live assets, health and browser-local autosave on HTTPS in an isolated profile. No server mutations in browser QA.
- Remote master matches local base ed2a3b6. Last successful deployment currently reported by GitHub is a3741f6 / run 34023134011. Revalidate runtime after the new release; this prior run is not evidence of the new feature.
- Security release pass uses conducting-api-security-testing and the dependency-review principles of analyzing-sbom-for-supply-chain-vulnerabilities. Syft/Grype not installed: use lockfile inventory and npm audit fallback, not a claim of full image/SBOM/NVD coverage. No new scanners or dependencies installed.

## Release preflight

- Repeated frontend typecheck, lint, 58 tests and production build: PASS. Repeated backend 70 tests: PASS. npm audit across all frontend dependencies: zero advisories.
- Production API health with ordinary DNS and default TLS verification: HTTP 200, ok=true, version=1.6.0, desktop_session=false, local_edit=preview-only, render_queue=preview-only.
- Public DNS A record verified as 111.88.125.84. Unlike the previous release's environment, default HTTPS resolution works in this preflight; no DNS override or machine settings changed.
- Reviewed existing master-only workflow: pinned Action commits, production environment, contents:read, strict host-key checks, deployment argument validation and healthcheck/rollback. No workflow, credentials or production config changes.
- Browser QA harness now accepts only the exact local URL or Media production URL. Fresh isolated profile, synthetic data, server mutations/external requests blocked; optional per-process IPv4 mapping does not disable TLS verification.
