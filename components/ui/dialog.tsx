"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The one modal implementation for the whole app.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard had 11 hand-rolled overlays and 118 `alert()` / `confirm()` /
 * `prompt()` calls across the app. Each overlay re-decided the same things and
 * got them differently wrong. The three bugs worth naming, because they are
 * the ones users actually hit:
 *
 *  1. **The close button could not be tapped on a phone.** The overlays centred
 *     their panel with `items-center` but gave the panel no `max-height`, so a
 *     panel taller than the viewport overflowed *symmetrically* in a flex
 *     container - and the top half, containing the pinned header and its ×
 *     button, was pushed off-screen above the viewport where nothing can scroll
 *     to it. Worse, the only reason the panel could overflow at all was that
 *     its body had no scroll container of its own. Fix: the panel is a flex
 *     *column* with a capped height and a scrolling body, and the overlay
 *     aligns to the top on small screens (`items-start sm:items-center`) so a
 *     tall panel extends downward into reachable space instead of upward into
 *     nowhere.
 *
 *  2. **Escape was wired to a non-focusable `<div>`.** `onKeyDown` on an
 *     overlay div only fires when focus is already on a descendant, so Escape
 *     silently did nothing when the modal had just opened (focus was still
 *     behind it on the page) and worked "by accident" only if you happened to
 *     be focused in a text field. Worse, the handler it called was
 *     `closeAllModals()` - a hammer that cleared all 11 modal states at once,
 *     so dismissing a nested prompt also discarded the unsaved form behind it.
 *     Fix: a document-level listener, and a mount stack so only the **top-most**
 *     dialog reacts. Each dialog owns its own Escape; none of them knows about
 *     the others.
 *
 *  3. **No focus management.** Opening a dialog left focus on the page behind
 *     it, so a keyboard user was tabbing through controls that were visually
 *     covered, and Tab could walk out of the modal entirely onto the page
 *     underneath. Fix: focus moves in on open, is trapped while open, and is
 *     restored to the exact trigger on close.
 *
 * `alert()` / `confirm()` cannot express any of that. They are also rendered by
 * the browser, not the app, so they ignore the design system, cannot be styled
 * for touch, and - on a dashboard where the admin is confirming an irreversible
 * delete - they put a system-styled dialog between the operator and the thing
 * they are about to destroy.
 */

type Tone = "default" | "danger";

const TONE: Record<Tone, { panel: string; head: string; ring: string }> = {
  default: {
    panel: "border-brand-navy",
    head: "bg-brand-accent border-brand-navy",
    ring: "shadow-(--shadow-brut-2xl)",
  },
  danger: {
    panel: "border-red-600",
    head: "bg-red-600 border-red-600",
    ring: "shadow-(--shadow-brut-fire)",
  },
};

/**
 * Mount order of every currently-open dialog, oldest first. Escape and the
 * focus trap act on the last entry only, so a dialog opened on top of another
 * behaves like a dialog and not like a trapdoor to the whole page.
 */
const openDialogs: symbol[] = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered before the title in the pinned header. */
  icon?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body. Put actions here, not in `children`. */
  footer?: ReactNode;
  /** Tailwind `max-w-*` class. Defaults to a comfortable single column. */
  maxWidth?: string;
  tone?: Tone;
  /** Clicking the backdrop dismisses. Default true. */
  closeOnBackdrop?: boolean;
  /** Extra classes on the panel. */
  panelClassName?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = "max-w-lg",
  tone = "default",
  closeOnBackdrop = true,
  panelClassName = "",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Captured while closed so `open` flipping to true does not itself overwrite
  // the element we owe focus back to.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // This dialog's identity in the mount stack. Stable for the life of the
  // component, so the stack entry and the Escape handler always agree on which
  // instance is which even if `open` toggles.
  const tokenRef = useRef<symbol>(Symbol("dialog"));
  const id = useId();
  const titleId = `${id}-title`;
  const toneStyles = TONE[tone];

  // Mount bookkeeping. Runs on `open` rather than on unmount alone so a dialog
  // that is toggled off and on quickly cannot leave a stale entry behind.
  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    openDialogs.push(token);
    return () => {
      const at = openDialogs.indexOf(token);
      if (at >= 0) openDialogs.splice(at, 1);
    };
  }, [open]);

  // Focus in, focus trapped, focus returned.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      // Top-most dialog only. Everything below keeps its own listener but
      // stands down, so Escape peels one layer at a time.
      const isTopMost = openDialogs[openDialogs.length - 1] === tokenRef.current;
      if (!isTopMost) return;

      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;
      const nodes = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;
      // Wrap in both directions, and pull focus back in if it escaped the panel
      // some other way (a programmatic focus, a click on the backdrop).
      if (e.shiftKey && (active === firstNode || !panel?.contains(active))) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && active === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      returnFocusRef.current?.focus?.();
    };
    // Deps are `[open, onClose]` on purpose. Re-running this effect would re-steal
    // focus mid-interaction, which is worse than a stale closure over `panel`.
  }, [open, onClose]);

  // Stop the page behind the dialog from scrolling under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onBackdropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // `mousedown` rather than `click`: a drag that starts inside the panel and
      // ends on the backdrop should not dismiss, and `click` would fire there.
      if (!closeOnBackdrop) return;
      if (e.target !== e.currentTarget) return;
      onClose();
    },
    [closeOnBackdrop, onClose]
  );

  if (!open) return null;

  return (
    <div
      // `items-start` on small screens: an aligned panel grows downward into
      // scrollable space. Centring it is what pushed the header off-screen.
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain bg-brand-navy/80 backdrop-blur-sm p-4 font-mono"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} max-h-[90dvh] flex flex-col overflow-hidden border-4 ${toneStyles.panel} bg-brand-off-white ${toneStyles.ring} ${panelClassName}`}
      >
        <div
          className={`flex items-center justify-between gap-3 shrink-0 border-b-4 p-3 ${toneStyles.head}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <h3
              id={titleId}
              className={`font-display text-lg uppercase truncate ${
                tone === "danger" ? "text-white" : "text-brand-navy"
              }`}
            >
              {title}
            </h3>
          </div>
          {/* 44x44: below that, iOS and Android both treat the target as a tap
              at the wrong place rather than making the button bigger. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className={`shrink-0 grid place-items-center min-w-[44px] min-h-[44px] border-2 transition-colors cursor-pointer ${
              tone === "danger"
                ? "border-white bg-transparent text-white hover:bg-white hover:text-red-600"
                : "border-brand-navy bg-brand-navy text-brand-off-white hover:bg-brand-off-white hover:text-brand-navy"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>

        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t-4 border-brand-navy bg-brand-accent/40 p-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons, so callers do not re-decide focus-ring and disabled styling */
/* ------------------------------------------------------------------ */

export function DialogButton({
  children,
  onClick,
  variant = "ghost",
  type = "button",
  disabled,
  autoFocus,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const styles = {
    ghost: "bg-brand-off-white text-brand-navy border-brand-navy hover:bg-brand-accent/20",
    primary: "bg-brand-navy text-brand-off-white border-brand-navy hover:bg-brand-accent hover:text-brand-navy",
    danger: "bg-red-600 text-white border-red-600 hover:bg-red-700",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`px-4 py-2 min-h-[44px] border-2 text-caption font-black uppercase tracking-wider transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                       */
/* ------------------------------------------------------------------ */

/**
 * The replacement for `confirm()`.
 *
 * Two deliberate differences from the native dialog:
 *
 *  - `confirm()` cannot show which event an action will affect. Almost every
 *    destructive path here is event-scoped, and a tier id like "ADV 500" exists
 *    on more than one edition - so the operator was confirming a delete without
 *    knowing what it would delete. `scope` is rendered as a labelled line
 *    instead.
 *  - The confirm button is never the autofocused element. Auto-focusing "Delete"
 *    means a stray Enter confirms an irreversible action; focus starts on
 *    Cancel, which is what a dialog that can destroy data should do.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  /** Rendered as a bordered "On event: <scope>" line. Say the target out loud. */
  scope,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  scope?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      tone={danger ? "danger" : "default"}
      footer={
        <>
          <DialogButton onClick={onClose} autoFocus>
            {cancelLabel}
          </DialogButton>
          <DialogButton
            onClick={onConfirm}
            variant={danger ? "danger" : "primary"}
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </DialogButton>
        </>
      }
    >
      <div className="text-body text-brand-navy space-y-4">
        <div>{body}</div>
        {scope != null && (
          <div className="p-2.5 border-2 border-brand-navy/20 bg-brand-navy/5 text-caption uppercase">
            <span className="text-brand-navy-light">On event</span>{" "}
            <span className="font-black text-brand-navy">{scope}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}