# Local research + scene direction

Updated: 2026-09-06.

## Scope and checkout

- User approved practical use of reviewed resources.
- Checkout: E:/projects/eclipse-media; branch master; base HEAD 4e91074.
- Starting Git state was clean. Existing master retained. Application commit a3741f630ac9d1cd4d54fe30bed150988d624cc2 was subsequently pushed and deployed with current user approval.
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
- Release follow-up checked all frontend dependency advisories: npm reported zero. Backend dependency advisories and desktop runtime were not audited in this scoped pass.

## Remaining limits and next safe action

- Drafts are in memory; leaving the workspace or reloading clears them. Download before leaving. Import of exported JSON and persistent autosave are not implemented.
- No automatic transcript retrieval, speech recognition, video-frame understanding, provider generation or publishing.
- Existing web/desktop version remains 1.6.0; no installer was built.
- Safe next step: user uses production Plan → Разобрать субтитры and Бит-карта → Открыть пример → Режиссура сцен. Future autosave/import work is separate from this completed release.
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
- Preflight was followed by the completed release and runtime checks below.

## Published and verified

- Application revision: a3741f630ac9d1cd4d54fe30bed150988d624cc2.
- CI: [34023129281](https://github.com/PavelHopson/eclipse-media/actions/runs/34023129281), success for this revision.
- Production workflow: [34023134011](https://github.com/PavelHopson/eclipse-media/actions/runs/34023134011), success for this revision, including build, container smoke and VPS activation/healthcheck.
- Production: https://media.eclipse-forge.ru/.
- Seven Edge scenario runs passed on production: both flows at 1440/390/320 widths plus real decoding of a generated 8-second PCM WAV and direction export linked to its scene plan.
- Production page errors: 0; HTTP errors: 0; external request attempts: 0; non-GET/HEAD mutation attempts: 0. Test files stayed in browser memory; downloads were captured in the isolated test profile.
- Desktop direction and mobile research screenshots visually checked.
- API health: ok=true, version=1.6.0, desktop_session=false, local_edit=preview-only, render_queue=preview-only.
- Production assets matched local built bytes by SHA-256:
  - index-Dn_j9K1X.js: 8014af55ac1b2b037e8cb6d0b177974151dac1b4c517287597b1ba442db03423.
  - index-CHgjlsYc.css: bd770d6285ea93183d484e56c27f614c1a9f6346a9baf88d56be746596433e33.
  - icon.svg: 2d1bea5a7da8db42c11b1f1eb7cb147f70930049c56d1ff07ea716f60cb352c9.
- Evidence: .runtime/news-pilot-20260906/production-browser-results.json, production-*.png, release-*.log and release-audit*.json.
- Operational caveat: the local default DNS resolver continued to time out. Google public DNS resolved the domain to 111.88.125.84. Verification used this address only as a per-process resolver mapping; HTTPS hostname/certificate checks remained enabled. No hosts, Windows DNS, proxy or server configuration was changed. Normal resolution from this local environment remains unverified.
- This receipt is documentation only; the application revision above is the deployed release, independent of any subsequent docs-only commit.
