use std::collections::{HashMap, VecDeque};
use std::time::Instant;

use super::Table;
use crate::error::AppError;
use crate::limits::{PROGRESS_PREVIEW, SATELLITE_CHILDREN, SATELLITE_PARENTS};
use crate::models::{FileCategory, FileNode, NodeKind, SatellitePreview, ScanProgress};
use crate::services::category::classify;
use crate::services::index::ScanIndex;
use crate::services::paths::ready_file_name;
use crate::services::preview::snapshot;

impl Table {
    pub(super) fn finish(
        &self,
        root: &str,
        generation: u64,
        started: Instant,
        denied: u64,
        cancelled: bool,
    ) -> Result<(ScanIndex, ScanProgress), AppError> {
        let index = self.materialize(root, generation)?;
        let current = self
            .last
            .and_then(|id| self.path_of(id, root))
            .unwrap_or_else(|| root.to_string());
        let mut progress = snapshot(&index, self.scanned, &current, started, denied, true);
        progress.cancelled = cancelled;
        Ok((index, progress))
    }

    pub(super) fn progress(&self, root: &str, generation: u64, started: Instant, done: bool) -> ScanProgress {
        let mut ranked: Vec<(u64, String, u64)> = self
            .root_children
            .iter()
            .filter_map(|id| {
                let rec = self.records.get(id)?;
                if rec.skip {
                    None
                } else {
                    Some((rec.rolled, rec.name.clone(), *id))
                }
            })
            .collect();
        ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        ranked.truncate(PROGRESS_PREVIEW);
        let folder_ids: Vec<u64> = ranked.iter().map(|(_, _, id)| *id).collect();
        let satellites = self.satellites(root, &folder_ids);
        let top_level = ranked.into_iter().filter_map(|(_, _, id)| self.child_node(root, id)).collect();
        let current = self
            .last
            .and_then(|id| self.path_of(id, root))
            .unwrap_or_else(|| root.to_string());
        ScanProgress {
            generation,
            scanned_count: self.scanned,
            current_path: current,
            elapsed_ms: started.elapsed().as_millis() as u64,
            access_denied_count: 0,
            root: Some(self.root_node(root)),
            top_level,
            satellites,
            done,
            cancelled: false,
        }
    }

    fn satellites(&self, root: &str, ranked_ids: &[u64]) -> Vec<SatellitePreview> {
        let mut groups = Vec::new();
        for id in ranked_ids {
            if groups.len() >= SATELLITE_PARENTS {
                break;
            }
            let (is_dir, skip, reparse, name, parent_size) = {
                let Some(rec) = self.records.get(id) else {
                    continue;
                };
                (rec.is_dir, rec.skip, rec.reparse, rec.name.clone(), rec.rolled)
            };
            if !is_dir || skip || reparse {
                continue;
            }
            let Some(kids) = self.children.get(id).cloned() else {
                continue;
            };
            let parent_path = join_child(root, &name);
            let mut moons: Vec<(u64, String, u64)> = kids
                .iter()
                .filter_map(|cid| {
                    let child = self.records.get(cid)?;
                    if child.skip {
                        None
                    } else {
                        Some((child.rolled, child.name.clone(), *cid))
                    }
                })
                .collect();
            if moons.is_empty() {
                continue;
            }
            moons.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
            moons.truncate(SATELLITE_CHILDREN);
            let nodes = moons
                .into_iter()
                .filter_map(|(_, _, cid)| self.moon_node(&parent_path, parent_size, cid))
                .collect();
            groups.push(SatellitePreview { parent_path, nodes });
        }
        groups
    }

    fn materialize(&self, root: &str, generation: u64) -> Result<ScanIndex, AppError> {
        let mut index = ScanIndex::new(generation);
        index.reserve(self.records.len());
        index.insert_ready(root.to_string(), true, 0)?;
        let Some(root_number) = self.root_number else {
            index.sort_children();
            return Ok(index);
        };
        let mut kids: HashMap<u64, Vec<u64>> = HashMap::new();
        for (id, rec) in &self.records {
            if !rec.skip {
                kids.entry(rec.parent).or_default().push(*id);
            }
        }
        let mut queue = VecDeque::new();
        if let Some(list) = kids.get(&root_number) {
            for id in list {
                queue.push_back((*id, root.to_string()));
            }
        }
        while let Some((id, parent_path)) = queue.pop_front() {
            let Some(rec) = self.records.get(&id) else {
                continue;
            };
            if rec.skip {
                continue;
            }
            let path = join_child(&parent_path, &rec.name);
            index.insert_ready(path.clone(), rec.is_dir, rec.own)?;
            if rec.is_dir && !rec.reparse {
                if let Some(list) = kids.get(&id) {
                    for child in list {
                        queue.push_back((*child, path.clone()));
                    }
                }
            }
        }
        index.sort_children();
        Ok(index)
    }

    fn root_node(&self, root: &str) -> FileNode {
        file_node(
            root,
            ready_file_name(root),
            None,
            true,
            self.root_rolled,
            self.root_folders + self.root_files,
            self.root_folders,
            self.root_files,
            0.0,
        )
    }

    fn child_node(&self, root: &str, id: u64) -> Option<FileNode> {
        let rec = self.records.get(&id)?;
        let path = join_child(root, &rec.name);
        Some(file_node(
            &path,
            &rec.name,
            Some(root.to_string()),
            rec.is_dir,
            rec.rolled,
            rec.child_count,
            rec.folder_count,
            rec.file_count,
            percent(rec.rolled, self.root_rolled),
        ))
    }

    fn moon_node(&self, parent_path: &str, parent_size: u64, id: u64) -> Option<FileNode> {
        let rec = self.records.get(&id)?;
        let path = join_child(parent_path, &rec.name);
        Some(file_node(
            &path,
            &rec.name,
            Some(parent_path.to_string()),
            rec.is_dir,
            rec.rolled,
            rec.child_count,
            rec.folder_count,
            rec.file_count,
            percent(rec.rolled, parent_size),
        ))
    }

    fn path_of(&self, id: u64, root: &str) -> Option<String> {
        let mut names = Vec::new();
        let mut cur = id;
        for _ in 0..512 {
            if self.root_number == Some(cur) {
                break;
            }
            let rec = self.records.get(&cur)?;
            names.push(rec.name.clone());
            if rec.parent == cur {
                break;
            }
            cur = rec.parent;
        }
        names.reverse();
        let mut path = root.to_string();
        for name in names {
            path = join_child(&path, &name);
        }
        Some(path)
    }
}

fn file_node(
    path: &str,
    name: &str,
    parent_id: Option<String>,
    is_dir: bool,
    size: u64,
    child_count: u64,
    folder_count: u64,
    file_count: u64,
    percent_of_parent: f32,
) -> FileNode {
    FileNode {
        id: path.to_string(),
        name: name.to_string(),
        path: path.to_string(),
        parent_id,
        kind: if is_dir { NodeKind::Folder } else { NodeKind::File },
        category: if is_dir { FileCategory::Folder } else { classify(name, false, size) },
        size_bytes: size,
        child_count,
        folder_count,
        file_count,
        percent_of_parent,
    }
}

fn percent(size: u64, parent: u64) -> f32 {
    if parent == 0 { 0.0 } else { (size as f64 / parent as f64) as f32 }
}

fn join_child(parent: &str, name: &str) -> String {
    if parent.ends_with('\\') {
        format!("{parent}{name}")
    } else {
        format!("{parent}\\{name}")
    }
}
