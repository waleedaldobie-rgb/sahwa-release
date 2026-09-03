import { AccessoryItem, ColorItem, FabricItem, InventoryItemType, ThobeType } from '../types';
import { validateEntity } from '../domain/validation';
import { AppSession } from './sessionTypes';

export function useInventoryController(session: AppSession) {
  const { data, showToast, executeCrud, loadAppData, persistData, refreshSlices, offerDeleteUndo, gateway } = session;

  const handleSaveFabric = async (fabric: FabricItem) => {
    const err = validateEntity('fabric', fabric);
    if (err) {
      showToast(err, 'danger');
      return;
    }

    await executeCrud('جاري حفظ بيانات القماش...', async () => {
      let alerts: string[] = [];
      if (gateway.createFabric && gateway.updateFabric) {
        const exists = data?.fabrics.some((f) => f.id === fabric.id);
        if (exists) {
          await gateway.updateFabric(fabric);
        } else {
          await gateway.createFabric(fabric);
        }
        alerts = await refreshSlices(['fabrics', 'notifications']);
      } else {
        if (!data) return;
        const exists = data.fabrics.some((f) => f.id === fabric.id);
        const updatedFabrics = exists
          ? data.fabrics.map((f) => (f.id === fabric.id ? fabric : f))
          : [fabric, ...data.fabrics];
        alerts = await persistData({ ...data, fabrics: updatedFabrics });
      }

      if (alerts && alerts.length > 0) {
        showToast(`تم حفظ القماش. ⚠️ ${alerts[0]}`, 'warning');
      } else {
        showToast('تم حفظ صنف القماش بنجاح', 'success');
      }
    });
  };

  const handleDeleteFabric = async (id: string) => {
    const beforeDelete = data ? JSON.parse(JSON.stringify(data)) as typeof data : null;
    await executeCrud('جاري حذف القماش من المخزون...', async () => {
      if (gateway.deleteFabric) {
        await gateway.deleteFabric(id);
        await refreshSlices(['fabrics', 'notifications']);
        showToast('تم حذف القماش بنجاح', 'success');
      } else {
        if (!data) return;
        const isUsed = data.orders.some((o) => o.fabricId === id && o.status !== 'cancelled');
        if (isUsed) {
          throw new Error('لا يمكن حذف هذا الصنف لارتباطه بطلبات موجودة');
        }
        await persistData({ ...data, fabrics: data.fabrics.filter((f) => f.id !== id) });
        offerDeleteUndo(beforeDelete || data, 'تم حذف القماش');
      }
    });
  };

  const handleSaveAccessory = async (accessory: AccessoryItem) => {
    const err = validateEntity('accessory', accessory);
    if (err) {
      showToast(err, 'danger');
      return;
    }

    await executeCrud('جاري حفظ صنف الإكسسوار...', async () => {
      let alerts: string[] = [];
      if (gateway.createAccessory && gateway.updateAccessory) {
        const exists = data?.accessories.some((a) => a.id === accessory.id);
        if (exists) {
          await gateway.updateAccessory(accessory);
        } else {
          await gateway.createAccessory(accessory);
        }
        alerts = await refreshSlices(['accessories', 'notifications']);
      } else {
        if (!data) return;
        const exists = data.accessories.some((a) => a.id === accessory.id);
        const updatedAccessories = exists
          ? data.accessories.map((a) => (a.id === accessory.id ? accessory : a))
          : [accessory, ...data.accessories];
        alerts = await persistData({ ...data, accessories: updatedAccessories });
      }

      if (alerts && alerts.length > 0) {
        showToast(`تم حفظ الإكسسوار. ⚠️ ${alerts[0]}`, 'warning');
      } else {
        showToast('تم حفظ صنف الإكسسوار بنجاح', 'success');
      }
    });
  };

  const handleDeleteAccessory = async (id: string) => {
    const beforeDelete = data ? JSON.parse(JSON.stringify(data)) as typeof data : null;
    await executeCrud('جاري حذف الإكسسوار...', async () => {
      if (gateway.deleteAccessory) {
        await gateway.deleteAccessory(id);
        await refreshSlices(['accessories', 'notifications']);
        showToast('تم حذف الإكسسوار بنجاح', 'success');
      } else {
        if (!data) return;
        await persistData({ ...data, accessories: data.accessories.filter((a) => a.id !== id) });
        offerDeleteUndo(beforeDelete || data, 'تم حذف الإكسسوار');
      }
    });
  };

  const handleAdjustStock = async (itemType: InventoryItemType, itemId: string, quantity: number, reason: string, direction: 'adjustment' | 'return') => {
    await executeCrud('جاري تسجيل تسوية المخزون...', async () => {
      if (!window.electronAPI.adjustStock) throw new Error('وظيفة حركة المخزون غير متاحة في هذه النسخة');
      await window.electronAPI.adjustStock({ itemType, itemId, quantity, reason, direction });
      await loadAppData();
    });
  };

  const handleSaveThobeType = async (thobeType: ThobeType) => {
    const err = validateEntity('thobeType', thobeType);
    if (err) {
      showToast(err, 'danger');
      return;
    }

    await executeCrud('جاري حفظ نوع الثوب...', async () => {
      if (!data) return;
      if (gateway.createThobeType) {
        const exists = data.thobeTypes.some((t) => t.id === thobeType.id);
        if (exists && gateway.updateThobeType) {
          await gateway.updateThobeType(thobeType);
        } else {
          await gateway.createThobeType(thobeType);
        }
        await loadAppData();
      } else {
        const exists = data.thobeTypes.some((t) => t.id === thobeType.id);
        const updated = exists
          ? data.thobeTypes.map((t) => (t.id === thobeType.id ? thobeType : t))
          : [thobeType, ...data.thobeTypes];
        await persistData({ ...data, thobeTypes: updated });
      }
      showToast('تم حفظ نوع الثوب بنجاح', 'success');
    });
  };

  const handleSaveColor = async (color: ColorItem) => {
    const err = validateEntity('color', color);
    if (err) {
      showToast(err, 'danger');
      return;
    }

    await executeCrud('جاري حفظ اللون...', async () => {
      if (!data) return;
      if (gateway.createColor) {
        const exists = data.colors.some((c) => c.id === color.id);
        if (exists && gateway.updateColor) {
          await gateway.updateColor(color);
        } else {
          await gateway.createColor(color);
        }
        await loadAppData();
      } else {
        const exists = data.colors.some((c) => c.id === color.id);
        const updated = exists
          ? data.colors.map((c) => (c.id === color.id ? color : c))
          : [color, ...data.colors];
        await persistData({ ...data, colors: updated });
      }
      showToast('تم حفظ اللون بنجاح', 'success');
    });
  };

  const handleDeleteThobeType = async (id: string) => {
    await executeCrud('جاري حذف نوع الثوب...', async () => {
      if (!data) return;
      if (gateway.deleteThobeType) {
        await gateway.deleteThobeType(id);
        await loadAppData();
      } else {
        await persistData({ ...data, thobeTypes: data.thobeTypes.filter((t) => t.id !== id) });
      }
      showToast('تم حذف نوع الثوب بنجاح', 'success');
    });
  };

  const handleDeleteColor = async (id: string) => {
    await executeCrud('جاري حذف اللون...', async () => {
      if (!data) return;
      if (gateway.deleteColor) {
        await gateway.deleteColor(id);
        await loadAppData();
      } else {
        await persistData({ ...data, colors: data.colors.filter((c) => c.id !== id) });
      }
      showToast('تم حذف اللون بنجاح', 'success');
    });
  };

  return {
    handleSaveFabric,
    handleDeleteFabric,
    handleSaveAccessory,
    handleDeleteAccessory,
    handleAdjustStock,
    handleSaveThobeType,
    handleSaveColor,
    handleDeleteThobeType,
    handleDeleteColor,
  };
}
