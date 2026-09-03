// @ts-nocheck
import React from 'react';
import {
  LayoutDashboard,
  Users,
  Scissors,
  Receipt,
  Package,
  BarChart3,
  WalletCards,
  Settings,
  DatabaseBackup,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { SahwaLogo } from './SahwaLogo';
import { ornamentPattern, CornerOrnament, DiamondDivider } from './Ornaments';

export interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenBackupModal: () => void;
  unreadNotifCount: number;
  managerName?: string;
}

export const navItems = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'orders', label: 'إدارة الطلبات', icon: Scissors },
  { id: 'customers', label: 'العملاء والمقاسات', icon: Users },
  { id: 'invoices', label: 'الفواتير والحسابات', icon: Receipt },
  { id: 'inventory', label: 'المخزون والأصناف', icon: Package },
  { id: 'accounting', label: 'المحاسبة والمشتريات', icon: WalletCards },
  { id: 'reports', label: 'التقارير والإحصائيات', icon: BarChart3 },
  { id: 'settings', label: 'الإعدادات', icon: Settings }
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onOpenBackupModal,
  managerName = 'حاتم محمد الدبعي'
}) => {
  return (
    <aside className="w-68 bg-[var(--ui-charcoal)] border-l border-white/5 flex flex-col justify-between shrink-0 h-full select-none no-print text-white shadow-[0_12px_35px_rgba(28,28,26,.14)] overflow-y-auto">
      <div className="flex flex-col">
        {/* Top Header Logo */}
        <div className="relative overflow-hidden">
          {/* Top ornamental brass band */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c9a35f] to-transparent" />

          {/* Faint Arabesque background pattern */}
          <div
            className="absolute inset-0 opacity-[0.12] pointer-events-none"
            style={{ backgroundImage: ornamentPattern, backgroundSize: '84px 84px' }}
          />

          {/* Ornamental frame corners */}
          <CornerOrnament className="absolute top-0 left-0 opacity-50 -scale-x-100" />
          <CornerOrnament className="absolute top-0 right-0 opacity-50" />

          <div className="relative z-10 px-5 pt-6 pb-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-[rgba(176,138,74,.4)] flex items-center justify-center p-2 shrink-0 shadow-[0_4px_16px_rgba(0,0,0,.3)]">
              <SahwaLogo className="w-full h-full text-[#d8bd86]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
                <span className="text-[#c9a35f] text-[9px] leading-none">◆</span>
                <span className="truncate">صهوة للخياطة</span>
                <span className="text-[#c9a35f] text-[9px] leading-none">◆</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 mt-1">
                <span className="h-px w-5 bg-gradient-to-l from-[#c9a35f] to-transparent shrink-0" />
                <span className="truncate">الخياطة الرجالية الراقية</span>
                <Sparkles className="w-3 h-3 text-amber-500/80 shrink-0" />
              </p>
              <p className="text-[9px] text-[#d8bd86]/80 font-bold mt-1 truncate" title={`إشراف ${managerName}`}>
                إشراف {managerName}
              </p>
            </div>
          </div>

          {/* Ornamental divider */}
          <DiamondDivider dark className="px-5 pb-4" />
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5 mt-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-[44px] px-4 py-2.5 flex items-center gap-3 text-xs font-bold transition-all duration-200 cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd86] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-charcoal)] ${
                  isActive
                    ? 'bg-[rgba(176,138,74,.13)] text-[#d8bd86] font-extrabold shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-4 border-t border-white/5 space-y-2.5 bg-[var(--ui-charcoal)]">
        {/* Offline Badge */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/5 border border-white/10 text-slate-300 text-[11px] rounded-xl">
          <span className="flex items-center gap-2 font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            نظام متصل (محلي)
          </span>
          <WifiOff className="w-3.5 h-3.5 text-slate-500" />
        </div>

        {/* Backup Modal Trigger */}
        <button
          type="button"
          onClick={onOpenBackupModal}
          aria-label="فتح النسخ الاحتياطي للاستيراد أو التصدير"
          className="w-full min-h-[40px] px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold transition-all duration-200 cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd86] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-charcoal)]"
        >
          <DatabaseBackup className="w-4 h-4 text-slate-400" />
          <span>نسخة احتياطية (استيراد/تصدير)</span>
        </button>
      </div>
    </aside>
  );
};
