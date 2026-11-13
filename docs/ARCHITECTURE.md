# Architecture and scaling patterns

This file is the source of truth for how the app is structured and how it stays fast. `docs/SRS.md` says what the product must do. This file says how code is allowed to do it. `AGENT.md` tells coding agents to follow both and to update them when a pattern changes.

## Data flow

```text
TopDriveBar / tree / graph
        │  Zustand actions only
        ▼
src/services/tauriBridge.ts     ← only frontend module that imports Tauri IPC
        │  invoke + listen (tauri-remote-ui) and Channel (@tauri-apps/api)
        ▼
src-tauri/src/commands/         ← thin wrappers, no scanning logic
        ▼
src-tauri/src/services/         ← scanner, index, watcher, drive listing
        ▼
ScanIndex (RAM)                 ← full tree stays here
```

The webview never receives the whole recursive tree. It receives:

- drive list
- a progress payload every 100ms with the root, at most 200 largest direct children, and moons for the 12 largest of those folders (5 children each)
- one page of direct children (default 400, max 1000) for a folder the user opened
- one graph view: the focused folder, its 60 largest children, and one aggregate sphere

## Constants (keep these in sync)

| Constant | Rust | TypeScript | Value |
| --- | --- | --- | --- |
| Child page size | `limits::CHILD_PAGE_DEFAULT` | `CHILD_PAGE_SIZE` | 400 |
| Child page max | `limits::CHILD_PAGE_MAX` | requested by Rust clamp | 1000 |
| Graph children | `limits::GRAPH_CHILD_CAP` | `GRAPH_CHILD_CAP` | 60 |
| Progress preview | `limits::PROGRESS_PREVIEW` | not sent above this | 200 |
| Moon parents | `limits::SATELLITE_PARENTS` | `SATELLITE_PARENTS` | 12 |
| Moons per parent | `limits::SATELLITE_CHILDREN` | `SATELLITE_CHILDREN` | 5 |
| Progress interval | `limits::PROGRESS_INTERVAL_MS` | n/a | 100 |
| Heavy file | `limits::HEAVY_FILE_BYTES` | `HEAVY_FILE_BYTES` | 5 GiB |
| Sphere radius | n/a | `scale.ts` | 0.4 – 3.5 |

Rust is authoritative for paging and the graph cap. Do not re-implement the cap only in the UI.

## Backend patterns

- `ScanIndex` is an arena: `Vec<NodeRecord>` plus `HashMap` path → id. Directory sizes are the sum of file sizes bubbled to ancestors while scanning. Children are sorted once at the end.
- IDs sent to the UI are normalized Windows paths. `normalize_path` strips `\\?\`, flips slashes, and keeps the trailing slash only for drive roots (`C:\`).
- `start_scan` runs on `spawn_blocking`. A generation counter drops results from a scan that was replaced. Cancel is `Arc<AtomicBool>` with relaxed ordering.
- An elevated NTFS drive root is read with `ntfs-reader` (`MftScan`), one sequential pass over the Master File Table. Logical file size is the unnamed data stream. Hard-link bytes are counted once, under the Win32 name. Reparse points are recorded and not treated as containers. If the volume cannot be opened, the scan falls through to the folder walk.
- Every other root uses a worker pool around `FindFirstFileExW` (`FindExInfoBasic` and `FIND_FIRST_EX_LARGE_FETCH`). Size and the reparse attribute come from `WIN32_FIND_DATA`. Workers only enumerate. The blocking thread owns the index. `insert_ready` does not parse a path that is already normalized.
- On launch, a non-elevated process with a fixed NTFS drive asks whether to restart as administrator. Continue starts the folder walk. The choice can be remembered. The top bar keeps a Faster scan action. `npm run dev:admin` runs `tauri dev` elevated, so Cargo owns the process. Stop any other dev session first; both need port 1420. The in-app restart does the same handoff and then exits. A release build starts the installed exe and exits. Normal and elevated runs use different WebView2 directories under the app local data dir: `webview-user` or `webview-admin`.
- Progress streaming uses a callback in the scanner. The command adapts that callback to `tauri::ipc::Channel`. Tests do not need a Tauri runtime.
- On cancel, the partial index is kept so the user can browse what was already found.
- `trash_path` uses the `trash` crate. `permanent_delete` is the only caller of `remove_file` / `remove_dir_all`. Both then call `ScanIndex::remove_path`, which subtracts `freedBytes` up the ancestor chain and returns those nodes.
- The watcher is non-recursive on the focused folder, debounced, and emits `fs-stale`. It does not rescan. The UI shows a rescan action. Rescan always restarts from the active drive so ancestor totals stay honest.
- Commands return `Result<T, AppError>`. `AppError` serializes as a string. No `.unwrap()` or `.expect()` in commands or services. `Builder::run` in `lib.rs` is the one allowed startup `.expect()`.
- Debug builds start `tauri-remote-ui` on `127.0.0.1:9090` from `lib.rs`, with the desktop window left active. Release builds do not open that socket. Vite proxies `/remote_ui_ws`, `/remote_ui_info`, and `/remote_ui_disconnect` to that port. A browser on `http://localhost:1420` uses the same commands once that process is listening. If the socket drops, the page reconnects instead of leaving for the plugin disconnect screen.
- The desktop webview calls `start_scan` and receives progress on a `Channel`. The browser calls `start_scan_remote`, which returns immediately, and waits for `scan-progress` with `done: true`. That avoids the remote-ui invoke timeout. Boot attaches to a scan already running for that drive, or replays a finished one. Choosing a drive or Rescan passes `force` and starts a new walk. One emit task coalesces browser progress. Failures emit `scan-error`. `fs-stale` uses `EmitterExt` too.

## Frontend patterns

- Zustand (`useFileStore`) is the only shared state. Components do not call `invoke`.
- Tree pages (`childPages`, source `preview` or `index`) and the filtered folder list (`list`) are separate. A search must not replace the tree cache. The folder list is not rendered; `list` and `refreshList` stay so filtered results never mix into tree pages. An expanded folder draws its file rows from that same child page. Files are leaves.
- The selection details panel is a 2D layout widget (`components/layout/ViewerInspector.tsx`) docked under the folder tree by `SplitWorkspace`. It is not an overlay on the graph. `SplitWorkspace` owns the panel height ratio and collapsed flag. The graph surface is the canvas and HUD only.
- While `scanStatus` is `scanning`, the canvas reads `progress` inside the animation frame and draws the root, at most 16 direct children, and the capped moons beside the largest folders. It does not write `graphView` on each tick. Each level-1 path keeps the slot angle it got the first time it appeared, including after the scan finishes. Publishing `graphView` for the hub already on screen does not replay the drill-in. A new moon eases out from its parent. The radar sweep, scanning label, and path ticker fade out over about 700ms. A click during the scan selects the ball and does not drill in, because the index is published when the scan finishes.
- Lists render through `@tanstack/react-virtual`. A "load more" row fetches the next page. Do not map a filesystem array into DOM nodes.
- 3D code lives under `src/components/visualizer/`. `useFrame` may write refs and shader uniforms. It may call `useFileStore.getState()`. It must not call a React `setState` every frame. A one-shot action (the drain finished) is allowed.
- Sphere geometry and the glass `MeshPhysicalMaterial` are allocated once per graph mount and passed down. Liquid `ShaderMaterial`s are per sphere because their uniforms differ. Meshes that share geometry use `dispose={null}` so one unmount does not free the shared GPU buffer.
- `d3-force-3d` runs when the graph payload changes, not every frame. `useFrame` only lerps meshes toward those targets.
- Category colors: folders cyan `#00F0FF` → `#0066FF`, media `#FF007A` → `#7928CA`, code/archives/binaries `#00FF87` → `#00B4DB`, files over 5 GiB `#FFC837` → `#FF8008`.
- Shared chrome lives in `src/index.css` (page background `#0b0f17`, text `#e2e8f0`). Scrollbars are one global rule there: 8px, transparent track, slate-600 thumb (`#475569`), slate-400 on hover (`#94a3b8`). Firefox gets that through `scrollbar-width` / `scrollbar-color` only; Chromium, including the Tauri webview, uses the `::-webkit-scrollbar` rules in the same file. Every overflow surface uses it. Do not restyle a panel's scrollbar on its own.

## Where new code goes

| Change | Home |
| --- | --- |
| New IPC | `commands/` wrapper, `services/` logic, `tauriBridge.ts`, `types/filesystem.ts`, register in `lib.rs` |
| New filesystem behavior | `services/`, then a store action |
| New 2D widget | `components/explorer/` or `components/layout/` |
| New 3D object | `components/visualizer/` and, if it shades, `shaders/` |
| New serializable field | Rust struct with `rename_all = "camelCase"` and the matching TypeScript field in the same change |

Keep files under about 250 lines. Split a hook or a `limits` / `paths` module before a file becomes a second feature.

## Change protocol

Any change to module boundaries, IPC shape, paging, the graph cap, deletion safety, or the scan index updates all three of:

1. `docs/SRS.md` if the user-visible requirement changed
2. `docs/ARCHITECTURE.md` for the pattern
3. `AGENT.md` if the agent rule changed

Do not "temporarily" stream the full tree, render uncapped spheres, or call `@tauri-apps/api` from a component.
