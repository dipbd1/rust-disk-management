# Software Requirements Specification (SRS)
## Project: 3D Liquid Storage Manager for Windows

### 1. Purpose
A high-performance desktop storage analyzer and file management utility for Windows. It combines a fast, virtualized 2D file tree with an interactive 3D force-directed graph where folders and files are represented as glass spheres filled with animated colored liquid proportional to their storage footprint.

### 2. Functional Requirements (FR)

#### FR-1: Disk Discovery & Mounting
- **FR-1.1:** On launch, the Rust backend shall query all mounted Windows volumes (Fixed NTFS, exFAT, FAT32, and removable drives) and return total capacity, available space, and mount root (`C:\`, `D:\`, etc.).

#### FR-2: Multi-Threaded Directory Scanning
- **FR-2.1:** An elevated scan of an NTFS drive root shall read the Master File Table. Every other scan (a folder, a non-NTFS volume, or a process that is not elevated) shall walk the tree with parallel `FindFirstFileEx` calls. File size comes from that listing. The walk does not stat each file again.
- **FR-2.2:** Scanning must be non-blocking. Progress updates and partial tree chunks shall stream to the frontend via Tauri v2 IPC `Channel` at a throttled interval (every 100ms). While a scan is running, the graph draws the drive, up to 16 of its largest direct children, and up to five moons on each of the 12 largest of those folders. Level-1 balls keep a stable slot through the end of the scan. New moons ease out from their parent. The radar sweep, scanning label, and path ticker fade out over about 700ms when the scan ends. A click on any ball during the scan selects it and does not open a folder. The app toasts “Scanning in progress. Please wait.” at the top center of the window.
- **FR-2.3:** Users must be able to cancel an active scan immediately via an atomic cancellation token (`Arc<AtomicBool>`).
- **FR-2.4:** The scanner shall gracefully skip Windows system-locked directories (`System Volume Information`, `$Recycle.Bin`, restricted AppData junctions) without crashing, logging them as `access_deniedCount`.
- **FR-2.5:** On launch, if the process is not elevated and a fixed NTFS drive is present, the app shall explain that an administrator scan is faster and that a folder walk still works. The user can restart as administrator or continue. "Don't ask again" remembers the continue choice. A Faster scan action stays available afterward. A debug restart exits and starts an elevated `tauri dev` session. A release build exits and starts one elevated process.

#### FR-3: Left Pane — Virtualized Explorer & Context Menu
- **FR-3.1:** The left pane shall render a virtualized tree of folders and files capable of holding 100,000+ entries (`@tanstack/react-virtual`). Folders collapse. Files are leaves.
- **FR-3.2:** Nodes in the tree shall be sorted in descending order by cumulative byte size by default.
- **FR-3.3:** Right-clicking any node shall open a custom Context Menu providing:
  - Focus Node in 3D View
  - Reveal in Windows File Explorer
  - Move to Recycle Bin
  - Permanently Delete (with confirmation prompt)
  - Copy Full Path
- **FR-3.4:** The left column shall contain the virtualized folder tree and a docked selection-details panel. The panel collapses to its header and resizes vertically against the tree.

#### FR-4: Right Pane — 3D Liquid Sphere Graph
- **FR-4.1:** The right pane shall render the currently focused folder as a central 3D sphere and its immediate children as connected satellite spheres using a 3D force-directed layout (`d3-force-3d`).
- **FR-4.2:** Sphere radius shall scale logarithmically (`Math.cbrt` or clamped log scale) between a minimum (`0.4` units) and maximum (`3.5` units) so massive folders do not swallow the camera and tiny files remain clickable.
- **FR-4.3:** Each sphere shall display an internal GLSL liquid shader:
  - Fill height (`0.05` to `0.95`) represents the node's percentage share of the focused parent folder.
  - Liquid color maps to the dominant file category or folder state.
- **FR-4.4:** Clicking a child folder sphere in 3D shall transition it to become the new central focused sphere, updating the left-pane tree selection simultaneously.
- **FR-4.5:** To guarantee frame rate stability, the 3D graph shall render a maximum of 60 active child spheres at once; remaining smaller items in the focused directory shall be grouped into an aggregated "Other Files" sphere that can be expanded on demand.

#### FR-5: Safe File Operations & State Sync
- **FR-5.1:** Deleting a file/folder via "Move to Recycle Bin" shall invoke the native Windows Recycle Bin API (`trash` crate).
- **FR-5.2:** Upon successful deletion, the backend shall return the freed byte count, and the frontend shall subtract that size up the ancestor tree in O(depth) time without requiring a full disk re-scan.

#### FR-6: Find the space
- **FR-6.1:** Largest files are a size-descending page from `ScanIndex` (default 400, clamp 1000). Choosing a row selects that file and focuses its parent in the graph.
- **FR-6.2:** Search matches file and folder names anywhere in the scan, paged the same way. Results stay in their own store slice, separate from tree pages and the hidden folder list.
- **FR-6.3:** Types are the top 12 extensions by bytes plus one Other row (count and bytes). Choosing a row opens a paged file list for that extension, including Other.
- **FR-6.4:** A top-bar Folder action opens the native folder dialog. A drive root still uses the Master File Table when the process is elevated. Every other path uses the folder walk.

#### FR-7: Reclaim, with a sentence
- **FR-7.1:** After a finished scan, Reclaim lists only catalog matches. Each row has a tier, the byte total, one sentence, and Reveal.
- **FR-7.2:** Safe covers user Temp, Windows Temp, the Windows Update download cache, the Delivery Optimization cache, thumbnail cache files, and browser caches. They can be recycled together after one confirm that shows count and bytes.
- **FR-7.3:** Rebuilds covers `node_modules`, the npm cache, the pip cache, the Cargo registry, and Steam shader caches outside protected folders. The confirm is the same shape. The sentence says the tool will recreate them.
- **FR-7.4:** Review covers `Windows.old`, Downloads files of at least 100 MiB that are older than 30 days, and Docker or WSL virtual disks. One item at a time. There is no group clean.
- **FR-7.5:** System explains `hiberfil.sys` and `pagefile.sys` and offers no delete. Recycle Bin size comes from `SHQueryRecycleBinW`. Emptying it is a separate confirm and uses `SHEmptyRecycleBinW`, not `permanent_delete`.
- **FR-7.6:** Reclaim calls the Recycle Bin only. There is no "clean everything" and no permanent delete on this screen.

#### FR-8: Duplicates people can trust
- **FR-8.1:** Duplicate review does not run during a scan. The user starts it. Cancel uses `Arc<AtomicBool>`. Progress streams on a channel.
- **FR-8.2:** Candidates are files of at least 1 MiB that share a size. Confirmation is a content hash. Hard links (same file id), offline files, cloud-recall files, and reparse points are skipped.
- **FR-8.3:** A group shows wasted bytes and a keeper: a copy outside the user libraries (Documents, Music, Pictures, Videos, Desktop) when one exists, otherwise the shortest path. Recycling the other copies happens after a confirm. The keeper stays.
- **FR-8.4:** At most 100 groups are returned, largest wasted bytes first.

#### FR-9: What grew
- **FR-9.1:** A finished scan that was not cancelled saves a compact snapshot for that root: total bytes, each direct child's size, and the 200 largest file paths and sizes. The file lives in the app data directory.
- **FR-9.2:** The next finished scan of the same root shows folders that grew and large files that are new or bigger. The webview receives that delta list only.

#### FR-10: Area map, same cap
- **FR-10.1:** A visualizer toggle draws a squarified map of the current graph view: the focused folder, at most 60 children, and the existing aggregate. The liquid graph stays the default.
- **FR-10.2:** Clicking a folder focuses it, the same as a sphere. Layout runs when the graph payload or the pane size changes, not inside `useFrame`. `GRAPH_CHILD_CAP` stays 60.

#### FR-11: Delete means the Recycle Bin
- **FR-11.1:** Delete moves the selection to the Recycle Bin and toasts the freed bytes. Shift+Delete keeps the permanent-delete confirm. Drive roots cannot be deleted.

### 3. Non-Functional Requirements (NFR)
- **NFR-1 (Frame Rate):** The 3D viewport and 2D UI must maintain 60 FPS during idle, camera orbit, and tree scrolling on modern integrated or discrete GPUs.
- **NFR-2 (Memory Footprint):** Frontend WebView memory usage must remain under 400 MB even when indexing 500,000 files; full deeply nested file lists should reside in Rust memory and only query active/expanded branches into JS when needed, or use flat indexed typed arrays.
- **NFR-3 (Safety):** Zero usage of `.unwrap()` or `.expect()` in Tauri command handlers. All OS/filesystem errors must serialize cleanly to the UI as user-friendly toast notifications.

### 4. Locked product decisions
These decisions are part of the contract. The implementation detail lives in [ARCHITECTURE.md](ARCHITECTURE.md). If a requirement changes, update this file and `ARCHITECTURE.md` and `AGENT.md` in the same change.

- React 19 stays (the scaffold is 19; do not downgrade to React 18).
- ReFS volumes are listed alongside NTFS, exFAT, and FAT32. Removable drives are listed regardless of filesystem.
- Drive roots (`C:\`) cannot be deleted. `permanent_delete` is the only command allowed to erase bytes, and only after the UI confirmation modal.
- Reclaim and duplicate review never call `permanent_delete`. They recycle through the Recycle Bin. Emptying the Recycle Bin uses the Windows recycle API.
- The never-delete list refuses `\Windows\` except the named safe caches (Windows Temp, Windows Update download cache, Delivery Optimization cache), `\Program Files\`, `\Program Files (x86)\`, and drive roots. Duplicate review has no Windows-cache exception.
- Insight, search, reclaim, duplicate, and growth results are never merged into tree pages or the hidden folder list.
- The area map uses the existing graph payload. It does not raise `GRAPH_CHILD_CAP`.
- The growth file is a compact snapshot, not a second copy of the tree, and it is not sent wholesale to the webview.
- Hidden files are scanned. `System Volume Information` and `$Recycle.Bin` are not. Directory junctions are recorded but not followed.
- The filtered file list and the unfiltered tree use separate page caches.
- Bloom post-processing is intentionally omitted so integrated GPUs can hold 60 FPS. Liquid glow comes from the shader.
- Scrollable panels use the thin dark scrollbar from `src/index.css` (slate thumb, transparent track). The platform light scrollbar is not used, and scrollbars are not hidden.
