// @ts-nocheck
import React, { useState } from 'react';
import { Modal, Button, EmptyState, Badge } from './ui';
import { NotificationItem } from '../types';
import { Bell, Package, MessageSquare, CheckCheck, Trash2 } from 'lucide-react';

export interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearNotifications
}) => {
  const [filterType, setFilterType] = useState<'all' | 'stock' | 'whatsapp'>('all');

  const filtered = notifications.filter((item) => {
    if (filterType === 'stock') return item.type === 'stock';
    if (filterType === 'whatsapp') return item.type === 'whatsapp';
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="الإشعارات والسجلات"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearNotifications}
            icon={<Trash2 className="w-4 h-4 text-rose-600" />}
          >
            مسح الكل
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onMarkAllAsRead}
            icon={<CheckCheck className="w-4 h-4 text-emerald-600" />}
          >
            تحديد الكل كُمقروء
          </Button>
        </div>
      }
    >
      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 mb-4 p-1.5 bg-slate-100 border border-[#DEDEDA] rounded-xl">
        <button
          onClick={() => setFilterType('all')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
            filterType === 'all'
              ? 'bg-white text-[#111111] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          الكل ({notifications.length})
        </button>
        <button
          onClick={() => setFilterType('stock')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
            filterType === 'stock'
              ? 'bg-white text-[#111111] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          تنبيهات المخزون ({notifications.filter((n) => n.type === 'stock').length})
        </button>
        <button
          onClick={() => setFilterType('whatsapp')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
            filterType === 'whatsapp'
              ? 'bg-white text-[#111111] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          رسائل واتساب ({notifications.filter((n) => n.type === 'whatsapp').length})
        </button>
      </div>

      {/* Notifications List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="لا توجد إشعارات حالياً"
          description="جميع تنبيهات المخزون ورسائل واتساب ستظهر في هذه القائمة."
        />
      ) : (
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border transition-all ${
                item.type === 'stock'
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              } ${!item.read ? 'border-r-4 border-r-amber-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-2 rounded-lg bg-white border border-slate-200 shadow-xs shrink-0">
                    {item.type === 'stock' ? (
                      <Package className="w-4 h-4 text-amber-600" />
                    ) : (
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      {item.title}
                      {!item.read && <Badge variant="amber">جديد</Badge>}
                    </h5>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.message}</p>
                    <span className="text-[10px] text-slate-500 block mt-2">{item.date}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
