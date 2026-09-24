"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Flame, ArrowLeft, Play, Pause, SkipForward, Volume2, VolumeX } from "lucide-react";

interface RadioSet {
  id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  cover_url: string;
  duration: string;
  genre: string;
}

export default function RadioPage() {
  const [sets, setSets] = useState<RadioSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/hub/radio")
      .then(res => res.json())
      .then(data => {
        setSets(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const currentSet = sets[currentSetIndex];

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextTrack = () => {
    if (sets.length === 0) return;
    const nextIdx = (currentSetIndex + 1) % sets.length;
    setCurrentSetIndex(nextIdx);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = sets[nextIdx].audio_url;
      audioRef.current.load();
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const newTime = (Number(e.target.value) / 100) * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      setProgress(Number(e.target.value));
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-navy font-sans">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px, 48px 48px', backgroundPosition: '0 0, 12px 12px' }}></div>
      
      <div className="relative z-10 max-w-4xl mx-auto space-y-8">
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-sm)">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="font-display text-2xl tracking-wide uppercase">GOODLIFE RADIO</span>
          </div>
          <Flame className="w-6 h-6 text-brand-accent hidden md:block" strokeWidth={2.5} />
        </header>

        {loading ? (
          <div className="h-64 flex items-center justify-center font-mono uppercase tracking-widest animate-pulse">
            Tuning in...
          </div>
        ) : sets.length === 0 ? (
          <div className="h-64 flex items-center justify-center font-mono uppercase tracking-widest text-brand-navy/60">
            No live sets available currently.
          </div>
        ) : (
          <div className="flex flex-col gap-8 md:flex-row items-center md:items-start md:mt-12">
            
            {/* Player Artwork */}
            <div className="w-full md:w-1/2 aspect-square border-4 border-brand-navy shadow-(--shadow-brut-2xl) bg-brand-navy p-4 relative overflow-hidden flex items-center justify-center">
              {currentSet.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentSet.cover_url} alt="Cover" className={`w-full h-full object-cover transition-transform duration-[10000ms] ${isPlaying ? 'scale-110' : 'scale-100'}`} />
              ) : (
                <div className={`w-3/4 h-3/4 rounded-full border-8 border-brand-navy/50 border-t-brand-accent transition-all duration-1000 ${isPlaying ? 'animate-spin' : ''}`}></div>
              )}
              
              <div className="absolute top-4 left-4 bg-brand-accent text-brand-navy font-bold text-[10px] px-2 py-1 uppercase tracking-widest border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                ON AIR
              </div>
            </div>

            {/* Controls */}
            <div className="w-full md:w-1/2 flex flex-col space-y-6">
              <div>
                <h2 className="font-display text-4xl uppercase tracking-wider mb-1 leading-none">{currentSet.title}</h2>
                <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy/70">
                  BY {currentSet.dj_name}
                </p>
                <div className="mt-3 flex gap-2">
                  <span className="px-2 py-1 border-2 border-brand-navy bg-brand-off-white text-[10px] font-bold uppercase tracking-widest">{currentSet.genre}</span>
                  <span className="px-2 py-1 border-2 border-brand-navy bg-brand-off-white text-[10px] font-bold uppercase tracking-widest">{currentSet.duration}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full space-y-2 pt-4">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={progress || 0} 
                  onChange={handleSeek}
                  className="w-full h-4 bg-brand-off-white border-2 border-brand-navy appearance-none cursor-pointer accent-brand-accent"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-4 pt-4">
                <button 
                  onClick={togglePlay}
                  className="w-16 h-16 border-4 border-brand-navy bg-brand-accent flex items-center justify-center shadow-(--shadow-brut-md) hover:bg-brand-off-white hover:translate-x-1 hover:translate-y-1 transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-brand-navy" /> : <Play className="w-8 h-8 fill-brand-navy ml-1" />}
                </button>
                <button 
                  onClick={nextTrack}
                  className="w-12 h-12 border-4 border-brand-navy bg-brand-off-white flex items-center justify-center shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors cursor-pointer"
                >
                  <SkipForward className="w-5 h-5 fill-brand-navy" />
                </button>
                <div className="flex-1"></div>
                <button 
                  onClick={toggleMute}
                  className="p-3 border-2 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xs) hover:bg-brand-accent transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>

            </div>
          </div>
        )}

        <audio 
          ref={audioRef}
          src={currentSet?.audio_url}
          onTimeUpdate={handleTimeUpdate}
          onEnded={nextTrack}
          autoPlay={false}
        />
      </div>
    </div>
  );
}
