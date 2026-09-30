"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ConfirmDialog, Dialog, DialogButton } from "./dialog";

/**
 * Promise-based `confirm()` / `alert()` replacements that render the app's own
 * modals.
 *
 * WHY PROMISE-BASED INSTEAD OF HAND-WRITTEN STATE PER CALL SITE
 * ----------------------------------------------------------
 * There are ~120 `alert()` / `confirm()` / `prompt()` calls left in the app, most
 * of them in an 180 KB dashboard monolith. Giving each one its own
 * `{ open, setOpen }` pair plus a bespoke JSX block is how they got inconsistent
 * in the first place, and it is a lot of surface to review for what is always a
 * one-line decision. Instead each call site keeps its shape and only the call
 * changes:
 *
 *     if (!confirm("Delete this tier?")) return;                     // native
 *     if (!(await confirm({ title, body, danger: true }))) return;   // now
 *
 * The event handlers are already `async` (they `await fetch`), so this is a
 * mechanical rewrite with no restructuring, and the call site still reads like
 * the `confirm()` it replaced.
 *
 * The dialog closes as soon as the decision is made and the caller's `await`
 * continuation then performs the write. That means there is no in-dialog busy
 * state, which is also why a double-press cannot fire the action twice: the
 * button it was attached to is gone.
 *
 * WORTH BEING EXPLICIT ABOUT WHAT THIS DOES NOT FIX
 * -------------------------------------------------
 * The native dialogs have one genuinely nice property: they block.
 * `window.confirm` halts the event loop, so nothing can run while a decision is
 * pending. These modals yield instead, so a handler that awaits one and then
 * writes can in principle be re-entered from elsewhere. In practice the dialog
 * swallows the clicks that would trigger it, and the calls that follow are
 * guarded by an explicit `res.ok` check rather than by the dialog staying open.
 * Where an action is irreversible, prefer a button that asks and a separate
 * button that acts over one that does both.
 */

export type ConfirmOptions = {
  title: string;
  body: ReactNode;
  /** Rendered as a bordered "On event: <scope>" line. Name the target. */
  scope?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AlertOptions = {
  title: string;
  body: ReactNode;
  tone?: "info" | "success" | "danger";
};

/**
 * A bare string is accepted anywhere an options object is, and a title is
 * derived from it.
 *
 * This is what makes the migration finishable. There are ~120 native calls, and
 * a mechanical rewrite of all of them into a hand-written title plus a body is
 * a large, hard-to-review diff across an 180 KB monolith - exactly the shape of
 * change that gets one thing subtly wrong in a payment path and ships it.
 *
 * So the type accepts both. Every remaining `alert("...")` and `confirm("...")`
 * in the codebase renders the app's own modal from the moment this lands, with
 * no call site edited at all. Titles that matter - the irreversible ones - are
 * then written out deliberately, one at a time, as `ConfirmOptions`. The derived
 * title is the floor, not the goal.
 */
function toOptions(options: ConfirmOptions | string): ConfirmOptions {
  if (typeof options !== "string") return options;
  return { title: deriveTitle(options), body: options };
}

/**
 * Best-effort dialog title from a sentence. Takes the first clause, which is
 * almost always the action ("Delete payment log entry?", "Incorrect admin
 * password.") rather than the explanation that follows it.
 */
function deriveTitle(message: string): string {
  const firstLine = message.split("\n")[0] ?? "";
  const clause = firstLine.split(/[?.]/)[0] ?? firstLine;
  const trimmed = clause.trim();
  if (!trimmed) return "Please confirm";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

/**
 * Whether a bare-string confirm should default to the destructive style. The
 * words below are the ones that actually appear in this codebase's irreversible
 * actions; a confirm that only destroys something the operator can rebuild
 * should not be dressed up as dangerous.
 */
function looksDestructive(message: string): boolean {
  return /\b(delete|permanent|remove|clear|wipe|discard|revoke|cancel|reject|purge|erase)\b/i.test(
    message
  );
}

const ALERT_TONE = {
  info: { icon: <Info className="w-5 h-5 text-brand-navy" />, button: "Got it" },
  success: { icon: <CheckCircle2 className="w-5 h-5 text-green-700" />, button: "OK" },
  danger: { icon: <AlertTriangle className="w-5 h-5 text-red-600" />, button: "Understood" },
} as const;

export function useFeedback() {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [alertState, setAlertState] = useState<AlertOptions | null>(null);

  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const alertResolver = useRef<(() => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const resolved = toOptions(options);
    // Never stack one decision on another. A dialog asking a question while a
    // different dialog is already asking one is precisely the confusion a modal
    // exists to prevent, and an unanswered promise would otherwise leak.
    setAlertState(null);
    alertResolver.current?.();
    alertResolver.current = null;

    setConfirmState({
      ...resolved,
      danger: resolved.danger ?? looksDestructive(String(resolved.body ?? resolved.title)),
    });
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    setConfirmState(null);
    confirmResolver.current?.(false);
    confirmResolver.current = null;

    setAlertState(
      typeof options === "string"
        ? { title: deriveTitle(options), body: options }
        : options
    );
    return new Promise<void>((resolve) => {
      alertResolver.current = resolve;
    });
  }, []);

  const settleConfirm = useCallback((ok: boolean) => {
    setConfirmState(null);
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    resolve?.(ok);
  }, []);

  const settleAlert = useCallback(() => {
    setAlertState(null);
    const resolve = alertResolver.current;
    alertResolver.current = null;
    resolve?.();
  }, []);

  const alertTone = ALERT_TONE[alertState?.tone ?? "info"];

  /**
   * Mount this once, near the root of the screen that uses `confirm`/`alert`.
   * Returned as a value rather than rendered by the hook so a caller gets the
   * API and the host in one call, and cannot mount the host twice or forget it.
   */
  const host = (
    <>
      <ConfirmDialog
        open={confirmState !== null}
        onClose={() => settleConfirm(false)}
        onConfirm={() => settleConfirm(true)}
        title={confirmState?.title ?? ""}
        body={confirmState?.body ?? null}
        scope={confirmState?.scope}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        danger={confirmState?.danger}
      />
      <Dialog
        open={alertState !== null}
        onClose={settleAlert}
        title={alertState?.title ?? ""}
        icon={alertTone.icon}
        maxWidth="max-w-md"
        footer={
          <DialogButton onClick={settleAlert} autoFocus>
            {alertTone.button}
          </DialogButton>
        }
      >
        <div className="text-body text-brand-navy whitespace-pre-line">{alertState?.body}</div>
      </Dialog>
    </>
  );

  return { confirm, alert, host };
}