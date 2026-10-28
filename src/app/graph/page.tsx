import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  themes,
  evidenceThemeLinks,
  recordAnalyses,
  researchQuestions,
  opportunities,
  opportunityThemes,
  contradictions,
} from '@/db/schema';
import { EvidenceGraph, GraphNode, GraphLink } from '@/components/EvidenceGraph';

export const dynamic = 'force-dynamic';

export default async function EvidenceGraphPage() {
  await initializeDatabase();

  const allRecords = await db.select().from(evidenceRecords).all();
  const allThemes = await db.select().from(themes).all();
  const allLinks = await db.select().from(evidenceThemeLinks).all();
  const allAnalyses = await db.select().from(recordAnalyses).all();
  const allQuestions = await db.select().from(researchQuestions).all();
  const allOpps = await db.select().from(opportunities).all();
  const allOppThemes = await db.select().from(opportunityThemes).all();
  const allContradictions = await db.select().from(contradictions).all();

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // 1. Source Nodes
  const platforms = Array.from(new Set(allRecords.map((r) => r.platform)));
  for (const plat of platforms) {
    const platLabel =
      plat === 'play_store'
        ? 'Google Play Store'
        : plat === 'reddit'
        ? 'Reddit Community'
        : plat === 'twitter_x'
        ? 'Twitter / X'
        : plat === 'interview'
        ? 'User Interviews'
        : plat === 'ticket'
        ? 'Support Tickets'
        : 'Desk Research';

    nodes.push({
      id: `source_${plat}`,
      type: 'source',
      label: platLabel,
      subtitle: `Aggregated investor touchpoint channel`,
    });
  }

  // 2. Evidence Record Nodes
  for (const rec of allRecords) {
    nodes.push({
      id: rec.id,
      type: 'record',
      label: `Evidence #${rec.id.slice(0, 6)}`,
      subtitle: rec.originalText.slice(0, 100) + '...',
      details: {
        originalText: rec.originalText,
        platform: rec.platform,
        journeyStage: rec.journeyStage,
        sourceUrl: rec.sourceUrl,
      },
    });

    // Link from source to record
    links.push({
      id: `link_src_${rec.id}`,
      source: `source_${rec.platform}`,
      target: rec.id,
      relation: 'originates_from',
    });
  }

  // 3. Theme Nodes
  for (const t of allThemes) {
    nodes.push({
      id: t.id,
      type: 'theme',
      label: t.name,
      subtitle: t.description,
      size: 16,
    });
  }

  // Links between Evidence Records and Themes
  for (const l of allLinks) {
    links.push({
      id: l.id,
      source: l.evidenceId,
      target: l.themeId,
      relation: l.role === 'supports' ? 'supports' : 'contradicts',
    });
  }

  // 4. Hypothesis Nodes (from Analyses)
  const hypothesisSet = new Set<string>();
  for (const a of allAnalyses) {
    if (!a.parsedOutput) continue;
    try {
      const parsed = JSON.parse(a.parsedOutput);
      const themeName = parsed.theme?.name;
      const matchingTheme = allThemes.find((t) => t.name.toLowerCase() === themeName?.toLowerCase());
      if (matchingTheme && Array.isArray(parsed.hypotheses)) {
        for (const h of parsed.hypotheses) {
          const cleanHyp = h.replace(/^\[HYPOTHESIS\]\s*/i, '');
          const hypId = `hyp_${matchingTheme.id}_${cleanHyp.slice(0, 20).replace(/\s+/g, '_')}`;
          if (!hypothesisSet.has(hypId)) {
            hypothesisSet.add(hypId);
            nodes.push({
              id: hypId,
              type: 'hypothesis',
              label: cleanHyp.slice(0, 40) + '...',
              subtitle: cleanHyp,
            });

            links.push({
              id: `link_${hypId}`,
              source: matchingTheme.id,
              target: hypId,
              relation: 'generates_hypothesis',
            });
          }
        }
      }
    } catch {
      // skip
    }
  }

  // 5. Research Question Nodes
  for (const q of allQuestions) {
    nodes.push({
      id: q.id,
      type: 'question',
      label: q.question.slice(0, 36) + '...',
      subtitle: q.question,
    });

    if (q.relatedThemeId) {
      links.push({
        id: `link_q_${q.id}`,
        source: q.relatedThemeId,
        target: q.id,
        relation: 'raises_question',
      });
    }
  }

  // 6. Central Business Outcome Node (The Fellowship North Star)
  nodes.push({
    id: 'outcome_12m_retention',
    type: 'outcome',
    label: '12-Month Active SIP Retention',
    subtitle: 'Primary Fellowship Business Objective: Active SIP (>= 1 instalment in last 30 days) at month 12',
    size: 20,
    details: {
      canonicalDefinition: 'At least one successful instalment in the last 30 days, 12 months after inception.',
      cohortTarget: 'First-time mutual fund investors starting on Groww.',
      governingConstraint: 'Academic prototype; no fund recommendations or artificial urgency nudges.',
    },
  });

  // 7. Candidate Opportunity Nodes
  for (const opp of allOpps) {
    nodes.push({
      id: opp.id,
      type: 'opportunity',
      label: opp.title,
      subtitle: opp.problemStatement,
      size: 16,
      details: {
        problemStatement: opp.problemStatement,
        hypothesis: opp.hypothesisOnRetention,
        compositeScore: opp.compositeScore,
      },
    });

    // Link Opportunity to Business Outcome
    links.push({
      id: `link_opp_outcome_${opp.id}`,
      source: opp.id,
      target: 'outcome_12m_retention',
      relation: 'targets_outcome',
    });
  }

  // 8. Link Themes to Opportunities
  for (const ot of allOppThemes) {
    links.push({
      id: `link_theme_opp_${ot.id}`,
      source: ot.themeId,
      target: ot.opportunityId,
      relation: 'informs_opportunity',
    });
  }

  // 9. Contradiction Links between Opposing Evidence Records
  for (const c of allContradictions) {
    links.push({
      id: `contradiction_${c.id}`,
      source: c.evidenceAId,
      target: c.evidenceBId,
      relation: 'contradicts',
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-emerald">Knowledge Network</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Bi-Directional Interactive Network Trace
          </span>
        </div>
        <h1>Evidence & Theme Discovery Graph</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Trace how investor touchpoints and verbatim sentiment cluster into problem themes, generate hypotheses, and spawn research inquiries.
        </p>
      </div>

      <EvidenceGraph initialNodes={nodes} initialLinks={links} />
    </div>
  );
}
