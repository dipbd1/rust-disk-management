use super::*;

fn index_with(files: &[(&str, u64)]) -> ScanIndex {
    let mut index = ScanIndex::new(1);
    index.insert("C:\\data", true, 0).unwrap();
    for (path, size) in files {
        let normalized = path.replace('/', "\\");
        if let Some(parent) = crate::services::paths::parent_path(&normalized) {
            let mut chain = Vec::new();
            let mut current = Some(parent);
            while let Some(dir) = current {
                if dir != "C:\\data" && dir != "C:\\" {
                    chain.push(dir.clone());
                }
                current = crate::services::paths::parent_path(&dir);
            }
            for dir in chain.iter().rev() {
                index.insert(dir, true, 0).unwrap();
            }
        }
        index.insert(&normalized, false, *size).unwrap();
    }
    index.sort_children();
    index
}

#[test]
fn largest_files_page_and_clamp() {
    let mut index = ScanIndex::new(1);
    index.insert("C:\\data", true, 0).unwrap();
    for n in 1..=1001 {
        index.insert(&format!("C:\\data\\f{n:04}.bin"), false, n).unwrap();
    }
    index.sort_children();
    let mut cache = None;
    let first = largest_files(&index, &mut cache, 0, 0).unwrap();
    assert_eq!(first.total, 1001);
    assert_eq!(first.nodes.len(), 400);
    assert_eq!(first.nodes[0].size_bytes, 1001);
    assert_eq!(first.nodes[399].size_bytes, 602);
    let next = largest_files(&index, &mut cache, 400, 400).unwrap();
    assert_eq!(next.nodes.len(), 400);
    assert_eq!(next.nodes[0].size_bytes, 601);
    let clamped = largest_files(&index, &mut cache, 0, 5000).unwrap();
    assert_eq!(clamped.nodes.len(), 1000);
    assert_eq!(clamped.total, 1001);
}

#[test]
fn search_reaches_descendants_without_using_the_child_page() {
    let index = index_with(&[("C:\\data\\a\\nested\\FindMe.txt", 12), ("C:\\data\\other.txt", 4)]);
    let mut cache = None;
    let found = search_index(&index, &mut cache, "findme", 0, 50).unwrap();
    assert_eq!(found.total, 1);
    assert_eq!(found.nodes[0].name, "FindMe.txt");
    assert_eq!(found.nodes[0].path, "C:\\data\\a\\nested\\FindMe.txt");
    let direct = index.children_page("C:\\data", 0, 50, Some("findme")).unwrap();
    assert!(direct.nodes.is_empty());
    let empty = search_index(&index, &mut cache, "  ", 0, 50).unwrap();
    assert_eq!(empty.total, 0);
}

#[test]
fn extensions_are_ordered_by_bytes_then_other() {
    let mut index = ScanIndex::new(2);
    index.insert("C:\\data", true, 0).unwrap();
    for n in 0..14 {
        let size = (14 - n) as u64 * 100;
        index.insert(&format!("C:\\data\\f{n}.e{n:02}"), false, size).unwrap();
    }
    index.insert("C:\\data\\README", false, 5).unwrap();
    index.sort_children();
    let mut cache = None;
    let rollup = extension_rollup(&index, &mut cache).unwrap();
    assert_eq!(rollup.rows.len(), 13);
    assert_eq!(rollup.rows[0].extension, "e00");
    assert_eq!(rollup.rows[0].size_bytes, 1400);
    assert_eq!(rollup.rows[11].extension, "e11");
    assert!(!rollup.rows[11].other);
    let other = rollup.rows.last().unwrap();
    assert!(other.other);
    assert_eq!(other.count, 3);
    assert_eq!(other.size_bytes, 200 + 100 + 5);
    let page = extension_files(&index, &mut cache, "e00", false, 0, 10).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.nodes[0].name, "f0.e00");
    let rest = extension_files(&index, &mut cache, "", true, 0, 10).unwrap();
    assert_eq!(rest.total, 3);
}
