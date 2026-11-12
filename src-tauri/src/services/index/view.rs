use crate::error::AppError;
use crate::limits::{self, page_limit};
use crate::models::{ChildrenPage, FileCategory, FileNode, GraphView, NodeKind, SatellitePreview};
use crate::services::paths::normalize_path;

use super::{NodeId, ScanIndex};

impl ScanIndex {
    pub fn children_page(
        &self,
        path: &str,
        offset: u32,
        limit: u32,
        query: Option<&str>,
    ) -> Result<ChildrenPage, AppError> {
        let path = normalize_path(path);
        let id = self.lookup(&path)?;
        let limit = page_limit(limit);
        let needle = query.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_ascii_lowercase())
            }
        });
        let child_ids = &self.nodes[id.0 as usize].children;
        let matched: Vec<NodeId> = child_ids
            .iter()
            .copied()
            .filter(|cid| match &needle {
                Some(needle) => self.nodes[cid.0 as usize]
                    .name
                    .to_ascii_lowercase()
                    .contains(needle),
                None => true,
            })
            .collect();
        let total = matched.len().min(u32::MAX as usize) as u32;
        let start = offset as usize;
        let end = start.saturating_add(limit as usize).min(matched.len());
        let nodes = if start >= matched.len() {
            Vec::new()
        } else {
            matched[start..end]
                .iter()
                .map(|cid| self.to_file_node(*cid))
                .collect()
        };
        Ok(ChildrenPage {
            parent_path: path,
            total,
            offset,
            nodes,
        })
    }

    pub fn graph_view(&self, path: &str) -> Result<GraphView, AppError> {
        let path = normalize_path(path);
        let id = self.lookup(&path)?;
        let shown = self.largest(id, limits::GRAPH_CHILD_CAP);
        let shown_sum: u64 = shown
            .iter()
            .map(|cid| self.nodes[cid.0 as usize].size_bytes)
            .sum();
        let focus = self.to_file_node(id);
        let rest_count = focus.child_count.saturating_sub(shown.len() as u64);
        let children = shown
            .into_iter()
            .map(|cid| self.to_file_node(cid))
            .collect();
        let other = if rest_count == 0 {
            None
        } else {
            Some(self.aggregate(id, rest_count, focus.size_bytes.saturating_sub(shown_sum)))
        };
        Ok(GraphView {
            focus,
            children,
            other,
        })
    }

    pub fn preview(&self, cap: usize) -> (Option<FileNode>, Vec<FileNode>) {
        let Some(root) = self.root else {
            return (None, Vec::new());
        };
        let ids = self.largest(root, cap);
        let top_level = ids.into_iter().map(|id| self.to_file_node(id)).collect();
        (Some(self.to_file_node(root)), top_level)
    }

    /// The 12 largest top-level folders, each with its 5 largest children.
    pub fn satellite_groups(&self) -> Vec<SatellitePreview> {
        let Some(root) = self.root else {
            return Vec::new();
        };
        let mut folders: Vec<NodeId> = self.nodes[root.0 as usize]
            .children
            .iter()
            .copied()
            .filter(|id| self.nodes[id.0 as usize].kind == NodeKind::Folder)
            .collect();
        folders.sort_by(|a, b| self.cmp_desc(*a, *b));
        folders.truncate(limits::SATELLITE_PARENTS);
        let mut groups = Vec::new();
        for id in folders {
            let child_ids = self.largest(id, limits::SATELLITE_CHILDREN);
            if child_ids.is_empty() {
                continue;
            }
            let parent = &self.nodes[id.0 as usize];
            groups.push(SatellitePreview {
                parent_path: parent.path.clone(),
                nodes: child_ids.into_iter().map(|cid| self.to_file_node(cid)).collect(),
            });
        }
        groups
    }

    fn largest(&self, id: NodeId, cap: usize) -> Vec<NodeId> {
        if cap == 0 {
            return Vec::new();
        }
        let mut ids = self.nodes[id.0 as usize].children.clone();
        if ids.len() > cap {
            ids.select_nth_unstable_by(cap, |a, b| self.cmp_desc(*a, *b));
            ids.truncate(cap);
        }
        ids.sort_by(|a, b| self.cmp_desc(*a, *b));
        ids
    }

    fn cmp_desc(&self, a: NodeId, b: NodeId) -> std::cmp::Ordering {
        let left = &self.nodes[a.0 as usize];
        let right = &self.nodes[b.0 as usize];
        right
            .size_bytes
            .cmp(&left.size_bytes)
            .then_with(|| left.name.cmp(&right.name))
    }

    pub(super) fn to_file_node(&self, id: NodeId) -> FileNode {
        let node = &self.nodes[id.0 as usize];
        let parent_size = node.parent.map(|pid| self.nodes[pid.0 as usize].size_bytes);
        let parent_id = node
            .parent
            .map(|pid| self.nodes[pid.0 as usize].path.clone());
        let (folder_count, file_count) = if node.kind == NodeKind::Folder {
            node.children.iter().fold((0u64, 0u64), |(fc, flc), &cid| {
                if self.nodes[cid.0 as usize].kind == NodeKind::Folder {
                    (fc + 1, flc)
                } else {
                    (fc, flc + 1)
                }
            })
        } else {
            (0, 0)
        };
        FileNode {
            id: node.path.clone(),
            name: node.name.clone(),
            path: node.path.clone(),
            parent_id,
            kind: node.kind,
            category: node.category,
            size_bytes: node.size_bytes,
            child_count: node.child_count,
            folder_count,
            file_count,
            percent_of_parent: percent(node.size_bytes, parent_size),
        }
    }

    fn aggregate(&self, parent: NodeId, count: u64, size_bytes: u64) -> FileNode {
        let parent = &self.nodes[parent.0 as usize];
        let id = format!("aggregate:{}", parent.path);
        FileNode {
            id: id.clone(),
            name: format!("Other Small Files ({count} items)"),
            path: id,
            parent_id: Some(parent.path.clone()),
            kind: NodeKind::Aggregate,
            category: FileCategory::Other,
            size_bytes,
            child_count: count,
            folder_count: 0,
            file_count: count,
            percent_of_parent: percent(size_bytes, Some(parent.size_bytes)),
        }
    }
}

fn percent(size: u64, parent_size: Option<u64>) -> f32 {
    match parent_size {
        None => 1.0,
        Some(0) => 0.0,
        Some(parent) => ((size as f64 / parent as f64) as f32).clamp(0.0, 1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn children_are_ordered_by_size() {
        let page = sample().children_page("C:\\data", 0, 10, None).unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.nodes[0].name, "a");
        assert_eq!(page.nodes[1].name, "b");
        assert!(page.nodes[0].size_bytes > page.nodes[1].size_bytes);
    }

    #[test]
    fn satellite_groups_follow_the_largest_folders() {
        let groups = sample().satellite_groups();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].parent_path, "C:\\data\\a");
        assert_eq!(groups[0].nodes[0].name, "f2");
        assert_eq!(groups[0].nodes[1].name, "f1");
        assert_eq!(groups[1].parent_path, "C:\\data\\b");
        assert_eq!(groups[1].nodes[0].name, "f3");
    }

    #[test]
    fn graph_caps_at_sixty_plus_aggregate() {
        let mut index = ScanIndex::new(2);
        index.insert("C:\\data", true, 0).unwrap();
        for n in 1..=61 {
            index
                .insert(&format!("C:\\data\\f{n:02}"), false, n)
                .unwrap();
        }
        index.sort_children();
        let view = index.graph_view("C:\\data").unwrap();
        assert_eq!(view.children.len(), 60);
        assert_eq!(view.children[0].size_bytes, 61);
        assert_eq!(view.children[59].size_bytes, 2);
        let other = view.other.expect("aggregate");
        assert_eq!(other.kind, NodeKind::Aggregate);
        assert_eq!(other.id, "aggregate:C:\\data");
        assert_eq!(other.name, "Other Small Files (1 items)");
        assert_eq!(other.child_count, 1);
        assert_eq!(other.size_bytes, 1);
    }
}
