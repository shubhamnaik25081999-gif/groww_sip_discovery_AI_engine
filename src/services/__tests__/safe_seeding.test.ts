import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { seedBenchmarkData, dangerousResetDatabase } from '@/db/seed';
import { EvidenceService } from '../evidence';
import { evidenceRecords, goldenLabels } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('Safe Seeding and Benchmark Idempotency', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('rejects destructive reset without explicit confirmation', async () => {
    // Attempting to call dangerousResetDatabase without exact confirmation string must throw
    await expect(
      dangerousResetDatabase({ confirmation: 'WRONG_CONFIRMATION' })
    ).rejects.toThrow(/Destructive reset aborted/);

    await expect(
      // @ts-expect-error testing missing argument
      dangerousResetDatabase({})
    ).rejects.toThrow(/Destructive reset aborted/);
  });

  it('preserves user-imported evidence records and avoids duplicates across repeated seed executions', async () => {
    // 1. Create a user-imported record
    const userRecord = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/personalfinanceindia/comments/user_imported_sip',
      platform: 'reddit',
      collectedAt: '2026-06-10',
      originalText: 'My personal SIP transaction failed on bank side and was not retried by app.',
      journeyStage: 'autopay_failure_recovery',
      entryMethod: 'manual',
      isSynthetic: false,
    });

    expect(userRecord.id).toBeDefined();

    // Verify initial count of user record in DB
    const beforeSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));
    expect(beforeSeed.length).toBe(1);
    expect(beforeSeed[0].verificationStatus).toBe('user_entered');

    // 2. First Seed Execution
    const firstSeedResult = await seedBenchmarkData();
    expect(firstSeedResult.success).toBe(true);

    // Verify user record was NOT deleted by seed execution
    const afterFirstSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));
    expect(afterFirstSeed.length).toBe(1);

    // Verify benchmark items were seeded as synthetic fixtures
    const allRecordsFirst = await db.select().from(evidenceRecords);
    const benchmarkItemsFirst = allRecordsFirst.filter((r) => r.id !== userRecord.id);
    expect(benchmarkItemsFirst.length).toBe(20);
    for (const item of benchmarkItemsFirst) {
      expect(item.isSynthetic).toBe(true);
      expect(item.verificationStatus).toBe('synthetic_fixture');
    }

    const goldensFirst = await db.select().from(goldenLabels);
    expect(goldensFirst.length).toBe(20);

    // 3. Second Seed Execution (Idempotency Check)
    const secondSeedResult = await seedBenchmarkData();
    expect(secondSeedResult.success).toBe(true);

    // Verify NO duplicates were created
    const allRecordsSecond = await db.select().from(evidenceRecords);
    expect(allRecordsSecond.length).toBe(allRecordsFirst.length);

    const goldensSecond = await db.select().from(goldenLabels);
    expect(goldensSecond.length).toBe(goldensFirst.length);

    // Verify user record is still preserved
    const afterSecondSeed = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.id, userRecord.id));
    expect(afterSecondSeed.length).toBe(1);
  });
});
