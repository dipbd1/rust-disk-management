use crate::models::{FileNode, NodeKind};

use super::{NodeId, ScanIndex};

impl ScanIndex {
    pub(crate) fn revision(&self) -> u64 {
        self.revision
    }

    pub(crate) fn live_ids(&self) -> Vec<u32> {
        let mut ids = Vec::new();
        for (index, node) in self.nodes.iter().enumerate() {
            let live = self
                .by_path
                .get(&node.path)
                .is_some_and(|id| id.0 as usize == index);
            if live {
                ids.push(index as u32);
            }
        }
        ids
    }

    pub(crate) fn name_at(&self, index: u32) -> Option<&str> {
        self.nodes.get(index as usize).map(|node| node.name.as_str())
    }

    pub(crate) fn path_at(&self, index: u32) -> Option<&str> {
        self.nodes.get(index as usize).map(|node| node.path.as_str())
    }

    pub(crate) fn kind_at(&self, index: u32) -> Option<NodeKind> {
        self.nodes.get(index as usize).map(|node| node.kind)
    }

    pub(crate) fn size_at(&self, index: u32) -> Option<u64> {
        self.nodes.get(index as usize).map(|node| node.size_bytes)
    }

    pub(crate) fn file_node_at(&self, index: u32) -> Option<FileNode> {
        let node = self.nodes.get(index as usize)?;
        let live = self
            .by_path
            .get(&node.path)
            .is_some_and(|id| id.0 == index);
        if !live {
            return None;
        }
        Some(self.to_file_node(NodeId(index)))
    }

    pub(crate) fn root_path(&self) -> Option<String> {
        let id = self.root?;
        self.nodes.get(id.0 as usize).map(|node| node.path.clone())
    }

    pub(crate) fn root_size(&self) -> u64 {
        self.root
            .and_then(|id| self.nodes.get(id.0 as usize))
            .map(|node| node.size_bytes)
            .unwrap_or(0)
    }

    pub(crate) fn direct_children(&self) -> Vec<FileNode> {
        let Some(id) = self.root else {
            return Vec::new();
        };
        let Some(node) = self.nodes.get(id.0 as usize) else {
            return Vec::new();
        };
        node.children
            .iter()
            .copied()
            .map(|cid| self.to_file_node(cid))
            .collect()
    }
}
