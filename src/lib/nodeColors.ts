import type { FileNode } from "../types/filesystem";
import { HEAVY_FILE_BYTES } from "./limits";

export interface NodeVisualTheme {
  primary: string;       // Vibrant glowing accent / wave crest
  secondary: string;     // Deep fluid base color
  crest: string;         // Bright wave meniscus highlight
  rim: string;           // Circular glass stroke
  glow: string;          // Outer ambient glow
  badgeBg: string;       // Category pill background
  badgeText: string;     // Category pill text
  icon: string;          // Symbol or glyph
  label: string;         // Human friendly type name
}

// Preset color themes matching the reference UI
const THEME_CYAN: NodeVisualTheme = {
  primary: "#00F0FF",
  secondary: "#0284C7",
  crest: "#E0F2FE",
  rim: "rgba(0, 240, 255, 0.75)",
  glow: "rgba(0, 240, 255, 0.45)",
  badgeBg: "rgba(0, 240, 255, 0.15)",
  badgeText: "#38BDF8",
  icon: "📁",
  label: "Folder",
};

const THEME_TEAL: NodeVisualTheme = {
  primary: "#06B6D4",
  secondary: "#0E7490",
  crest: "#CCFBF1",
  rim: "rgba(6, 182, 212, 0.75)",
  glow: "rgba(6, 182, 212, 0.4)",
  badgeBg: "rgba(6, 182, 212, 0.15)",
  badgeText: "#2DD4BF",
  icon: "📁",
  label: "Folder",
};

const THEME_BLUE: NodeVisualTheme = {
  primary: "#38BDF8",
  secondary: "#1D4ED8",
  crest: "#BAE6FD",
  rim: "rgba(56, 189, 248, 0.75)",
  glow: "rgba(56, 189, 248, 0.4)",
  badgeBg: "rgba(56, 189, 248, 0.15)",
  badgeText: "#60A5FA",
  icon: "📁",
  label: "Folder",
};

const THEME_SAPPHIRE: NodeVisualTheme = {
  primary: "#3B82F6",
  secondary: "#1E3A8A",
  crest: "#DBEAFE",
  rim: "rgba(59, 130, 246, 0.75)",
  glow: "rgba(59, 130, 246, 0.4)",
  badgeBg: "rgba(59, 130, 246, 0.15)",
  badgeText: "#93C5FD",
  icon: "📁",
  label: "Folder",
};

const THEME_PURPLE: NodeVisualTheme = {
  primary: "#8B5CF6",
  secondary: "#581C87",
  crest: "#EDE9FE",
  rim: "rgba(139, 92, 246, 0.75)",
  glow: "rgba(139, 92, 246, 0.4)",
  badgeBg: "rgba(139, 92, 246, 0.15)",
  badgeText: "#C4B5FD",
  icon: "📁",
  label: "Folder",
};

const THEME_MAGENTA: NodeVisualTheme = {
  primary: "#D946EF",
  secondary: "#701A75",
  crest: "#FAE8FF",
  rim: "rgba(217, 70, 239, 0.75)",
  glow: "rgba(217, 70, 239, 0.4)",
  badgeBg: "rgba(217, 70, 239, 0.15)",
  badgeText: "#F0ABFC",
  icon: "📁",
  label: "Folder",
};

const THEME_ROSE: NodeVisualTheme = {
  primary: "#F43F5E",
  secondary: "#881337",
  crest: "#FFE4E6",
  rim: "rgba(244, 63, 94, 0.75)",
  glow: "rgba(244, 63, 94, 0.4)",
  badgeBg: "rgba(244, 63, 94, 0.15)",
  badgeText: "#FDA4AF",
  icon: "📁",
  label: "Folder",
};

// File Theme: Executable & Binaries (.exe, .msi, .bat, .cmd, .sh)
const THEME_EXEC: NodeVisualTheme = {
  primary: "#A855F7",
  secondary: "#581C87",
  crest: "#F3E8FF",
  rim: "rgba(168, 85, 247, 0.75)",
  glow: "rgba(168, 85, 247, 0.4)",
  badgeBg: "rgba(168, 85, 247, 0.15)",
  badgeText: "#D8B4FE",
  icon: "⚙",
  label: "Executable",
};

// File Theme: System & Libraries (.sys, .dll, .bin, .ocx)
const THEME_SYSTEM: NodeVisualTheme = {
  primary: "#EC4899",
  secondary: "#831843",
  crest: "#FCE7F3",
  rim: "rgba(236, 72, 153, 0.75)",
  glow: "rgba(236, 72, 153, 0.4)",
  badgeBg: "rgba(236, 72, 153, 0.15)",
  badgeText: "#F472B6",
  icon: "🧩",
  label: "System File",
};

// File Theme: Code (.ts, .tsx, .js, .jsx, .py, .rs, .c, .cpp, .html, .css)
const THEME_CODE: NodeVisualTheme = {
  primary: "#00FF87",
  secondary: "#065F46",
  crest: "#D1FAE5",
  rim: "rgba(0, 255, 135, 0.75)",
  glow: "rgba(0, 255, 135, 0.4)",
  badgeBg: "rgba(0, 255, 135, 0.15)",
  badgeText: "#34D399",
  icon: "</>",
  label: "Code",
};

// File Theme: Video (.mp4, .mkv, .avi, .mov, .webm)
const THEME_VIDEO: NodeVisualTheme = {
  primary: "#FF007A",
  secondary: "#881337",
  crest: "#FFE4E6",
  rim: "rgba(255, 0, 122, 0.75)",
  glow: "rgba(255, 0, 122, 0.45)",
  badgeBg: "rgba(255, 0, 122, 0.15)",
  badgeText: "#FB7185",
  icon: "🎬",
  label: "Video",
};

// File Theme: Audio (.mp3, .wav, .flac, .aac, .ogg)
const THEME_AUDIO: NodeVisualTheme = {
  primary: "#FB7185",
  secondary: "#9F1239",
  crest: "#FFE4E6",
  rim: "rgba(251, 113, 133, 0.75)",
  glow: "rgba(251, 113, 133, 0.4)",
  badgeBg: "rgba(251, 113, 133, 0.15)",
  badgeText: "#FDA4AF",
  icon: "🎵",
  label: "Audio",
};

// File Theme: Images (.png, .jpg, .jpeg, .webp, .svg, .psd)
const THEME_IMAGE: NodeVisualTheme = {
  primary: "#F59E0B",
  secondary: "#78350F",
  crest: "#FEF3C7",
  rim: "rgba(245, 158, 11, 0.75)",
  glow: "rgba(245, 158, 11, 0.4)",
  badgeBg: "rgba(245, 158, 11, 0.15)",
  badgeText: "#FBBF24",
  icon: "🖼",
  label: "Image",
};

// File Theme: Archives (.zip, .rar, .7z, .tar, .gz)
const THEME_ARCHIVE: NodeVisualTheme = {
  primary: "#F97316",
  secondary: "#7C2D12",
  crest: "#FFEDD5",
  rim: "rgba(249, 115, 22, 0.75)",
  glow: "rgba(249, 115, 22, 0.4)",
  badgeBg: "rgba(249, 115, 22, 0.15)",
  badgeText: "#FB923C",
  icon: "📦",
  label: "Archive",
};

// File Theme: Documents (.pdf, .docx, .xlsx, .pptx, .txt, .md)
const THEME_DOCUMENT: NodeVisualTheme = {
  primary: "#38BDF8",
  secondary: "#075985",
  crest: "#E0F2FE",
  rim: "rgba(56, 189, 248, 0.75)",
  glow: "rgba(56, 189, 248, 0.4)",
  badgeBg: "rgba(56, 189, 248, 0.15)",
  badgeText: "#7DD3FC",
  icon: "📄",
  label: "Document",
};

// File Theme: Heavy Files (> 5GB)
const THEME_HEAVY: NodeVisualTheme = {
  primary: "#FFC837",
  secondary: "#92400E",
  crest: "#FEF08A",
  rim: "rgba(255, 200, 55, 0.8)",
  glow: "rgba(255, 200, 55, 0.45)",
  badgeBg: "rgba(255, 200, 55, 0.18)",
  badgeText: "#FDE047",
  icon: "⚡",
  label: "> 5GB File",
};

// File Theme: Other / Slate
const THEME_OTHER: NodeVisualTheme = {
  primary: "#94A3B8",
  secondary: "#334155",
  crest: "#F1F5F9",
  rim: "rgba(148, 163, 184, 0.7)",
  glow: "rgba(148, 163, 184, 0.35)",
  badgeBg: "rgba(148, 163, 184, 0.15)",
  badgeText: "#CBD5E1",
  icon: "▤",
  label: "File",
};

const FOLDER_PALETTE = [
  THEME_CYAN,
  THEME_BLUE,
  THEME_SAPPHIRE,
  THEME_PURPLE,
  THEME_MAGENTA,
  THEME_TEAL,
  THEME_ROSE,
];

export function getFileExtension(filename: string): string {
  if (!filename || !filename.includes(".")) return "";
  const parts = filename.split(".");
  return parts[parts.length - 1].toLowerCase();
}

export function getNodeVisualTheme(node: FileNode, index = 0, isHub = false): NodeVisualTheme {
  if (isHub) {
    return THEME_CYAN;
  }

  // Folders
  if (node.kind === "folder") {
    const nameLower = node.name.toLowerCase();
    if (nameLower.includes("program files (x86)")) return THEME_CYAN;
    if (nameLower === "program files") return THEME_MAGENTA;
    if (nameLower.includes("users")) return THEME_BLUE;
    if (nameLower.includes("riot") || nameLower.includes("games") || nameLower.includes("steam")) return THEME_SAPPHIRE;
    if (nameLower.includes("windows") || nameLower.includes("system32")) return THEME_PURPLE;
    if (nameLower.includes("programdata")) return THEME_PURPLE;
    if (nameLower.includes("intel") || nameLower.includes("recovery")) return THEME_ROSE;

    return FOLDER_PALETTE[Math.abs(index) % FOLDER_PALETTE.length];
  }

  // Heavy file check (> 5GB)
  if (node.sizeBytes >= HEAVY_FILE_BYTES) {
    return THEME_HEAVY;
  }

  const ext = getFileExtension(node.name);

  // Executables
  if (["exe", "msi", "bat", "cmd", "sh", "bin", "app", "deb", "rpm", "com"].includes(ext)) {
    return { ...THEME_EXEC, label: ext ? `.${ext.toUpperCase()}` : "Executable" };
  }

  // System & Dynamic Libraries
  if (["sys", "dll", "drv", "ocx", "so", "dylib", "pdb", "lib", "obj", "rom"].includes(ext)) {
    return { ...THEME_SYSTEM, label: ext ? `.${ext.toUpperCase()}` : "System" };
  }

  // Disk Images
  if (["iso", "img", "vmdk", "vhd", "vhdx", "dmg"].includes(ext)) {
    return { ...THEME_MAGENTA, icon: "💿", label: `.${ext.toUpperCase()}` };
  }

  // Code & Web
  if (
    [
      "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "cpp", "c", "h", "hpp", "cs",
      "go", "java", "kt", "html", "css", "scss", "sql", "php", "rb", "swift", "wasm", "vue", "svelte",
      "json", "yaml", "yml", "xml", "toml", "ini", "cfg", "config"
    ].includes(ext)
  ) {
    return { ...THEME_CODE, label: ext ? `.${ext.toUpperCase()}` : "Code" };
  }

  // Video
  if (["mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", "m4v"].includes(ext)) {
    return { ...THEME_VIDEO, label: ext ? `.${ext.toUpperCase()}` : "Video" };
  }

  // Audio
  if (["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a", "opus"].includes(ext)) {
    return { ...THEME_AUDIO, label: ext ? `.${ext.toUpperCase()}` : "Audio" };
  }

  // Images
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "psd", "ai", "raw"].includes(ext)) {
    return { ...THEME_IMAGE, label: ext ? `.${ext.toUpperCase()}` : "Image" };
  }

  // Archives
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext)) {
    return { ...THEME_ARCHIVE, label: ext ? `.${ext.toUpperCase()}` : "Archive" };
  }

  // Documents
  if (["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md", "rtf", "csv", "log"].includes(ext)) {
    return { ...THEME_DOCUMENT, label: ext ? `.${ext.toUpperCase()}` : "Document" };
  }

  return { ...THEME_OTHER, label: ext ? `.${ext.toUpperCase()}` : "File" };
}
