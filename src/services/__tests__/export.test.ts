import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase, db } from '@/db';
import { clearAllTables } from '@/db/test-utils';
import { EvidenceService } from '../evidence';
import { ExportService } from '../export';

describe('Evidence Log Export', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await clearAllTables();
  });

  it('generates markdown report containing all required sections and disclaimer', async () => {
    await EvidenceService.createManualRecord({
      sourceUrl: 'https://play.google.com/review-export-test',
      platform: 'play_store',
      collectedAt: '2026-06-15',
      originalText: 'Mandate setup failed three times without descriptive bank error codes.',
      journeyStage: 'mandate_kyc_setup',
      entryMethod: 'manual',
      isSynthetic: false,
    });

    const markdown = await ExportService.generateMarkdownReport();
    expect(markdown).toContain('# Groww SIP Intelligence Lab — Evidence Log');
    expect(markdown).toContain('Executive Summary & Provenance');
    expect(markdown).toContain('Golden-Set Diagnostic Evaluation');
    expect(markdown).toContain('Documented Failure Cases & Lessons Learned');
    expect(markdown).toContain('Known Technical & Data Limitations');
    expect(markdown).toContain('Academic Prototype Notice');
  });

  it('generates structured JSON export payload', async () => {
    const data = await ExportService.compileExportData();
    expect(data.metadata.productName).toContain('Groww');
    expect(data.summary.totalEvidenceRecords).toBeGreaterThan(0);
    expect(data.knownLimitations.length).toBeGreaterThan(0);
  });
});
