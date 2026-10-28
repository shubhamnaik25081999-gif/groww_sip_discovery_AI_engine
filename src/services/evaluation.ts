import { db, initializeDatabase } from '@/db';
import {
  goldenLabels,
  evaluationRuns,
  evaluationItems,
  recordAnalyses,
  evidenceRecords,
  themes,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

export type SpecialLabel = 'standard' | 'insufficient_evidence' | 'ambiguous';

export interface AddGoldenLabelInput {
  evidenceId: string;
  themeId?: string | null;
  themeName?: string | null;
  specialLabel?: SpecialLabel;
  journeyStage: string;
  observedBehaviour?: string;
  labeller: string;
  rationale: string;
  labelledBlind?: boolean;
}

export interface ThemeMetric {
  themeName: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  support: number;
  precision: number | null; // null if precision undefined (0 denominator)
  recall: number | null;
  f1: number | null;
  statisticallyMeaningful: boolean; // true if support >= 3
}

export interface ConfusionMatrixCell {
  actual: string;
  predicted: string;
  count: number;
}

export class EvaluationService {
  /**
   * Records a human-verified golden label independently of AI output
   */
  static async addGoldenLabel(input: AddGoldenLabelInput) {
    await initializeDatabase();

    if (!input.rationale || !input.rationale.trim()) {
      throw new Error('A detailed justification is required for every golden-set ground-truth label.');
    }

    let themeId = input.themeId || null;
    if (!themeId && input.themeName && input.themeName.trim()) {
      const trimmedName = input.themeName.trim();
      const existingTheme = await db
        .select()
        .from(themes)
        .where(eq(themes.name, trimmedName))
        .limit(1);

      if (existingTheme.length > 0) {
        themeId = existingTheme[0].id;
      } else {
        const newThemeId = crypto.randomUUID();
        const slug = trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await db.insert(themes).values({
          id: newThemeId,
          name: trimmedName,
          slug,
          description: `Discovered from blind ground truth: ${trimmedName}`,
          journeyStage: input.journeyStage,
          origin: 'human_created',
          status: 'accepted',
        });
        themeId = newThemeId;
      }
    }

    const labelId = crypto.randomUUID();

    // Upsert golden label
    const existing = await db
      .select()
      .from(goldenLabels)
      .where(eq(goldenLabels.evidenceId, input.evidenceId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(goldenLabels)
        .set({
          themeId: themeId || null,
          specialLabel: input.specialLabel || 'standard',
          journeyStage: input.journeyStage,
          observedBehaviour: input.observedBehaviour || null,
          labeller: input.labeller,
          rationale: input.rationale,
          labelledBlind: input.labelledBlind !== undefined ? Boolean(input.labelledBlind) : true,
          labelledAt: new Date().toISOString(),
        })
        .where(eq(goldenLabels.evidenceId, input.evidenceId));

      return { labelId: existing[0].id, updated: true };
    }

    await db.insert(goldenLabels).values({
      id: labelId,
      evidenceId: input.evidenceId,
      themeId: themeId || null,
      specialLabel: input.specialLabel || 'standard',
      journeyStage: input.journeyStage,
      observedBehaviour: input.observedBehaviour || null,
      labeller: input.labeller,
      rationale: input.rationale,
      labelledBlind: input.labelledBlind !== undefined ? Boolean(input.labelledBlind) : true,
    });

    return { labelId, updated: false };
  }

  /**
   * Lists all registered golden set labels
   */
  static async listGoldenLabels() {
    await initializeDatabase();
    const rows = await db
      .select({
        id: goldenLabels.id,
        evidenceId: goldenLabels.evidenceId,
        themeId: goldenLabels.themeId,
        specialLabel: goldenLabels.specialLabel,
        journeyStage: goldenLabels.journeyStage,
        observedBehaviour: goldenLabels.observedBehaviour,
        labeller: goldenLabels.labeller,
        rationale: goldenLabels.rationale,
        labelledBlind: goldenLabels.labelledBlind,
        labelledAt: goldenLabels.labelledAt,
        evidenceText: evidenceRecords.originalText,
        sourceUrl: evidenceRecords.sourceUrl,
        platform: evidenceRecords.platform,
        themeName: themes.name,
      })
      .from(goldenLabels)
      .innerJoin(evidenceRecords, eq(goldenLabels.evidenceId, evidenceRecords.id))
      .leftJoin(themes, eq(goldenLabels.themeId, themes.id))
      .orderBy(desc(goldenLabels.labelledAt))
      .all();

    return rows;
  }

  /**
   * Executes a formal evaluation run comparing an AI analysis run against the golden ground truth
   */
  static async evaluateAnalysisRun(analysisRunId: string) {
    await initializeDatabase();

    // 1. Fetch all golden labels
    const goldens = await this.listGoldenLabels();
    if (goldens.length === 0) {
      throw new Error('Cannot run evaluation: No golden-set labels have been registered yet.');
    }

    // 2. Fetch record analyses for this analysis run
    const analyses = await db
      .select()
      .from(recordAnalyses)
      .where(eq(recordAnalyses.runId, analysisRunId))
      .all();

    const analysisByEvidenceId = new Map(analyses.map((a) => [a.evidenceId, a]));

    const evalRunId = crypto.randomUUID();
    let exactMatches = 0;
    let evaluatedCount = 0;
    let abstentionMatches = 0;
    let totalAbstentionGoldens = 0;

    const evalItemsToInsert = [];
    const confusionMap = new Map<string, number>(); // "actual:::predicted" -> count
    const errorCategoryCounts: Record<string, number> = {
      wrong_theme: 0,
      missed_abstention: 0,
      unwarranted_abstention: 0,
      unsupported_context: 0,
      excerpt_mismatch: 0,
      inference_as_observation: 0,
      none: 0,
    };

    // Track per-theme TP, FP, FN
    const allThemeNames = new Set<string>();
    const tpMap = new Map<string, number>();
    const fpMap = new Map<string, number>();
    const fnMap = new Map<string, number>();
    const supportMap = new Map<string, number>();

    for (const golden of goldens) {
      const analysis = analysisByEvidenceId.get(golden.evidenceId);
      if (!analysis) continue; // Record was not part of this analysis run

      evaluatedCount++;
      const parsedAi = analysis.parsedOutput ? JSON.parse(analysis.parsedOutput) : null;

      // Determine predicted class
      let predictedClass = 'unclassified';
      if (parsedAi) {
        if (parsedAi.abstainReason) {
          predictedClass = 'abstention';
        } else if (parsedAi.theme?.name) {
          predictedClass = parsedAi.theme.name.trim();
        }
      }

      // Determine actual class
      let actualClass = golden.themeName ? golden.themeName.trim() : golden.specialLabel;
      if (golden.specialLabel === 'insufficient_evidence') {
        actualClass = 'abstention';
        totalAbstentionGoldens++;
      }

      allThemeNames.add(actualClass);
      allThemeNames.add(predictedClass);

      supportMap.set(actualClass, (supportMap.get(actualClass) || 0) + 1);

      // Check match
      const isMatch = actualClass.toLowerCase() === predictedClass.toLowerCase();

      // Classify error category
      let errorCategory:
        | 'none'
        | 'wrong_theme'
        | 'missed_abstention'
        | 'unwarranted_abstention'
        | 'unsupported_context'
        | 'excerpt_mismatch'
        | 'inference_as_observation' = 'none';

      if (isMatch) {
        exactMatches++;
        if (actualClass === 'abstention') {
          abstentionMatches++;
        }
        tpMap.set(actualClass, (tpMap.get(actualClass) || 0) + 1);
        errorCategoryCounts.none++;
      } else {
        // Classify the failure mode
        if (actualClass === 'abstention' && predictedClass !== 'abstention') {
          errorCategory = 'missed_abstention';
          errorCategoryCounts.missed_abstention++;
        } else if (actualClass !== 'abstention' && predictedClass === 'abstention') {
          errorCategory = 'unwarranted_abstention';
          errorCategoryCounts.unwarranted_abstention++;
        } else if (analysis.validationStatus === 'guard_failed') {
          if (analysis.validationErrors?.includes('Excerpt Mismatch')) {
            errorCategory = 'excerpt_mismatch';
            errorCategoryCounts.excerpt_mismatch++;
          } else {
            errorCategory = 'unsupported_context';
            errorCategoryCounts.unsupported_context++;
          }
        } else {
          errorCategory = 'wrong_theme';
          errorCategoryCounts.wrong_theme++;
        }

        fpMap.set(predictedClass, (fpMap.get(predictedClass) || 0) + 1);
        fnMap.set(actualClass, (fnMap.get(actualClass) || 0) + 1);
      }

      // Record confusion
      const pairKey = `${actualClass}:::${predictedClass}`;
      confusionMap.set(pairKey, (confusionMap.get(pairKey) || 0) + 1);

      evalItemsToInsert.push({
        id: crypto.randomUUID(),
        evaluationRunId: evalRunId,
        evidenceId: golden.evidenceId,
        goldenLabelId: golden.id,
        recordAnalysisId: analysis.id,
        predictedTheme: predictedClass,
        actualTheme: actualClass,
        isMatch: Boolean(isMatch),
        errorCategory,
      });
    }

    if (evaluatedCount === 0) {
      throw new Error('None of the golden set records were analyzed in this run.');
    }

    const accuracy = exactMatches / evaluatedCount;
    const abstentionAccuracy =
      totalAbstentionGoldens > 0 ? abstentionMatches / totalAbstentionGoldens : null;

    // Calculate per-theme metrics
    const themeMetrics: ThemeMetric[] = [];
    for (const themeName of allThemeNames) {
      const tp = tpMap.get(themeName) || 0;
      const fp = fpMap.get(themeName) || 0;
      const fn = fnMap.get(themeName) || 0;
      const support = supportMap.get(themeName) || 0;

      const precision = tp + fp > 0 ? tp / (tp + fp) : null;
      const recall = tp + fn > 0 ? tp / (tp + fn) : null;
      const f1 =
        precision !== null && recall !== null && precision + recall > 0
          ? (2 * (precision * recall)) / (precision + recall)
          : null;

      themeMetrics.push({
        themeName,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        support,
        precision,
        recall,
        f1,
        statisticallyMeaningful: support >= 3,
      });
    }

    // Build confusion matrix array
    const confusionMatrix: ConfusionMatrixCell[] = [];
    for (const [key, count] of confusionMap.entries()) {
      const [actual, predicted] = key.split(':::');
      confusionMatrix.push({ actual, predicted, count });
    }

    // Save evaluation run
    await db.insert(evaluationRuns).values({
      id: evalRunId,
      analysisRunId,
      totalGoldenRecords: evaluatedCount,
      exactMatches,
      accuracy,
      metricsByTheme: JSON.stringify(themeMetrics),
      confusionMatrix: JSON.stringify(confusionMatrix),
      abstentionAccuracy,
      commonErrorCategories: JSON.stringify(errorCategoryCounts),
      smallSampleWarning: evaluatedCount < 50,
    });

    // Save evaluation items
    for (const item of evalItemsToInsert) {
      await db.insert(evaluationItems).values(item);
    }

    return {
      evalRunId,
      analysisRunId,
      totalGoldenRecords: evaluatedCount,
      exactMatches,
      accuracy,
      themeMetrics,
      confusionMatrix,
      abstentionAccuracy,
      errorCategoryCounts,
      smallSampleWarning: evaluatedCount < 50,
      warningMessage:
        'Small Golden Set Diagnostic (n < 50): Metrics provide an initial diagnostic of failure modes and classification alignment, not mathematical proof of broad model generalization.',
    };
  }

  /**
   * Retrieves the latest evaluation run result
   */
  static async getLatestEvaluation() {
    await initializeDatabase();
    const runs = await db
      .select()
      .from(evaluationRuns)
      .orderBy(desc(evaluationRuns.evaluatedAt))
      .limit(1);

    if (runs.length === 0) return null;
    const run = runs[0];

    const items = await db
      .select({
        id: evaluationItems.id,
        evidenceId: evaluationItems.evidenceId,
        predictedTheme: evaluationItems.predictedTheme,
        actualTheme: evaluationItems.actualTheme,
        isMatch: evaluationItems.isMatch,
        errorCategory: evaluationItems.errorCategory,
        evidenceText: evidenceRecords.originalText,
        sourceUrl: evidenceRecords.sourceUrl,
        platform: evidenceRecords.platform,
      })
      .from(evaluationItems)
      .innerJoin(evidenceRecords, eq(evaluationItems.evidenceId, evidenceRecords.id))
      .where(eq(evaluationItems.evaluationRunId, run.id))
      .all();

    return {
      ...run,
      metricsByTheme: JSON.parse(run.metricsByTheme) as ThemeMetric[],
      confusionMatrix: JSON.parse(run.confusionMatrix) as ConfusionMatrixCell[],
      commonErrorCategories: JSON.parse(run.commonErrorCategories) as Record<string, number>,
      items,
    };
  }
}
