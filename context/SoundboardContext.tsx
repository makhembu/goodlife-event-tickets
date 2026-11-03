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
  createBank: (name: string) => Promise<boolean>;
  renameBank: (bankId: number, newName: string) => Promise<boolean>;
  deleteBank: (bankId: number) => Promise<boolean>;
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

  const createBank = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    try {
      const res = await fetch("/api/admin/radio/soundboard/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create bank");
      }

      const data = await res.json();
      if (data.bank) {
        const updated = [...banks, data.bank];
        setBanks(updated);
        setActiveBankId(data.bank.id);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
        } catch {}
        showToast(`Bank "${trimmed}" created!`, "success");
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || "Failed to create bank", "error");
      return false;
    }
  }, [banks, showToast]);

  const renameBank = useCallback(async (bankId: number, newName: string): Promise<boolean> => {
    const trimmed = newName.trim();
    if (!trimmed) return false;

    const previousBanks = banks;
    const optimisticBanks = banks.map((b) => (b.id === bankId ? { ...b, name: trimmed } : b));
    setBanks(optimisticBanks);

    try {
      const res = await fetch(`/api/admin/radio/soundboard/banks/${bankId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to rename bank");
      }

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(optimisticBanks));
      } catch {}
      showToast(`Bank renamed to "${trimmed}"`, "success");
      return true;
    } catch (err: any) {
      setBanks(previousBanks);
      showToast(err.message || "Failed to rename bank", "error");
      return false;
    }
  }, [banks, showToast]);

  const deleteBank = useCallback(async (bankId: number): Promise<boolean> => {
    if (banks.length <= 1) {
      showToast("Cannot delete the last remaining soundboard bank.", "error");
      return false;
    }

    const bankToDelete = banks.find((b) => b.id === bankId);
    if (!bankToDelete) return false;

    const padCount = bankToDelete.pads?.length || 0;
    const message = padCount > 0
      ? `Are you sure you want to delete bank "${bankToDelete.name}"? It contains ${padCount} pad(s) which will also be removed. Audio clips in Drops Vault are NOT deleted.`
      : `Are you sure you want to delete bank "${bankToDelete.name}"?`;

    if (!confirm(message)) return false;

    const previousBanks = banks;
    const optimisticBanks = banks.filter((b) => b.id !== bankId);
    setBanks(optimisticBanks);
    if (activeBankId === bankId && optimisticBanks.length > 0) {
      setActiveBankId(optimisticBanks[0].id);
    }

    try {
      const res = await fetch(`/api/admin/radio/soundboard/banks/${bankId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete bank");
      }

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(optimisticBanks));
      } catch {}
      showToast(`Bank "${bankToDelete.name}" deleted.`, "success");
      return true;
    } catch (err: any) {
      setBanks(previousBanks);
      showToast(err.message || "Failed to delete bank", "error");
      return false;
    }
  }, [banks, activeBankId, showToast]);

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
        createBank,
        renameBank,
        deleteBank,
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
