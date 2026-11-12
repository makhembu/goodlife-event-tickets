"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Radio, ZoomIn, ZoomOut, RotateCcw, Users, Globe2, Compass } from "lucide-react";
import type { ListenerAnalytics, ListenerMapCluster } from "@/lib/radio/listener-analytics";

interface SvgCounty {
  name: string;
  code: number;
  d: string;
  cx: number;
  cy: number;
}

interface SvgCountyData {
  viewBox: string;
  counties: SvgCounty[];
}

interface KenyaListenerMapProps {
  onSelectCounty?: (countyName: string, listenerCount: number, cities: string[]) => void;
  className?: string;
}

export function KenyaListenerMap({ onSelectCounty, className = "" }: KenyaListenerMapProps) {
  const [svgData, setSvgData] = useState<SvgCountyData | null>(null);
  const [analytics, setAnalytics] = useState<ListenerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCountyCode, setSelectedCountyCode] = useState<string | null>(null);
  const [hoveredCounty, setHoveredCounty] = useState<{ name: string; count: number; cities: string[] } | null>(null);

  // Pan & Zoom Transform State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Load SVG boundaries once
  useEffect(() => {
    fetch("/kenya_counties_svg.json")
      .then((res) => res.json())
      .then((data: SvgCountyData) => setSvgData(data))
      .catch((err) => console.warn("[KenyaListenerMap] Failed to load SVG geo data:", err));
  }, []);

  // Poll active listener telemetry
  useEffect(() => {
    let isMounted = true;
    const fetchRadar = async () => {
      try {
        const res = await fetch("/api/radio/radar");
        if (res.ok) {
          const data: ListenerAnalytics = await res.json();
          if (isMounted) {
            setAnalytics(data);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.warn("[KenyaListenerMap] Radar fetch error:", err);
      }
    };

    fetchRadar();
    const interval = setInterval(fetchRadar, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Map cluster dictionary by zero-padded code (e.g. "047")
  const clusterByCode = useMemo(() => {
    const map = new Map<string, ListenerMapCluster>();
    if (!analytics?.clusters) return map;
    for (const c of analytics.clusters) {
      map.set(c.countyCode, c);
    }
    return map;
  }, [analytics?.clusters]);

  // Pan / Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(3.5, z * 1.25));
  const handleZoomOut = () => setZoom((z) => Math.max(0.8, z / 1.25));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedCountyCode(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((z) => Math.min(3.5, Math.max(0.8, z * delta)));
  };

  const totalKenya = analytics?.kenyaListeners ?? 0;
  const totalDiaspora = analytics?.diasporaListeners ?? 0;
  const activeCountiesCount = analytics?.activeCounties?.length ?? 0;

  return (
    <div className={`relative flex flex-col rounded-2xl border border-neutral-800 bg-[#0A0A0A] overflow-hidden shadow-2xl ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3 bg-neutral-900/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#DFBB7D] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#DFBB7D]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-[#DFBB7D] uppercase font-mono">
                Live Listener Radar
              </span>
              <span className="rounded bg-neutral-800/90 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
                47 Counties
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-mono">
            <Users className="h-3.5 w-3.5 text-[#DFBB7D]" />
            <span className="font-bold text-white">{totalKenya}</span> KE
            <span className="text-neutral-600">|</span>
            <Globe2 className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-bold text-white">{totalDiaspora}</span> World
          </div>

          {/* Zoom & Reset Controls */}
          <div className="flex items-center gap-1 bg-neutral-950/80 p-0.5 rounded-lg border border-neutral-800">
            <button
              onClick={handleZoomIn}
              className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
              title="Zoom In"
              type="button"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
              title="Zoom Out"
              type="button"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleReset}
              className="p-1 text-neutral-400 hover:text-[#DFBB7D] hover:bg-neutral-800 rounded transition-colors"
              title="Reset View"
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main SVG Radar Canvas */}
      <div
        ref={svgContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`relative h-[340px] w-full select-none cursor-grab active:cursor-grabbing bg-gradient-to-b from-[#0A0A0A] via-[#0E0E0E] to-[#0A0A0A] overflow-hidden ${
          isDragging ? "cursor-grabbing" : ""
        }`}
      >
        {/* Radar Scanning Grid Sweep Overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#DFBB7D_1px,transparent_1px)] [background-size:18px_18px]" />

        {svgData ? (
          <svg
            viewBox={svgData.viewBox || "0 0 600 700"}
            className="h-full w-full transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            <defs>
              <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Render 47 County Vector Polygons */}
            {svgData.counties.map((county) => {
              const code = String(county.code).padStart(3, "0");
              const cluster = clusterByCode.get(code);
              const hasListeners = Boolean(cluster && cluster.count > 0);
              const isSelected = selectedCountyCode === code;

              return (
                <path
                  key={county.code}
                  d={county.d}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCountyCode(code);
                    if (onSelectCounty) {
                      onSelectCounty(county.name, cluster?.count ?? 0, cluster?.cities ?? []);
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredCounty({
                      name: county.name,
                      count: cluster?.count ?? 0,
                      cities: cluster?.cities ?? [],
                    });
                  }}
                  onMouseLeave={() => setHoveredCounty(null)}
                  className={`transition-all duration-200 cursor-pointer stroke-[1.2] ${
                    isSelected
                      ? "fill-[#DFBB7D]/40 stroke-[#DFBB7D] stroke-[2]"
                      : hasListeners
                      ? "fill-[#DFBB7D]/20 hover:fill-[#DFBB7D]/35 stroke-[#DFBB7D]/70"
                      : "fill-[#141414] hover:fill-[#1E1E1E] stroke-[#282828]"
                  }`}
                />
              );
            })}

            {/* Render Animated Sonic Ripple Rings at Native County Centroids (cx, cy) */}
            {svgData.counties.map((county) => {
              const code = String(county.code).padStart(3, "0");
              const cluster = clusterByCode.get(code);
              if (!cluster || cluster.count <= 0) return null;

              const count = cluster.count;
              const radius = Math.min(22, Math.max(6, 4 + count * 2));

              return (
                <g key={`ripple-${code}`} pointerEvents="none">
                  {/* Outer pulse */}
                  <circle
                    cx={county.cx}
                    cy={county.cy}
                    r={radius * 1.6}
                    className="fill-[#DFBB7D]/10 stroke-[#DFBB7D]/40 stroke-[0.8] animate-ping"
                    style={{ transformOrigin: `${county.cx}px ${county.cy}px` }}
                  />
                  {/* Mid glow */}
                  <circle
                    cx={county.cx}
                    cy={county.cy}
                    r={radius}
                    className="fill-[#DFBB7D]/30 stroke-[#DFBB7D] stroke-[1.5]"
                    filter="url(#radar-glow)"
                  />
                  {/* Core hot point */}
                  <circle cx={county.cx} cy={county.cy} r={2.8} className="fill-white" />
                  {/* Listener count badge */}
                  {count > 1 && (
                    <text
                      x={county.cx}
                      y={county.cy - radius - 2}
                      textAnchor="middle"
                      className="fill-[#DFBB7D] text-[9px] font-black font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    >
                      {count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500 font-mono">
            <Compass className="h-5 w-5 animate-spin mr-2 text-[#DFBB7D]" />
            Initializing Kenya 47-County Vector Mesh...
          </div>
        )}

        {/* Hover / Selection Badge Tooltip */}
        {hoveredCounty && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-[#DFBB7D]/40 bg-black/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <span>{hoveredCounty.name}</span>
              <span className="rounded bg-[#DFBB7D]/20 px-1 py-0.2 text-[10px] font-mono text-[#DFBB7D]">
                {hoveredCounty.count} {hoveredCounty.count === 1 ? "listener" : "listeners"}
              </span>
            </div>
            {hoveredCounty.cities.length > 0 && (
              <div className="text-[10px] text-neutral-400 max-w-[200px] truncate">
                Active in: {hoveredCounty.cities.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Ticker: Active Counties & International Diaspora */}
      <div className="border-t border-neutral-800/80 bg-neutral-950/80 px-3.5 py-2 text-[11px] text-neutral-400">
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-neutral-300 font-mono">ON AIR:</span>
            {activeCountiesCount > 0 ? (
              <span className="truncate text-neutral-300">
                {analytics?.activeCounties.slice(0, 4).join(", ")}
                {activeCountiesCount > 4 && ` +${activeCountiesCount - 4} more`}
              </span>
            ) : (
              <span className="text-neutral-500 italic">Awaiting pulse...</span>
            )}
          </div>

          {/* Diaspora Ticker */}
          {analytics?.diaspora && analytics.diaspora.length > 0 && (
            <div className="flex items-center gap-1 text-sky-400 shrink-0 font-mono text-[10px]">
              <Globe2 className="h-3 w-3" />
              <span>
                Diaspora: {analytics.diaspora.map((d) => `${d.count} in ${d.country}`).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default KenyaListenerMap;
