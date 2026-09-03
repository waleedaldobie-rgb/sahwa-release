import { ipcMain } from 'electron';
import { safeIpcHandle } from '../errorHandler';
import { FabricItem, AccessoryItem, ThobeType, ColorItem } from '../../types';
import { FabricRepository } from '../repositories/fabricRepository';
import { AccessoryRepository } from '../repositories/accessoryRepository';
import { ThobeTypeRepository } from '../repositories/thobeTypeRepository';
import { ColorRepository } from '../repositories/colorRepository';
import {
  accessoryCreateSchema,
  accessoryUpdateSchema,
  colorCreateSchema,
  colorUpdateSchema,
  fabricCreateSchema,
  fabricUpdateSchema,
  idArgsSchema,
  thobeTypeCreateSchema,
  thobeTypeUpdateSchema,
} from '../../services/shared/ipcSchemas';
import { parseIpcInput } from '../validation/parseIpc';

interface CatalogRepositories {
  fabricRepository: FabricRepository;
  accessoryRepository: AccessoryRepository;
  thobeTypeRepository: ThobeTypeRepository;
  colorRepository: ColorRepository;
}

export function registerCatalogHandlers(repos: CatalogRepositories): void {
  const { fabricRepository, accessoryRepository, thobeTypeRepository, colorRepository } = repos;

  safeIpcHandle(ipcMain, 'fabrics:list', async () => fabricRepository.list());
  safeIpcHandle(ipcMain, 'fabrics:create', async (_, raw: unknown) => {
    const input = parseIpcInput(fabricCreateSchema, raw, 'بيانات القماش');
    return fabricRepository.insert(input as unknown as Partial<FabricItem>);
  });
  safeIpcHandle(ipcMain, 'fabrics:update', async (_, raw: unknown) => {
    const input = parseIpcInput(fabricUpdateSchema, raw, 'بيانات القماش');
    fabricRepository.update(input as unknown as FabricItem);
    return true;
  });
  safeIpcHandle(ipcMain, 'fabrics:delete', async (_, fabricId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: fabricId }, 'معرّف القماش');
    fabricRepository.delete(input.id);
    return true;
  });

  safeIpcHandle(ipcMain, 'accessories:list', async () => accessoryRepository.list());
  safeIpcHandle(ipcMain, 'accessories:create', async (_, raw: unknown) => {
    const input = parseIpcInput(accessoryCreateSchema, raw, 'بيانات الإكسسوار');
    return accessoryRepository.insert(input as unknown as Partial<AccessoryItem>);
  });
  safeIpcHandle(ipcMain, 'accessories:update', async (_, raw: unknown) => {
    const input = parseIpcInput(accessoryUpdateSchema, raw, 'بيانات الإكسسوار');
    accessoryRepository.update(input as unknown as AccessoryItem);
    return true;
  });
  safeIpcHandle(ipcMain, 'accessories:delete', async (_, accessoryId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: accessoryId }, 'معرّف الإكسسوار');
    accessoryRepository.delete(input.id);
    return true;
  });

  safeIpcHandle(ipcMain, 'thobeTypes:list', async () => thobeTypeRepository.list());
  safeIpcHandle(ipcMain, 'thobeTypes:create', async (_, raw: unknown) => {
    const input = parseIpcInput(thobeTypeCreateSchema, raw, 'بيانات نوع الثوب');
    return thobeTypeRepository.insert(input as unknown as Partial<ThobeType>);
  });
  safeIpcHandle(ipcMain, 'thobeTypes:update', async (_, raw: unknown) => {
    const input = parseIpcInput(thobeTypeUpdateSchema, raw, 'بيانات نوع الثوب');
    thobeTypeRepository.update(input as unknown as ThobeType);
    return true;
  });
  safeIpcHandle(ipcMain, 'thobeTypes:delete', async (_, id: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id }, 'معرّف نوع الثوب');
    thobeTypeRepository.delete(input.id);
    return true;
  });

  safeIpcHandle(ipcMain, 'colors:list', async () => colorRepository.list());
  safeIpcHandle(ipcMain, 'colors:create', async (_, raw: unknown) => {
    const input = parseIpcInput(colorCreateSchema, raw, 'بيانات اللون');
    return colorRepository.insert(input as unknown as Partial<ColorItem>);
  });
  safeIpcHandle(ipcMain, 'colors:update', async (_, raw: unknown) => {
    const input = parseIpcInput(colorUpdateSchema, raw, 'بيانات اللون');
    colorRepository.update(input as unknown as ColorItem);
    return true;
  });
  safeIpcHandle(ipcMain, 'colors:delete', async (_, id: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id }, 'معرّف اللون');
    colorRepository.delete(input.id);
    return true;
  });
}
