// @ts-nocheck
import React from 'react';

// Faint brass Arabesque lattice (eight-pointed star) used as a background ornament.
export const ornamentPattern = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'>
    <g fill='none' stroke='#b08a4a' stroke-width='0.7'>
      <path d='M42 18 L48.9 35.1 L66 42 L48.9 48.9 L42 66 L35.1 48.9 L18 42 L35.1 35.1 Z'/>
      <circle cx='42' cy='42' r='4'/>
      <path d='M0 0 L9 9 M84 0 L75 9 M0 84 L9 75 M84 84 L75 75'/>
    </g>
  </svg>`
)}")`;

// Very light cream Arabesque lattice for ivory/light backgrounds.
export const ornamentPatternSoft = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
    <g fill='none' stroke='#d9cdb4' stroke-width='0.8'>
      <path d='M48 20 L55.4 40.6 L76 48 L55.4 55.4 L48 76 L40.6 55.4 L20 48 L40.6 40.6 Z'/>
      <circle cx='48' cy='48' r='4.5'/>
      <path d='M0 0 L10 10 M96 0 L86 10 M0 96 L10 86 M96 96 L86 86'/>
    </g>
  </svg>`
)}")`;

// Elegant picture-frame corner ornament with a brass diamond.
export const CornerOrnament: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 80 80" className={`w-16 h-16 text-[var(--ui-brass)] ${className}`} fill="none" aria-hidden="true">
    <path d="M1 1 V 26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M1 1 H 26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M1 1 V 58" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 4" strokeLinecap="round" />
    <path d="M1 1 H 58" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 4" strokeLinecap="round" />
    <path d="M9 9 L 12.5 12.5 L 9 16 L 5.5 12.5 Z" fill="currentColor" />
  </svg>
);

// Ornamental diamond divider used between sections.
export const DiamondDivider: React.FC<{ className?: string; dark?: boolean }> = ({ className = '', dark = false }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <span
      className={`h-px flex-1 ${
        dark
          ? 'bg-gradient-to-l from-[rgba(176,138,74,.5)] to-transparent'
          : 'bg-gradient-to-l from-[rgba(176,138,74,.4)] to-transparent'
      }`}
    />
    <span className={`w-1.5 h-1.5 rotate-45 ${dark ? 'bg-[#c9a35f]/80' : 'bg-[#c9a35f]/70'}`} />
    <span
      className={`h-px flex-1 ${
        dark
          ? 'bg-gradient-to-r from-[rgba(176,138,74,.5)] to-transparent'
          : 'bg-gradient-to-r from-[rgba(176,138,74,.4)] to-transparent'
      }`}
    />
  </div>
);
