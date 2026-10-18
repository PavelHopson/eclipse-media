# Eclipse Media — product profile

Scope: React/TypeScript web UI under [frontend/src/](../../../../frontend/src/). Users prepare an authorized source, see processing states, work on a plan and save a result. A preview, a queued job and a completed file are distinct outcomes.

## Existing system

- Read [repository guide](../../../../docs/repository-guide.md), [safe local edit contract](../../../../docs/safe-local-edit-contract.md), and [local projects](../../../../docs/local-projects.md) for the affected flow. Historical QA is evidence for its dated revision, not current production.
- Reuse [index.css](../../../../frontend/src/index.css), the component-specific styles and [token snapshot](../../../../frontend/public/design-system/eclipse-forge.tokens.json). Keep the operator-console density, typography, borders and icon family; do not apply a new Apple skin.
- [frontend/package.json](../../../../frontend/package.json) defines the React/Vite stack; inspect its lockfile before any version-specific advice. No new Motion dependency is required by this skill.
- [DownloadProgress](../../../../frontend/src/components/DownloadProgress.tsx) and [downloadProgress service](../../../../frontend/src/services/downloadProgress.ts) separate preparation, downloading and finalization. Reuse these state semantics instead of a decorative success timer.
- [MediaIntake](../../../../frontend/src/components/MediaIntake.tsx) keeps source intent, project choice, errors and rights confirmation together. UI simplification must not bypass that confirmation.

## Product invariants

100% transferred is not proof that processing/finalizing or saving succeeded. Announce actual phase and actionable errors; retry must not silently duplicate work. Cancel is not success. Preserve supported cancellation and drafts without inventing new backend capability.

Keep browser preview and authenticated desktop export distinct. Do not expose tokens, paths or arbitrary commands in UI feedback. Permission to view a source is not permission to download, send it to an AI provider, publish or incur charges.

## Next small pilot — proposed, not implemented

DownloadProgress.tsx currently places label and detail in one atomic polite live region. Review whether frequent fragment/progress updates repeatedly announce the whole status. Pilot stable phase announcements with useful progress still visible and accessible; retain processing/finalizing distinctions, reduced-motion feedback and error/retry controls in the owning queue. Verify with synthetic phase updates and a screen reader before claiming a defect or improvement. Do not start real downloads for this pilot.

## Verification routing

For this documentation-only package: validate skill frontmatter, links, pinned source/license and diff scope. For a later UI pilot: use frontend typecheck, relevant tests, lint and build from [package.json](../../../../frontend/package.json), plus keyboard and desktop/mobile runtime checks. Backend tests apply only if backend contracts change. [.github/workflows/ci.yml](../../../../.github/workflows/ci.yml) defines the broader PR checks. Do not invoke deployment or desktop release workflows to test UI.
