export interface Crumb {
  label: string;
  path: string;
}

export function toWindowsPath(path: string): string {
  return path.split("/").join("\\");
}

export function isDriveRoot(path: string): boolean {
  return /^[A-Za-z]:\\?$/.test(toWindowsPath(path));
}

export function ancestorChain(path: string): string[] {
  const slash = toWindowsPath(path);
  const match = /^([A-Za-z]:)(\\.*)?$/.exec(slash);
  if (!match) return [path];
  const root = `${match[1]}\\`;
  const chain = [root];
  const rest = (match[2] ?? "").replace(/^\\+/, "").replace(/\\+$/, "");
  if (!rest) return chain;
  let current = root;
  for (const part of rest.split("\\")) {
    if (!part) continue;
    current = `${current}${part}`;
    chain.push(current);
    current += "\\";
  }
  return chain;
}

export function breadcrumbs(path: string): Crumb[] {
  return ancestorChain(path).map((item) => ({
    path: item,
    label: item.endsWith("\\") ? item.slice(0, -1) : item.slice(item.lastIndexOf("\\") + 1),
  }));
}

export function isRemovedPath(path: string, removed: string): boolean {
  if (path === removed) return true;
  const prefix = removed.endsWith("\\") ? removed : `${removed}\\`;
  return path.startsWith(prefix);
}

export function nearestAncestorId(paths: { id: string; path: string }[], removed: string): string | null {
  let best: { id: string; path: string } | null = null;
  for (const ancestor of paths) {
    if (ancestor.path === removed) continue;
    const prefix = ancestor.path.endsWith("\\") ? ancestor.path : `${ancestor.path}\\`;
    if (!removed.startsWith(prefix)) continue;
    if (!best || ancestor.path.length > best.path.length) best = ancestor;
  }
  return best?.id ?? null;
}
