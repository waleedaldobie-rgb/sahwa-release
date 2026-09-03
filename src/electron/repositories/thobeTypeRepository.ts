import Database from 'better-sqlite3';
import { ThobeType } from '../../types';
import { createSafeId } from '../../domain/idGenerator';

export class ThobeTypeRepository {
  constructor(private readonly db: Database.Database) {}

  list(): ThobeType[] {
    return this.db.prepare('SELECT id, name, default_price as defaultPrice, description FROM dress_types ORDER BY name ASC').all() as ThobeType[];
  }

  insert(item: Partial<ThobeType>): ThobeType {
    const record: ThobeType = {
      id: item.id || createSafeId('TH'),
      name: item.name || 'نوع جديد',
      defaultPrice: item.defaultPrice || 0,
      description: item.description || ''
    };
    this.db.prepare('INSERT INTO dress_types (id,name,default_price,description) VALUES (?,?,?,?)').run(record.id, record.name, record.defaultPrice, record.description);
    return record;
  }

  update(item: ThobeType): void {
    this.db.prepare('UPDATE dress_types SET name=?, default_price=?, description=? WHERE id=?').run(item.name, item.defaultPrice || 0, item.description || '', item.id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM dress_types WHERE id=?').run(id);
  }
}
