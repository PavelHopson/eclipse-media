# Local draft autosave

Updated: 2026-09-06. Scope: implemented, published and verified on production.

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

## Release authorization

- Production permission received after the user preview. Scoped commit on master and existing manual deploy workflow authorized; no server mutations in browser QA.
- Before release, remote master matched local base ed2a3b6. Previous successful deployment was a3741f6 / run 34023134011; superseded by the verified application release below.
- Security release pass uses conducting-api-security-testing and the dependency-review principles of analyzing-sbom-for-supply-chain-vulnerabilities. Syft/Grype not installed: use lockfile inventory and npm audit fallback, not a claim of full image/SBOM/NVD coverage. No new scanners or dependencies installed.

## Release preflight

- Repeated frontend typecheck, lint, 58 tests and production build: PASS. Repeated backend 70 tests: PASS. npm audit across all frontend dependencies: zero advisories.
- Production API health with ordinary DNS and default TLS verification: HTTP 200, ok=true, version=1.6.0, desktop_session=false, local_edit=preview-only, render_queue=preview-only.
- Public DNS A record verified as 111.88.125.84. Unlike the previous release's environment, default HTTPS resolution works in this preflight; no DNS override or machine settings changed.
- Reviewed existing master-only workflow: pinned Action commits, production environment, contents:read, strict host-key checks, deployment argument validation and healthcheck/rollback. No workflow, credentials or production config changes.
- Browser QA harness now accepts only the exact local URL or Media production URL. Fresh isolated profile, synthetic data, server mutations/external requests blocked; optional per-process IPv4 mapping does not disable TLS verification.

## Published and verified

- Application revision: 2f111a477d4ba4d476248384ea26dac4a967bdfd, existing master branch.
- [CI 34025622938](https://github.com/PavelHopson/eclipse-media/actions/runs/34025622938): success for this exact revision.
- [Deploy production 34025696485](https://github.com/PavelHopson/eclipse-media/actions/runs/34025696485): success for this exact revision, including build, container smoke, source transfer and VPS activation/healthcheck. Completed 2026-09-06T09:51:28Z.
- Production: https://media.eclipse-forge.ru/?workspace=intake&intakeMode=research and https://media.eclipse-forge.ru/?workspace=beats.
- 14 production Edge scenario groups PASS: 7 autosave groups plus 7 existing research/direction groups. Widths 1440/390/320, restore after reload and navigation, incomplete forms, separate workspace clear, persisted off preference, cross-tab conflicts including stale resurrection prevention, corrupted storage, simulated quota failure/retry, storage-denied memory-only fallback, 2000-cue restore, inert restored HTML, real 8-second PCM WAV decode and original exports/consent gates.
- Both production browser suites: zero page errors, HTTP errors, external request attempts and non-GET/HEAD server mutation attempts. All inputs synthetic; isolated profiles, not the user's browser data.
- Large fixture: 376008 bytes / 2000 cues. One observed draft write for a typing burst and zero observed >50ms long tasks; a scoped synthetic observation, not a universal latency guarantee.
- Default DNS and HTTPS verification succeeded without per-process overrides or TLS bypasses. No machine DNS/hosts settings changed.
- API health after publication: ok=true, version=1.6.0, desktop_session=false, local_edit=preview-only, render_queue=preview-only.
- Live bytes matched local build SHA-256:
  - /assets/index-Bx4E7u9T.js: 414836 bytes, beca9a34a083126c342532f0cf0a924c63dc7cc793c6597620474fe6553cc374.
  - /assets/index-wnViEs08.css: 124363 bytes, 24ba885f09ef7b18860817d8b56e0ea3c607cbb32041975da7d900e87283a310.
  - /icon.svg: 618 bytes, 2d1bea5a7da8db42c11b1f1eb7cb147f70930049c56d1ff07ea716f60cb352c9.
- Evidence: .runtime/draft-autosave-20260906/production-release.json, production/results.json and screenshots; .runtime/news-pilot-20260906/production-browser-results.json and production screenshots. Generated artifacts ignored in Git.
- Critical / High: no findings in the scoped release pass. Medium privacy and Low retention/crash risks documented above remain; publication does not turn browser storage into an encrypted backup. Full container/OS/backend advisory scanning was not performed in this frontend-only change.
- Desktop installer not rebuilt; web/desktop version number remains 1.6.0. Any later docs-only commit is a receipt, not a new deployed application revision.

## Next safe action

- Use the production tools; the new autosave code loads on a fresh page load. Save any work still open in the old application before refreshing it.
- Local preview and production use different origins, so browser drafts do not transfer automatically. Import of downloaded JSON, cross-device sync and encrypted backup remain separate future work, not part of this release.
