# Packaging (WinGet + Scoop)

Local manifests for distributing Liquid Storage Manager on Windows. Nothing here submits to an external repository until you set secrets and publish a release.

| Path | Purpose |
| --- | --- |
| [`winget/`](winget/) | WinGet multi-file manifests (`dipbd1.LiquidStorageManager`, schema 1.6.0) |
| [`scoop/liquid-storage-manager.json`](scoop/liquid-storage-manager.json) | Scoop app manifest with GitHub `checkver` + `autoupdate` |
| [`.github/workflows/winget.yml`](../.github/workflows/winget.yml) | On published release, opens a PR to `microsoft/winget-pkgs` when `WINGET_TOKEN` is set |

Package identifier: **`dipbd1.LiquidStorageManager`**.

Installer artifacts (from the Release workflow):

- NSIS: `Liquid.Storage.Manager_<ver>_x64-setup.exe` (silent: `/S`)
- MSI (WiX): `Liquid.Storage.Manager_<ver>_x64_en-US.msi` (silent: `/quiet /norestart`)

## Do not bump local manifests before assets exist

Keep `packaging/winget/*.yaml` and `packaging/scoop/liquid-storage-manager.json` pointed at **0.1.0** (URLs + SHA256) until the matching GitHub Release assets are published. A version bump PR must not invent hashes for a tag that has not been built yet.

After **v0.1.1** (or any later tag) is published:

1. **WinGet** — if the 0.1.0 package is already accepted in `microsoft/winget-pkgs` and `WINGET_TOKEN` is set, the [Publish to WinGet](../.github/workflows/winget.yml) workflow (`vedantmgoyal9/winget-releaser`) opens the update PR automatically on `release: published`. You do not need to hand-edit the local winget YAML for that path.
2. **Scoop** — `checkver` / `autoupdate` rewrite the NSIS URL and hash from the latest GitHub release when maintainers run `scoop update` / bucket CI. Optionally refresh the checked-in JSON afterward so the raw install URL matches current.
3. If you still maintain the local winget copies for reference, refresh hashes only after downloadable `…/download/v<ver>/…` assets exist (see below).

## Fill or refresh SHA256 hashes

Draft releases use temporary `untagged-…` download URLs. Manifests use the stable published form:

`https://github.com/dipbd1/rust-disk-management/releases/download/v<ver>/…`

Hashes for **0.1.0** were taken from the draft assets (and match `sha256sum` of those files). After you **publish** a tag — or rebuild installers — recompute:

```bash
TAG=v0.1.0   # or v0.1.1 once that release exists
VER=${TAG#v}
gh release download "$TAG" -R dipbd1/rust-disk-management -D /tmp/lsm-hash --clobber
sha256sum /tmp/lsm-hash/Liquid.Storage.Manager_${VER}_x64-setup.exe \
          /tmp/lsm-hash/Liquid.Storage.Manager_${VER}_x64_en-US.msi
```

- WinGet `InstallerSha256`: uppercase hex, no `sha256:` prefix.
- Scoop `hash`: lowercase hex (or `sha256:<hex>`).

If an asset is not downloadable yet, put `REPLACE_WITH_SHA256` in the installer / Scoop hash fields and replace before submitting.

Placeholder example (do not submit with this):

```yaml
InstallerSha256: REPLACE_WITH_SHA256
```

## First WinGet submission (manual)

[`vedantmgoyal9/winget-releaser`](https://github.com/vedantmgoyal9/winget-releaser) updates an **existing** package in [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs). The **first** version must be submitted by hand:

1. Publish the GitHub release for `v0.1.0` (draft → published) so the `…/download/v0.1.0/…` URLs work.
2. Confirm hashes in `packaging/winget/*.yaml` match the published assets.
3. Install [wingetcreate](https://github.com/microsoft/winget-create) (or use `winget download` / Community repo PR UI).
4. Submit the three files under `packaging/winget/` to `microsoft/winget-pkgs` under  
   `manifests/d/dipbd1/LiquidStorageManager/0.1.0/`.
5. Wait for the Microsoft WinGet pipeline to merge/approve.

Do **not** expect the Actions workflow to create the first PR successfully until that package already exists.

Validate locally (Windows with WinGet CLI):

```powershell
winget validate --manifest packaging\winget
```

## `WINGET_TOKEN` (subsequent releases, including 0.1.1+)

The [Publish to WinGet](../.github/workflows/winget.yml) workflow runs on `release: published` and does **nothing** unless the repository secret `WINGET_TOKEN` is set.

One-time setup (Dip):

1. Fork `microsoft/winget-pkgs` under the same GitHub account that will own the token (usually `dipbd1`).
2. Create a **classic** Personal Access Token with `public_repo` (and preferably `workflow` so the fork can sync workflow files). Fine-grained PATs are not supported by winget-releaser.
3. Repo **Settings → Secrets and variables → Actions → New repository secret**  
   Name: `WINGET_TOKEN`  
   Value: that classic PAT.
4. After the first package is in winget-pkgs, publishing a new `v*` GitHub release (e.g. **v0.1.1**) will open an update PR automatically. No need to bump the local `packaging/winget` files first for that automated path.

Without the secret, the job prints a skip notice and exits successfully.

## Scoop

Install from this repo’s raw manifest URL:

```powershell
scoop install https://raw.githubusercontent.com/dipbd1/rust-disk-management/main/packaging/scoop/liquid-storage-manager.json
```

Or vendor the JSON into a custom bucket (Scoop expects apps under that bucket’s `bucket/` directory):

```powershell
copy packaging\scoop\liquid-storage-manager.json <your-bucket>\bucket\
scoop install liquid-storage-manager
```

`checkver` / `autoupdate` track GitHub releases and rewrite the NSIS `#/dl.7z` URL. Scoop extracts the setup.exe as a portable tree; the binary is `disk-space-management.exe` (Cargo package name). After **v0.1.1** is published, bucket maintainers (or `scoop update` against a bucket that vendors this JSON) pick up the new version via `checkver` without waiting for a hand-edited hash in this repo.
