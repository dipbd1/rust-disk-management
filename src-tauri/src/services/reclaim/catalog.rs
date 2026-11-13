use crate::models::ReclaimTier;
use crate::services::guard::segments;

#[derive(Clone, Copy)]
pub struct DirHit {
    pub id: &'static str,
    pub tier: ReclaimTier,
    pub title: &'static str,
    pub sentence: &'static str,
}

pub enum FileHit {
    System {
        title: &'static str,
        sentence: &'static str,
    },
    Download,
    Disk,
    Thumb,
}

pub fn match_dir(path: &str, name: &str) -> Option<DirHit> {
    let segs = segments(path);
    let name_l = name.to_ascii_lowercase();
    if let Some(hit) = browser_cache(&segs, &name_l) {
        return Some(hit);
    }
    const RULES: &[(&[&str], DirHit)] = &[
        (
            &["appdata", "local", "temp"],
            DirHit {
                id: "user-temp",
                tier: ReclaimTier::Safe,
                title: "User temporary files",
                sentence: "Windows and apps recreate files here the next time they need scratch space.",
            },
        ),
        (
            &["windows", "temp"],
            DirHit {
                id: "windows-temp",
                tier: ReclaimTier::Safe,
                title: "Windows temporary files",
                sentence: "Windows recreates this folder for installer and service temporary files.",
            },
        ),
        (
            &["softwaredistribution", "download"],
            DirHit {
                id: "windows-update",
                tier: ReclaimTier::Safe,
                title: "Windows Update downloads",
                sentence: "Windows Update can download these packages again if an update still needs them.",
            },
        ),
        (
            &["softwaredistribution", "deliveryoptimization"],
            DirHit {
                id: "delivery-optimization",
                tier: ReclaimTier::Safe,
                title: "Delivery Optimization cache",
                sentence: "Windows rebuilds this cache when it shares or downloads updates.",
            },
        ),
        (
            &["deliveryoptimization", "cache"],
            DirHit {
                id: "delivery-optimization",
                tier: ReclaimTier::Safe,
                title: "Delivery Optimization cache",
                sentence: "Windows rebuilds this cache when it shares or downloads updates.",
            },
        ),
        (
            &["microsoft", "windows", "deliveryoptimization"],
            DirHit {
                id: "delivery-optimization",
                tier: ReclaimTier::Safe,
                title: "Delivery Optimization cache",
                sentence: "Windows rebuilds this cache when it shares or downloads updates.",
            },
        ),
        (
            &["npm-cache"],
            DirHit {
                id: "npm-cache",
                tier: ReclaimTier::Rebuild,
                title: "npm cache",
                sentence: "npm downloads packages again the next time you install.",
            },
        ),
        (
            &["pip", "cache"],
            DirHit {
                id: "pip-cache",
                tier: ReclaimTier::Rebuild,
                title: "pip cache",
                sentence: "pip downloads packages again the next time you install.",
            },
        ),
        (
            &[".cargo", "registry"],
            DirHit {
                id: "cargo-registry",
                tier: ReclaimTier::Rebuild,
                title: "Cargo registry",
                sentence: "Cargo downloads crates again the next time you build.",
            },
        ),
        (
            &["steamapps", "shadercache"],
            DirHit {
                id: "steam-shader",
                tier: ReclaimTier::Rebuild,
                title: "Steam shader cache",
                sentence: "Steam rebuilds these shaders the next time the game starts.",
            },
        ),
    ];
    for rule in RULES {
        if ends_with(&segs, rule.0) {
            return Some(rule.1);
        }
    }
    if name_l == "node_modules" && segs.iter().filter(|seg| *seg == "node_modules").count() == 1 {
        return Some(DirHit {
            id: "node-modules",
            tier: ReclaimTier::Rebuild,
            title: "Node modules",
            sentence: "The project recreates this folder the next time its dependencies are installed.",
        });
    }
    if name_l == "windows.old" {
        return Some(DirHit {
            id: "windows-old",
            tier: ReclaimTier::Review,
            title: "Previous Windows installation",
            sentence: "This is a previous Windows installation kept for rollback. Review it before recycling.",
        });
    }
    None
}

pub fn match_file(path: &str, name: &str) -> Option<FileHit> {
    let name_l = name.to_ascii_lowercase();
    match name_l.as_str() {
        "hiberfil.sys" => {
            return Some(FileHit::System {
                title: "hiberfil.sys",
                sentence: "Hibernation uses this file. Windows recreates it only if hibernation stays on. There is no delete action here.",
            });
        }
        "pagefile.sys" => {
            return Some(FileHit::System {
                title: "pagefile.sys",
                sentence: "Windows uses this file as virtual memory. Change it in system settings. There is no delete action here.",
            });
        }
        _ => {}
    }
    if name_l.starts_with("thumbcache") && name_l.ends_with(".db") {
        let segs = segments(path);
        if has_seq(&segs, &["microsoft", "windows", "explorer"]) {
            return Some(FileHit::Thumb);
        }
    }
    if in_downloads(path) {
        return Some(FileHit::Download);
    }
    if is_virtual_disk(&name_l, path) {
        return Some(FileHit::Disk);
    }
    None
}

pub fn in_downloads(path: &str) -> bool {
    segments(path).iter().any(|seg| seg == "downloads")
}

fn is_virtual_disk(name: &str, path: &str) -> bool {
    if !name.ends_with(".vhdx") {
        return false;
    }
    if name == "ext4.vhdx" || name == "docker_data.vhdx" {
        return true;
    }
    segments(path).iter().any(|seg| seg == "docker" || seg == "wsl")
}

fn ends_with(segs: &[String], tail: &[&str]) -> bool {
    if segs.len() < tail.len() {
        return false;
    }
    segs[segs.len() - tail.len()..]
        .iter()
        .zip(tail)
        .all(|(seg, expected)| seg == expected)
}

fn has_seq(segs: &[String], needle: &[&str]) -> bool {
    segs.windows(needle.len())
        .any(|window| window.iter().zip(needle).all(|(seg, expected)| seg == expected))
}

fn browser_cache(segs: &[String], name: &str) -> Option<DirHit> {
    let cache_name = matches!(name, "cache" | "code cache" | "gpucache" | "cache2");
    if !cache_name {
        return None;
    }
    let hit = if has_seq(segs, &["google", "chrome", "user data"]) {
        ("browser-chrome", "Chrome cache")
    } else if has_seq(segs, &["microsoft", "edge", "user data"]) {
        ("browser-edge", "Edge cache")
    } else if has_seq(segs, &["bravesoftware", "brave-browser", "user data"]) {
        ("browser-brave", "Brave cache")
    } else if has_seq(segs, &["mozilla", "firefox", "profiles"]) && name == "cache2" {
        ("browser-firefox", "Firefox cache")
    } else {
        return None;
    };
    Some(DirHit {
        id: hit.0,
        tier: ReclaimTier::Safe,
        title: hit.1,
        sentence: "The browser rebuilds this cache as you browse.",
    })
}
