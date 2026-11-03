"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  SoundboardBankItem,
  SoundboardPadItem,
  DropVaultOption,
} from "@/lib/radio/soundboard-helpers";

export interface AssignModalState {
  open: boolean;
  audioUrl: string;
  clipTitle: string;
  dropId?: number | null;
}

export interface SoundboardContextType {
  banks: SoundboardBankItem[];
  setBanks: React.Dispatch<React.SetStateAction<SoundboardBankItem[]>>;
  activeBankId: number;
  setActiveBankId: (id: number) => void;
  vaultDrops: DropVaultOption[];
  loading: boolean;
  refreshSoundboard: () => Promise<void>;
  assignModalState: AssignModalState | null;
  openAssignModal: (audioUrl: string, clipTitle: string, dropId?: number | null) => void;
  closeAssignModal: () => void;
  assignClipToPad: (
    padId: number,
    audioUrl: string,
    dropId?: number | null,
    newLabel?: string
  ) => Promise<{ success: boolean; bankName?: string; padPosition?: number; error?: string }>;
  toastMsg: { text: string; type: "success" | "error" } | null;
  showToast: (text: string, type?: "success" | "error") => void;
}

const SoundboardContext = createContext<SoundboardContextType | null>(null);

const CACHE_KEY = "goodlife_soundboard_cache";

export function SoundboardProvider({ children }: { children: React.ReactNode }) {
  const [banks, setBanks] = useState<SoundboardBankItem[]>([]);
  const [activeBankId, setActiveBankId] = useState<number>(1);
  const [vaultDrops, setVaultDrops] = useState<DropVaultOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalState, setAssignModalState] = useState<AssignModalState | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const refreshSoundboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/radio/soundboard");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.banks) && data.banks.length > 0) {
          setBanks(data.banks);
          setActiveBankId((prev) => (data.banks.some((b: any) => b.id === prev) ? prev : data.banks[0].id));
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data.banks));
          } catch {}
        }
        if (Array.isArray(data.drops)) {
          setVaultDrops(data.drops);
        }
      }
    } catch (err) {
      console.warn("[SoundboardContext] Fetch error, relying on cache/static fallback:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Load localStorage cache first for zero-flash render
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBanks(parsed);
          setActiveBankId(parsed[0].id);
        }
      }
    } catch {}

    // 2. Fetch fresh data
    refreshSoundboard();
  }, [refreshSoundboard]);

  const openAssignModal = useCallback((audioUrl: string, clipTitle: string, dropId?: number | null) => {
    setAssignModalState({
      open: true,
      audioUrl,
      clipTitle,
      dropId: dropId ?? null,
    });
  }, []);

  const closeAssignModal = useCallback(() => {
    setAssignModalState(null);
  }, []);

  const assignClipToPad = useCallback(
    async (
      padId: number,
      audioUrl: string,
      dropId?: number | null,
      newLabel?: string
    ): Promise<{ success: boolean; bankName?: string; padPosition?: number; error?: string }> => {
      // Find the pad and its bank
      let targetBank: SoundboardBankItem | undefined;
      let targetPad: SoundboardPadItem | undefined;

      for (const b of banks) {
        const found = (b.pads || []).find((p) => p.id === padId);
        if (found) {
          targetBank = b;
          targetPad = found;
          break;
        }
      }

      if (!targetBank || !targetPad) {
        return { success: false, error: "Target pad not found" };
      }

      const previousBanks = banks;
      const updatedLabel = newLabel?.trim() ? newLabel.trim() : targetPad.label;

      // Optimistically update banks
      const optimisticBanks = banks.map((b) => ({
        ...b,
        pads: b.pads.map((p) =>
          p.id === padId
            ? { ...p, audio_url: audioUrl, drop_id: dropId ?? null, label: updatedLabel }
            : p
        ),
      }));
      setBanks(optimisticBanks);

      try {
        const res = await fetch(`/api/admin/radio/soundboard/pads/${padId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_url: audioUrl,
            drop_id: dropId ?? null,
            label: updatedLabel,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const confirmedBanks = optimisticBanks.map((b) => ({
          ...b,
          pads: b.pads.map((p) => (p.id === padId && data.pad ? data.pad : p)),
        }));
        setBanks(confirmedBanks);

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(confirmedBanks));
        } catch {}

        showToast(`Assigned to ${targetBank.name} · Pad #${targetPad.position || 1}`, "success");
        return {
          success: true,
          bankName: targetBank.name,
          padPosition: targetPad.position,
        };
      } catch (err: any) {
        // Rollback
        setBanks(previousBanks);
        showToast(err.message || "Failed to assign clip to pad", "error");
        return { success: false, error: err.message };
      }
    },
    [banks, showToast]
  );

  return (
    <SoundboardContext.Provider
      value={{
        banks,
        setBanks,
        activeBankId,
        setActiveBankId,
        vaultDrops,
        loading,
        refreshSoundboard,
        assignModalState,
        openAssignModal,
        closeAssignModal,
        assignClipToPad,
        toastMsg,
        showToast,
      }}
    >
      {children}
    </SoundboardContext.Provider>
  );
}

export function useSoundboard() {
  const ctx = useContext(SoundboardContext);
  if (!ctx) {
    throw new Error("useSoundboard must be used within a SoundboardProvider");
  }
  return ctx;
}
