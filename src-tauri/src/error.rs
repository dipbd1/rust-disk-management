use serde::Serializer;
use thiserror::Error;

/// User-facing failure. Tauri serializes this as a string for the toast.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("drive list failed: {0}")]
    Drives(String),
    #[error("scan failed: {0}")]
    Scan(String),
    #[error("path not found: {0}")]
    NotFound(String),
    #[error("refusing to delete a drive root ({0})")]
    DriveRoot(String),
    #[error("trash failed: {0}")]
    Trash(String),
    #[error("delete failed: {0}")]
    Delete(String),
    #[error("clipboard failed: {0}")]
    Clipboard(String),
    #[error("reveal failed: {0}")]
    Reveal(String),
    #[error("watch failed: {0}")]
    Watch(String),
    #[error("elevation failed: {0}")]
    Elevation(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_a_string() {
        let err = AppError::DriveRoot("C:\\".into());
        let value = serde_json::to_value(&err).expect("error json");
        assert_eq!(value, serde_json::Value::String(err.to_string()));
    }
}
