import Link from 'next/link';
import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  analysisRuns,
  recordAnalyses,
  reviews,
  goldenLabels,
  failureCases,
  themes,
  opportunities,
} from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { SeedButton } from '@/components/SeedButton';
import { EvidenceService } from '@/services/evidence';

export const dynamic = 'force-dynamic';

export default async function IntelligenceOverviewPage() {
  await initializeDatabase();

  const allRecords = await db.select().from(evidenceRecords).all();
  const realRecords = allRecords.filter((r) => !r.isSynthetic);
  const syntheticRecords = allRecords.filter((r) => r.isSynthetic);
  const provBreakdown = await EvidenceService.getProvenanceBreakdown();

  const analyses = await db.select().from(recordAnalyses).all();
  const allReviews = await db.select().from(reviews).all();
  const goldens = await db.select().from(goldenLabels).all();
  const failures = await db.select().from(failureCases).all();
  const allThemes = await db.select().from(themes).all();
  const allOpps = await db.select().from(opportunities).all();

  const platforms = Array.from(new Set(allRecords.map((r) => r.platform)));
  const confirmedCount = allReviews.filter((r) => r.decision === 'confirmed').length;
  const correctedCount = allReviews.filter((r) => r.decision === 'corrected').length;
  const rejectedCount = allReviews.filter((r) => r.decision === 'rejected').length;

  const agreementRate = allReviews.length > 0 ? ((confirmedCount / allReviews.length) * 100).toFixed(1) : null;

  const recentRecords = await db
    .select()
    .from(evidenceRecords)
    .orderBy(desc(evidenceRecords.createdAt))
    .limit(6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Banner / Hero */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-emerald">Discovery Engine Active</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Evidence-First Problem Space Formulation</span>
          </div>
          <h1>Intelligence Overview</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '720px', marginTop: '6px', fontSize: '14px' }}>
            Discovering root causes of first-time mutual fund investor attrition 12 months after SIP initiation. Grounded strictly in public investor feedback without predetermining the solution.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <SeedButton hasData={allRecords.length > 0} />
          <Link href="/evidence" className="btn btn-primary">
            + Ingest New Feedback
          </Link>
        </div>
      </div>

      {/* Business Objective & Metric Definition Card */}
      <div className="card" style={{ borderColor: 'var(--emerald-border)', background: 'linear-gradient(180deg, var(--emerald-glow) 0%, var(--bg-surface) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ color: 'var(--emerald-400)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎯 NextLeap Fellowship Business Target
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>12-Month Active SIP Retention</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Increase the percentage of first-time mutual fund investors who still maintain an active SIP 12 months after their first debit.
            </p>
          </div>
          <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--emerald-400)', fontWeight: 600, textTransform: 'uppercase' }}>
              Canonical Active Definition
            </span>
            <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              &quot;At least one successful instalment in the last 30 days.&quot;
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
              Any pause, mandate drop, or uncorrected payment failure exceeding 30 days is classified as churned.
            </p>
          </div>
        </div>
      </div>

      {/* Evidence Provenance & Audit Status Banner */}
      <div
        className="card"
        style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-subtle)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge badge-amber" style={{ fontSize: '11px' }}>Provenance Audit</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <strong>Evidence Status:</strong> {provBreakdown.contentVerified + provBreakdown.linkChecked} verified evidence, {provBreakdown.unverified + provBreakdown.userEntered} unverified submissions, {provBreakdown.syntheticFixture} synthetic fixtures (dev/test)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
          <span className="badge badge-emerald">Verified: {provBreakdown.contentVerified + provBreakdown.linkChecked}</span>
          <span className="badge badge-amber">Unverified / User: {provBreakdown.unverified + provBreakdown.userEntered}</span>
          <span className="badge badge-zinc">Synthetic Fixtures: {provBreakdown.syntheticFixture}</span>
        </div>
      </div>

      {/* Pipeline Funnel Metrics */}
      <div>
        <h2 style={{ fontSize: '16px', marginBottom: '14px', color: 'var(--text-secondary)' }}>
          Discovery Pipeline Progress
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Evidence Ingested</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {allRecords.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {provBreakdown.contentVerified + provBreakdown.linkChecked} verified · {provBreakdown.unverified + provBreakdown.userEntered} unverified · {provBreakdown.syntheticFixture} synthetic fixtures
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. AI Analyzed</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--blue-400)', marginTop: '4px' }}>
              {analyses.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Structured Zod schemas &amp; guards
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>3. Human Reviewed</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--purple-400)', marginTop: '4px' }}>
              {allReviews.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {confirmedCount} confirmed · {correctedCount} corrected · {rejectedCount} rejected
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Golden Evaluated</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--emerald-400)', marginTop: '4px' }}>
              {goldens.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {agreementRate ? `${agreementRate}% agreement (n=${goldens.length} diagnostic)` : 'Pending eval run'}
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Discovered Themes</span>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--amber-400)', marginTop: '4px' }}>
              {allThemes.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {allOpps.length} candidate opportunities
            </div>
          </div>
        </div>
      </div>

      {/* Honest Empty State Check */}
      {allRecords.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', borderStyle: 'dashed' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No Evidence Records Ingested Yet</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 24px', fontSize: '13px' }}>
            The Groww SIP Intelligence Lab is an evidence-first engine. To discover root causes, either upload your own research CSV or load the curated NextLeap Fellowship benchmark set (20 authentic feedback records across Play Store, Reddit, and Twitter).
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <SeedButton hasData={false} />
            <Link href="/evidence" className="btn btn-secondary">
              Upload CSV or Add Manually
            </Link>
          </div>
        </div>
      ) : (
        /* Discovery Highlights Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
          {/* Recent Verbatim Feed */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px' }}>Recent Evidence Feed</h3>
              <Link href="/evidence" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                View All ({allRecords.length}) →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentRecords.map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{rec.platform}</span>
                      <span className="badge badge-emerald" style={{ fontSize: '10px' }}>{rec.journeyStage.replace(/_/g, ' ')}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rec.collectedAt}</span>
                  </div>
                  <p className="editorial-quote" style={{ fontSize: '13px', padding: '6px 10px', margin: '6px 0' }}>
                    &ldquo;{rec.originalText}&rdquo;
                  </p>
                  {rec.investorContext && (
                    <div style={{ fontSize: '11px', color: 'var(--emerald-400)', marginTop: '4px' }}>
                      Context: {rec.investorContext}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Discovered Themes & Candidate Opportunities */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '15px' }}>Discovered Friction Themes</h3>
                <Link href="/themes" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                  Theme Map →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allThemes.slice(0, 4).map((theme) => (
                  <div
                    key={theme.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--bg-canvas)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{theme.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Stage: {theme.journeyStage.replace(/_/g, ' ')} · Origin: {theme.origin}
                      </div>
                    </div>
                    <span className="badge badge-emerald">{theme.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '15px' }}>Candidate Opportunities</h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>7-Criteria Transparent Prioritization</div>
                </div>
                <Link href="/opportunities" style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                  Opportunity Explorer →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allOpps.slice(0, 3).map((opp) => (
                  <div
                    key={opp.id}
                    style={{
                      padding: '12px',
                      background: 'var(--bg-canvas)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{opp.title}</div>
                      <span className="badge badge-purple" style={{ fontSize: '12px', fontWeight: 700 }}>
                        {opp.compositeScore} / 100
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {opp.problemStatement}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
