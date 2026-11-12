use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::error::AppError;
use crate::models::ScanProgress;
use crate::services::index::ScanIndex;
use crate::services::paths::normalize_path;
use crate::services::{mft, walk};

/// Walk `root` on the calling thread. `on_progress` fires at most every 100ms.
/// The returned progress is the terminal snapshot (`done` is true) and is not
/// passed to the callback, so the caller can store the index before publishing it.
///
/// An elevated NTFS drive root is read from the Master File Table. Anything else,
/// including a volume that cannot be opened, uses the folder walk.
pub fn scan_tree(
    root: &str,
    generation: u64,
    cancel: &Arc<AtomicBool>,
    mut on_progress: impl FnMut(ScanProgress),
) -> Result<(ScanIndex, ScanProgress), AppError> {
    let root = normalize_path(root);
    if root.is_empty() {
        return Err(AppError::Scan("empty path".into()));
    }
    if cancel.load(Ordering::Relaxed) {
        return walk::scan(&root, generation, cancel, on_progress);
    }
    if let Some(done) = mft::try_scan(&root, generation, cancel, &mut on_progress)? {
        return Ok(done);
    }
    walk::scan(&root, generation, cancel, on_progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::paths::normalize_path;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;

    struct TempTree(PathBuf);
    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn scans_a_temp_directory_and_honors_cancel() {
        let dir = std::env::temp_dir().join(format!("liquid-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("a.txt"), vec![1u8; 10]).unwrap();
        fs::write(dir.join("sub").join("b.txt"), vec![2u8; 25]).unwrap();
        fs::write(dir.join(".secret"), b"hide").unwrap();
        let scratch = TempTree(dir.clone());
        let root = normalize_path(&scratch.0.to_string_lossy());

        let cancel = Arc::new(AtomicBool::new(false));
        let mut callbacks = 0u32;
        let (index, progress) = scan_tree(&root, 7, &cancel, |_| callbacks += 1).unwrap();
        assert!(progress.done);
        assert!(!progress.cancelled);
        assert_eq!(progress.generation, 7);
        assert_eq!(index.size_of(&root), Some(10 + 25 + 4));
        assert_eq!(index.size_of(&format!("{root}\\sub")), Some(25));
        let page = index.children_page(&root, 0, 10, None).unwrap();
        assert!(page.nodes.iter().any(|node| node.name == ".secret"));
        assert!(page.nodes.windows(2).all(|pair| pair[0].size_bytes >= pair[1].size_bytes));
        let _ = callbacks;

        let cancel = Arc::new(AtomicBool::new(true));
        let (partial, stopped) = scan_tree(&root, 8, &cancel, |_| {}).unwrap();
        assert!(stopped.cancelled);
        assert!(stopped.done);
        assert_eq!(partial.size_of(&root), Some(0));
        assert!(partial.children_page(&root, 0, 10, None).unwrap().nodes.is_empty());
    }
}
