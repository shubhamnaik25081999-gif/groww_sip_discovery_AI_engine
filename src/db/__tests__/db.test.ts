import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '../index';
import { evidenceRecords } from '../schema';

describe('Database initialization and basic schema', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  it('initializes tables without error and can query evidence_records', async () => {
    const records = await db.select().from(evidenceRecords).all();
    expect(Array.isArray(records)).toBe(true);
  });
});
