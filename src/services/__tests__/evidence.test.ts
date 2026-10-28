import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { evidenceRecords, evidenceEdits } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('EvidenceService Ingestion & Integrity', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('ingests CSV and detects duplicates based on content hash', async () => {
    const csvContent = `source_url,platform,collected_at,original_text,investor_context,journey_stage
https://play.google.com/review1,play_store,2026-06-01,"My first SIP got debited but units were not allotted for 5 days. Very stressful for beginner.",First-time investor,first_instalment
https://play.google.com/review2,play_store,2026-06-02,"Auto-pay failed silently because mandate limits were not explained. I only found out when penalty was charged.",New to MF,autopay_failure_recovery
https://play.google.com/review3,play_store,2026-06-03,"My first SIP got debited but units were not allotted for 5 days. Very stressful for beginner.",First-time investor,first_instalment`;

    const result = await EvidenceService.ingestCsv(csvContent, 'test_batch_1.csv', 'TestRunner');

    expect(result.totalRows).toBe(3);
    expect(result.acceptedRows).toBe(3);
    expect(result.duplicateRows).toBe(1);
    expect(result.rejectedRows).toBe(0);

    // Verify duplicate link
    const duplicateRecord = await db
      .select()
      .from(evidenceRecords)
      .where(eq(evidenceRecords.sourceUrl, 'https://play.google.com/review3'))
      .limit(1);

    expect(duplicateRecord[0].duplicateOfId).not.toBeNull();
  });

  it('rejects malformed CSV rows with invalid URLs or short text', async () => {
    const invalidCsv = `source_url,platform,original_text
not-a-valid-url,play_store,"Valid text here"
https://example.com/groww,play_store,"Hi"`;

    const result = await EvidenceService.ingestCsv(invalidCsv, 'invalid_batch.csv', 'TestRunner');
    expect(result.rejectedRows).toBe(2);
    expect(result.acceptedRows).toBe(0);
    expect(result.rejectedDetails.length).toBe(2);
  });

  it('enforces originalText immutability and audits valid metadata edits', async () => {
    const { id } = await EvidenceService.createManualRecord({
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/xyz123',
      platform: 'reddit',
      collectedAt: '2026-06-15',
      originalText: 'I stopped my SIP after market crashed in March because I panicked seeing negative returns.',
      investorContext: 'First SIP',
      journeyStage: 'market_dip_reaction',
      fieldProvenance: {
        sourceUrl: 'verified',
        platform: 'verified',
        collectedAt: 'verified',
        originalText: 'verified',
        journeyStage: 'user_entered',
      },
      entryMethod: 'manual',
      isSynthetic: false,
    });

    // Attempting to edit originalText must throw an error
    await expect(
      EvidenceService.updateRecordMetadata(
        id,
        { originalText: 'Modified text that tries to rewrite history' },
        'Auditor',
        'Attempted rewrite'
      )
    ).rejects.toThrow(/Integrity Violation/);

    // Valid metadata edit should succeed and be logged in evidenceEdits
    await EvidenceService.updateRecordMetadata(
      id,
      { investorContext: 'Confirmed first-time investor, age 24' },
      'SeniorResearcher',
      'Clarified user profile from linked Reddit comment context'
    );

    const edits = await db.select().from(evidenceEdits).where(eq(evidenceEdits.evidenceId, id));
    expect(edits.length).toBe(1);
    expect(edits[0].fieldName).toBe('investor_context');
    expect(edits[0].newValue).toBe('Confirmed first-time investor, age 24');
    expect(edits[0].editedBy).toBe('SeniorResearcher');
  });

  it('generates sanitized CSV export', async () => {
    const csvExport = await EvidenceService.exportToCsv({ excludeSynthetic: false });
    expect(csvExport).toContain('source_url,platform,collected_at');
    expect(csvExport).toContain('https://play.google.com/review1');
  });
});
