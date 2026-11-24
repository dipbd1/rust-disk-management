import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/format";
import { appVersion, checkForAppUpdate, type AppUpdateInfo } from "../../services/tauriBridge";
import { useFileStore } from "../../store/useFileStore";

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "available"; update: AppUpdateInfo }
  | { kind: "error"; message: string }
  | { kind: "installing" };

function assertNever(value: never): never {
  throw new Error(`unexpected check state: ${JSON.stringify(value)}`);
}

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [version, setVersion] = useState("…");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void appVersion().then((value) => {
      if (!cancelled) setVersion(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setCheck({ kind: "idle" });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
        autoFocus
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl outline-none"
      >
        <h2 id="about-title" className="text-base font-medium text-white">
          Liquid Storage Manager
        </h2>
        <p className="mt-1 text-sm text-slate-400">Version {version}</p>
        <p className="mt-3 text-sm text-slate-300">
          Windows disk map. Updates come from the published GitHub release when signing is configured.
        </p>
        <div className="mt-4 min-h-10 text-sm text-slate-300">{renderCheck(check)}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
            onClick={onClose}
          >
            Close
          </button>
          {check.kind === "available" ? (
            <button
              type="button"
              className="rounded-md bg-cyan-300 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-200"
              onClick={() => {
                const update = check.update;
                setCheck({ kind: "installing" });
                void update.installAndRelaunch().catch((error) => {
                  setCheck({ kind: "error", message: errorMessage(error) });
                  useFileStore.setState({ toast: errorMessage(error) });
                });
              }}
            >
              Install and restart
            </button>
          ) : (
            <button
              type="button"
              disabled={check.kind === "checking" || check.kind === "installing"}
              className="rounded-md bg-cyan-300 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
              onClick={() => {
                setCheck({ kind: "checking" });
                void (async () => {
                  try {
                    const update = await checkForAppUpdate();
                    if (update) setCheck({ kind: "available", update });
                    else setCheck({ kind: "current", version });
                  } catch (error) {
                    setCheck({ kind: "error", message: errorMessage(error) });
                  }
                })();
              }}
            >
              Check for updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function renderCheck(check: CheckState): string {
  switch (check.kind) {
    case "idle":
      return "";
    case "checking":
      return "Checking…";
    case "current":
      return `You are on the latest version (v${check.version}).`;
    case "available":
      return `Update available: v${check.update.version}`;
    case "error":
      return check.message;
    case "installing":
      return "Downloading and installing…";
    default:
      return assertNever(check);
  }
}
