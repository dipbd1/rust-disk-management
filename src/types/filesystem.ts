export interface DriveInfo {
  mount: string;
  label: string;
  fileSystem: string;
  totalBytes: number;
  availableBytes: number;
  isRemovable: boolean;
}

export type NodeKind = "folder" | "file" | "aggregate";

export type FileCategory = "folder" | "media" | "code" | "heavy" | "other";

export interface FileNode {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  kind: NodeKind;
  category: FileCategory;
  sizeBytes: number;
  childCount: number;
  folderCount?: number;
  fileCount?: number;
  percentOfParent: number;
}

export interface SatellitePreview {
  parentPath: string;
  nodes: FileNode[];
}

export interface ScanProgress {
  generation: number;
  scannedCount: number;
  currentPath: string;
  elapsedMs: number;
  accessDeniedCount: number;
  root: FileNode | null;
  topLevel: FileNode[];
  satellites?: SatellitePreview[];
  done: boolean;
  cancelled: boolean;
}

export interface ChildrenPage {
  parentPath: string;
  total: number;
  offset: number;
  nodes: FileNode[];
}

export interface GraphView {
  focus: FileNode;
  children: FileNode[];
  other: FileNode | null;
}

export interface DeleteResult {
  freedBytes: number;
  removedPath: string;
  ancestors: FileNode[];
}

export interface ElevationStatus {
  elevated: boolean;
  ntfsPresent: boolean;
}

export interface InsightPage {
  total: number;
  offset: number;
  nodes: FileNode[];
}

export interface ExtensionRow {
  extension: string;
  count: number;
  sizeBytes: number;
  other: boolean;
}

export interface ExtensionRollup {
  rows: ExtensionRow[];
}

export type ReclaimTier = "safe" | "rebuild" | "review" | "system";

export interface ReclaimRow {
  id: string;
  tier: ReclaimTier;
  title: string;
  sentence: string;
  revealPath: string;
  sizeBytes: number;
  itemCount: number;
  canRecycle: boolean;
}

export interface RecycleBinStatus {
  sizeBytes: number;
  itemCount: number;
  available: boolean;
}

export interface ReclaimReport {
  rows: ReclaimRow[];
  recycleBin: RecycleBinStatus;
}

export interface RecycleBatch {
  freedBytes: number;
  results: DeleteResult[];
}

export interface DuplicateFile {
  path: string;
  name: string;
  sizeBytes: number;
}

export interface DuplicateGroup {
  id: string;
  sizeBytes: number;
  wastedBytes: number;
  keeper: DuplicateFile;
  copies: DuplicateFile[];
}

export interface DuplicateProgress {
  checked: number;
  total: number;
  currentPath: string;
  done: boolean;
  cancelled: boolean;
  truncated: boolean;
  groups: DuplicateGroup[];
}

export interface GrowthEntry {
  path: string;
  name: string;
  kind: NodeKind;
  previousBytes: number;
  sizeBytes: number;
  deltaBytes: number;
}

export interface GrowthDelta {
  root: string;
  hasBaseline: boolean;
  previousTotal: number;
  totalBytes: number;
  entries: GrowthEntry[];
}

export interface BinEmptyResult {
  freedBytes: number;
}
