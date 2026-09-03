// @ts-nocheck
import React from 'react';
import { Bell, Printer, PlusCircle } from 'lucide-react';
import { Button } from './ui';
import { SahwaLogo } from './SahwaLogo';
import { ornamentPattern, CornerOrnament } from './Ornaments';

export interface HeaderProps {
  title: string;
  description: string;
  unreadNotifCount: number;
  onOpenNotifications: () => void;
  onQuickAction?: () => void;
  quickActionLabel?: string;
  onPrintScreen?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  description,
  unreadNotifCount,
  onOpenNotifications,
  onQuickAction,
  quickActionLabel,
  onPrintScreen
}) => {
  return (
    <header className="relative no-print h-[76px] shrink-0 bg-[var(--ui-surface)] border-b border-[var(--ui-border)] shadow-[0_3px_16px_rgba(28,28,26,.05)] overflow-hidden">
      {/* Top ornamental brass band */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--ui-brass-soft)] via-[#c9a35f] to-[var(--ui-brass-soft)]" />

      {/* Faint Arabesque background pattern */}
      <div
        className="absolute inset-0 opacity-[0.16] pointer-events-none"
        style={{ backgroundImage: ornamentPattern, backgroundSize: '84px 84px' }}
      />

      {/* Ornamental frame corners */}
      <CornerOrnament className="absolute bottom-[-6px] right-5 opacity-60" />
      <CornerOrnament className="absolute bottom-[-6px] left-5 opacity-60 -scale-x-100" />

      <div className="relative z-10 h-full px-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[var(--ui-brass-soft)] border border-[#e2d2ae] flex items-center justify-center p-2 shrink-0 shadow-inner">
            <SahwaLogo className="w-full h-full" color="#8f6d38" />
          </div>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-[var(--ui-charcoal)] tracking-tight flex items-center gap-2">
              <span className="text-[var(--ui-brass)] text-[10px] leading-none">◆</span>
              <span className="truncate">{title}</span>
              <span className="text-[var(--ui-brass)] text-[10px] leading-none">◆</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="hidden sm:block h-px w-6 bg-gradient-to-l from-[var(--ui-brass)] to-transparent shrink-0" />
              <p className="text-[10px] sm:text-[11px] text-[var(--ui-muted)] font-semibold truncate">{description}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
        {/* Quick Action Button if applicable */}
        {onQuickAction && quickActionLabel && (
          <Button
            variant="primary"
            size="sm"
            onClick={onQuickAction}
            icon={<PlusCircle className="w-4 h-4 text-white" />}
          >
            {quickActionLabel}
          </Button>
        )}

        {/* Quick Print Page Button */}
        {onPrintScreen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPrintScreen}
            icon={<Printer className="w-4 h-4 text-slate-600" />}
          >
            طباعة
          </Button>
        )}

        {/* Notifications Bell Button */}
        <button
          onClick={onOpenNotifications}
          className="relative w-10 h-10 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
          title="الإشعارات والتنبيهات"
          aria-label={`الإشعارات والتنبيهات${unreadNotifCount > 0 ? `، ${unreadNotifCount} غير مقروءة` : ''}`}
          aria-haspopup="dialog"
        >
          <Bell className="w-4.5 h-4.5" />
          {unreadNotifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center">
              {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
            </span>
          )}
        </button>
      </div>
      </div>
    </header>
  );
};
