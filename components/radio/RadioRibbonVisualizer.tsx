"use client";

import React, { useEffect, useRef } from "react";

interface RadioRibbonVisualizerProps {
  isPlaying: boolean;
  isMuted?: boolean;
  volume?: number;
  isDropPlaying?: boolean;
  getAudioElement?: () => HTMLAudioElement | null;
}

type AudioCaptureElement = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * Fluid luminous soundwave visualizer rendered directly on the dark deck card
 * in Goodlife sand-gold and vivid gold with ambient studio underglow.
 * Uses a read-only captureStream() -> Web Audio AnalyserNode when supported
 * so bass/mid/high ribbons react to real audio without muting cross-origin streams.
 */
export default function RadioRibbonVisualizer({
  isPlaying,
  isMuted = false,
  volume = 1,
  isDropPlaying = false,
  getAudioElement,
}: RadioRibbonVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ isPlaying, isMuted, volume, isDropPlaying, getAudioElement });
  stateRef.current = { isPlaying, isMuted, volume, isDropPlaying, getAudioElement };

  const analyserRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    bins: Uint8Array<ArrayBuffer>;
    sourceEl: HTMLAudioElement | null;
    sourceNode: MediaStreamAudioSourceNode | null;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    let phase = 0;
    let smoothBass = 1.0;
    let smoothMid = 1.0;

    const ensureAnalyser = () => {
      const el = stateRef.current.getAudioElement?.() as AudioCaptureElement | null;
      if (!el) return null;
      const capFn = el.captureStream || el.mozCaptureStream;
      if (typeof capFn !== "function") return null;

      try {
        if (!analyserRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioCtx) return null;
          const audioCtx = new AudioCtx();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          analyserRef.current = {
            ctx: audioCtx,
            analyser,
            bins: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
            sourceEl: null,
            sourceNode: null,
          };
        }

        const state = analyserRef.current;
        if (state.ctx.state === "suspended") {
          state.ctx.resume().catch(() => {});
        }
        if (state.sourceEl !== el) {
          if (state.sourceNode) {
            try {
              state.sourceNode.disconnect();
            } catch {}
          }
          const stream = capFn.call(el);
          if (stream && stream.getAudioTracks().length > 0) {
            const node = state.ctx.createMediaStreamSource(stream);
            node.connect(state.analyser);
            state.sourceNode = node;
            state.sourceEl = el;
          }
        }
        return state.sourceNode ? state : null;
      } catch {
        return null;
      }
    };

    const render = () => {
      const { isPlaying: playing, isMuted: muted, volume: vol, isDropPlaying: drop } =
        stateRef.current;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 300;
      const cssH = canvas.clientHeight || 48;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      const active = playing && !muted;
      let targetBass = active ? Math.max(0.7, Math.min(1.4, vol * (drop ? 1.3 : 1))) : 0.85;
      let targetMid = active ? targetBass : 0.85;

      if (active) {
        const analyserState = ensureAnalyser();
        if (analyserState) {
          analyserState.analyser.getByteFrequencyData(analyserState.bins);
          const bins = analyserState.bins;
          const avgRange = (start: number, end: number) => {
            let sum = 0;
            const len = Math.max(1, end - start);
            for (let i = start; i < end && i < bins.length; i++) sum += bins[i];
            return sum / (len * 255);
          };
          const liveBass = avgRange(0, 5);
          const liveMid = avgRange(5, 14);
          if (liveBass + liveMid > 0.01) {
            targetBass = 0.65 + liveBass * 1.5;
            targetMid = 0.60 + liveMid * 1.4;
          }
        }
      }

      smoothBass += (targetBass - smoothBass) * 0.15;
      smoothMid += (targetMid - smoothMid) * 0.15;

      if (!prefersReducedMotion) {
        phase += active ? 0.045 + smoothBass * 0.035 : 0.022;
      }

      const midY = cssH / 2;
      const cycles = 1.8;
      const freq = cycles * 2 * Math.PI;
      const baseAmp = 18;

      // 1. Secondary Charcoal / Deep Shadow Wave (intertwines in opposite phase)
      ctx.beginPath();
      for (let x = 0; x <= cssW; x += 2) {
        const t = x / cssW;
        const envelope = Math.pow(Math.sin(t * Math.PI), 1.15);
        const y = midY + Math.sin(t * freq - phase + Math.PI) * (baseAmp * smoothMid) * envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#080A0F";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // 2. Glowing Amber Fill Under Gold Sine Wave
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x <= cssW; x += 2) {
        const t = x / cssW;
        const envelope = Math.pow(Math.sin(t * Math.PI), 1.15);
        const y = midY + Math.sin(t * freq - phase) * (baseAmp * smoothBass) * envelope;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cssW, midY);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, midY - baseAmp * 1.2, 0, midY + baseAmp * 1.2);
      grad.addColorStop(0, "rgba(245, 200, 66, 0.36)");
      grad.addColorStop(0.5, "rgba(223, 187, 125, 0.18)");
      grad.addColorStop(1, "rgba(245, 200, 66, 0.0)");
      ctx.fillStyle = grad;
      ctx.fill();

      // 3. Primary Luminous Golden Wave with Radiant Studio Bloom
      ctx.save();
      ctx.shadowColor = "rgba(245, 200, 66, 0.85)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let x = 0; x <= cssW; x += 2) {
        const t = x / cssW;
        const envelope = Math.pow(Math.sin(t * Math.PI), 1.15);
        const y = midY + Math.sin(t * freq - phase) * (baseAmp * smoothBass) * envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#F5C842";
      ctx.lineWidth = 2.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      // 4. Subtle inner champagne highlight line
      ctx.beginPath();
      for (let x = 0; x <= cssW; x += 3) {
        const t = x / cssW;
        const envelope = Math.pow(Math.sin(t * Math.PI), 1.15);
        const y = midY + Math.sin(t * freq - phase) * (baseAmp * smoothBass) * envelope - 0.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255, 245, 200, 0.75)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, isMuted, volume, isDropPlaying]);

  return (
    <div className="mt-2 py-0.5 h-12 flex items-center" aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-11 block" />
    </div>
  );
}
