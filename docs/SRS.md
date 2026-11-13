# Software Requirements Specification (SRS)
## Project: 3D Liquid Storage Manager for Windows

### 1. Purpose
A high-performance desktop storage analyzer and file management utility for Windows. It combines a fast, virtualized 2D file tree with an interactive 3D force-directed graph where folders and files are represented as glass spheres filled with animated colored liquid proportional to their storage footprint.

### 2. Functional Requirements (FR)

#### FR-1: Disk Discovery & Mounting
- **FR-1.1:** On launch, the Rust backend shall query all mounted Windows volumes (Fixed NTFS, exFAT, FAT32, and removable drives) and return total capacity, available space, and mount root (`C:\`, `D:\`, etc.).

#### FR-2: Multi-Threaded Directory Scanning
- **FR-2.1:** An elevated scan of an NTFS drive root shall read the Master File Table. Every other scan (a folder, a non-NTFS volume, or a process that is not elevated) shall walk the tree with parallel `FindFirstFileEx` calls. File size comes from that listing. The walk does not stat each file again.
- **FR-2.2:** Scanning must be non-blocking. Progress updates and partial tree chunks shall stream to the frontend via Tauri v2 IPC `Channel` at a throttled interval (every 100ms). While a scan is running, the graph draws the drive, up to 16 of its largest direct children, and up to five moons on each of the 12 largest of those folders. Level-1 balls keep a stable slot through the end of the scan. New moons ease out from their parent. The radar sweep, scanning label, and path ticker fade out over about 700ms when the scan ends.
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

### 3. Non-Functional Requirements (NFR)
- **NFR-1 (Frame Rate):** The 3D viewport and 2D UI must maintain 60 FPS during idle, camera orbit, and tree scrolling on modern integrated or discrete GPUs.
- **NFR-2 (Memory Footprint):** Frontend WebView memory usage must remain under 400 MB even when indexing 500,000 files; full deeply nested file lists should reside in Rust memory and only query active/expanded branches into JS when needed, or use flat indexed typed arrays.
- **NFR-3 (Safety):** Zero usage of `.unwrap()` or `.expect()` in Tauri command handlers. All OS/filesystem errors must serialize cleanly to the UI as user-friendly toast notifications.

### 4. Locked product decisions
These decisions are part of the contract. The implementation detail lives in [ARCHITECTURE.md](ARCHITECTURE.md). If a requirement changes, update this file and `ARCHITECTURE.md` and `AGENT.md` in the same change.

- React 19 stays (the scaffold is 19; do not downgrade to React 18).
- ReFS volumes are listed alongside NTFS, exFAT, and FAT32. Removable drives are listed regardless of filesystem.
- Drive roots (`C:\`) cannot be deleted. `permanent_delete` is the only command allowed to erase bytes, and only after the UI confirmation modal.
- Hidden files are scanned. `System Volume Information` and `$Recycle.Bin` are not. Directory junctions are recorded but not followed.
- The filtered file list and the unfiltered tree use separate page caches.
- Bloom post-processing is intentionally omitted so integrated GPUs can hold 60 FPS. Liquid glow comes from the shader.
- Scrollable panels use the thin dark scrollbar from `src/index.css` (slate thumb, transparent track). The platform light scrollbar is not used, and scrollbars are not hidden.
