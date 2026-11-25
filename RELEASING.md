# Releasing Liquid Storage Manager

Windows installers (MSI + NSIS) are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) on `v*` tags (and `workflow_dispatch`). The workflow creates a **draft** GitHub Release. Review the artifacts, then publish.

The in-app updater reads:

`https://github.com/dipbd1/rust-disk-management/releases/latest/download/latest.json`

Draft releases are **not** served by `/releases/latest/`. Publish the release when users should receive the update.

## Branch convention

Release work lives on **`release/X.Y.Z`** (example: `release/0.1.1`). The version is whatever follows `release/`.

Automation:

| Piece | Role |
| --- | --- |
| [`scripts/bump-version.mjs`](scripts/bump-version.mjs) | Sets or checks every app version field |
| [`.github/workflows/release-branch-version.yml`](.github/workflows/release-branch-version.yml) | On `release/**` pushes and PRs into `main`, fails if files do not match the branch version |

Do **not** invent WinGet/Scoop URLs or hashes for a version whose GitHub Release assets do not exist yet — see [`packaging/README.md`](packaging/README.md).

## Updater signing keys

The **public** key is already in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`. **Never commit the private key.**

If you ever need to regenerate a keypair (you will also have to replace that pubkey and re-ship so existing installs can verify future updates):

```bash
# From the repo root (writes the private key to the path you choose):
npm run tauri signer generate -- -w ~/.tauri/liquid-storage-manager.key

# Equivalent:
# cargo tauri signer generate -w ~/.tauri/liquid-storage-manager.key
```

Add these **repository secrets** (Settings → Secrets and variables → Actions) if they are not set yet:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of the private key file (or the key string the CLI printed) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set, or empty if you did not set one |

Optional Authenticode secrets (unchanged): `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`.

## What the release workflow does

- Builds MSI and NSIS with `tauri-apps/tauri-action`.
- When `TAURI_SIGNING_PRIVATE_KEY` is set: signs updater artifacts (`.sig`) and uploads `latest.json` (NSIS preferred for the Windows platform entry).
- When that secret is **absent**: the workflow disables `createUpdaterArtifacts` for that run so installers still build. There will be no `.sig` / `latest.json`, and the in-app updater cannot verify updates until you add the secrets and ship a signed release.

`bundle.createUpdaterArtifacts` stays `true` in `tauri.conf.json` for real releases. Local `npm run tauri build` without the private key env var will fail signing; either export the key or pass:

```bash
npm run tauri build -- --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}"
```

Manual `workflow_dispatch` draft tags use the version from `tauri.conf.json` (e.g. `v0.1.1-draft-<run>`).

## Checklist: cut a release

Replace `X.Y.Z` with the real version (example below uses `0.1.1`).

### 1. Branch from current `main`

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b release/X.Y.Z
```

Example: `git checkout -b release/0.1.1`

### 2. Bump version files

From the repo root (Node is enough; works on Windows):

```bash
node scripts/bump-version.mjs --from-branch
# or: node scripts/bump-version.mjs X.Y.Z
node scripts/bump-version.mjs --check --from-branch
```

Files the script updates (keep them in sync; CI checks them on `release/**`):

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `package-lock.json` | root `version` and `packages[""].version` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/Cargo.lock` | `name = "disk-space-management"` → `version` |
| `src-tauri/tauri.conf.json` | `version` |

Leave `packaging/winget/*.yaml` and `packaging/scoop/liquid-storage-manager.json` on the **previous** published version until the new assets exist.

### 3. Changelog

Edit [`CHANGELOG.md`](CHANGELOG.md):

- Add a `## [X.Y.Z] — YYYY-MM-DD` section (Keep a Changelog: Added / Changed / Fixed as needed)
- Move or leave prior released sections dated (not “Unreleased”)
- Update compare links at the bottom, e.g. `[X.Y.Z]: https://github.com/dipbd1/rust-disk-management/compare/vPREV...vX.Y.Z`

### 4. Release workflow / docs touch-ups (as needed)

Confirm [`.github/workflows/release.yml`](.github/workflows/release.yml) still builds MSI + NSIS, prefers NSIS for `latest.json`, and documents draft vs published for the updater. Update [`packaging/README.md`](packaging/README.md) post-release notes if the packaging story changed.

### 5. Open a PR into `main`

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
# plus any workflow/docs edits for this cut
git commit -m "Prepare vX.Y.Z release."
git push -u origin release/X.Y.Z
```

Open a PR titled **Release vX.Y.Z** (`release/X.Y.Z` → `main`).

### 6. CI must pass

- **CI / windows** — fmt, clippy (`-D warnings`), tests, `tsc`, frontend build (MSRV **1.85**)
- **Release branch version / match-release-branch** — versions match `release/X.Y.Z`

Do not merge with red checks.

### 7. Merge (maintainer)

A maintainer merges the PR into `main`. Agents must not merge unless explicitly asked.

### 8. Tag the merge commit on `main`

```bash
git fetch origin
git checkout main
git pull origin main
# confirm HEAD is the release merge
git tag vX.Y.Z
git push origin vX.Y.Z
```

Example: `git tag v0.1.1 && git push origin v0.1.1`

### 9. Draft GitHub Release (automated)

The tag push runs the Release workflow. It creates a **draft** with:

- MSI and NSIS installers (x64)
- When `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set: `.sig` files and `latest.json` for the in-app updater (`updaterJsonPreferNsis: true`)

Open the draft, smoke-test the installers, confirm updater artifacts when secrets are present.

### 10. Publish the draft

Publish when users should receive the update. `/releases/latest/` (and therefore the in-app updater) ignores drafts.

### 11. WinGet

- **First package version** (historically 0.1.0): submit `packaging/winget/` manually to `microsoft/winget-pkgs` — see [`packaging/README.md`](packaging/README.md).
- **Later versions** (e.g. 0.1.1+): after the package exists and repo secret `WINGET_TOKEN` is set, [`.github/workflows/winget.yml`](.github/workflows/winget.yml) (`vedantmgoyal9/winget-releaser`) opens an update PR on `release: published`. You do not need to bump local winget YAML first for that path.
- Optional: refresh local `packaging/winget` hashes from published assets for reference.

### 12. Scoop

- `packaging/scoop/liquid-storage-manager.json` uses GitHub `checkver` / `autoupdate` on the NSIS setup URL.
- After publish, bucket maintainers (or anyone vendoring the JSON) pick up `X.Y.Z` via `checkver`; optionally refresh the checked-in JSON afterward.
- Details: [`packaging/README.md`](packaging/README.md).

## Quick reference — secrets

| Secret | Needed for |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Signed updater `.sig` + `latest.json` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Unlock the private key (empty string if none) |
| `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` | Optional Authenticode |
| `WINGET_TOKEN` | Auto PR to `microsoft/winget-pkgs` after publish |
