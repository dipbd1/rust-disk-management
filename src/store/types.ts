import type { DriveInfo, FileNode, GraphView, ScanProgress } from "../types/filesystem";

export type ScanStatus = "idle" | "scanning" | "ready" | "cancelled" | "error";

export type PageSource = "preview" | "index";

export interface ChildPage {
  parentPath: string;
  nodes: FileNode[];
  total: number;
  complete: boolean;
  source: PageSource;
}

export interface FolderList {
  parentPath: string;
  query: string;
  nodes: FileNode[];
  total: number;
  complete: boolean;
}

export interface FileData {
  drives: DriveInfo[];
  activeDrive: string | null;
  rootId: string | null;
  scanStatus: ScanStatus;
  progress: ScanProgress | null;
  nodes: Record<string, FileNode>;
  childPages: Record<string, ChildPage>;
  list: FolderList | null;
  focusedNodeId: string | null;
  selectedNodeId: string | null;
  expandedIds: string[];
  graphView: GraphView | null;
  query: string;
  stale: boolean;
  stalePath: string | null;
  toast: string | null;
  confirmPath: string | null;
  drainingId: string | null;
}

export interface FileActions {
  boot: () => Promise<void>;
  scanDrive: (mount: string) => Promise<void>;
  cancelScan: () => Promise<void>;
  rescan: () => Promise<void>;
  setQuery: (query: string) => void;
  selectNode: (id: string) => void;
  focusNode: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => Promise<void>;
  loadMoreTree: (parentPath: string) => Promise<void>;
  loadMoreList: () => Promise<void>;
  reveal: (path: string) => Promise<void>;
  copyNodePath: (path: string) => Promise<void>;
  requestTrash: (path: string) => void;
  finishDrain: (path: string) => void;
  requestPermanentDelete: (path: string) => void;
  confirmPermanentDelete: () => Promise<void>;
  dismissConfirm: () => void;
  dismissToast: () => void;
}

export type FileStore = FileData & FileActions;

export const initialData: FileData = {
  drives: [],
  activeDrive: null,
  rootId: null,
  scanStatus: "idle",
  progress: null,
  nodes: {},
  childPages: {},
  list: null,
  focusedNodeId: null,
  selectedNodeId: null,
  expandedIds: [],
  graphView: null,
  query: "",
  stale: false,
  stalePath: null,
  toast: null,
  confirmPath: null,
  drainingId: null,
};
