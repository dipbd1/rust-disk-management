const press =
  "transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1020]";

/** Focus ring for list controls that are not action buttons. */
export const reclaimFocus = `${focusRing} focus-visible:ring-slate-300`;

// `button { font: inherit }` in index.css is unlayered, so size and weight need
// the important modifier or that rule keeps every label at 16px regular.
const pane = "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg text-sm!";

const row =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-[13px]! font-medium!";

export const reclaimButton = {
  danger: `${pane} h-10 self-start bg-[#BE123C] px-4 font-semibold! text-white hover:bg-[#9F1239] ${press} ${focusRing} focus-visible:ring-rose-300`,
  primary: `${pane} h-10 px-4 font-semibold! text-[#0B0F17] hover:brightness-110 ${press} ${focusRing} focus-visible:ring-cyan-200`,
  secondary: `${pane} h-9 border border-cyan-300/40 bg-white/[0.04] px-3 font-medium! text-cyan-100 hover:bg-cyan-300/10 ${press} ${focusRing} focus-visible:ring-cyan-200`,
  safe: `${pane} h-9 border border-cyan-300/50 bg-white/[0.04] px-3 font-medium! text-cyan-100 hover:bg-cyan-300/10 ${press} ${focusRing} focus-visible:ring-cyan-200`,
  rebuild: `${pane} h-9 border border-amber-300/50 bg-white/[0.04] px-3 font-medium! text-amber-100 hover:bg-amber-300/10 ${press} ${focusRing} focus-visible:ring-amber-200`,
  ghost: `${pane} h-10 px-3 font-medium! text-cyan-200 hover:bg-white/5 hover:text-white ${press} ${focusRing} focus-visible:ring-cyan-200`,
  row: `${row} border border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] ${press} ${focusRing} focus-visible:ring-slate-300`,
  rowDanger: `${row} border border-rose-400/40 text-rose-100 hover:bg-rose-400/10 ${press} ${focusRing} focus-visible:ring-rose-300`,
} as const;
