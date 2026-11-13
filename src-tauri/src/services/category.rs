use crate::limits::HEAVY_FILE_BYTES;
use crate::models::FileCategory;

const MEDIA: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "heic", "heif", "raw",
    "psd", "mp4", "mkv", "mov", "avi", "webm", "wmv", "flv", "m4v", "mp3", "wav", "flac", "aac",
    "ogg", "wma", "m4a", "opus",
];

const CODE: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "java", "kt", "c", "h", "cpp", "hpp",
    "cc", "cs", "json", "toml", "yaml", "yml", "xml", "html", "css", "scss", "md", "sql", "sh",
    "ps1", "rb", "php", "swift", "zip", "7z", "rar", "tar", "gz", "bz2", "xz", "tgz", "iso", "exe",
    "dll", "msi", "bin", "wasm", "so", "dylib", "pdb", "lib", "obj", "sys",
];

pub fn classify(name: &str, is_dir: bool, size_bytes: u64) -> FileCategory {
    if is_dir {
        return FileCategory::Folder;
    }
    if size_bytes >= HEAVY_FILE_BYTES {
        return FileCategory::Heavy;
    }
    match extension(name).as_deref() {
        Some(ext) if MEDIA.contains(&ext) => FileCategory::Media,
        Some(ext) if CODE.contains(&ext) => FileCategory::Code,
        _ => FileCategory::Other,
    }
}

pub(crate) fn file_extension(name: &str) -> Option<String> {
    extension(name)
}

fn extension(name: &str) -> Option<String> {
    let (stem, ext) = name.rsplit_once('.')?;
    if stem.is_empty() || ext.is_empty() {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}
