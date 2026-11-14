use std::collections::HashMap;

use crate::error::AppError;
use crate::limits::{self, page_limit};
use crate::models::{ExtensionRollup, ExtensionRow, InsightPage, LargestSort, NodeKind};
use crate::services::category::file_extension;
use crate::services::index::ScanIndex;
use crate::services::paths::ready_parent;

use super::InsightCache;

pub fn largest_files(
    index: &ScanIndex,
    slot: &mut Option<InsightCache>,
    offset: u32,
    limit: u32,
    sort: LargestSort,
    descending: bool,
) -> Result<InsightPage, AppError> {
    let cache = ensure(index, slot)?;
    if sort == LargestSort::Size && descending {
        return Ok(page_of(index, &cache.files_desc, offset, limit));
    }
    if cache.order_sort != Some(sort) || cache.order_desc != descending {
        cache.order = build_order(index, &cache.files_desc, sort, descending);
        cache.order_sort = Some(sort);
        cache.order_desc = descending;
    }
    Ok(page_of(index, &cache.order, offset, limit))
}

fn build_order(index: &ScanIndex, files: &[u32], sort: LargestSort, descending: bool) -> Vec<u32> {
    let mut keys: Vec<(u64, String, String, u32)> = files
        .iter()
        .map(|id| {
            let size = index.size_at(*id).unwrap_or(0);
            let name = index.name_at(*id).unwrap_or("").to_ascii_lowercase();
            let parent = if sort == LargestSort::Folder {
                index.path_at(*id).and_then(ready_parent).unwrap_or("").to_ascii_lowercase()
            } else {
                String::new()
            };
            (size, name, parent, *id)
        })
        .collect();
    keys.sort_by(|a, b| match sort {
        LargestSort::Size => {
            let size = if descending { b.0.cmp(&a.0) } else { a.0.cmp(&b.0) };
            size.then_with(|| a.1.cmp(&b.1))
        }
        LargestSort::Name => {
            let name = if descending { b.1.cmp(&a.1) } else { a.1.cmp(&b.1) };
            name.then_with(|| b.0.cmp(&a.0))
        }
        LargestSort::Folder => {
            let folder = if descending { b.2.cmp(&a.2) } else { a.2.cmp(&b.2) };
            folder.then_with(|| b.0.cmp(&a.0)).then_with(|| a.1.cmp(&b.1))
        }
    });
    keys.into_iter().map(|(_, _, _, id)| id).collect()
}

pub fn search_index(
    index: &ScanIndex,
    slot: &mut Option<InsightCache>,
    query: &str,
    offset: u32,
    limit: u32,
) -> Result<InsightPage, AppError> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return Ok(InsightPage {
            total: 0,
            offset,
            nodes: Vec::new(),
        });
    }
    let cache = ensure(index, slot)?;
    if cache.search_key != needle {
        let mut hits = Vec::new();
        for id in index.live_ids() {
            let Some(name) = index.name_at(id) else { continue };
            if !name.to_ascii_lowercase().contains(&needle) {
                continue;
            }
            let size = index.size_at(id).unwrap_or(0);
            hits.push((size, name.to_ascii_lowercase(), id));
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        cache.search_key = needle;
        cache.search_hits = hits.into_iter().map(|(_, _, id)| id).collect();
    }
    let hits = cache.search_hits.clone();
    Ok(page_of(index, &hits, offset, limit))
}

pub fn extension_rollup(
    index: &ScanIndex,
    slot: &mut Option<InsightCache>,
) -> Result<ExtensionRollup, AppError> {
    let cache = ensure(index, slot)?;
    Ok(ExtensionRollup {
        rows: cache.rows.clone(),
    })
}

pub fn extension_files(
    index: &ScanIndex,
    slot: &mut Option<InsightCache>,
    extension: &str,
    other: bool,
    offset: u32,
    limit: u32,
) -> Result<InsightPage, AppError> {
    let cache = ensure(index, slot)?;
    let key = extension.trim().trim_start_matches('.').to_ascii_lowercase();
    let top = cache.top.clone();
    let files = cache.files_desc.clone();
    let mut ids = Vec::new();
    for id in files {
        let Some(name) = index.name_at(id) else { continue };
        let ext = file_extension(name);
        let hit = if other {
            ext.as_ref().is_none_or(|value| !top.iter().any(|item| item == value))
        } else {
            ext.as_deref() == Some(key.as_str())
        };
        if hit {
            ids.push(id);
        }
    }
    Ok(page_of(index, &ids, offset, limit))
}

fn ensure<'a>(
    index: &ScanIndex,
    slot: &'a mut Option<InsightCache>,
) -> Result<&'a mut InsightCache, AppError> {
    let revision = index.revision();
    let stale = match slot.as_ref() {
        Some(cache) => cache.revision != revision,
        None => true,
    };
    if stale {
        *slot = Some(build(index, revision));
    }
    slot.as_mut()
        .ok_or_else(|| AppError::Scan("insight cache missing".into()))
}

fn build(index: &ScanIndex, revision: u64) -> InsightCache {
    let mut files = Vec::new();
    let mut ext_bytes: HashMap<String, (u64, u64)> = HashMap::new();
    let mut other_bytes = 0u64;
    let mut other_count = 0u64;
    for id in index.live_ids() {
        if index.kind_at(id) != Some(NodeKind::File) {
            continue;
        }
        let Some(name) = index.name_at(id) else { continue };
        let size = index.size_at(id).unwrap_or(0);
        files.push((size, name.to_ascii_lowercase(), id));
        match file_extension(name) {
            Some(ext) => {
                let entry = ext_bytes.entry(ext).or_insert((0, 0));
                entry.0 = entry.0.saturating_add(size);
                entry.1 = entry.1.saturating_add(1);
            }
            None => {
                other_bytes = other_bytes.saturating_add(size);
                other_count = other_count.saturating_add(1);
            }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let files_desc = files.into_iter().map(|(_, _, id)| id).collect();
    let mut ranked: Vec<(String, u64, u64)> = ext_bytes.into_iter().map(|(ext, (bytes, count))| (ext, bytes, count)).collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let mut rows = Vec::new();
    let mut top = Vec::new();
    for (ext, bytes, count) in ranked.iter().take(limits::EXTENSION_TOP) {
        top.push(ext.clone());
        rows.push(ExtensionRow {
            extension: ext.clone(),
            count: *count,
            size_bytes: *bytes,
            other: false,
        });
    }
    let mut rest_bytes = other_bytes;
    let mut rest_count = other_count;
    for (_, bytes, count) in ranked.iter().skip(limits::EXTENSION_TOP) {
        rest_bytes = rest_bytes.saturating_add(*bytes);
        rest_count = rest_count.saturating_add(*count);
    }
    if rest_count > 0 {
        rows.push(ExtensionRow {
            extension: String::new(),
            count: rest_count,
            size_bytes: rest_bytes,
            other: true,
        });
    }
    InsightCache {
        revision,
        files_desc,
        rows,
        top,
        search_key: String::new(),
        search_hits: Vec::new(),
        order_sort: None,
        order_desc: false,
        order: Vec::new(),
    }
}

fn page_of(index: &ScanIndex, ids: &[u32], offset: u32, limit: u32) -> InsightPage {
    let limit = page_limit(limit);
    let total = u32::try_from(ids.len()).unwrap_or(u32::MAX);
    let start = offset as usize;
    let nodes = if start >= ids.len() {
        Vec::new()
    } else {
        let end = start.saturating_add(limit as usize).min(ids.len());
        ids[start..end]
            .iter()
            .filter_map(|id| index.file_node_at(*id))
            .collect()
    };
    InsightPage { total, offset, nodes }
}

#[cfg(test)]
#[path = "query_tests.rs"]
mod tests;
