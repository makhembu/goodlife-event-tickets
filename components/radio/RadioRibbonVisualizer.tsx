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
    let smoothBass = 0.14;
    let smoothMid = 0.14;
    let smoothHigh = 0.14;

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

    const drawRibbon = (
      w: number,
      h: number,
      freq: number,
      ampScale: number,
      phaseOffset: number,
      color: string,
      lineWidth: number,
      fillAlpha: number
    ) => {
      const mid = h / 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const t = x / w;
        const envelope = Math.pow(Math.sin(t * Math.PI), 1.3);
        const y = mid + Math.sin(t * freq - phase + phaseOffset) * ampScale * envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();

      if (fillAlpha > 0) {
        ctx.lineTo(w, mid);
        ctx.lineTo(0, mid);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = fillAlpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    const render = () => {
      const { isPlaying: playing, isMuted: muted, volume: vol, isDropPlaying: drop } =
        stateRef.current;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 300;
      const cssH = canvas.clientHeight || 40;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      const active = playing && !muted;
      let targetBass = active ? Math.max(0.45, Math.min(1.25, vol * (drop ? 1.25 : 1))) : 0.38;
      let targetMid = active ? targetBass : 0.44;
      let targetHigh = active ? targetBass : 0.34;

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
          const liveHigh = avgRange(14, 26);
          if (liveBass + liveMid + liveHigh > 0.01) {
            targetBass = 0.35 + liveBass * 1.45;
            targetMid = 0.30 + liveMid * 1.55;
            targetHigh = 0.25 + liveHigh * 1.65;
          }
        }
      }

      smoothBass += (targetBass - smoothBass) * 0.22;
      smoothMid += (targetMid - smoothMid) * 0.22;
      smoothHigh += (targetHigh - smoothHigh) * 0.22;

      if (!prefersReducedMotion) {
        phase += active ? 0.055 + smoothBass * 0.075 : 0.022;
      }

      // 1. Dark intertwining wave (creates dimensional depth from mockup)
      drawRibbon(cssW, cssH, 5, 10 * smoothBass, 0.3, "#282D38", 2.2, 0);

      // 2. Ambient golden studio luminescence for dark deck integration
      ctx.shadowColor = "rgba(245, 200, 66, 0.65)";
      ctx.shadowBlur = 8;

      // 3. Fluid champagne & vivid gold glowing waves
      drawRibbon(cssW, cssH, 8, 12 * smoothMid, 1.3, "#DFBB7D", 1.8, 0.16);
      drawRibbon(cssW, cssH, 11, 14 * smoothHigh, 2.1, "#F5C842", 2.4, 0.24);

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
    <div className="mt-2 py-0.5 h-11 flex items-center" aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-10 block" />
    </div>
  );
}
