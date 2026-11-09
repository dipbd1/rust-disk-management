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
  percentOfParent: number;
}

export interface ScanProgress {
  generation: number;
  scannedCount: number;
  currentPath: string;
  elapsedMs: number;
  accessDeniedCount: number;
  root: FileNode | null;
  topLevel: FileNode[];
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
