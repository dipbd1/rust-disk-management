# Changelog

All notable changes to Liquid Storage Manager are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-11-25

### Added

- README screenshots and demo media for the public repo front page (#3)
- WinGet and Scoop packaging manifests under `packaging/`, plus a publish-to-WinGet workflow gated on `WINGET_TOKEN` (#4)
- In-app auto-updater (`tauri-plugin-updater` + process relaunch): startup check, dismissible prompt, About → Check for updates (#5)
- Updater public key in `tauri.conf.json`; release workflow signs `.sig` files and uploads `latest.json` when `TAURI_SIGNING_PRIVATE_KEY` is set (#5, #7)
- Delete preview lists items, count, size, and destination before Recycle Bin or permanent delete (#6)
- JSONL deletion log in app data plus a Deleted tab with Restore / Open Recycle Bin (#6)

### Changed

- Permanent delete requires a stronger confirm (acknowledgment checkbox) (#6)
- Draft release notes mention updater artifacts and that `/releases/latest/` only serves published releases (#5)

### Fixed

- Clippy on MSRV 1.85: avoid `is_multiple_of` (stabilized later) (#6)

## [0.1.0] — 2026-11-24

First public Windows release.

### Added

- Disk map with Rust-owned scan index, virtualized explorer, and liquid / area-map views
- Elevated NTFS MFT scan and `FindFirstFileEx` folder walk fallback
- Reclaim, duplicates, largest files, types, search, and growth panels
- Recycle Bin deletes by default; permanent delete behind a confirm
- Backend never-delete guards on explorer trash and permanent delete (`\Windows\`, Program Files, drive roots)
- Windows CI (fmt, clippy, tests, frontend build)
- Draft GitHub Release workflow for MSI and NSIS installers on `v*` tags
- MIT license

### Notes

- Windows-only; not published to crates.io

[0.1.1]: https://github.com/dipbd1/rust-disk-management/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/dipbd1/rust-disk-management/releases/tag/v0.1.0
