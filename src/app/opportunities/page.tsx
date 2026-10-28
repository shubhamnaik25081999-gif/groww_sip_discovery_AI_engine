import { db, initializeDatabase } from '@/db';
import { themes } from '@/db/schema';
import { OpportunityService } from '@/services/opportunity';
import { OpportunityView } from '@/components/OpportunityView';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  await initializeDatabase();

  const opps = await OpportunityService.listOpportunities();
  const allThemes = await db.select().from(themes).all();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">Prioritization Engine</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            7 Explicit Multi-Dimensional Criteria
          </span>
        </div>
        <h1>Opportunity Formulation & Ranking</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Evaluate and prioritize problem spaces against empirical evidence depth, source diversity, user pain intensity, and 12-month active SIP retention alignment.
        </p>
      </div>

      <OpportunityView
        initialOpportunities={opps as any}
        availableThemes={allThemes}
      />
    </div>
  );
}
