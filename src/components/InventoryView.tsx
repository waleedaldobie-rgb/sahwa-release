// @ts-nocheck
import React, { useState } from 'react';
import { FabricItem, AccessoryItem, ThobeType, ColorItem, StockMovement, InventoryItemType } from '../types';
import { createSafeId } from '../domain/idGenerator';
import { Card, Button, Input, Select, Modal, Badge, EmptyState, SortHeader, SortDirection, SegmentedControl } from './ui';
import { ConfirmModal } from './ConfirmModal';
import {
  Package,
  Search,
  Layers,
  Plus,
  Palette,
  Scissors,
  Database,
  ClipboardList,
  Edit2,
  Trash2
} from 'lucide-react';

export interface InventoryViewProps {
  fabrics: FabricItem[];
  accessories: AccessoryItem[];
  thobeTypes: ThobeType[];
  colors: ColorItem[];
  onSaveFabric: (fabric: FabricItem) => void;
  onDeleteFabric: (id: string) => void;
  onSaveAccessory: (accessory: AccessoryItem) => void;
  onDeleteAccessory: (id: string) => void;
  onSaveThobeType: (thobeType: ThobeType) => void;
  onDeleteThobeType: (id: string) => void;
  onSaveColor: (color: ColorItem) => void;
  onDeleteColor: (id: string) => void;
  stockMovements?: StockMovement[];
  onAdjustStock?: (itemType: InventoryItemType, itemId: string, quantity: number, reason: string, direction: 'adjustment' | 'return') => Promise<void> | void;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  fabrics,
  accessories,
  thobeTypes,
  colors,
  onSaveFabric,
  onDeleteFabric,
  onSaveAccessory,
  onDeleteAccessory,
  onSaveThobeType,
  onDeleteThobeType,
  onSaveColor,
  onDeleteColor,
  stockMovements = [],
  onAdjustStock,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'fabrics' | 'accessories' | 'models' | 'movements'>('fabrics');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [fabricSort, setFabricSort] = useState<{ key: 'name' | 'color' | 'sellingPrice' | 'quantityMeters'; direction: SortDirection }>({ key: 'name', direction: 'asc' });
  const [accessorySort, setAccessorySort] = useState<{ key: 'name' | 'category' | 'quantity'; direction: SortDirection }>({ key: 'name', direction: 'asc' });
  const [movementSort, setMovementSort] = useState<{ key: 'createdAt' | 'itemName' | 'quantity' | 'quantityAfter'; direction: SortDirection }>({ key: 'createdAt', direction: 'desc' });
  const [movementType, setMovementType] = useState<InventoryItemType>('fabric');
  const [movementItemId, setMovementItemId] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementDirection, setMovementDirection] = useState<'adjustment' | 'return'>('adjustment');
  const [movementReason, setMovementReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'fabric' | 'accessory' | 'thobeType' | 'color'; id: string; name: string } | null>(null);

  // Fabric Modal State
  const [isFabricModalOpen, setIsFabricModalOpen] = useState(false);
  const [fabricForm, setFabricForm] = useState<FabricItem>({
    id: '',
    name: '',
    color: 'أبيض نص لمعة',
    purchasePrice: 40,
    sellingPrice: 100,
    quantityMeters: 50,
    minStockMeters: 20
  });

  // Accessory Modal State
  const [isAccessoryModalOpen, setIsAccessoryModalOpen] = useState(false);
  const [accessoryForm, setAccessoryForm] = useState<AccessoryItem>({
    id: '',
    name: '',
    category: 'أزرار',
    quantity: 10,
    minStock: 5,
    unit: 'حبة',
    purchasePrice: 0,
    sellingPrice: 0
  });

  // Thobe Type Modal State
  const [isThobeTypeModalOpen, setIsThobeTypeModalOpen] = useState(false);
  const [thobeTypeForm, setThobeTypeForm] = useState<ThobeType>({
    id: '',
    name: '',
    defaultPrice: 220,
    description: ''
  });

  // Color Modal State
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [colorForm, setColorForm] = useState<ColorItem>({
    id: '',
    name: '',
    hex: '#ffffff'
  });

  // HANDLERS
  const handleOpenAddFabric = () => {
    setFabricForm({ id: '', name: '', color: 'أبيض نص لمعة', purchasePrice: 40, sellingPrice: 110, quantityMeters: 50, minStockMeters: 20 });
    setIsFabricModalOpen(true);
  };

  const handleOpenEditFabric = (f: FabricItem) => {
    setFabricForm({ ...f });
    setIsFabricModalOpen(true);
  };

  const handleSaveFabricSubmit = () => {
    if (!fabricForm.name.trim()) {
      showToast('يرجى أدخال اسم القماش', 'danger');
      return;
    }
    onSaveFabric({ ...fabricForm, id: fabricForm.id || createSafeId('FAB') });
    showToast('تم حفظ القماش بنجاح', 'success');
    setIsFabricModalOpen(false);
  };

  const handleOpenAddAccessory = () => {
    setAccessoryForm({ id: '', name: '', category: 'أزرار', quantity: 50, minStock: 10, unit: 'حبة', purchasePrice: 0, sellingPrice: 0 });
    setIsAccessoryModalOpen(true);
  };

  const handleOpenEditAccessory = (acc: AccessoryItem) => {
    setAccessoryForm({ ...acc });
    setIsAccessoryModalOpen(true);
  };

  const handleOpenAddThobeType = () => {
    setThobeTypeForm({ id: '', name: '', defaultPrice: 220, description: '' });
    setIsThobeTypeModalOpen(true);
  };

  const handleOpenEditThobeType = (t: ThobeType) => {
    setThobeTypeForm({ ...t });
    setIsThobeTypeModalOpen(true);
  };

  const handleOpenAddColor = () => {
    setColorForm({ id: '', name: '', hex: '#ffffff' });
    setIsColorModalOpen(true);
  };

  const handleOpenEditColor = (c: ColorItem) => {
    setColorForm({ ...c });
    setIsColorModalOpen(true);
  };

  const handleSaveAccessorySubmit = () => {
    if (!accessoryForm.name.trim()) {
      showToast('يرجى كتابة اسم الصنف', 'danger');
      return;
    }
    onSaveAccessory({ ...accessoryForm, id: accessoryForm.id || createSafeId('ACC') });
    showToast('تم حفظ صنف الإكسسوار بنجاح', 'success');
    setIsAccessoryModalOpen(false);
  };

  const handleSaveThobeTypeSubmit = () => {
    if (!thobeTypeForm.name.trim()) {
      showToast('يرجى كتابة اسم الموديل', 'danger');
      return;
    }
    onSaveThobeType({ ...thobeTypeForm, id: thobeTypeForm.id || createSafeId('THB') });
    showToast('تم حفظ موديل الثوب بنجاح', 'success');
    setIsThobeTypeModalOpen(false);
  };

  const handleSaveColorSubmit = () => {
    if (!colorForm.name.trim()) return;
    onSaveColor({ ...colorForm, id: colorForm.id || createSafeId('COL') });
    showToast('تم حفظ اللون بنجاح', 'success');
    setIsColorModalOpen(false);
  };

  const handleAdjustStockSubmit = async () => {
    const quantity = Number(movementQuantity);
    if (!movementItemId || !movementReason.trim() || !Number.isFinite(quantity) || quantity === 0) {
      showToast('اختر الصنف وأدخل كمية وسبباً صحيحاً للتسوية', 'danger');
      return;
    }
    if (!onAdjustStock) return;
    await onAdjustStock(movementType, movementItemId, quantity, movementReason, movementDirection);
    setMovementQuantity('');
    setMovementReason('');
    showToast('تم تسجيل حركة التسوية بنجاح', 'success');
  };

  const movementItems = movementType === 'fabric' ? fabrics : accessories;
  const toggleFabricSort = (key: typeof fabricSort.key) => {
    setFabricSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };
  const toggleAccessorySort = (key: typeof accessorySort.key) => {
    setAccessorySort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };
  const toggleMovementSort = (key: typeof movementSort.key) => {
    setMovementSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };
  const sortedFabrics = [...fabrics].sort((a, b) => {
    let comparison = fabricSort.key === 'name' ? a.name.localeCompare(b.name, 'ar') : fabricSort.key === 'color' ? a.color.localeCompare(b.color, 'ar') : fabricSort.key === 'sellingPrice' ? a.sellingPrice - b.sellingPrice : a.quantityMeters - b.quantityMeters;
    if (comparison === 0) comparison = a.id.localeCompare(b.id);
    return fabricSort.direction === 'asc' ? comparison : -comparison;
  });
  const sortedAccessories = [...accessories].sort((a, b) => {
    let comparison = accessorySort.key === 'name' ? a.name.localeCompare(b.name, 'ar') : accessorySort.key === 'category' ? a.category.localeCompare(b.category, 'ar') : a.quantity - b.quantity;
    if (comparison === 0) comparison = a.id.localeCompare(b.id);
    return accessorySort.direction === 'asc' ? comparison : -comparison;
  });
  const sortedMovements = [...stockMovements].sort((a, b) => {
    let comparison = movementSort.key === 'createdAt' ? a.createdAt.localeCompare(b.createdAt) : movementSort.key === 'itemName' ? a.itemName.localeCompare(b.itemName, 'ar') : movementSort.key === 'quantity' ? a.quantity - b.quantity : a.quantityAfter - b.quantityAfter;
    if (comparison === 0) comparison = a.id.localeCompare(b.id);
    return movementSort.direction === 'asc' ? comparison : -comparison;
  });

  const normalizedInventorySearch = inventorySearch.trim().toLocaleLowerCase('ar');
  const matchesInventoryStatus = (quantity: number, minimum: number) => {
    if (inventoryStatusFilter === 'out') return quantity <= 0;
    if (inventoryStatusFilter === 'low') return quantity > 0 && quantity <= minimum;
    if (inventoryStatusFilter === 'available') return quantity > minimum;
    return true;
  };
  const hasActiveInventoryFilters = Boolean(inventorySearch.trim()) || inventoryStatusFilter !== 'all';
  const visibleFabrics = sortedFabrics.filter((fabric) => {
    const matchesSearch = !normalizedInventorySearch || `${fabric.name} ${fabric.color}`.toLocaleLowerCase('ar').includes(normalizedInventorySearch);
    return matchesSearch && matchesInventoryStatus(fabric.quantityMeters, fabric.minStockMeters);
  });
  const visibleAccessories = sortedAccessories.filter((accessory) => {
    const matchesSearch = !normalizedInventorySearch || `${accessory.name} ${accessory.category}`.toLocaleLowerCase('ar').includes(normalizedInventorySearch);
    return matchesSearch && matchesInventoryStatus(accessory.quantity, accessory.minStock);
  });

  return (
    <div className="view-wrapper animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="page-header">
          <h2 className="page-title flex items-center gap-3">
            <Database className="w-7 h-7 text-[#111111]" />
            المخزون والأصناف
          </h2>
          <p className="page-subtitle">إدارة الأقمشة، الإكسسوارات، وموديلات الثياب</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'fabrics' && (
            <Button variant="primary" onClick={handleOpenAddFabric} icon={<Plus className="w-4 h-4" />} size="lg">
              إضافة قماش جديد
            </Button>
          )}
          {activeTab === 'accessories' && (
            <Button variant="primary" onClick={handleOpenAddAccessory} icon={<Plus className="w-4 h-4" />} size="lg">
              إضافة إكسسوار
            </Button>
          )}
        </div>
      </div>

          <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-xl w-fit" role="tablist" aria-label="أقسام المخزون">
        {[
          { id: 'fabrics', label: 'الأقمشة', icon: <Layers className="w-4 h-4" /> },
          { id: 'accessories', label: 'الإكسسوارات', icon: <Package className="w-4 h-4" /> },
          { id: 'models', label: 'الموديلات والألوان', icon: <Scissors className="w-4 h-4" /> },
          { id: 'movements', label: 'حركة المخزون', icon: <Database className="w-4 h-4" /> }
        ].map((tab) => (
            <button
            type="button"
            role="tab"
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            aria-selected={activeTab === tab.id}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`px-6 py-2.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b08a4a] focus-visible:ring-offset-2 ${
              activeTab === tab.id ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === 'fabrics' || activeTab === 'accessories') && (
        <Card className="inventory-filter-card">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
            <div className="w-full xl:max-w-xl">
              <Input
                label="بحث في المخزون"
                placeholder={activeTab === 'fabrics' ? 'ابحث باسم القماش أو اللون...' : 'ابحث باسم الإكسسوار أو الفئة...'}
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
                icon={<Search className="w-4 h-4" aria-hidden="true" />}
                aria-label="البحث في المخزون"
              />
            </div>
            <SegmentedControl
              value={inventoryStatusFilter}
              onChange={setInventoryStatusFilter}
              ariaLabel="تصفية حالة المخزون"
              options={[
                { value: 'all', label: 'الكل' },
                { value: 'available', label: 'متوفر' },
                { value: 'low', label: 'منخفض' },
                { value: 'out', label: 'نفد' }
              ]}
            />
          </div>
          <p className="inventory-filter-meta" aria-live="polite">
            {activeTab === 'fabrics' ? `عرض ${visibleFabrics.length} من أصل ${fabrics.length} قماش` : `عرض ${visibleAccessories.length} من أصل ${accessories.length} إكسسوار`}
          </p>
        </Card>
      )}

      {activeTab === 'fabrics' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th aria-sort={fabricSort.key === 'name' ? fabricSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="اسم القماش" active={fabricSort.key === 'name'} direction={fabricSort.direction} onClick={() => toggleFabricSort('name')} /></th>
                  <th aria-sort={fabricSort.key === 'color' ? fabricSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="اللون" active={fabricSort.key === 'color'} direction={fabricSort.direction} onClick={() => toggleFabricSort('color')} /></th>
                  <th className="text-center" aria-sort={fabricSort.key === 'sellingPrice' ? fabricSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="سعر البيع" active={fabricSort.key === 'sellingPrice'} direction={fabricSort.direction} onClick={() => toggleFabricSort('sellingPrice')} align="center" /></th>
                  <th className="text-center">سعر الشراء</th>
                  <th className="text-center" aria-sort={fabricSort.key === 'quantityMeters' ? fabricSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="المخزون" active={fabricSort.key === 'quantityMeters'} direction={fabricSort.direction} onClick={() => toggleFabricSort('quantityMeters')} align="center" /></th>
                  <th>الحالة</th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
                <tbody>
                {visibleFabrics.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState compact icon={<Layers className="w-7 h-7" />} title={fabrics.length === 0 ? 'لا توجد أقمشة بعد' : 'لا توجد أقمشة مطابقة'} description={fabrics.length === 0 ? 'أضف أول قماش لتبدأ متابعة الأسعار والكميات وحالة المخزون.' : 'غيّر البحث أو حالة المخزون لعرض أصناف أخرى.'} action={fabrics.length === 0 ? <Button size="sm" variant="primary" onClick={handleOpenAddFabric} icon={<Plus className="w-4 h-4" />}>إضافة قماش</Button> : hasActiveInventoryFilters ? <Button size="sm" variant="secondary" onClick={() => { setInventorySearch(''); setInventoryStatusFilter('all'); }}>مسح البحث والفلاتر</Button> : undefined} className="my-4" /></td></tr>
                ) : visibleFabrics.map((fab) => {
                  const isOutOfStock = fab.quantityMeters <= 0;
                  const isLowStock = !isOutOfStock && fab.quantityMeters <= fab.minStockMeters;
                  return (
                    <tr key={fab.id}>
                      <td title={fab.name} className="font-black text-[#111111]">{fab.name}</td>
                      <td title={fab.color} className="font-bold text-[#4B5563]">{fab.color}</td>
                      <td className="text-center font-black text-emerald-600 font-mono">{fab.sellingPrice} ر.س</td>
                      <td className="text-center font-black text-[var(--color-text-muted-token)] font-mono">{fab.purchasePrice} ر.س</td>
                      <td className="text-center font-black font-mono">
                        <span className={isLowStock ? 'text-rose-600' : 'text-[#111111]'}>{fab.quantityMeters} متر</span>
                      </td>
                        <td>
                          <Badge variant={isOutOfStock ? 'red' : isLowStock ? 'amber' : 'emerald'}>
                            {isOutOfStock ? 'نفد المخزون' : isLowStock ? 'مخزون منخفض' : 'متوفر'}
                          </Badge>
                        </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleOpenEditFabric(fab)}>تعديل</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: 'fabric', id: fab.id, name: fab.name })} className="text-rose-600 hover:bg-rose-50">حذف</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'accessories' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th aria-sort={accessorySort.key === 'name' ? accessorySort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="اسم الإكسسوار" active={accessorySort.key === 'name'} direction={accessorySort.direction} onClick={() => toggleAccessorySort('name')} /></th>
                  <th aria-sort={accessorySort.key === 'category' ? accessorySort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="الفئة" active={accessorySort.key === 'category'} direction={accessorySort.direction} onClick={() => toggleAccessorySort('category')} /></th>
                  <th className="text-center" aria-sort={accessorySort.key === 'quantity' ? accessorySort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="الكمية" active={accessorySort.key === 'quantity'} direction={accessorySort.direction} onClick={() => toggleAccessorySort('quantity')} align="center" /></th>
                  <th className="text-center">سعر الشراء</th>
                  <th>الحالة</th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
                <tbody>
                {visibleAccessories.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState compact icon={<Package className="w-7 h-7" />} title={accessories.length === 0 ? 'لا توجد إكسسوارات بعد' : 'لا توجد إكسسوارات مطابقة'} description={accessories.length === 0 ? 'أضف أول إكسسوار لتسجيل الكميات والحد الأدنى للمخزون.' : 'غيّر البحث أو حالة المخزون لعرض أصناف أخرى.'} action={accessories.length === 0 ? <Button size="sm" variant="primary" onClick={handleOpenAddAccessory} icon={<Plus className="w-4 h-4" />}>إضافة إكسسوار</Button> : hasActiveInventoryFilters ? <Button size="sm" variant="secondary" onClick={() => { setInventorySearch(''); setInventoryStatusFilter('all'); }}>مسح البحث والفلاتر</Button> : undefined} className="my-4" /></td></tr>
                ) : visibleAccessories.map((acc) => {
                  const isOutOfStock = acc.quantity <= 0;
                  const isLowStock = !isOutOfStock && acc.quantity <= acc.minStock;
                  return (
                    <tr key={acc.id}>
                      <td title={acc.name} className="font-black text-[#111111]">{acc.name}</td>
                      <td title={acc.category} className="font-bold text-[#4B5563]">{acc.category}</td>
                      <td className="text-center font-black font-mono">
                        <span className={isOutOfStock || isLowStock ? 'text-rose-600' : 'text-[#111111]'}>{acc.quantity} {acc.unit}</span>
                      </td>
                      <td className="text-center font-black text-[var(--color-text-muted-token)] font-mono">{typeof acc.purchasePrice === 'number' ? `${acc.purchasePrice} ر.س` : '—'}</td>
                      <td>
                          <Badge variant={isOutOfStock ? 'red' : isLowStock ? 'amber' : 'emerald'}>
                            {isOutOfStock ? 'نفد المخزون' : isLowStock ? 'كمية منخفضة' : 'متوفر'}
                          </Badge>
                        </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleOpenEditAccessory(acc)}>تعديل</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: 'accessory', id: acc.id, name: acc.name })} className="text-rose-600 hover:bg-rose-50">حذف</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'models' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card title="موديلات الثياب" headerIcon={<Scissors className="w-5 h-5" />}>
             <div className="space-y-4">
                {thobeTypes.length === 0 && <EmptyState compact icon={<Scissors className="w-7 h-7" />} title="لا توجد موديلات بعد" description="أضف موديل الثوب الأول لتظهر خياراته في الطلبات." className="my-0" />}
                {thobeTypes.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                    <div className="flex-1">
                      <div title={t.name} className="font-black text-[#111111]">{t.name}</div>
                      <div title={t.description || 'لا يوجد وصف'} className="text-[10px] text-[#6B7280] font-bold">{t.description || 'لا يوجد وصف'}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-black font-mono text-emerald-600">{t.defaultPrice} ر.س</div>
                      <div className="flex gap-1">
                        <button type="button" title={`تعديل موديل ${t.name}`} aria-label={`تعديل موديل ${t.name}`} onClick={() => handleOpenEditThobeType(t)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button type="button" title={`حذف موديل ${t.name}`} aria-label={`حذف موديل ${t.name}`} onClick={() => setDeleteTarget({ type: 'thobeType', id: t.id, name: t.name })} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline-dark" className="w-full border-dashed" onClick={handleOpenAddThobeType}>+ إضافة موديل جديد</Button>
             </div>
          </Card>

          <Card title="الألوان المتاحة" headerIcon={<Palette className="w-5 h-5" />}>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {colors.length === 0 && <div className="sm:col-span-2"><EmptyState compact icon={<Palette className="w-7 h-7" />} title="لا توجد ألوان بعد" description="أضف لونًا لتسهيل اختيار القماش في الطلبات." className="my-0" /></div>}
                {colors.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full border border-[#E5E7EB] shadow-sm" style={{ backgroundColor: c.hex }}></div>
                      <span title={c.name} className="text-xs font-black text-[#111111]">{c.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" title={`تعديل لون ${c.name}`} aria-label={`تعديل لون ${c.name}`} onClick={() => handleOpenEditColor(c)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button type="button" title={`حذف لون ${c.name}`} aria-label={`حذف لون ${c.name}`} onClick={() => setDeleteTarget({ type: 'color', id: c.id, name: c.name })} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  aria-label="إضافة لون جديد"
                  onClick={handleOpenAddColor}
                  className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-dashed border-[#E5E7EB] rounded-xl text-xs font-black text-[#6B7280] hover:border-[#111111] hover:text-[#111111] transition-all"
                >
                  + إضافة لون
                </button>
             </div>
          </Card>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="space-y-6">
          <Card title="تسوية مخزون مصرح بها" subtitle="تستخدم للزيادة أو النقص بعد التحقق الفعلي من الكمية" headerIcon={<Database className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <Select label="نوع الصنف" value={movementType} onChange={(e) => { setMovementType(e.target.value as InventoryItemType); setMovementItemId(''); }}><option value="fabric">قماش</option><option value="accessory">مستلزم / إكسسوار</option></Select>
              <Select label="الصنف" value={movementItemId} onChange={(e) => setMovementItemId(e.target.value)}><option value="">اختر الصنف</option>{movementItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
              <Input label="الكمية" type="number" step="0.01" value={movementQuantity} onChange={(e) => setMovementQuantity(e.target.value)} placeholder="النقص بالسالب" />
              <Select label="نوع الحركة" value={movementDirection} onChange={(e) => setMovementDirection(e.target.value as 'adjustment' | 'return')}><option value="adjustment">تسوية زيادة / نقص</option><option value="return">إرجاع</option></Select>
              <div className="flex gap-2"><Input label="السبب" value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="جرد فعلي" /><Button type="button" className="h-12" onClick={handleAdjustStockSubmit}>حفظ</Button></div>
            </div>
          </Card>
          <Card title="سجل حركة كل صنف" subtitle="شراء، صرف للطلبات، إرجاع وتسويات مع الرصيد قبل وبعد الحركة" headerIcon={<ClipboardList className="w-5 h-5" />}>
            <div className="overflow-x-auto"><table className="premium-table"><caption className="sr-only">سجل حركة المخزون</caption><thead><tr><th aria-sort={movementSort.key === 'createdAt' ? movementSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="التاريخ والوقت" active={movementSort.key === 'createdAt'} direction={movementSort.direction} onClick={() => toggleMovementSort('createdAt')} /></th><th aria-sort={movementSort.key === 'itemName' ? movementSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="الصنف" active={movementSort.key === 'itemName'} direction={movementSort.direction} onClick={() => toggleMovementSort('itemName')} /></th><th>الحركة</th><th aria-sort={movementSort.key === 'quantity' ? movementSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="الكمية" active={movementSort.key === 'quantity'} direction={movementSort.direction} onClick={() => toggleMovementSort('quantity')} align="center" /></th><th>قبل</th><th aria-sort={movementSort.key === 'quantityAfter' ? movementSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="بعد" active={movementSort.key === 'quantityAfter'} direction={movementSort.direction} onClick={() => toggleMovementSort('quantityAfter')} align="center" /></th><th>السبب</th><th>المرجع</th></tr></thead><tbody>{stockMovements.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-slate-400 font-bold"><div className="space-y-2"><ClipboardList className="w-8 h-8 mx-auto text-slate-300" /><p>لا توجد حركات مخزون بعد</p><p className="text-xs font-medium">ستظهر هنا عمليات الشراء والصرف والإرجاع والتسوية.</p></div></td></tr> : sortedMovements.map((movement) => <tr key={movement.id}><td className="text-xs font-bold">{new Date(movement.createdAt).toLocaleString('ar-SA')}</td><td title={movement.itemName} className="font-black">{movement.itemName}</td><td><Badge variant={movement.direction === 'purchase' || movement.direction === 'return' ? 'emerald' : movement.direction === 'sale' ? 'red' : 'slate'}>{movement.direction === 'purchase' ? 'شراء' : movement.direction === 'sale' ? 'صرف طلب' : movement.direction === 'return' ? 'إرجاع' : 'تسوية'}</Badge></td><td className="font-black">{movement.quantity} {movement.unit}</td><td>{movement.quantityBefore}</td><td className="font-black">{movement.quantityAfter}</td><td title={movement.reason}>{movement.reason}</td><td title={movement.referenceNumber || movement.referenceId || undefined} className="text-xs">{movement.referenceNumber || movement.referenceId || '—'}</td></tr>)}</tbody></table></div>
          </Card>
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            if (deleteTarget.type === 'fabric') onDeleteFabric(deleteTarget.id);
            else if (deleteTarget.type === 'accessory') onDeleteAccessory(deleteTarget.id);
            else if (deleteTarget.type === 'thobeType') onDeleteThobeType(deleteTarget.id);
            else if (deleteTarget.type === 'color') onDeleteColor(deleteTarget.id);
            setDeleteTarget(null);
            showToast('تم الحذف بنجاح', 'success');
          }
        }}
        title="تأكيد الحذف"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟`}
      />
      
      <Modal isOpen={isFabricModalOpen} onClose={() => setIsFabricModalOpen(false)} title={fabricForm.id ? 'تعديل قماش' : 'إضافة قماش جديد'}>
        <div className="space-y-4">
          <Input label="اسم القماش *" value={fabricForm.name} onChange={e => setFabricForm({...fabricForm, name: e.target.value})} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="اللون" value={fabricForm.color} onChange={e => setFabricForm({...fabricForm, color: e.target.value})} />
            <Input label="سعر الشراء (ر.س)" type="number" min="0" step="0.01" value={fabricForm.purchasePrice} onChange={e => setFabricForm({...fabricForm, purchasePrice: Number(e.target.value)})} />
            <Input label="سعر البيع (ر.س)" type="number" min="0" step="0.01" value={fabricForm.sellingPrice} onChange={e => setFabricForm({...fabricForm, sellingPrice: Number(e.target.value)})} />
            <Input label="المخزون الحالي (متر)" type="number" min="0" value={fabricForm.quantityMeters} onChange={e => setFabricForm({...fabricForm, quantityMeters: Number(e.target.value)})} />
            <Input label="حد التنبيه (متر)" type="number" min="0" value={fabricForm.minStockMeters} onChange={e => setFabricForm({...fabricForm, minStockMeters: Number(e.target.value)})} />
          </div>
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[#F3F4F6]"><Button variant="ghost" onClick={() => setIsFabricModalOpen(false)}>إلغاء</Button><Button variant="primary" onClick={handleSaveFabricSubmit}>حفظ البيانات</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isAccessoryModalOpen} onClose={() => setIsAccessoryModalOpen(false)} title={accessoryForm.id ? 'تعديل إكسسوار' : 'إضافة إكسسوار جديد'}>
        <div className="space-y-4">
          <Input label="اسم الصنف *" value={accessoryForm.name} onChange={e => setAccessoryForm({...accessoryForm, name: e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="الفئة" value={accessoryForm.category} onChange={e => setAccessoryForm({...accessoryForm, category: e.target.value as any})}>
              <option value="أزرار">أزرار</option>
              <option value="خيوط">خيوط</option>
              <option value="إكسسوارات أخرى">إكسسوارات أخرى</option>
            </Select>
            <Input label="الوحدة" value={accessoryForm.unit} onChange={e => setAccessoryForm({...accessoryForm, unit: e.target.value})} />
            <Input label="الكمية الحالية" type="number" min="0" value={accessoryForm.quantity} onChange={e => setAccessoryForm({...accessoryForm, quantity: Number(e.target.value)})} />
            <Input label="حد التنبيه" type="number" min="0" value={accessoryForm.minStock} onChange={e => setAccessoryForm({...accessoryForm, minStock: Number(e.target.value)})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="سعر الشراء (ر.س)" type="number" min="0" step="0.01" value={accessoryForm.purchasePrice || 0} onChange={e => setAccessoryForm({...accessoryForm, purchasePrice: Number(e.target.value)})} />
            <Input label="سعر البيع (ر.س)" type="number" min="0" step="0.01" value={accessoryForm.sellingPrice || 0} onChange={e => setAccessoryForm({...accessoryForm, sellingPrice: Number(e.target.value)})} />
          </div>
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[#F3F4F6]"><Button variant="ghost" onClick={() => setIsAccessoryModalOpen(false)}>إلغاء</Button><Button variant="primary" onClick={handleSaveAccessorySubmit}>حفظ الإكسسوار</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isThobeTypeModalOpen} onClose={() => setIsThobeTypeModalOpen(false)} title={thobeTypeForm.id ? "تعديل موديل ثوب" : "إضافة موديل ثوب جديد"}>
        <div className="space-y-4">
          <Input label="اسم الموديل *" value={thobeTypeForm.name} onChange={e => setThobeTypeForm({...thobeTypeForm, name: e.target.value})} />
          <Input label="السعر الافتراضي (ر.س)" type="number" value={thobeTypeForm.defaultPrice} onChange={e => setThobeTypeForm({...thobeTypeForm, defaultPrice: Number(e.target.value)})} />
          <Input label="الوصف" value={thobeTypeForm.description || ''} onChange={e => setThobeTypeForm({...thobeTypeForm, description: e.target.value})} />
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[#F3F4F6]"><Button variant="ghost" onClick={() => setIsThobeTypeModalOpen(false)}>إلغاء</Button><Button variant="primary" onClick={handleSaveThobeTypeSubmit}>{thobeTypeForm.id ? 'حفظ التغييرات' : 'إضافة الموديل'}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isColorModalOpen} onClose={() => setIsColorModalOpen(false)} title={colorForm.id ? "تعديل لون" : "إضافة لون جديد"}>
        <div className="space-y-4">
          <Input label="اسم اللون *" value={colorForm.name} onChange={e => setColorForm({...colorForm, name: e.target.value})} />
          <Input label="كود اللون (Hex)" value={colorForm.hex} onChange={e => setColorForm({...colorForm, hex: e.target.value})} />
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[#F3F4F6]"><Button variant="ghost" onClick={() => setIsColorModalOpen(false)}>إلغاء</Button><Button variant="primary" onClick={handleSaveColorSubmit}>{colorForm.id ? 'حفظ التغييرات' : 'إضافة اللون'}</Button></div>
        </div>
      </Modal>
    </div>
  );
};
