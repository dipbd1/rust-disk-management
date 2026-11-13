# Liquid Storage Manager

A Windows disk map. The scan stays in Rust. The window shows a size-sorted folder tree and a liquid view of the folder you are in.

## Scan

The top bar lists mounted drives. Choose one to scan it. **Folder** opens a folder and scans that path instead.

An elevated scan of an NTFS drive root reads the Master File Table. Every other scan walks the folder with `FindFirstFileEx`. Hidden files are included. Symlinks and reparse points are not followed. `System Volume Information` and `$Recycle.Bin` are not descended.

If the app is not elevated and a fixed NTFS drive is present, it asks once whether to restart as administrator. A folder walk still works if you continue. **Faster scan** restarts the debug session elevated (`npm run dev:admin` does the same). Stop any other dev session first; both need port 1420.

Cancel keeps the partial index. Rescan starts again from the active drive or folder.

## What the panes do

The left pane tabs are Explorer, Largest, Search, Types, Reclaim, Duplicates, and Growth.

- **Largest** pages files by size. Choosing one selects it and focuses its parent in the graph.
- **Search** matches names anywhere in the scan. Those results are not the tree.
- **Types** shows the top 12 extensions by bytes, plus Other. Choosing one opens that file list.
- **Growth** compares this finished scan with the last snapshot of the same root: folders that grew, and large files that are new or bigger.

The right pane is the liquid graph of the focused folder: at most 60 children, plus one aggregate for the rest. **Area map** draws those same nodes as a squarified map. Liquid stays the default. Clicking a folder focuses it.

## Cleanup rules

Delete moves the selection to the Recycle Bin and reports the freed bytes. Shift+Delete asks before permanent delete. A drive root cannot be deleted.

**Reclaim** lists only catalog matches, each with a sentence:

- **Safe** — user Temp, Windows Temp, Windows Update downloads, Delivery Optimization, thumbnail caches, and browser caches. One confirm recycles that group.
- **Rebuilds** — `node_modules`, npm cache, pip cache, the Cargo registry, and Steam shader caches that are not under a protected folder. The tools recreate them. Same confirm.
- **Review** — `Windows.old`, Downloads files of at least 100 MiB older than 30 days, and Docker or WSL virtual disks. One item at a time.
- **System** — `hiberfil.sys` and `pagefile.sys` are explained and cannot be deleted here. Recycle Bin size is read from Windows. Emptying the bin is a separate confirm and uses the Recycle Bin API.

Nothing under `\Windows\` is recycled except the named safe caches above. Nothing under `\Program Files\` or `\Program Files (x86)\` is recycled. There is no “clean everything.”

**Duplicates** does not run during a scan. You start it. It hashes files of at least 1 MiB that share a size, skips hard links, cloud-only files, and protected paths (with no Windows-cache exception), and keeps one copy. Recycling the others is a confirm. At most 100 groups are shown.

## Develop

```bash
npm install
npm run tauri dev
```

The debug build also serves the UI at `http://localhost:1420` through the remote command socket. Release builds do not open that socket.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npx tsc --noEmit
```

The identifier stays `com.anarchy.disk-space-management`, so existing app data paths stay put. Code signing and a store listing are outside this repo.
