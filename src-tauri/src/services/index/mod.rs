use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{FileCategory, NodeKind};
use crate::services::category::classify;
use crate::services::paths::{normalize_path, ready_file_name, ready_parent};

mod access;
mod view;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct NodeId(u32);

struct NodeRecord {
    name: String,
    path: String,
    parent: Option<NodeId>,
    kind: NodeKind,
    category: FileCategory,
    size_bytes: u64,
    children: Vec<NodeId>,
    child_count: u64,
}

/// Arena of the last scan. The webview never receives this tree.
pub struct ScanIndex {
    generation: u64,
    nodes: Vec<NodeRecord>,
    by_path: HashMap<String, NodeId>,
    root: Option<NodeId>,
    /// Bumps when the tree changes so the insight cache can drop a stale sort.
    revision: u64,
}

impl ScanIndex {
    pub fn new(generation: u64) -> Self {
        Self {
            generation,
            nodes: Vec::new(),
            by_path: HashMap::new(),
            root: None,
            revision: 0,
        }
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    #[cfg(test)]
    pub fn size_of(&self, path: &str) -> Option<u64> {
        let path = normalize_path(path);
        self.by_path
            .get(&path)
            .map(|id| self.nodes[id.0 as usize].size_bytes)
    }

    pub fn reserve(&mut self, extra: usize) {
        self.nodes.reserve(extra);
        self.by_path.reserve(extra);
    }

    /// Parents must already exist, except the first node, which becomes the root.
    /// The scanner uses [`Self::insert_ready`] so this stays for callers that still have a raw path.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn insert(&mut self, path: &str, is_dir: bool, size_bytes: u64) -> Result<(), AppError> {
        self.insert_ready(normalize_path(path), is_dir, size_bytes)
    }

    /// Insert a path that is already normalized. Does not parse it again.
    pub fn insert_ready(&mut self, path: String, is_dir: bool, size_bytes: u64) -> Result<(), AppError> {
        if path.is_empty() {
            return Err(AppError::Scan("empty path".into()));
        }
        if self.by_path.contains_key(&path) {
            return Ok(());
        }
        let id = self.alloc_id()?;
        let name = ready_file_name(&path).to_string();
        let parent = if self.root.is_none() {
            None
        } else {
            ready_parent(&path).and_then(|parent| self.by_path.get(parent).copied())
        };
        self.nodes.push(NodeRecord {
            name: name.clone(),
            path: path.clone(),
            parent,
            kind: if is_dir {
                NodeKind::Folder
            } else {
                NodeKind::File
            },
            category: classify(&name, is_dir, size_bytes),
            size_bytes,
            children: Vec::new(),
            child_count: 0,
        });
        self.by_path.insert(path, id);
        if let Some(pid) = parent {
            let parent = &mut self.nodes[pid.0 as usize];
            parent.children.push(id);
            parent.child_count += 1;
        }
        if self.root.is_none() {
            self.root = Some(id);
        }
        if size_bytes > 0 {
            self.bubble(id, size_bytes);
        }
        self.revision = self.revision.wrapping_add(1);
        Ok(())
    }

    pub fn sort_children(&mut self) {
        let parents: Vec<NodeId> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| !node.children.is_empty())
            .map(|(index, _)| NodeId(index as u32))
            .collect();
        for id in parents {
            self.sort_node(id);
        }
    }

    /// Subtract `size_bytes` through ancestors. Nearest parent is first.
    pub fn remove_path(&mut self, path: &str) -> Result<crate::models::DeleteResult, AppError> {
        let path = normalize_path(path);
        let id = self.lookup(&path)?;
        self.revision = self.revision.wrapping_add(1);
        let freed = self.nodes[id.0 as usize].size_bytes;
        let parent = self.nodes[id.0 as usize].parent;
        if let Some(pid) = parent {
            let parent_node = &mut self.nodes[pid.0 as usize];
            parent_node.children.retain(|child| *child != id);
            parent_node.child_count = parent_node.children.len() as u64;
        }
        let mut ancestor_ids = Vec::new();
        let mut current = parent;
        while let Some(pid) = current {
            self.nodes[pid.0 as usize].size_bytes =
                self.nodes[pid.0 as usize].size_bytes.saturating_sub(freed);
            ancestor_ids.push(pid);
            current = self.nodes[pid.0 as usize].parent;
        }
        self.forget(id);
        let mut sort_at = parent;
        while let Some(pid) = sort_at {
            self.sort_node(pid);
            sort_at = self.nodes[pid.0 as usize].parent;
        }
        let ancestors = ancestor_ids
            .iter()
            .map(|pid| self.to_file_node(*pid))
            .collect();
        Ok(crate::models::DeleteResult {
            freed_bytes: freed,
            removed_path: path,
            ancestors,
        })
    }

    fn alloc_id(&self) -> Result<NodeId, AppError> {
        u32::try_from(self.nodes.len())
            .map(NodeId)
            .map_err(|_| AppError::Scan("scan exceeded node id space".into()))
    }

    fn lookup(&self, path: &str) -> Result<NodeId, AppError> {
        self.by_path
            .get(path)
            .copied()
            .ok_or_else(|| AppError::NotFound(path.to_string()))
    }

    fn bubble(&mut self, id: NodeId, bytes: u64) {
        let mut current = self.nodes[id.0 as usize].parent;
        while let Some(pid) = current {
            self.nodes[pid.0 as usize].size_bytes =
                self.nodes[pid.0 as usize].size_bytes.saturating_add(bytes);
            current = self.nodes[pid.0 as usize].parent;
        }
    }

    fn forget(&mut self, id: NodeId) {
        let mut stack = vec![id];
        while let Some(current) = stack.pop() {
            let children = std::mem::take(&mut self.nodes[current.0 as usize].children);
            stack.extend(children);
            let path = self.nodes[current.0 as usize].path.clone();
            self.by_path.remove(&path);
            self.nodes[current.0 as usize].child_count = 0;
        }
        if self.root == Some(id) {
            self.root = None;
        }
    }

    fn sort_node(&mut self, id: NodeId) {
        let mut ranked: Vec<(u64, String, NodeId)> = self.nodes[id.0 as usize]
            .children
            .iter()
            .map(|cid| {
                let node = &self.nodes[cid.0 as usize];
                (node.size_bytes, node.name.clone(), *cid)
            })
            .collect();
        ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        self.nodes[id.0 as usize].children = ranked.into_iter().map(|(_, _, cid)| cid).collect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::limits::HEAVY_FILE_BYTES;
    use crate::models::FileCategory;

    fn sample() -> ScanIndex {
        let mut index = ScanIndex::new(1);
        index.insert("C:\\data", true, 0).unwrap();
        index.insert("C:\\data\\a", true, 0).unwrap();
        index.insert("C:\\data\\a\\f1", false, 10).unwrap();
        index.insert("C:\\data\\a\\f2", false, 30).unwrap();
        index.insert("C:\\data\\b", true, 0).unwrap();
        index.insert("C:\\data\\b\\f3", false, 5).unwrap();
        index.sort_children();
        index
    }

    #[test]
    fn size_bubbles_to_ancestors() {
        let index = sample();
        assert_eq!(index.size_of("C:\\data"), Some(45));
        assert_eq!(index.size_of("C:\\data\\a"), Some(40));
        assert_eq!(index.size_of("C:\\data\\b"), Some(5));
    }

    #[test]
    fn delete_subtracts_ancestor_sizes() {
        let mut index = sample();
        let deleted = index.remove_path("C:\\data\\a\\f1").unwrap();
        assert_eq!(deleted.freed_bytes, 10);
        assert_eq!(deleted.ancestors.len(), 2);
        assert_eq!(deleted.ancestors[0].path, "C:\\data\\a");
        assert_eq!(deleted.ancestors[0].size_bytes, 30);
        assert_eq!(deleted.ancestors[1].path, "C:\\data");
        assert_eq!(deleted.ancestors[1].size_bytes, 35);
        assert_eq!(index.size_of("C:\\data\\a\\f2"), Some(30));
        assert!(index.size_of("C:\\data\\a\\f1").is_none());
        index
            .insert("C:\\data\\big.bin", false, HEAVY_FILE_BYTES)
            .unwrap();
        let page = index.children_page("C:\\data", 0, 10, Some("big")).unwrap();
        assert_eq!(page.nodes[0].category, FileCategory::Heavy);
    }
}
