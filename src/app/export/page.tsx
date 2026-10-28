import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  themes,
  opportunities,
  failureCases,
} from '@/db/schema';
import { ExportService } from '@/services/export';
import { EvidenceService } from '@/services/evidence';
import { EvaluationService } from '@/services/evaluation';
import { ExportView } from '@/components/ExportView';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  await initializeDatabase();

  const markdownContent = await ExportService.generateMarkdownReport();
  const csvContent = await EvidenceService.exportToCsv();
  const jsonData = await ExportService.compileExportData();

  const allRecords = await db.select().from(evidenceRecords).all();
  const allThemes = await db.select().from(themes).all();
  const allOpps = await db.select().from(opportunities).all();
  const allFailures = await db.select().from(failureCases).all();
  const evalResult = await EvaluationService.getLatestEvaluation();

  const summary = {
    totalRecords: allRecords.length,
    totalThemes: allThemes.length,
    totalOpportunities: allOpps.length,
    evaluationAccuracy: evalResult ? evalResult.accuracy : null,
    failureCasesCount: allFailures.length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">Evidence Log Export</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Reproducible Fellowship Deliverables
          </span>
        </div>
        <h1>Export Evidence Log & Findings</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Download the complete graduation portfolio in Markdown, CSV, or JSON. All data exports strictly preserve verbatim quote provenance, review audit trails, and known research limitations.
        </p>
      </div>

      <ExportView
        markdownContent={markdownContent}
        csvContent={csvContent}
        jsonData={jsonData}
        summary={summary}
      />
    </div>
  );
}
