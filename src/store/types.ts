import type {
  DriveInfo,
  DuplicateProgress,
  ExtensionRollup,
  FileNode,
  GraphView,
  GrowthDelta,
  InsightPage,
  LargestOrder,
  ReclaimReport,
  ScanProgress,
} from "../types/filesystem";

export type LeftTab = "explorer" | "largest" | "search" | "types" | "reclaim" | "duplicates" | "growth";

export interface ExtensionTarget {
  extension: string;
  other: boolean;
}

export interface DuplicateRun extends DuplicateProgress {
  running: boolean;
}

export type RecyclePrompt =
  | { kind: "reclaim"; ids: string[]; title: string; body: string }
  | { kind: "bin"; title: string; body: string }
  | { kind: "duplicates"; paths: string[]; title: string; body: string };

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
  elevated: boolean;
  elevationPrompt: boolean;
  pendingMount: string | null;
  leftTab: LeftTab;
  largestPage: InsightPage | null;
  searchPage: InsightPage | null;
  extensions: ExtensionRollup | null;
  extensionTarget: ExtensionTarget | null;
  extensionPage: InsightPage | null;
  reclaim: ReclaimReport | null;
  duplicateRun: DuplicateRun | null;
  growth: GrowthDelta | null;
  recyclePrompt: RecyclePrompt | null;
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
  continueWithoutElevation: (remember: boolean) => Promise<void>;
  restartElevated: () => Promise<void>;
  setLeftTab: (tab: LeftTab) => void;
  loadLargest: (order: LargestOrder) => Promise<void>;
  loadMoreLargest: (order: LargestOrder) => Promise<void>;
  searchWhole: (query: string) => Promise<void>;
  loadMoreSearch: (query: string) => Promise<void>;
  loadExtensions: () => Promise<void>;
  openExtension: (target: ExtensionTarget) => Promise<void>;
  loadMoreExtension: () => Promise<void>;
  openLocated: (node: FileNode) => Promise<void>;
  loadReclaim: () => Promise<void>;
  loadGrowth: () => Promise<void>;
  scanFolder: () => Promise<void>;
  startDuplicates: () => Promise<void>;
  cancelDuplicates: () => Promise<void>;
  promptRecycle: (prompt: RecyclePrompt) => void;
  confirmRecycle: () => Promise<void>;
  dismissRecycle: () => void;
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
  elevated: false,
  elevationPrompt: false,
  pendingMount: null,
  leftTab: "explorer",
  largestPage: null,
  searchPage: null,
  extensions: null,
  extensionTarget: null,
  extensionPage: null,
  reclaim: null,
  duplicateRun: null,
  growth: null,
  recyclePrompt: null,
};
