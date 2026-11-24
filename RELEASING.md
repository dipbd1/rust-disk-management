# Releasing Liquid Storage Manager

Windows installers (MSI + NSIS) are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) on `v*` tags (and `workflow_dispatch`). The workflow creates a **draft** GitHub Release. Review the artifacts, then publish.

The in-app updater reads:

`https://github.com/dipbd1/rust-disk-management/releases/latest/download/latest.json`

Draft releases are **not** served by `/releases/latest/`. Publish the release when users should receive the update.

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

## Cut a release

1. Bump `version` in `src-tauri/Cargo.toml` (and its `Cargo.lock` package entry), `src-tauri/tauri.conf.json`, and root `package.json` / `package-lock.json` (keep them in sync). Do **not** point WinGet/Scoop URLs or hashes at the new version until release assets exist — see `packaging/README.md`.
2. Update `CHANGELOG.md` (Keep a Changelog sections + compare links).
3. Merge to `main`, then tag and push:

```bash
git tag v0.1.1
git push origin v0.1.1
```

4. Wait for the Release workflow. Open the draft release, check MSI/NSIS (and `.sig` / `latest.json` when signing secrets are present), then publish.
5. After publish: WinGet updates via `winget-releaser` once `WINGET_TOKEN` is set and 0.1.0 is accepted; Scoop follows via `checkver` / `autoupdate` (details in `packaging/README.md`).
