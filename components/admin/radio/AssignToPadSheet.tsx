"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSoundboard } from "@/context/SoundboardContext";
import { Headphones, X, Check, AlertTriangle } from "lucide-react";

export default function AssignToPadSheet() {
  const {
    banks,
    assignModalState,
    closeAssignModal,
    assignClipToPad,
  } = useSoundboard();

  const [selectedBankId, setSelectedBankId] = useState<number>(1);
  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [alsoRename, setAlsoRename] = useState<boolean>(false);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // Sync default bank and pad when modal opens
  useEffect(() => {
    if (assignModalState?.open && banks.length > 0) {
      const initialBank = banks[0];
      setSelectedBankId(initialBank.id);
      if (initialBank.pads && initialBank.pads.length > 0) {
        setSelectedPadId(initialBank.pads[0].id);
      } else {
        setSelectedPadId(null);
      }
      setAlsoRename(false);
      setConfirmedOverwrite(false);
    }
  }, [assignModalState?.open, banks]);

  const currentBank = useMemo(() => {
    return banks.find((b) => b.id === selectedBankId) || banks[0];
  }, [banks, selectedBankId]);

  const bankPads = useMemo(() => {
    return currentBank?.pads || [];
  }, [currentBank]);

  // When bank changes, select first pad of that bank
  const handleBankChange = (newBankId: number) => {
    setSelectedBankId(newBankId);
    setConfirmedOverwrite(false);
    const b = banks.find((item) => item.id === newBankId);
    if (b && b.pads && b.pads.length > 0) {
      setSelectedPadId(b.pads[0].id);
    } else {
      setSelectedPadId(null);
    }
  };

  const selectedPad = useMemo(() => {
    return bankPads.find((p) => p.id === selectedPadId);
  }, [bankPads, selectedPadId]);

  const existingClipUrl = selectedPad?.audio_url;
  const hasExistingClip = Boolean(existingClipUrl);
  const existingClipName = existingClipUrl ? existingClipUrl.split("/").pop() : null;

  if (!assignModalState?.open) return null;

  const handleConfirmAssign = async () => {
    if (!selectedPadId || !assignModalState.audioUrl) return;

    // If pad already has a clip and user hasn't explicitly confirmed overwrite
    if (hasExistingClip && !confirmedOverwrite) {
      setConfirmedOverwrite(true);
      return;
    }

    setSaving(true);
    try {
      const res = await assignClipToPad(
        selectedPadId,
        assignModalState.audioUrl,
        assignModalState.dropId,
        alsoRename ? assignModalState.clipTitle : undefined
      );

      if (res.success) {
        closeAssignModal();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeAssignModal}
        className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[60] animate-in fade-in duration-150"
      />

      {/* Drawer Container: Bottom Sheet on Mobile, Centered Modal on Desktop */}
      <div className="fixed bottom-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 left-0 right-0 z-[70] bg-[#16181D] border-t-2 sm:border-2 border-[#DFBB7D] rounded-t-2xl sm:rounded-xl p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom,20px))] shadow-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] rounded">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-mono text-sm sm:text-base font-bold text-white uppercase">
                Assign to Soundboard Pad
              </h3>
              <p className="text-[11px] font-mono text-[#DFBB7D] truncate max-w-xs sm:max-w-sm">
                Clip: &ldquo;{assignModalState.clipTitle}&rdquo;
              </p>
            </div>
          </div>
          <button
            onClick={closeAssignModal}
            className="p-1.5 text-white/60 hover:text-white rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bank Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-mono uppercase text-white/70 tracking-wider">
            1. Select Bank:
          </label>
          <select
            value={selectedBankId}
            onChange={(e) => handleBankChange(parseInt(e.target.value))}
            className="w-full min-h-[44px] bg-[#1A1D24] text-white font-mono text-base sm:text-xs p-3 border border-white/20 rounded focus:border-[#DFBB7D] focus:outline-none"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id} className="bg-[#16181D] text-white">
                {b.name} ({b.pads?.length || 0} pads)
              </option>
            ))}
          </select>
        </div>

        {/* Pad Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-mono uppercase text-white/70 tracking-wider">
            2. Select Destination Pad:
          </label>
          {bankPads.length === 0 ? (
            <div className="p-3 bg-white/5 border border-dashed border-white/20 rounded text-xs font-mono text-white/50 text-center">
              This bank currently has no pads. Add a pad in Edit Mode first.
            </div>
          ) : (
            <select
              value={selectedPadId ?? ""}
              onChange={(e) => {
                setSelectedPadId(parseInt(e.target.value));
                setConfirmedOverwrite(false);
              }}
              className="w-full min-h-[44px] bg-[#1A1D24] text-white font-mono text-base sm:text-xs p-3 border border-white/20 rounded focus:border-[#DFBB7D] focus:outline-none"
            >
              {bankPads.map((p, idx) => (
                <option key={p.id} value={p.id} className="bg-[#16181D] text-white">
                  Pad #{p.position || idx + 1}: {p.emoji} {p.label} · {p.audio_url ? "✓ Has Clip" : "[Empty]"}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Overwrite Confirmation Step if Pad Already Has Clip */}
        {hasExistingClip && (
          <div className="p-3 bg-amber-500/10 border-2 border-amber-500/50 rounded-lg space-y-2">
            <div className="flex items-start space-x-2 text-amber-300 font-mono text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-bold">Pad Already Has a Clip Assigned:</p>
                <p className="text-[11px] text-white/80 mt-0.5">
                  Currently assigned: <span className="font-semibold text-amber-200">{existingClipName}</span>
                </p>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Assigning will replace this pad&apos;s audio. The old clip remains safe in your Drops Vault.
                </p>
              </div>
            </div>
            {!confirmedOverwrite && (
              <label className="flex items-center space-x-2 pt-1 font-mono text-xs text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedOverwrite}
                  onChange={(e) => setConfirmedOverwrite(e.target.checked)}
                  className="w-4 h-4 accent-[#DFBB7D]"
                />
                <span>I confirm replacing the existing audio clip</span>
              </label>
            )}
          </div>
        )}

        {/* Also Rename Pad Checkbox (Unchecked by default) */}
        <label className="flex items-center space-x-2.5 p-2.5 bg-white/5 border border-white/10 rounded cursor-pointer font-mono text-xs text-white">
          <input
            type="checkbox"
            checked={alsoRename}
            onChange={(e) => setAlsoRename(e.target.checked)}
            className="w-4 h-4 accent-[#DFBB7D]"
          />
          <span>Also rename pad label to &ldquo;{assignModalState.clipTitle}&rdquo;</span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={closeAssignModal}
            className="min-h-[44px] px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmAssign}
            disabled={saving || !selectedPadId || (hasExistingClip && !confirmedOverwrite)}
            className={`min-h-[44px] px-5 py-2.5 font-mono text-xs font-bold rounded flex items-center space-x-1.5 transition-all shadow-md cursor-pointer ${
              saving || !selectedPadId || (hasExistingClip && !confirmedOverwrite)
                ? "bg-white/20 text-white/40 cursor-not-allowed"
                : "bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D]"
            }`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{saving ? "Saving..." : hasExistingClip && !confirmedOverwrite ? "Confirm Overwrite First" : "Assign to Pad"}</span>
          </button>
        </div>
      </div>
    </>
  );
}
