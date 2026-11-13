use super::*;
use std::fs;
use std::sync::atomic::AtomicBool;

struct TempTree(std::path::PathBuf);
impl Drop for TempTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn content_hash_groups_copies_and_skips_hard_links() {
    let dir = std::env::temp_dir().join(format!("lsm-dup-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let scratch = TempTree(dir);
    let same_a = scratch.0.join("same-a.bin");
    let same_b = scratch.0.join("same-b.bin");
    let diff_a = scratch.0.join("diff-a.bin");
    let diff_b = scratch.0.join("diff-b.bin");
    let link = scratch.0.join("link.bin");
    fs::write(&same_a, vec![7u8; 32]).unwrap();
    fs::write(&same_b, vec![7u8; 32]).unwrap();
    fs::write(&diff_a, vec![1u8; 32]).unwrap();
    fs::write(&diff_b, vec![2u8; 32]).unwrap();
    fs::write(&link, vec![9u8; 32]).unwrap();
    fs::hard_link(&link, scratch.0.join("link-again.bin")).unwrap();
    let files = ["same-a.bin", "same-b.bin", "diff-a.bin", "diff-b.bin", "link.bin", "link-again.bin"]
        .into_iter()
        .map(|name| FileCand {
            path: scratch.0.join(name).to_string_lossy().to_string(),
            name: name.to_string(),
            size_bytes: 32,
        })
        .collect();
    let cancel = AtomicBool::new(false);
    let progress = review_files(files, &cancel, |_| {});
    assert!(!progress.cancelled);
    assert_eq!(progress.groups.len(), 1);
    assert_eq!(progress.groups[0].copies.len(), 1);
    assert_eq!(progress.groups[0].wasted_bytes, 32);
}
