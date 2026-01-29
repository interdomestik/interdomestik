'use client';

import { ShieldCheck } from 'lucide-react';
import React, { useRef, useState } from 'react';

/**
 * AgentVerifiedID - Phase A (UI-only)
 * A compact "Verified Agent" authority badge.
 * Uses created_at timestamp to display "Aktiv që nga".
 */

interface AgentVerifiedIDProps {
  name: string;
  agentId: string;
  createdAt: string | Date;
}

export function AgentVerifiedID({ name, agentId, createdAt }: AgentVerifiedIDProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const formattedDate = new Date(createdAt).toLocaleDateString('sq-AL', {
    month: 'long',
    year: 'numeric',
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div className="relative group perspective-1000" data-testid="agent-verified-id">
      {/* Subtle Aura Glow */}
      <div
        className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-slate-400/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
        style={{
          transform: `translate3d(${rotate.y * 2}px, ${rotate.x * 2}px, 0)`,
        }}
      />

      {/* The Mini Card */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          transition: rotate.x === 0 ? 'transform 0.6s ease-out' : 'none',
        }}
        className="relative w-64 h-36 rounded-2xl border border-white/10 bg-slate-950 overflow-hidden shadow-2xl p-4 flex flex-col justify-between select-none ring-1 ring-white/5"
      >
        {/* Matte Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800/40 to-black pointer-events-none" />

        {/* Header: Verified Stamp */}
        <div className="flex justify-between items-start relative z-10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">
              Agjent i verifikuar
            </span>
          </div>
        </div>

        {/* Content: Name & ID */}
        <div className="relative z-10">
          <h3 className="text-white font-bold text-sm tracking-tight truncate uppercase">{name}</h3>
          <p className="text-indigo-400/60 font-mono text-[10px] tracking-widest mt-0.5">
            ID: {agentId.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Bottom Detail */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
            <span className="text-[8px] text-slate-400 font-medium tracking-wide uppercase">
              Aktiv që nga: {formattedDate}
            </span>
          </div>
        </div>

        {/* Shine Sweep */}
        <div className="absolute top-0 -inset-full h-full w-1/2 z-20 block transform -skew-x-[45deg] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent group-hover:animate-shine-slow pointer-events-none" />
      </div>
    </div>
  );
}
