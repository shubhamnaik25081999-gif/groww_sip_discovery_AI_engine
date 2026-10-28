import { db, initializeDatabase } from '@/db';
import {
  opportunities,
  opportunityThemes,
  opportunityScores,
  themes,
  evidenceThemeLinks,
  evidenceRecords,
  reviews,
} from '@/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import crypto from 'crypto';

export interface OpportunityWeights {
  evidenceStrength: number; // 0 to 5, default 1
  independentRecords: number; // 0 to 5, default 1
  sourceDiversity: number; // 0 to 5, default 1
  userImpact: number; // 0 to 5, default 1
  businessMetricLink: number; // 0 to 5, default 1
  researchUncertainty: number; // 0 to 5, default 1 (inverted)
  potentialFeasibility: number; // 0 to 5, default 1
}

export const DEFAULT_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
  evidenceStrength: 1,
  independentRecords: 1,
  sourceDiversity: 1,
  userImpact: 1,
  businessMetricLink: 1,
  researchUncertainty: 1,
  potentialFeasibility: 1,
};

export interface CreateOpportunityInput {
  title: string;
  problemStatement: string; // strictly a problem statement
  hypothesisOnRetention: string; // strictly framed as testable hypothesis on 12-month continuation
  themeIds: string[];
  humanScores?: {
    userImpact: { score: number; rationale: string; scoredBy: string };
    businessMetricLink: { score: number; rationale: string; scoredBy: string };
    researchUncertainty: { score: number; rationale: string; scoredBy: string };
    potentialFeasibility: { score: number; rationale: string; scoredBy: string };
  };
}

export class OpportunityService {
  /**
   * Creates a candidate opportunity strictly grounded in themes and problem statements
   */
  static async createOpportunity(input: CreateOpportunityInput) {
    await initializeDatabase();

    if (!input.title || !input.title.trim()) {
      throw new Error('Opportunity title is required.');
    }
    if (!input.problemStatement || !input.problemStatement.trim()) {
      throw new Error('Problem statement is required. Must define the user problem without predetermining a solution.');
    }
    if (!input.hypothesisOnRetention || !input.hypothesisOnRetention.trim()) {
      throw new Error('Hypothesis on 12-month active SIP continuation is required.');
    }

    const opportunityId = crypto.randomUUID();

    await db.insert(opportunities).values({
      id: opportunityId,
      title: input.title.trim(),
      problemStatement: input.problemStatement.trim(),
      hypothesisOnRetention: input.hypothesisOnRetention.trim(),
      status: 'under_evaluation',
      weightsSnapshot: JSON.stringify(DEFAULT_OPPORTUNITY_WEIGHTS),
      compositeScore: 0,
    });

    // Link themes
    for (const themeId of input.themeIds) {
      await db.insert(opportunityThemes).values({
        id: crypto.randomUUID(),
        opportunityId,
        themeId,
      });
    }

    // Insert human scores if provided
    if (input.humanScores) {
      const { userImpact, businessMetricLink, researchUncertainty, potentialFeasibility } =
        input.humanScores;

      const items = [
        {
          criterion: 'user_impact',
          rawScore: userImpact.score,
          normalizedScore: (userImpact.score / 5) * 100,
          basis: 'human_judgement',
          rationale: userImpact.rationale,
          scoredBy: userImpact.scoredBy,
        },
        {
          criterion: 'business_metric_link',
          rawScore: businessMetricLink.score,
          normalizedScore: (businessMetricLink.score / 5) * 100,
          basis: 'human_judgement',
          rationale: businessMetricLink.rationale,
          scoredBy: businessMetricLink.scoredBy,
        },
        {
          criterion: 'research_uncertainty',
          rawScore: researchUncertainty.score,
          normalizedScore: (researchUncertainty.score / 5) * 100,
          basis: 'human_judgement',
          rationale: researchUncertainty.rationale,
          scoredBy: researchUncertainty.scoredBy,
        },
        {
          criterion: 'potential_feasibility',
          rawScore: potentialFeasibility.score,
          normalizedScore: (potentialFeasibility.score / 5) * 100,
          basis: 'human_judgement',
          rationale: potentialFeasibility.rationale,
          scoredBy: potentialFeasibility.scoredBy,
        },
      ];

      for (const item of items) {
        await db.insert(opportunityScores).values({
          id: crypto.randomUUID(),
          opportunityId,
          ...item,
        });
      }
    }

    // Compute composite score
    await this.recalculateOpportunityScore(opportunityId, DEFAULT_OPPORTUNITY_WEIGHTS);

    return { opportunityId };
  }

  /**
   * Recalculates component and composite scores without double-counting duplicates
   */
  static async recalculateOpportunityScore(
    opportunityId: string,
    weights: OpportunityWeights = DEFAULT_OPPORTUNITY_WEIGHTS
  ) {
    await initializeDatabase();

    // 1. Fetch linked themes
    const linkedThemeRows = await db
      .select({ themeId: opportunityThemes.themeId })
      .from(opportunityThemes)
      .where(eq(opportunityThemes.opportunityId, opportunityId))
      .all();

    const themeIds = linkedThemeRows.map((r) => r.themeId);
    if (themeIds.length === 0) return null;

    // 2. Fetch all linked evidence records
    const links = await db
      .select({ evidenceId: evidenceThemeLinks.evidenceId })
      .from(evidenceThemeLinks)
      .where(inArray(evidenceThemeLinks.themeId, themeIds))
      .all();

    const evidenceIds = Array.from(new Set(links.map((l) => l.evidenceId)));
    if (evidenceIds.length === 0) {
      return {
        compositeScore: 0,
        independentRecordCount: 0,
        sourceDiversityCount: 0,
        isThinEvidence: true,
      };
    }

    const records = await db
      .select()
      .from(evidenceRecords)
      .where(inArray(evidenceRecords.id, evidenceIds))
      .all();

    // 3. COLLAPSE DUPLICATES: Group by canonical root (duplicateOfId) and contentHash
    // Duplicate records must not inflate independent evidence counts.
    const seenHashes = new Set<string>();
    const seenCanonicalIds = new Set<string>();
    const independentRecords: typeof records = [];

    for (const record of records) {
      const canonicalId = record.duplicateOfId || record.id;
      if (seenCanonicalIds.has(canonicalId) || seenCanonicalIds.has(record.id)) {
        continue;
      }
      if (seenHashes.has(record.contentHash)) {
        continue;
      }
      seenHashes.add(record.contentHash);
      seenCanonicalIds.add(canonicalId);
      seenCanonicalIds.add(record.id);
      independentRecords.push(record);
    }
    const independentRecordCount = independentRecords.length;

    // 4. Source Diversity (distinct platforms among independent records)
    const distinctPlatforms = Array.from(new Set(independentRecords.map((r) => r.platform)));
    const sourceDiversityCount = distinctPlatforms.length;
    // Normalize source diversity: 1 platform = 20%, 2 = 50%, 3 = 80%, >=4 = 100%
    const normalizedDiversity = Math.min(100, sourceDiversityCount * 25);

    // 5. Evidence Strength: Proportion of independent records with verified source + human-confirmed review
    const allReviews = await db
      .select()
      .from(reviews)
      .where(inArray(reviews.evidenceId, independentRecords.map((r) => r.id)))
      .all();

    const confirmedEvidenceIds = new Set(
      allReviews.filter((r) => r.decision === 'confirmed').map((r) => r.evidenceId)
    );

    let weightedEvidencePoints = 0;
    let contentVerifiedCount = 0;
    let linkCheckedCount = 0;
    let syntheticFixtureCount = 0;
    let userEnteredCount = 0;
    let unverifiedCount = 0;

    for (const r of independentRecords) {
      const prov = JSON.parse(r.fieldProvenance || '{}');
      const isConfirmed = confirmedEvidenceIds.has(r.id);
      const status = r.verificationStatus || prov.sourceUrl || 'unverified';

      if (status === 'content_verified' || status === 'verified_live' || status === 'verified') {
        contentVerifiedCount++;
        weightedEvidencePoints += isConfirmed ? 1.0 : 0.8;
      } else if (status === 'link_checked') {
        linkCheckedCount++;
        weightedEvidencePoints += isConfirmed ? 0.8 : 0.6;
      } else if (status === 'synthetic_fixture' || status === 'curated_benchmark' || r.isSynthetic) {
        syntheticFixtureCount++;
        weightedEvidencePoints += isConfirmed ? 0.6 : 0.4;
      } else if (status === 'user_entered') {
        userEnteredCount++;
        weightedEvidencePoints += isConfirmed ? 0.4 : 0.2;
      } else {
        unverifiedCount++;
        weightedEvidencePoints += isConfirmed ? 0.2 : 0.0;
      }
    }

    const evidenceStrengthRatio =
      independentRecordCount > 0 ? weightedEvidencePoints / independentRecordCount : 0;
    const normalizedEvidenceStrength = Math.min(100, Number((evidenceStrengthRatio * 100).toFixed(1)));

    // Independent record score (diminishing returns log scale, 1 record = 20, 5 = 60, 10+ = 100)
    const normalizedRecordsScore = Math.min(100, Math.log10(independentRecordCount + 1) * 95);

    // Fetch existing human scores
    const existingScores = await db
      .select()
      .from(opportunityScores)
      .where(eq(opportunityScores.opportunityId, opportunityId))
      .all();

    const humanScoreMap = new Map(existingScores.map((s) => [s.criterion, s]));

    const userImpactNorm = humanScoreMap.get('user_impact')?.normalizedScore ?? 50;
    const businessLinkNorm = humanScoreMap.get('business_metric_link')?.normalizedScore ?? 50;
    const uncertaintyRaw = humanScoreMap.get('research_uncertainty')?.rawScore ?? 3;
    // Uncertainty is INVERTED for composite score (lower uncertainty = higher priority)
    const invertedUncertaintyNorm = Math.max(0, 100 - (uncertaintyRaw / 5) * 100);
    const feasibilityNorm = humanScoreMap.get('potential_feasibility')?.normalizedScore ?? 50;

    // Store or update computed scores
    const computedItems = [
      {
        criterion: 'evidence_strength',
        rawScore: Number((evidenceStrengthRatio * 5).toFixed(1)),
        normalizedScore: Number(normalizedEvidenceStrength.toFixed(1)),
        basis: 'computed',
        rationale: `Computed across ${independentRecordCount} independent non-duplicate records: ${contentVerifiedCount} content-verified, ${linkCheckedCount} link-checked, ${syntheticFixtureCount} synthetic/benchmark fixtures, ${userEnteredCount} user-entered, ${unverifiedCount} unverified. Human confirmation rate: ${confirmedEvidenceIds.size}/${independentRecordCount}. Provenance-weighted strength: ${normalizedEvidenceStrength}%.`,
        scoredBy: 'System Engine',
      },
      {
        criterion: 'independent_records',
        rawScore: Math.min(5, Number((independentRecordCount / 2).toFixed(1))),
        normalizedScore: Number(normalizedRecordsScore.toFixed(1)),
        basis: 'computed',
        rationale: `Derived from ${independentRecordCount} distinct non-duplicate records (duplicates collapsed by content hash and canonical duplicateOfId).`,
        scoredBy: 'System Engine',
      },
      {
        criterion: 'source_diversity',
        rawScore: Math.min(5, sourceDiversityCount),
        normalizedScore: Number(normalizedDiversity.toFixed(1)),
        basis: 'computed',
        rationale: `Observed across ${sourceDiversityCount} distinct channel(s): ${distinctPlatforms.join(', ')}.`,
        scoredBy: 'System Engine',
      },
    ];

    for (const comp of computedItems) {
      const existing = existingScores.find((s) => s.criterion === comp.criterion);
      if (existing) {
        await db
          .update(opportunityScores)
          .set({
            rawScore: comp.rawScore,
            normalizedScore: comp.normalizedScore,
            rationale: comp.rationale,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(opportunityScores.id, existing.id));
      } else {
        await db.insert(opportunityScores).values({
          id: crypto.randomUUID(),
          opportunityId,
          ...comp,
        });
      }
    }

    // Helper to compute composite for arbitrary weights
    const computeForWeights = (w: OpportunityWeights) => {
      const sumW =
        w.evidenceStrength +
        w.independentRecords +
        w.sourceDiversity +
        w.userImpact +
        w.businessMetricLink +
        w.researchUncertainty +
        w.potentialFeasibility;
      if (sumW <= 0) return 0;
      const score =
        (normalizedEvidenceStrength * w.evidenceStrength +
          normalizedRecordsScore * w.independentRecords +
          normalizedDiversity * w.sourceDiversity +
          userImpactNorm * w.userImpact +
          businessLinkNorm * w.businessMetricLink +
          invertedUncertaintyNorm * w.researchUncertainty +
          feasibilityNorm * w.potentialFeasibility) /
        sumW;
      return Number(score.toFixed(1));
    };

    const compositeScore = computeForWeights(weights);

    await db
      .update(opportunities)
      .set({
        compositeScore,
        weightsSnapshot: JSON.stringify(weights),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(opportunities.id, opportunityId));

    return {
      opportunityId,
      compositeScore,
      independentRecordCount,
      sourceDiversityCount,
      isThinEvidence: independentRecordCount < 3,
      components: {
        evidenceStrength: normalizedEvidenceStrength,
        independentRecords: normalizedRecordsScore,
        sourceDiversity: normalizedDiversity,
        userImpact: userImpactNorm,
        businessMetricLink: businessLinkNorm,
        researchUncertaintyInverted: invertedUncertaintyNorm,
        potentialFeasibility: feasibilityNorm,
      },
    };
  }

  /**
   * Lists all candidate opportunities with component breakdowns, sensitivity analysis,
   * direct evidence lineage, and documented qualitative limitations.
   */
  static async listOpportunities() {
    await initializeDatabase();

    const opps = await db.select().from(opportunities).orderBy(desc(opportunities.compositeScore)).all();
    const scores = await db.select().from(opportunityScores).all();
    const oppThemes = await db.select().from(opportunityThemes).all();
    const allThemes = await db.select().from(themes).all();
    const allLinks = await db.select().from(evidenceThemeLinks).all();
    const allRecords = await db.select().from(evidenceRecords).all();

    const themeMap = new Map(allThemes.map((t) => [t.id, t]));
    const recordMap = new Map(allRecords.map((r) => [r.id, r]));

    return opps.map((opp) => {
      const oppScores = scores.filter((s) => s.opportunityId === opp.id);
      const linkedThemeIds = oppThemes.filter((ot) => ot.opportunityId === opp.id).map((ot) => ot.themeId);
      const linkedThemes = linkedThemeIds.map((id) => themeMap.get(id)).filter(Boolean);

      // Find all evidence records supporting the linked themes
      const relevantEvidenceIds = Array.from(
        new Set(
          allLinks
            .filter((l) => linkedThemeIds.includes(l.themeId))
            .map((l) => l.evidenceId)
        )
      );

      const linkedEvidence = relevantEvidenceIds
        .map((id) => recordMap.get(id))
        .filter(Boolean)
        .map((r) => ({
          id: r!.id,
          originalText: r!.originalText,
          sourceUrl: r!.sourceUrl,
          platform: r!.platform,
          journeyStage: r!.journeyStage,
          verificationStatus: r!.verificationStatus,
          isSynthetic: r!.isSynthetic,
          duplicateOfId: r!.duplicateOfId,
          provenance: JSON.parse(r!.fieldProvenance || '{}'),
        }));

      const independentScore = oppScores.find((s) => s.criterion === 'independent_records');
      const independentCount = independentScore ? Math.round((independentScore.rawScore || 0) * 2) : linkedEvidence.length;

      // Extract components for sensitivity calculation
      const compMap = new Map(oppScores.map((s) => [s.criterion, s.normalizedScore]));
      const evStrength = compMap.get('evidence_strength') ?? 50;
      const indepRecords = compMap.get('independent_records') ?? 50;
      const srcDiv = compMap.get('source_diversity') ?? 50;
      const uImpact = compMap.get('user_impact') ?? 50;
      const bMetric = compMap.get('business_metric_link') ?? 50;
      const uncRaw = (oppScores.find((s) => s.criterion === 'research_uncertainty')?.rawScore ?? 3);
      const uncInverted = Math.max(0, 100 - (uncRaw / 5) * 100);
      const feas = compMap.get('potential_feasibility') ?? 50;

      const calcForW = (w: OpportunityWeights) => {
        const sum =
          w.evidenceStrength +
          w.independentRecords +
          w.sourceDiversity +
          w.userImpact +
          w.businessMetricLink +
          w.researchUncertainty +
          w.potentialFeasibility;
        if (sum <= 0) return 0;
        return Number(
          (
            (evStrength * w.evidenceStrength +
              indepRecords * w.independentRecords +
              srcDiv * w.sourceDiversity +
              uImpact * w.userImpact +
              bMetric * w.businessMetricLink +
              uncInverted * w.researchUncertainty +
              feas * w.potentialFeasibility) /
            sum
          ).toFixed(1)
        );
      };

      // Sensitivity Presets
      const sensitivityScenarios = [
        {
          id: 'balanced',
          name: 'Balanced (Equal Weights)',
          description: 'All 7 criteria weighted equally at 1.0',
          score: calcForW({
            evidenceStrength: 1,
            independentRecords: 1,
            sourceDiversity: 1,
            userImpact: 1,
            businessMetricLink: 1,
            researchUncertainty: 1,
            potentialFeasibility: 1,
          }),
        },
        {
          id: 'evidence_first',
          name: 'Evidence-Heavy (High Verification)',
          description: 'Focuses heavily on independent non-duplicate records and provenance verification',
          score: calcForW({
            evidenceStrength: 3,
            independentRecords: 3,
            sourceDiversity: 2,
            userImpact: 1,
            businessMetricLink: 1,
            researchUncertainty: 2,
            potentialFeasibility: 1,
          }),
        },
        {
          id: 'impact_first',
          name: 'Impact-First (Strategic Potential)',
          description: 'Prioritizes immediate user severity and 12-month retention metric linkage',
          score: calcForW({
            evidenceStrength: 1,
            independentRecords: 1,
            sourceDiversity: 1,
            userImpact: 3,
            businessMetricLink: 3,
            researchUncertainty: 1,
            potentialFeasibility: 2,
          }),
        },
        {
          id: 'conservative',
          name: 'Conservative (Low Uncertainty)',
          description: 'Penalizes high research ambiguity and prioritizes immediate technical feasibility',
          score: calcForW({
            evidenceStrength: 2,
            independentRecords: 2,
            sourceDiversity: 1,
            userImpact: 1,
            businessMetricLink: 1,
            researchUncertainty: 3,
            potentialFeasibility: 3,
          }),
        },
      ];

      // Missing information & methodological caveats
      const missingInformation = [
        'Opportunity conclusions are testable hypotheses on 12-month retention, NOT proven causes of SIP churn.',
        'Backend bank ledger transaction drop-off logs are missing; signal is derived from qualitative app reviews and community threads.',
        'Public complaint frequency cannot be equated with cohort churn prevalence (vocal minority bias).',
        'Hypothesis on 12-month retention requires primary quantitative validation via a randomized controlled trial (A/B test).',
      ];

      return {
        ...opp,
        weightsSnapshot: JSON.parse(opp.weightsSnapshot || '{}') as OpportunityWeights,
        linkedThemes,
        linkedEvidence,
        scores: oppScores,
        sensitivityScenarios,
        missingInformation,
        isThinEvidence: independentCount < 3,
      };
    });
  }
}
