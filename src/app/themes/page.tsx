import { db, initializeDatabase } from '@/db';
import {
  themes,
  evidenceThemeLinks,
  evidenceRecords,
  recordAnalyses,
} from '@/db/schema';
import { desc } from 'drizzle-orm';
import { ThemeMap, ThemeWithDetails } from '@/components/ThemeMap';

export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  await initializeDatabase();

  const allThemes = await db
    .select()
    .from(themes)
    .orderBy(desc(themes.createdAt))
    .all();

  const allLinks = await db.select().from(evidenceThemeLinks).all();
  const allRecords = await db.select().from(evidenceRecords).all();
  const allAnalyses = await db.select().from(recordAnalyses).all();

  const recordMap = new Map(allRecords.map((r) => [r.id, r]));

  // Extract behaviours and hypotheses associated with each theme from analyses
  const themeBehaviours = new Map<string, Set<string>>();
  const themeHypotheses = new Map<string, Set<string>>();

  for (const a of allAnalyses) {
    if (!a.parsedOutput) continue;
    try {
      const parsed = JSON.parse(a.parsedOutput);
      const themeName = parsed.theme?.name;
      if (themeName) {
        const matchingTheme = allThemes.find((t) => t.name.toLowerCase() === themeName.toLowerCase());
        if (matchingTheme) {
          if (!themeBehaviours.has(matchingTheme.id)) themeBehaviours.set(matchingTheme.id, new Set());
          if (!themeHypotheses.has(matchingTheme.id)) themeHypotheses.set(matchingTheme.id, new Set());

          if (parsed.observedBehaviour) {
            themeBehaviours.get(matchingTheme.id)!.add(parsed.observedBehaviour);
          }
          if (Array.isArray(parsed.hypotheses)) {
            for (const h of parsed.hypotheses) {
              themeHypotheses.get(matchingTheme.id)!.add(h);
            }
          }
        }
      }
    } catch {
      // skip
    }
  }

  // Build decorated themes
  const decoratedThemes: ThemeWithDetails[] = allThemes.map((t) => {
    const links = allLinks.filter((l) => l.themeId === t.id);
    const supportingLinks = links.filter((l) => l.role === 'supports');
    const contradictingLinks = links.filter((l) => l.role === 'contradicts');

    const evidenceQuotes = links
      .map((l) => {
        const rec = recordMap.get(l.evidenceId);
        if (!rec) return null;
        return {
          id: rec.id,
          text: rec.originalText,
          platform: rec.platform,
          sourceUrl: rec.sourceUrl,
          role: l.role,
        };
      })
      .filter(Boolean) as any[];

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      journeyStage: t.journeyStage,
      origin: t.origin,
      status: t.status,
      mergedIntoId: t.mergedIntoId,
      supportingCount: supportingLinks.length,
      contradictingCount: contradictingLinks.length,
      evidenceQuotes,
      behaviours: Array.from(themeBehaviours.get(t.id) || []),
      hypotheses: Array.from(themeHypotheses.get(t.id) || []),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-purple">Problem Space Discovery</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Unbiased Inductive Synthesis
          </span>
        </div>
        <h1>Investor Journey & Behaviour Map</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '780px', marginTop: '6px', fontSize: '14px' }}>
          Visualizing friction themes and behavioural patterns across the 12-month mutual fund investor journey. Themes are inductively formed from raw feedback rather than predetermined frameworks.
        </p>
      </div>

      <ThemeMap initialThemes={decoratedThemes} />
    </div>
  );
}
