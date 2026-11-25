"use client";

import React, { useEffect, useRef } from "react";

interface RadioRibbonVisualizerProps {
  isPlaying: boolean;
  isMuted?: boolean;
  volume?: number;
  isDropPlaying?: boolean;
}

/**
 * Fluid 3-ribbon soundwave visualizer rendered directly on the cream card
 * surface (no dark box) in Goodlife sand-gold, vivid gold, and charcoal ink.
 */
export default function RadioRibbonVisualizer({
  isPlaying,
  isMuted = false,
  volume = 1,
  isDropPlaying = false,
}: RadioRibbonVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ isPlaying, isMuted, volume, isDropPlaying });
  stateRef.current = { isPlaying, isMuted, volume, isDropPlaying };

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
    let smoothPower = 0.14;

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
      const targetPower = active ? Math.max(0.35, Math.min(1.15, vol * (drop ? 1.15 : 1))) : 0.14;
      smoothPower += (targetPower - smoothPower) * 0.12;

      if (!prefersReducedMotion) {
        phase += active ? (drop ? 0.12 : 0.095) : 0.015;
      }

      drawRibbon(cssW, cssH, 9, 13 * smoothPower, 1.8, "#DFBB7D", 2, 0.18);
      drawRibbon(cssW, cssH, 13, 15 * smoothPower, 0.7, "#F5C842", 2.4, 0.22);
      drawRibbon(cssW, cssH, 7, 11 * smoothPower, 0, "#16181D", 2.6, 0);

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
