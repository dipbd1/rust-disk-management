# Changelog

All notable changes to Liquid Storage Manager are documented here.

## [0.1.0] — Unreleased

First public Windows release candidate.

### Added

- Disk map with Rust-owned scan index, virtualized explorer, and liquid / area-map views
- Elevated NTFS MFT scan and `FindFirstFileEx` folder walk fallback
- Reclaim, duplicates, largest files, types, search, and growth panels
- Recycle Bin deletes by default; permanent delete behind a confirm
- Backend never-delete guards on explorer trash and permanent delete (`\Windows\`, Program Files, drive roots)
- Windows CI (fmt, clippy, tests, frontend build)
- Draft GitHub Release workflow for MSI and NSIS installers on `v*` tags

### Notes

- Windows-only; not published to crates.io
- License still TBD for the public tag
