# Local research + scene direction

Updated: 2026-09-06.

## Scope and checkout

- User approved practical use of reviewed resources.
- Checkout: E:/projects/eclipse-media; branch master; base HEAD 4e91074.
- Starting Git state was clean. Existing branch retained; no commit, push or deployment.
- Scope: local frontend implementation of transcript evidence review, scene direction and inert Codex exports. No Windows tweaks, GPU mods, external skill/model installation or paid API calls.
- Library resource review is a separate change in E:/projects/eclipse-library/.artifacts/original-motion/production-release; this task does not publish that checkout.

## Delivered locally

- Plan: a separate SRT/VTT review mode alongside the unchanged link-planning workflow.
- Bounded parsing, real-file SHA-256, selected excerpts, manual claim statuses, canonical YouTube moment links and JSON/Markdown exports.
- Beat map: seven original emotion presets, three intensities, per-scene direction, actor-consent declaration and separate scene-direction export.
- Existing eclipse.beat-map.v1 remains unchanged.
- Restored missing web favicon using the existing desktop SVG asset.
- Durable behavior and reference boundaries: [local-research-direction.md](../local-research-direction.md).

## Decisions

- Use local data before considering TranscriptAPI or generation providers: avoids sending transcripts, API-key storage and unapproved costs.
- Reuse existing Media theme and compact forms. The Taste is applied to operational UI, not as a marketing redesign.
- Do not copy the external emotion-prompt collection; use seven original observable-action presets.
- Treat imported strings as data. React escapes content; Markdown JSON fences and HTML delimiters are escaped; no network or code execution is attached.
- Keep source-file hashes separate from evidence claims. A hash cannot establish truth, video/subtitle correspondence or actor consent.
- Do not silently overwrite an authored action when switching emotions.
- Preserve a subtitle draft after a failed replacement file and across planning-mode switches.

## Evidence

Final local checks after implementation:

- npm --prefix frontend run typecheck: PASS.
- npm --prefix frontend run test: PASS, 48/48, including 8 new contract/security tests.
- npm --prefix frontend run lint: PASS.
- npm --prefix frontend run build: PASS, 79 modules. Existing font build-time warnings remain because public assets are copied after bundle creation; the tested browser paths returned no 404s.
- git diff --check: PASS for tracked diff; only normal Windows LF/CRLF notices.
- Isolated headless Edge against built assets on http://127.0.0.1:4192/: six scenario runs, two flows at widths 1440, 390 and 320.
- Browser assertions: file rights gate; demo; selected-note JSON and Codex downloads; manual evidence requirements; invalid-link rejection; bad/oversized file preserves notes; HTML remains inert; exact original-byte SHA-256; per-scene edits retained; actor consent gate; direction downloads; old beat-map schema unchanged; reset; keyboard outline; no document horizontal overflow.
- Reduced motion enabled for mobile-width runs. Desktop and narrow-screen screenshots visually inspected.
- Browser page errors: 0; HTTP errors: 0; external request attempts: 0.
- Evidence files: .runtime/news-pilot-20260906/{typecheck,test,lint,build}.log, browser-results.json and research-/direction-*.png. These are local ignored artifacts.

## Security review

Applied conducting-api-security-testing proportionally to the changed import/URL/export surface; no production API scanning was performed.

- Critical / High: none identified in this changed surface.
- Medium: no confirmed vulnerability found. Residual correctness/privacy limits are explicit: source correspondence, fact checking and consent are manual; exported user-supplied links may be sensitive and should be reviewed before sharing.
- Low: missing favicon 404 fixed with the existing asset.
- No new dependencies, secret values, authentication/API routes, shell commands, executable imports or production configuration were added. New flows contain no fetch, storage persistence or unsafe HTML sink.
- Prompt-injection protection is a data boundary and downstream review requirement, not a guarantee that any external agent will obey the handoff.
- Dependency advisories of unchanged packages, backend and desktop runtime were not audited in this scoped pass.

## Remaining limits and next safe action

- Drafts are in memory; leaving the workspace or reloading clears them. Download before leaving. Import of exported JSON and persistent autosave are not implemented.
- No automatic transcript retrieval, speech recognition, video-frame understanding, provider generation or publishing.
- Existing web/desktop version remains 1.6.0; no installer was built.
- Safe next step: user previews local Plan → Разобрать субтитры and Бит-карта → Открыть пример → Режиссура сцен.
- User subsequently authorized production publication in the current turn. The existing master-only manual deploy workflow is the release path; desktop release is excluded.

## Production release preflight

- master matched origin/master at 4e91074; last successful production workflow deployed that base.
- Repeated frontend typecheck, 48 tests, lint and build: PASS.
- Backend regression suite: 70/70 PASS.
- npm audit, both runtime-only and all frontend dependencies: 0 reported vulnerabilities.
- Repeated local Edge scenarios: 6/6 PASS, no page/HTTP errors or external requests.
- Deployment workflow reviewed: pinned Actions revisions, production environment, read-only repository permission, validated SSH parameters, strict host-key checking, healthcheck and previous-release rollback. No CI or secret changes.
- Preflight production HTML and API returned HTTP 200 via the current public-DNS address with hostname and TLS verification retained. Local resolver initially timed out; no machine DNS settings changed.
- Baseline production assets: index-oRZLWXEl.js and index-CiaW1j83.css.
- Release completion and actual deployed revision must be verified after workflow execution; this preflight is not a production-success claim.
