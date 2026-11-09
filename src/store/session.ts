export const session = {
  scan: 0,
  preview: -1,
  focus: 0,
  list: 0,
  view: 0,
  booted: false,
  stopStale: (): void => {},
};

export const treeInflight = new Set<string>();
export const trashLocks = new Set<string>();
