# Design QA — observable downloads v1.2.3

Status: **PASSED**

## Reference and target

- Reference: user screenshot `codex-clipboard-5e446205-0b90-4970-ab1a-5a8182199d18.png`
  showing the misleading long-download state at `100.0%` with no explanatory status.
- Implementation: local production preview of Eclipse Media v1.2.3 at 1440×900 and 390×844.
- Combined comparison artifact: `C:\Users\garaa\Documents\Codex\2026-08-22\new-chat\eclipse-media-comparison.png`.

## Visual review

- Existing Eclipse operator-console palette, typography, borders, radii and density are preserved.
- The progress region now adds one compact semantic status row instead of introducing another card
  or instruction-heavy modal.
- Spinner, phase label and secondary detail create an immediate hierarchy: current action first,
  diagnostic detail second, numeric progress last.
- Processing/finalizing retain the full progress bar but replace ambiguous ETA with
  `Не закрывайте приложение`, so 100% no longer reads as a frozen finished state.
- Desktop and 390 px mobile layouts have no document or body horizontal overflow.
- Mobile keeps the primary path, rights gate, controls and status content in a single column.

## State and interaction coverage

- Loading: `preparing`, `downloading`, `processing`, `finalizing` have distinct labels.
- Long HLS download: fragment counter is shown when the extractor provides it.
- Unknown ETA: omitted instead of displaying a false estimate.
- Completion and errors: existing save/error actions remain unchanged.
- Navigation: Downloads, Plan and Video Studio switch through semantic buttons at mobile width.
- Accessibility: progress region is `role=status` with polite live updates; the bar has a phase-aware
  accessible label; the spinner is hidden from assistive technology.
- Reduced motion remains covered by the existing global media-query baseline.

## Runtime evidence

- Production preview console: 0 warnings/errors.
- Desktop overflow: none.
- Mobile 390×844 overflow: none.
- Exact phase and fragment transitions are covered by backend and frontend focused tests.
- Two user-started downloads were deliberately not interrupted; the running v1.2.2 backend must be
  restarted only after they finish before the new backend phase telemetry is visible in that session.
