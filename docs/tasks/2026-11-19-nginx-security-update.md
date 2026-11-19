# NGINX security update — 2026-11-19

## Scope and outcome

Owner approved updating Media NGINX and the inactive host NGINX on the main Eclipse VPS. No Star/shared Chat server changes, kernel updates, exploit tests, or application feature release.

Production verified at **2026-11-19T15:23:35Z**, host `mara` / `111.88.125.84`:

- Media frontend: **NGINX 1.30.7**, healthy. Image `eclipse-media-frontend:nginx-1.30.7-20261119`, ID `sha256:797dea65d995f2b16918b27cbf8b2004495b0fde672a1c16d47b35589a39d249`.
- Host `nginx` and `nginx-common`: **1.24.0-2ubuntu7.20**. Service remains disabled, MainPID=0, with its pre-existing `failed` state; it was not started or reset.
- Caddy remained active with the same PID 530; backend container ID, image and start time unchanged.
- Rootless Docker, loopback-only port `127.0.0.1:8080`, user `nginx`, read-only filesystem, `cap_drop: ALL`, `no-new-privileges` and resource limits preserved.
- The runtime update did not dispatch a GitHub deployment or create a branch. Owner subsequently authorized publishing only this report and `frontend/Dockerfile` to existing `master`; existing local README changes are excluded.

Sources: [NGINX advisories](https://nginx.org/en/security_advisories.html), [Ubuntu USN-9159-1](https://ubuntu.com/security/notices/USN-9159-1).

## Deployment method and existing drift

Running containers referenced `/opt/eclipse-media/releases/4af73c614f80427899e89b2e5ff897f45e1500f1/docker-compose.production.yml`, while `/opt/eclipse-media/current` pointed to release `803c52c18ac7def81fe83ae4065047f4b44dde73`. This pre-existing mismatch was not corrected by deploying different application code.

The old image had been deleted although its container was running. A local container snapshot was made and archived before replacement. New image copies only the existing NGINX configuration and deployed static files onto the official fixed base:

`nginx:1.30.7-alpine@sha256:bef154735288bc38d99fac41ae63730684bcc661503673a04a0f9bc526ba8598`

Only frontend was recreated, using the original compose file plus the maintenance image override, with `--no-deps --no-build --wait`. Neither backend nor Caddy was restarted. Existing release directories and `current` symlink were not changed.

Maintenance artifacts on the server: `/opt/eclipse-media/maintenance/nginx-security-20261119/` (mode 0700). It contains build recipe, forward/rollback compose overrides, activation scripts, hash manifests, package/config backup and archived rollback image. No secrets are printed in the report.

## Verification

- Candidate container tested before activation with matching read-only/user/network restrictions.
- `nginx -t`: PASS before and after activation; active process reports `nginx/1.30.7`.
- SHA-256 hashes for all **32 deployed static files** and `/etc/nginx/nginx.conf`: identical before/candidate/after.
- Candidate and active `/api/health`: `ok=true`, version 1.6.0, desktop session false, local edit and render queue remain preview-only.
- Public HTTPS `/api/health`: same JSON, normal DNS and certificate verification.
- Public HEAD checks: `eclipse-forge.ru`, `library.eclipse-forge.ru`, `media.eclipse-forge.ru`, `hub.eclipse-forge.ru` all HTTP 200.
- Codex in-app browser opened the production Media intake page and rendered the interface. This is a load smoke test, not a full feature regression suite.
- `dpkg --audit`: no output; only nginx/nginx-common were upgraded (46 unrelated updates not installed).
- Host NGINX temporarily runtime-masked during package installation to avoid taking Caddy ports. Runtime mask removed by trap; disabled state preserved.
- No test container or port 18081 remained after candidate checks.
- Local Dockerfile `git diff --check`: PASS. No frontend source changes or new npm build were included in this infrastructure update.

The first activation rolled back automatically after a public 503 while direct backend checks passed. Inspection confirmed Caddy active upstream health checks every 30 seconds. Activation now waits for recovery across at least two health-check intervals before declaring failure; Caddy configuration was not weakened or edited. Second activation and final checks passed.

## Rollback (emergency only)

Rollback restores a known-vulnerable NGINX and must only be used to recover a service regression, followed by remediation.

On the VPS, Bash:

```bash
export DOCKER_HOST=unix:///run/user/1000/docker.sock
docker compose -p eclipse-media \
  -f /opt/eclipse-media/releases/4af73c614f80427899e89b2e5ff897f45e1500f1/docker-compose.production.yml \
  -f /opt/eclipse-media/maintenance/nginx-security-20261119/compose.rollback.yml \
  up -d --no-deps --no-build --wait --wait-timeout 90 frontend
curl --fail --show-error http://127.0.0.1:8080/api/health
# Allow Caddy's 30-second health-check cycle before checking public HTTPS.
curl --fail --show-error https://media.eclipse-forge.ru/api/health
```

Rollback image tag: `eclipse-media-frontend:pre-nginx-security-20261119`.
Archived copy: `rollback-image.tar.gz`, SHA-256 `8fd76906a6800879c2e275a37ffdf6e8ce7f7aaa6eb842060c1768b83ca25285`.
The automatic rollback was exercised successfully during the first activation.

Old Ubuntu debs and `/etc/nginx` archive remain in `host-backup/`; no package downgrade was required.

## Remaining boundary

`frontend/Dockerfile` in this source change pins the fixed official base image and digest. Subsequent normal builds must use this revision or a descendant retaining that pin; deploying older source can reintroduce NGINX 1.28.0. Do not deploy arbitrary local application changes or use the mismatched `current` release as proof of the active application version.

Publication is prepared from remote `master` at `567e7514c0ea6f778245f4700a9cb3e4f5119462` in a detached worktree because the original checkout is 19 commits behind and contains unrelated README changes. Only the Dockerfile and report belong to this commit. The production deployment workflow is manual (`workflow_dispatch`); this publication does not release the newer application changes already on remote `master`.

High-priority runtime package findings in this approved scope are fixed and verified. No claim is made about other servers, the Linux kernel, unrelated CVEs, or absence of prior compromise. Repository CI is distinct from the production checks recorded above.
