use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Folder,
    File,
    Aggregate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileCategory {
    Folder,
    Media,
    Code,
    Heavy,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub parent_id: Option<String>,
    pub kind: NodeKind,
    pub category: FileCategory,
    pub size_bytes: u64,
    pub child_count: u64,
    #[serde(default)]
    pub folder_count: u64,
    #[serde(default)]
    pub file_count: u64,
    pub percent_of_parent: f32,
}

/// Up to five largest children of one top-level folder, for the second ring.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SatellitePreview {
    pub parent_path: String,
    pub nodes: Vec<FileNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub generation: u64,
    pub scanned_count: u64,
    pub current_path: String,
    pub elapsed_ms: u64,
    pub access_denied_count: u64,
    pub root: Option<FileNode>,
    pub top_level: Vec<FileNode>,
    #[serde(default)]
    pub satellites: Vec<SatellitePreview>,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildrenPage {
    pub parent_path: String,
    pub total: u32,
    pub offset: u32,
    pub nodes: Vec<FileNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    pub focus: FileNode,
    pub children: Vec<FileNode>,
    pub other: Option<FileNode>,
}

/// `ancestors` is nearest parent first.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub freed_bytes: u64,
    pub removed_path: String,
    pub ancestors: Vec<FileNode>,
}
