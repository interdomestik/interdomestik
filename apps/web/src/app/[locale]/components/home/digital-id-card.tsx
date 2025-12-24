'use client';

import { CreditCard, QrCode, Shield, Wifi } from 'lucide-react';
import React, { useRef, useState } from 'react';

export function DigitalIDCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 15;
    const rotateY = (centerX - x) / 15;
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="relative group perspective-2000">
        {/* Dynamic Aura Glow */}
        <div
          className="absolute -inset-10 bg-gradient-to-r from-primary/40 via-secondary/30 to-accent/40 rounded-[3rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
          style={{
            transform: `translate3d(${rotate.y * 3}px, ${rotate.x * 3}px, 0)`,
          }}
        />

        {/* The Card */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
            transition: rotate.x === 0 ? 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          }}
          className="relative w-full max-w-[460px] aspect-[1.58/1] rounded-[2rem] border border-white/10 bg-slate-950 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] p-8 flex flex-col justify-between select-none ring-1 ring-white/10"
        >
          {/* Noise Texture & Omni-Gradient */}
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800/50 via-slate-900/80 to-black pointer-events-none" />
          <div className="absolute -top-[100%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08),transparent_50%)] pointer-events-none" />

          {/* Top Row: Brand & Chip */}
          <div className="flex justify-between items-start relative z-10">
            <div className="flex items-center gap-4">
              {/* Minimalist Shield Logo */}
              <div className="relative">
                <Shield
                  className="h-10 w-10 text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <span className="block text-white font-black text-2xl tracking-tighter leading-none italic uppercase">
                  ASISTENCA
                </span>
                <span className="text-[10px] text-white/40 font-bold tracking-[0.3em] uppercase block mt-1">
                  Membership
                </span>
              </div>
            </div>
            {/* Realistic EMV Chip */}
            <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-amber-200 via-yellow-100 to-amber-300 shadow-md border border-yellow-500/20 relative overflow-hidden flex items-center justify-center opacity-90 grayscale-[0.2]">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(0,0,0,0.1)_1px,rgba(0,0,0,0.1)_2px)] mix-blend-overlay" />
              <div className="w-8 h-[1px] bg-black/20 absolute top-1/2 -translate-y-1/2" />
              <div className="h-6 w-[1px] bg-black/20 absolute left-1/2 -translate-x-1/2" />
              <Wifi className="h-6 w-6 text-black/20 rotate-90 absolute right-1" />
            </div>
          </div>

          {/* Middle Row: Professional Feature List */}
          <div className="flex items-center gap-6 relative z-10 ml-1">
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                Dëmshpërblim
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                Mbrojtje Ligjore
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                Asistencë 24/7
              </span>
            </div>
          </div>

          {/* Bottom Row: Holder & ID (Credit Card Style) */}
          <div className="relative z-10 flex justify-between items-end">
            <div>
              <p className="text-white/40 text-[9px] font-mono mb-1 tracking-widest uppercase">
                Member Name
              </p>
              <p className="text-lg text-white font-medium tracking-wider drop-shadow-md font-mono">
                ESTIR RAMA
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[9px] font-mono mb-1 tracking-widest uppercase">
                Valid Thru
              </p>
              <p className="text-lg text-white font-medium tracking-widest drop-shadow-md font-mono">
                12/25
              </p>
            </div>
          </div>

          {/* Dynamic Light Sweep */}
          <div className="absolute top-0 -inset-full h-full w-2/3 z-20 block transform -skew-x-[45deg] bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-shine-slow pointer-events-none" />
        </div>

        {/* Floating Verification Badge (Cleaner) */}
        <div className="absolute -bottom-6 -right-6 lg:-right-10 bg-white rounded-full px-6 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-slate-100 z-30 transform group-hover:-translate-y-2 transition-transform duration-700 ease-out flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-900 font-bold uppercase tracking-wider">
            Active Member
          </span>
        </div>
      </div>

      {/* Modern Ecosystem Badges */}
      <div className="flex flex-wrap items-center justify-center gap-8 animate-fade-in delay-700 mt-4">
        <div className="group/wallet flex items-center gap-3 px-5 py-3 bg-black text-white rounded-2xl font-black text-xs ring-1 ring-white/20 hover:ring-white/50 transition-all cursor-pointer shadow-lg active:scale-95">
          <CreditCard className="h-4 w-4 text-white/70 group-hover/wallet:text-white transition-colors" />
          <span>Add to Apple Wallet</span>
        </div>
        <div className="group/wallet flex items-center gap-3 px-5 py-3 bg-slate-50 text-slate-900 rounded-2xl font-black text-xs border border-slate-200 hover:bg-white hover:shadow-xl transition-all cursor-pointer active:scale-95">
          <QrCode className="h-4 w-4 text-slate-400 group-hover/wallet:text-primary transition-colors" />
          <span>Google Pay Ready</span>
        </div>
      </div>
    </div>
  );
}
