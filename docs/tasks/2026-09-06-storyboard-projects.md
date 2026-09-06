# Projects to storyboard and safe edit

- Date: 2026-09-06. Checkout: E:/projects/eclipse-media, existing master.
- Scope approved in current task: publish local My projects; thesis-to-scene; unified editable storyboard; explicit safe-edit handoff; recoverable project trash. No new branch or external provider.
- Starting point: local changes listed in 2026-09-06-local-projects.md, production still the portable-project release described in 2026-09-06-portable-project-file.md.
- Plan: compatible contracts and transaction guards; UI and handoff; unit/browser/security checks; existing CI/deploy; production verification.
- Design read: quiet operational Media UI, existing tokens and labels. The Taste dials: variance 3, motion 1, density 7. No new UI dependencies.
- Boundaries: source cue times are evidence, not automatically verified video trim bounds. Web remains preview-only; desktop fixed-profile trim requires source verification and a fresh human approval. No arbitrary render commands or VPS worker enablement.
- Storage: storyboard belongs to each project's beat/direction draft and shares its autosave preference. Existing v1 backups remain importable. Trash preserves records; cross-tab writes must not resurrect archived data.
- State: all five approved items implemented, published and verified on web-production. Evidence below; no required work remains for this scope.
- Next safe action: use Plan / Research to create scenes, then Scenario to prepare one clip. Cloud sync, full multi-scene encoding and a new native installer remain separate scopes, not implied by this release.

## Implemented

- My projects: create/rename/duplicate/switch/import/export, legacy adoption, per-tab selection, memory fallback; includes the preceding local milestone.
- Thesis to scene: immutable evidence snapshot, exact cue milliseconds, explicit unverified status, duplicate-source guard and drift warning.
- Unified storyboard: order, duration, music/silence, observable action, camera, linked theses, incomplete-field highlights, beat-map copy, undo removal.
- Safe edit handoff: one scene at a time, explicit local MP4 selection and actual browser video preview, file/metadata/hash validation. No source registration at mount, changed bounds revoke approval, web cannot start an export. Existing desktop trim remains fixed-profile and gated.
- Trash: confirm/archive/restore, last-project empty replacement, CAS of both revisions and catalog, in-transaction membership guard, cross-tab inert state, no permanent deletion or hidden retention timer.
- Portable v1 remains importable; storyboard backups use v2. No dependencies, lockfiles, backend routes, CI permissions or VPS settings changed.

## Local evidence 2026-09-06

- npm --prefix frontend run lint, npm --prefix frontend test: PASS, 97 tests. Build/typecheck: PASS.
- backend/.venv/Scripts/python.exe -m unittest discover -s backend -p test_*.py -q: PASS, 70 tests.
- Isolated Edge: 4 storyboard groups + 10 local-project groups + 7 autosave groups + 7 original research/direction groups = 28 groups. Widths 1440/390/320, reduced motion, keyboard dialogs, synthetic 8-second MP4 with genuine decoding/playback and invalid-file rejection. No user profiles/media used.
- Browser outputs: .runtime/storyboard-20260906/local/results.json, .runtime/local-projects-20260906/results.json, .runtime/draft-autosave-20260906/results.json, .runtime/news-pilot-20260906/browser-results.json. All have zero JS/HTTP errors, external requests and server mutations. Local edit capability is mocked only for the static local preview; production QA will read the real endpoint.
- Final desktop/mobile screenshots inspected; fixed unstyled scene buttons and ambiguous time-input labels. Time UI now preserves milliseconds. Build: index-C3-ZgzPM.js (463.81 kB), index-CJ7rIRSr.css (130.58 kB). Build-time font warnings are existing; final assets copied and browser has no missing files.
- Known credential signatures and dynamic HTML/eval sink checks: zero matches in the checked changed surface. git diff --check: PASS.
- Full npm lockfile audit: zero vulnerabilities (Critical/High/Medium/Low all 0). CycloneDX inventory without optional packages: 166 components, 167 dependency nodes. Optional packages were not omitted from the separate advisory audit. No NVD/Grype or container-base audit claimed.
- New unresolved Critical/High/Medium findings: none in the scoped checks. Residual Low: plaintext browser data/backup JSON and local-only storage; UI discloses this. The trash is recoverable organization, not a disk cleaner or independent backup.
- Not verified: Lighthouse (not installed), Firefox/Safari, new native desktop installer/end-to-end encoding. This is a web release; no installer version bump or VPS encoding enablement.
- Preflight: master and origin/master both 04fbed7de92b563888b848b5666c3ddfa4ba8199 after fetch, origin is PavelHopson/eclipse-media. No concurrent production workflow observed. Latest previous successful deploy is 34030208469.

## Production receipt

- Application commit: bf6c3f9ef2cc1fd4f0df2d5a4d19bc0993a4f2ce, existing master. No new branch.
- [CI 34036025162](https://github.com/PavelHopson/eclipse-media/actions/runs/34036025162): success for this SHA.
- [Deploy 34036073447](https://github.com/PavelHopson/eclipse-media/actions/runs/34036073447): success, completed 2026-09-06T13:28:12Z. Frontend/backend checks, compose, image build, runtime smoke and activation/healthcheck passed. No rollback required.
- Live entry: https://media.eclipse-forge.ru/?workspace=storyboard.
- External receipt 2026-09-06T13:30:33.817Z: HTML asset references and exact JS/CSS/icon hashes match the tested local build. Standard system DNS, validated TLS. Health: ok=true, version=1.6.0, desktop_session=false, local_edit=preview-only, render_queue=preview-only.
- JS /assets/index-C3-ZgzPM.js: 463807 bytes, SHA-256 ff72b23d6634c141261e847669a7b1a909e7e667c96855b8adb2d8be76c89f8d.
- CSS /assets/index-CJ7rIRSr.css: 130580 bytes, SHA-256 6662b8ef01de711fc8412f0b27a19f9e3a06d483dba8b6e90f1b0d6a2fb5a79d.
- First Node probe timed out; independent PowerShell HTTPS returned 200, correct asset names and healthy preview-only state; retry Node probe succeeded. No system DNS/hosts/TLS overrides or changes.
- All **28 production Edge QA groups passed**: 4 storyboard + 10 local projects + 7 autosave + 7 research/direction. Widths 1440/390/320. Actual local synthetic MP4 decoded and played; invalid MP4 retained the previous good preview; live capability endpoint confirmed web cannot encode. Archive/restore/reload, source drift, v1/v2 files, cross-tab guards and legacy workflows passed.
- Every production suite: zero JS/HTTP errors, external requests and server mutations. Fresh isolated profiles and synthetic fixtures only. Published desktop/mobile screenshots inspected.
- Artifacts: .runtime/storyboard-20260906/production-release.json, .runtime/storyboard-20260906/production/results.json, .runtime/local-projects-20260906/production/results.json, .runtime/draft-autosave-20260906/production/results.json, .runtime/news-pilot-20260906/production-browser-results.json.
- Residual security and verification boundaries are unchanged from the local evidence section. Web is deployed; native installer was not built or released. Version label remains 1.6.0; application release identity is the SHA plus matching assets above.
