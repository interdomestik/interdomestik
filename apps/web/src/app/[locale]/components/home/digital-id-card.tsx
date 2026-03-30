'use client';

import { CreditCard, QrCode, Shield, Wifi } from 'lucide-react';
import React, { useRef, useState } from 'react';

interface DigitalIDCardProps {
  name?: string;
  memberNumber?: string;
  validThru?: string;
  isActive?: boolean;
  labels?: {
    membership: string;
    claimSupport: string;
    legalProtection: string;
    assistance247: string;
    memberName: string;
    validThru: string;
    activeMember: string;
    protectionPaused: string;
    addToAppleWallet: string;
    googlePayReady: string;
  };
}

export function DigitalIDCard({
  name = 'ESTIR RAMA',
  memberNumber = 'PRT-0492-X',
  validThru = '12/25',
  isActive = true,
  labels = {
    membership: 'Membership',
    claimSupport: 'Claims support',
    legalProtection: 'Legal protection',
    assistance247: '24/7 assistance',
    memberName: 'Member Name',
    validThru: 'Valid Thru',
    activeMember: 'Active Member',
    protectionPaused: 'Protection Paused',
    addToAppleWallet: 'Add to Apple Wallet',
    googlePayReady: 'Google Pay Ready',
  },
}: DigitalIDCardProps) {
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
    <div className="flex flex-col items-center gap-8">
      <div className="relative group perspective-2000">
        <div
          className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_52%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.12),transparent_55%)] opacity-80 blur-3xl transition-opacity duration-700 group-hover:opacity-100"
          style={{
            transform: `translate3d(${rotate.y * 2}px, ${rotate.x * 2}px, 0)`,
          }}
        />

        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
            transition: rotate.x === 0 ? 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          }}
          className="relative flex aspect-[1.58/1] w-full max-w-[460px] select-none flex-col justify-between overflow-hidden rounded-[2rem] border border-white/20 bg-[#0b1220] p-8 shadow-[0_40px_90px_-30px_rgba(15,23,42,0.65)] ring-1 ring-white/10"
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjAwIDIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZUZpbHRlciI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2VGaWx0ZXIpIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] opacity-[0.1] mix-blend-overlay pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.02)_28%,rgba(29,78,216,0.16)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(29,78,216,0.20),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-[1px] rounded-[calc(2rem-1px)] border border-white/8" />

          <div className="flex justify-between items-start relative z-10">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Shield className="h-10 w-10 text-white/90" strokeWidth={1.5} />
              </div>
              <div>
                <span className="block text-white font-black text-2xl tracking-tighter leading-none italic uppercase">
                  ASISTENCA
                </span>
                <span className="text-[10px] text-white/40 font-bold tracking-[0.3em] uppercase block mt-1">
                  {labels.membership}
                </span>
              </div>
            </div>
            <div className="relative flex h-9 w-12 items-center justify-center overflow-hidden rounded-lg border border-[#d9c079]/30 bg-gradient-to-br from-[#f4e3a4] via-[#ead287] to-[#d0aa4c] opacity-95 shadow-md">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(0,0,0,0.1)_1px,rgba(0,0,0,0.1)_2px)] mix-blend-overlay" />
              <div className="w-8 h-[1px] bg-black/20 absolute top-1/2 -translate-y-1/2" />
              <div className="h-6 w-[1px] bg-black/20 absolute left-1/2 -translate-x-1/2" />
              <Wifi className="h-6 w-6 text-black/20 rotate-90 absolute right-1" />
            </div>
          </div>

          <div className="flex items-center gap-6 relative z-10 ml-1">
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#60a5fa] shadow-[0_0_6px_rgba(96,165,250,0.85)]" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                {labels.claimSupport}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                {labels.legalProtection}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-[9px] text-slate-300 font-medium tracking-wide uppercase">
                {labels.assistance247}
              </span>
            </div>
          </div>

          <div className="relative z-10 flex justify-between items-end">
            <div className="min-w-0 flex-1">
              <p className="text-white/40 text-[9px] font-mono mb-1 tracking-widest uppercase truncate">
                {labels.memberName}
              </p>
              <p className="text-lg text-white font-medium tracking-wider drop-shadow-md font-mono truncate uppercase">
                {name}
              </p>
            </div>
            <div className="text-right ml-4">
              <p className="text-white/40 text-[9px] font-mono mb-1 tracking-widest uppercase">
                {labels.validThru}
              </p>
              <p className="text-lg text-white font-medium tracking-widest drop-shadow-md font-mono">
                {validThru}
              </p>
            </div>
          </div>

          <div className="absolute top-0 -inset-full h-full w-2/3 z-20 block transform -skew-x-[45deg] bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-shine-slow pointer-events-none" />
        </div>

        <div className="absolute -right-6 -bottom-6 z-30 flex items-center gap-3 rounded-full border border-white/80 bg-white/92 px-6 py-3 shadow-[0_22px_44px_rgba(15,23,42,0.16)] transition-transform duration-700 ease-out group-hover:-translate-y-2 lg:-right-10">
          <div
            className={`h-3 w-3 rounded-full animate-pulse ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
          <span className="text-xs text-slate-900 font-bold uppercase tracking-wider">
            {isActive ? labels.activeMember : labels.protectionPaused}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 animate-fade-in delay-700">
        <button
          type="button"
          className="group/wallet flex cursor-pointer items-center gap-3 rounded-2xl bg-[#111827] px-5 py-3 text-xs font-black text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] ring-1 ring-white/10 transition-all active:scale-95"
        >
          <CreditCard className="h-4 w-4 text-white/70 group-hover/wallet:text-white transition-colors" />
          <span>{labels.addToAppleWallet}</span>
        </button>
        <button
          type="button"
          className="group/wallet flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-xs font-black text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-white active:scale-95"
        >
          <QrCode className="h-4 w-4 text-slate-400 transition-colors group-hover/wallet:text-[#1d4ed8]" />
          <span>{labels.googlePayReady}</span>
        </button>
      </div>
    </div>
  );
}
