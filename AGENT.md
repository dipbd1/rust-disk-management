# AGENT.md

You are an expert Senior Rust (Tauri v2) and TypeScript / React Three Fiber engineer working on this Windows 3D disk manager.

Before writing code, follow this file, [docs/SRS.md](docs/SRS.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Those docs are the coding, scaling, and structure contract. If your change alters a pattern, update the docs in the same change. Do not leave the implementation smarter than the docs, or the docs ahead of the code.

## Change protocol

Update together when a boundary moves:

- `docs/SRS.md` — user-visible behavior
- `docs/ARCHITECTURE.md` — data flow, caps, paging, safety, file placement
- this file — rules an agent must obey on the next task

Forbidden drift:

- Sending the full recursive tree to the webview
- Rendering more than `GRAPH_CHILD_CAP` (60) child spheres
- Calling `@tauri-apps/api` outside `src/services/tauriBridge.ts`
- `.unwrap()` / `.expect()` in commands or services
- `setState` inside `useFrame`
- `std::fs::remove_dir_all` outside `permanent_delete`
- A second cache that mixes filtered search results into the tree pages

## 1. Core architectural principles

- **Strict separation of concerns:**
  - `src-tauri/src/commands/` contains ONLY thin Tauri command wrappers. Filesystem scanning, size aggregation, and OS operations belong in `src-tauri/src/services/`.
  - `src/components/explorer/` contains ONLY 2D UI components.
  - `src/components/visualizer/` contains ONLY 3D React Three Fiber components.
  - Frontend components NEVER call `@tauri-apps/api` directly; all IPC calls must go through typed functions in `src/services/tauriBridge.ts`.
- **Single source of truth:** Use Zustand (`src/store/useFileStore.ts`) for shared state (`focusedNodeId`, `selectedNodeId`, `scanStatus`, graph view, paged children).
- **Rust owns the index.** JavaScript holds the open branch, one folder page, and the current graph view. See the caps table in `docs/ARCHITECTURE.md`.

## 2. Rust backend rules

- **NO PANICS IN PRODUCTION:** Never use `.unwrap()` or `.expect()` inside commands or services. Define a unified `AppError` enum in `src-tauri/src/error.rs` using `thiserror::Error` and implement `serde::Serialize` for `AppError` so all Tauri commands return `Result<T, AppError>`.
- **Parallel non-blocking scanning:** Use `jwalk` with `skip_hidden(false)` and `follow_links(false)`. Never block the main Tauri thread. Heavy I/O uses `tauri::async_runtime::spawn_blocking`.
- **Streaming IPC:** Use `tauri::ipc::Channel` to stream `ScanProgress` every 100ms. The payload carries a preview of at most 200 top-level nodes, not the whole tree.
- **Cancellation:** `Arc<AtomicBool>` shared with `cancel_scan`. Relaxed ordering is enough. A generation counter discards a scan that a newer one replaced. Store the partial index on cancel.
- **Safe deletions:** Default user deletes go through the `trash` crate. `std::fs::remove_file` / `remove_dir_all` run only inside `permanent_delete`, after the UI confirmation modal. Never delete a drive root (`C:\`).
- **Windows paths:** Normalize with `services/paths.rs` before a path is stored or sent to the UI. One function, no ad-hoc slash logic in components.
- **Watcher:** `notify` watches the focused folder non-recursively and emits `fs-stale`. It must not start a second scanner.

## 3. React and TypeScript rules

- **Strict TypeScript:** Never use `any`. Every Rust struct serialized via `serde` has a matching interface in `src/types/filesystem.ts`. Rust structs use `#[serde(rename_all = "camelCase")]`.
- **Virtualization required:** Never map raw file arrays into the DOM. Trees and folder lists use `@tanstack/react-virtual` and paged `get_children`.
- **Two page caches:** `childPages` is the unfiltered tree. `list` is the focused folder and may include a search query. Do not merge them.
- Stay on the React version already in `package.json` (React 19). Do not pin React 18 because an older blueprint mentioned it.

## 4. React Three Fiber and 3D performance rules

- **NEVER `setState` inside `useFrame`:** Mutate mesh refs or shader uniforms. A single one-shot store action when a drain animation finishes is the exception.
- **Read Zustand transiently in 3D:** Inside `useFrame`, read `useFileStore.getState()` for selection and drain state.
- **Cap visible 3D nodes:** The backend `get_graph_view` returns the focus sphere, at most 60 children, and one "Other Small Files" aggregate. Do not uncapped this in the component.
- **Shader and geometry reuse:** Share one `SphereGeometry` and one glass `MeshPhysicalMaterial` per graph mount. Pass `dispose={null}` on meshes that use them. Per-sphere shader materials exist only because fill and color differ.
- **Physics is not a per-frame React update:** Run `d3-force-3d` when the graph payload changes. Lerp positions in `useFrame`.
- **No bloom pass.** The liquid fragment shader provides the glow. A post-processing pass is out of pattern unless `docs/ARCHITECTURE.md` is updated with a measured FPS note.

## 5. Code style

- Keep files modular and under about 250 lines. Extract a hook or a small module instead of growing a component.
- When writing Rust, add a brief comment where ownership or concurrency is not obvious (`Arc`, `AtomicBool`, generation counter).
- Match existing names: `FileNode`, `ScanProgress`, `GraphView`, `DeleteResult`, `focusedNodeId`.
- New IPC is unfinished until the command, the bridge function, and the TypeScript type all exist.

## 6. Adding a feature

1. Read the SRS item you are implementing.
2. Place the code using the table in `docs/ARCHITECTURE.md`.
3. If you need a new constant, add it to `src-tauri/src/limits.rs` and `src/lib/limits.ts`, then record it in `docs/ARCHITECTURE.md`.
4. Run `cargo test` in `src-tauri` and `npx tsc --noEmit` at the repo root before calling the task done.
