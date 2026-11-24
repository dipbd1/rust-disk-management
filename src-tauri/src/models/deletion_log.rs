use serde::{Deserialize, Serialize};

/// How a user-initiated delete finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeletionMethod {
    RecycleBin,
    Permanent,
}

/// One line in the app-data JSONL deletion log.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletionLogEntry {
    pub unix_ms: u64,
    pub path: String,
    pub size_bytes: u64,
    pub method: DeletionMethod,
}

/// Outcome of a best-effort Recycle Bin restore.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub restored: bool,
    pub path: String,
    pub message: String,
}
