use serde::{Deserialize, Serialize};

use super::{DeleteResult, FileNode, NodeKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightPage {
    pub total: u32,
    pub offset: u32,
    pub nodes: Vec<FileNode>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LargestSort {
    Size,
    Name,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRow {
    pub extension: String,
    pub count: u64,
    pub size_bytes: u64,
    pub other: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRollup {
    pub rows: Vec<ExtensionRow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReclaimTier {
    Safe,
    Rebuild,
    Review,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReclaimRow {
    pub id: String,
    pub tier: ReclaimTier,
    pub title: String,
    pub sentence: String,
    pub reveal_path: String,
    pub size_bytes: u64,
    pub item_count: u64,
    pub can_recycle: bool,
    /// Paths to recycle. Recomputed by the command; not part of the trusted client payload.
    #[serde(skip)]
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBinStatus {
    pub size_bytes: u64,
    pub item_count: u64,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReclaimReport {
    pub rows: Vec<ReclaimRow>,
    pub recycle_bin: RecycleBinStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBatch {
    pub freed_bytes: u64,
    pub results: Vec<DeleteResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub size_bytes: u64,
    pub wasted_bytes: u64,
    pub keeper: DuplicateFile,
    pub copies: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateProgress {
    pub checked: u64,
    pub total: u64,
    pub current_path: String,
    pub done: bool,
    pub cancelled: bool,
    pub truncated: bool,
    pub groups: Vec<DuplicateGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthEntry {
    pub path: String,
    pub name: String,
    pub kind: NodeKind,
    pub previous_bytes: u64,
    pub size_bytes: u64,
    pub delta_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthDelta {
    pub root: String,
    pub has_baseline: bool,
    pub previous_total: u64,
    pub total_bytes: u64,
    pub entries: Vec<GrowthEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinEmptyResult {
    pub freed_bytes: u64,
}
