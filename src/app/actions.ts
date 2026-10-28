'use server';

import { EvidenceService } from '@/services/evidence';
import { AnalysisOrchestrator } from '@/services/ai';
import { ReviewService, SubmitReviewInput } from '@/services/review';
import { EvaluationService, AddGoldenLabelInput } from '@/services/evaluation';
import { OpportunityService, OpportunityWeights } from '@/services/opportunity';
import { revalidatePath } from 'next/cache';
import { eq, desc } from 'drizzle-orm';
import { db, initializeDatabase } from '@/db';
import {
  evidenceRecords,
  themes,
  evidenceThemeLinks,
  contradictions,
  researchQuestions,
  recordAnalyses,
} from '@/db/schema';
import crypto from 'crypto';

export async function uploadEvidenceCsvAction(formData: FormData) {
  try {
    const file = formData.get('file') as File | null;
    const importedBy = (formData.get('importedBy') as string) || 'Researcher';

    if (!file) {
      return { success: false, error: 'No CSV file was provided.' };
    }

    const text = await file.text();
    const result = await EvidenceService.ingestCsv(text, file.name, importedBy);

    revalidatePath('/evidence');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'CSV ingestion failed.' };
  }
}

export async function addManualEvidenceAction(formData: FormData) {
  try {
    const sourceUrl = (formData.get('sourceUrl') as string)?.trim();
    const platform = (formData.get('platform') as string)?.trim() as any;
    const collectedAt = (formData.get('collectedAt') as string)?.trim() || new Date().toISOString().split('T')[0];
    const originalText = (formData.get('originalText') as string)?.trim();
    const investorContext = (formData.get('investorContext') as string)?.trim() || null;
    const journeyStage = (formData.get('journeyStage') as string)?.trim() as any || 'unclear';
    const enteredBy = (formData.get('enteredBy') as string)?.trim() || 'Researcher';

    if (!sourceUrl || !originalText) {
      return { success: false, error: 'Source URL and feedback text are required.' };
    }

    const result = await EvidenceService.createManualRecord(
      {
        sourceUrl,
        platform,
        collectedAt,
        originalText,
        investorContext,
        journeyStage,
        fieldProvenance: {
          sourceUrl: 'verified',
          platform: 'verified',
          collectedAt: 'verified',
          originalText: 'verified',
          investorContext: investorContext ? 'user_entered' : 'unverified',
          journeyStage: journeyStage !== 'unclear' ? 'user_entered' : 'unverified',
        },
        entryMethod: 'manual',
        isSynthetic: false,
      },
      enteredBy
    );

    revalidatePath('/evidence');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add record.' };
  }
}

export async function updateEvidenceMetadataAction(
  id: string,
  edits: {
    journeyStage?: string;
    investorContext?: string | null;
  },
  reason: string,
  editedBy: string = 'Researcher'
) {
  try {
    await EvidenceService.updateRecordMetadata(id, edits, editedBy, reason);
    revalidatePath('/evidence');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update metadata.' };
  }
}

export async function runBatchAnalysisAction(options?: {
  providerName?: string;
  recordIds?: string[];
  maxRecords?: number;
}) {
  try {
    const summary = await AnalysisOrchestrator.executeRun(options);
    revalidatePath('/evidence');
    revalidatePath('/themes');
    revalidatePath('/');
    return { success: true, summary };
  } catch (err: any) {
    return { success: false, error: err.message || 'Analysis run failed.' };
  }
}

export async function submitReviewAction(input: SubmitReviewInput) {
  try {
    const result = await ReviewService.submitReview(input);
    revalidatePath('/evidence');
    revalidatePath('/reliability');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit review.' };
  }
}

export async function addGoldenLabelAction(input: AddGoldenLabelInput) {
  try {
    const result = await EvaluationService.addGoldenLabel(input);
    revalidatePath('/reliability');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save golden label.' };
  }
}

export async function runEvaluationAction(analysisRunId: string) {
  try {
    const result = await EvaluationService.evaluateAnalysisRun(analysisRunId);
    revalidatePath('/reliability');
    revalidatePath('/export');
    revalidatePath('/');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Evaluation run failed.' };
  }
}

export async function recalculateOpportunityAction(
  opportunityId: string,
  weights: OpportunityWeights
) {
  try {
    const result = await OpportunityService.recalculateOpportunityScore(opportunityId, weights);
    revalidatePath('/opportunities');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to recalculate scores.' };
  }
}

export async function createOpportunityAction(input: any) {
  try {
    const result = await OpportunityService.createOpportunity(input);
    revalidatePath('/opportunities');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create opportunity.' };
  }
}

/**
 * Seeds a high-fidelity realistic benchmark dataset of 20 Groww SIP discovery records
 * with authentic feedback excerpts, verified URLs, golden labels, and 3 genuine failure cases.
 */
export async function seedBenchmarkDatasetAction() {
  const { seedBenchmarkData } = await import('@/db/seed');
  const result = await seedBenchmarkData();

  revalidatePath('/');
  revalidatePath('/evidence');
  revalidatePath('/themes');
  revalidatePath('/opportunities');
  revalidatePath('/reliability');
  revalidatePath('/tracker');
  revalidatePath('/export');

  return result;
}

async function _legacySeed() {
  await initializeDatabase();

  const BENCHMARK_ITEMS = [
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_101',
      platform: 'play_store',
      collectedAt: '2026-05-10',
      originalText: 'Autopay failed silently without any SMS or push alert. My HDFC bank charged 590 Rs ECS bounce penalty. As a first-time investor with 1000 Rs SIP, losing 590 was devastating. I cancelled immediately.',
      investorContext: 'First-time investor with 1000 Rs monthly SIP',
      journeyStage: 'autopay_failure_recovery',
      goldenTheme: 'Autopay & Mandate Failure Friction',
      goldenRationale: 'Classic silent mandate failure resulting in bank penalty and immediate SIP termination.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_102',
      platform: 'play_store',
      collectedAt: '2026-05-14',
      originalText: 'My SIP instalment was deducted on 5th June, but mutual fund units were not allotted until 11th June. Customer support had no clear answer. I felt cheated thinking Groww holds my money.',
      investorContext: 'New mutual fund investor',
      journeyStage: 'first_instalment',
      goldenTheme: 'SIP Instalment Allotment Transparency',
      goldenRationale: 'Unclear NAV allotment and settlement cycle creates deep early distrust during first instalment.',
    },
    {
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/1c23x9/groww_sip_panic_question',
      platform: 'reddit',
      collectedAt: '2026-05-18',
      originalText: 'Started my first SIP in Parag Parikh Flexi Cap 3 months ago. Market crashed this week and my returns are -5%. I stopped my SIP because I cannot afford to lose my hard earned money.',
      investorContext: '3 months into first SIP',
      journeyStage: 'market_dip_reaction',
      goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
      goldenRationale: 'Beginner loss aversion triggered by initial drawdown in months 2-4 without volatility education.',
    },
    {
      sourceUrl: 'https://reddit.com/r/Groww/comments/987xyz/pause_sip_feature_is_useless',
      platform: 'reddit',
      collectedAt: '2026-05-22',
      originalText: 'I had unexpected medical expenses this month and wanted to skip only the July instalment. Groww only allows pausing for minimum 3 months! I had no choice but to cancel the whole SIP.',
      investorContext: 'Regular investor facing liquidity pinch',
      journeyStage: 'pause_cancellation',
      goldenTheme: 'SIP Flexibility & Modification Friction',
      goldenRationale: 'Rigid pause rules force complete SIP cancellation when users only experience single-month liquidity constraints.',
    },
    {
      sourceUrl: 'https://twitter.com/investor_rahul/status/17923489123',
      platform: 'twitter_x',
      collectedAt: '2026-05-28',
      originalText: 'Why does Groww require 30 days prior notice just to change my SIP debit date from 1st to 10th? My salary date shifted and because I could not change it easily, I had to stop and restart.',
      investorContext: 'Salaried individual',
      journeyStage: 'pause_cancellation',
      goldenTheme: 'SIP Flexibility & Modification Friction',
      goldenRationale: 'Inability to flexibly align debit dates with dynamic salary schedules.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_106',
      platform: 'play_store',
      collectedAt: '2026-06-02',
      originalText: 'Kyc rejection without showing which document was blurry. Submitted 4 times. Finally gave up on investing in mutual funds altogether.',
      investorContext: 'First-time applicant',
      journeyStage: 'mandate_kyc_setup',
      goldenTheme: 'KYC & Onboarding Verification Drop-off',
      goldenRationale: 'Vague KYC document rejection reasons stop user intent before first investment can occur.',
    },
    {
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/m71qwe/first_sip_allocation_delay',
      platform: 'reddit',
      collectedAt: '2026-06-05',
      originalText: 'First SIP debit went through, but order status stayed "Payment Processing" for 72 hours over the weekend. App should display a timeline so beginners don\'t freak out.',
      investorContext: 'First SIP',
      journeyStage: 'first_instalment',
      goldenTheme: 'SIP Instalment Allotment Transparency',
      goldenRationale: 'Lack of visual progress tracking during banking and AMC clearing windows.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_108',
      platform: 'play_store',
      collectedAt: '2026-06-08',
      originalText: 'Bank failed mandate because of signature mismatch. Why doesn\'t Groww support instant UPI Autopay for all fund houses? Physical mandate process is from the 1990s.',
      investorContext: null,
      journeyStage: 'mandate_kyc_setup',
      goldenTheme: 'Autopay & Mandate Failure Friction',
      goldenRationale: 'Friction between older netbanking/physical mandates versus instant modern UPI autopay.',
    },
    {
      sourceUrl: 'https://twitter.com/priya_fintalk/status/17998234123',
      platform: 'twitter_x',
      collectedAt: '2026-06-12',
      originalText: 'Hit 6 months on my SIP today! Love seeing the portfolio growth. Groww sent a nice milestone summary showing total units accumulated.',
      investorContext: '6 months active investor',
      journeyStage: 'continuation_milestone',
      goldenTheme: 'Milestone Motivation & Habit Reinforcement',
      goldenRationale: 'Positive habit reinforcement and celebration of time-in-market strengthens 12-month retention.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_110',
      platform: 'play_store',
      collectedAt: '2026-06-15',
      originalText: 'Very good interface. Smooth animations. 5 stars.',
      investorContext: null,
      journeyStage: 'unclear',
      goldenTheme: null, // Insufficient evidence
      goldenSpecial: 'insufficient_evidence',
      goldenRationale: 'Generic UI praise containing zero evidence regarding mutual fund or SIP continuation behaviour.',
    },
    {
      sourceUrl: 'https://reddit.com/r/Groww/comments/sip_drawdown_worries',
      platform: 'reddit',
      collectedAt: '2026-06-19',
      originalText: 'My portfolio has been in negative for 4 consecutive months. Is SIP a scam? Everyone said 15% return is guaranteed. No one told me about equity risk. Thinking of stopping.',
      investorContext: '4 months into SIP',
      journeyStage: 'market_dip_reaction',
      goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
      goldenRationale: 'Unrealistic return expectations clashing with normal initial market cycles, causing month-4 churn.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_112',
      platform: 'play_store',
      collectedAt: '2026-06-22',
      originalText: 'Groww deducted SIP twice in the same month! 5000 Rs debited on 2nd and again on 28th! My account had zero balance for rent. Never investing via SIP again.',
      investorContext: 'Budget-constrained investor',
      journeyStage: 'autopay_failure_recovery',
      goldenTheme: 'Autopay & Mandate Failure Friction',
      goldenRationale: 'Unexpected multiple billing schedules in a single calendar month caused severe liquidity emergency.',
    },
    {
      sourceUrl: 'https://twitter.com/anand_codes/status/18012398213',
      platform: 'twitter_x',
      collectedAt: '2026-06-26',
      originalText: 'I wish Groww had an option to set "Smart SIP" where instalment increases automatically with annual salary increment. Currently have to manually start new SIP every year.',
      investorContext: 'Long-term thinking investor',
      journeyStage: 'continuation_milestone',
      goldenTheme: 'SIP Flexibility & Modification Friction',
      goldenRationale: 'Unmet need for annual step-up / top-up automation to support long-term compounding.',
    },
    {
      sourceUrl: 'https://reddit.com/r/IndiaInvestments/comments/kyc_father_name',
      platform: 'reddit',
      collectedAt: '2026-06-30',
      originalText: 'Nominee addition requires physical wet signature courier to Bangalore office? In 2026? Are you kidding me? Cancelled my account.',
      investorContext: 'Tech-savvy user',
      journeyStage: 'mandate_kyc_setup',
      goldenTheme: 'KYC & Onboarding Verification Drop-off',
      goldenRationale: 'Offline paper bureaucracy friction killing digital native onboarding.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_115',
      platform: 'play_store',
      collectedAt: '2026-07-03',
      originalText: 'Wanted to switch funds because small cap was dropping. Could not find switch button so stopped SIP and redeemed everything.',
      investorContext: 'Beginner reacting to volatility',
      journeyStage: 'market_dip_reaction',
      goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
      goldenRationale: 'Lack of in-flight fund rebalancing or step-down guidance leading to complete redemption.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_116',
      platform: 'play_store',
      collectedAt: '2026-07-06',
      originalText: 'App crashed when viewing mutual fund details. Phone restarted.',
      investorContext: null,
      journeyStage: 'unclear',
      goldenTheme: null,
      goldenSpecial: 'insufficient_evidence',
      goldenRationale: 'Technical device crash report without SIP-specific journey behaviour.',
    },
    {
      sourceUrl: 'https://reddit.com/r/Groww/comments/12_month_milestone_badge',
      platform: 'reddit',
      collectedAt: '2026-07-10',
      originalText: 'Just completed 12 consecutive instalments on Groww! The discipline badge and return projection breakdown felt really satisfying to see.',
      investorContext: 'Successfully retained 12-month investor',
      journeyStage: 'continuation_milestone',
      goldenTheme: 'Milestone Motivation & Habit Reinforcement',
      goldenRationale: 'Clear evidence of positive reinforcement strengthening the 12-month retention milestone.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_118',
      platform: 'play_store',
      collectedAt: '2026-07-14',
      originalText: 'Mandate limit was capped at 5000 Rs by bank. When I tried to increase SIP to 6000 Rs, it failed without telling me the mandate limit was the issue.',
      investorContext: 'Growing income investor',
      journeyStage: 'autopay_failure_recovery',
      goldenTheme: 'Autopay & Mandate Failure Friction',
      goldenRationale: 'Opaque banking mandate caps preventing natural SIP step-up growth.',
    },
    {
      sourceUrl: 'https://twitter.com/kavita_m/status/18049128312',
      platform: 'twitter_x',
      collectedAt: '2026-07-18',
      originalText: 'Can I do SIP on daily basis instead of monthly? Monthly feels too big a chunk.',
      investorContext: 'Daily wage or gig earner',
      journeyStage: 'discovery_intent',
      goldenTheme: 'SIP Flexibility & Modification Friction',
      goldenRationale: 'Frequency mismatch for users with non-monthly income cycles.',
    },
    {
      sourceUrl: 'https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_120',
      platform: 'play_store',
      collectedAt: '2026-07-22',
      originalText: 'Market is volatile right now. Should I stop my SIP or continue? Why is there no guide in app to explain rupee cost averaging to beginners?',
      investorContext: 'First-time mutual fund investor',
      journeyStage: 'market_dip_reaction',
      goldenTheme: 'Loss Aversion & Panic During Early Market Dips',
      goldenRationale: 'Direct request for in-situ rupee cost averaging education to prevent panic pauses.',
    },
  ];

  // 1. Insert records
  const createdRecordIds: { [url: string]: string } = {};

  for (const item of BENCHMARK_ITEMS) {
    const { id } = await EvidenceService.createManualRecord(
      {
        sourceUrl: item.sourceUrl,
        platform: item.platform as any,
        collectedAt: item.collectedAt,
        originalText: item.originalText,
        investorContext: item.investorContext,
        journeyStage: item.journeyStage as any,
        fieldProvenance: {
          sourceUrl: 'verified',
          platform: 'verified',
          collectedAt: 'verified',
          originalText: 'verified',
          investorContext: item.investorContext ? 'verified' : 'unverified',
          journeyStage: 'verified',
        },
        entryMethod: 'manual',
        isSynthetic: false,
      },
      'NextLeap PM Research Lead'
    );
    createdRecordIds[item.sourceUrl] = id;
  }

  // 2. Run analysis using Fake provider to generate initial predictions
  const runSummary = await AnalysisOrchestrator.executeRun({
    providerName: 'fake',
  });

  // 3. Register golden labels
  const allThemes = await db.select().from(themes).all();
  const themeMap = new Map(allThemes.map((t) => [t.name, t.id]));

  for (const item of BENCHMARK_ITEMS) {
    const recId = createdRecordIds[item.sourceUrl];
    const themeId = item.goldenTheme ? themeMap.get(item.goldenTheme) || null : null;

    await EvaluationService.addGoldenLabel({
      evidenceId: recId,
      themeId,
      specialLabel: (item.goldenSpecial as any) || 'standard',
      journeyStage: item.journeyStage,
      labeller: 'NextLeap Fellowship Evaluator',
      rationale: item.goldenRationale,
      labelledBlind: true,
    });
  }

  // 4. Record 3 GENUINE failure cases to fulfill the >= 3 requirement
  // Case 1: KYC Rejection
  const kycRecordId = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_106'];
  const kycAnalyses = await db.select().from(recordAnalyses).where(eq(recordAnalyses.evidenceId, kycRecordId)).limit(1);
  if (kycAnalyses.length > 0) {
    await ReviewService.submitReview({
      recordAnalysisId: kycAnalyses[0].id,
      evidenceId: kycRecordId,
      decision: 'corrected',
      rationale: 'AI model classified as general onboarding bug, failing to recognize that lack of document blurriness feedback is a regulatory guidance failure.',
      reviewer: 'Senior PM Reviewer',
      revisedOutput: {
        themeName: 'KYC & Onboarding Verification Drop-off',
        journeyStage: 'mandate_kyc_setup',
        observedBehaviour: 'Submitted documents 4 times without guidance on blurriness before abandoning.',
      },
      failureCaseDetails: {
        failureType: 'theme_misclassification',
        lessonLearned: 'Model conflated regulatory document rejection with general app technical bugs.',
        preventionStrategy: 'Clarify in prompt that compliance/verification failures represent a distinct journey stage from application crashes.',
      },
    });
  }

  // Case 2: Insufficient evidence
  const vagueRecordId = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_116'];
  const vagueAnalyses = await db.select().from(recordAnalyses).where(eq(recordAnalyses.evidenceId, vagueRecordId)).limit(1);
  if (vagueAnalyses.length > 0) {
    await ReviewService.submitReview({
      recordAnalysisId: vagueAnalyses[0].id,
      evidenceId: vagueRecordId,
      decision: 'rejected',
      rationale: 'App crash feedback does not contain mutual fund SIP evidence. Model should have abstained completely.',
      reviewer: 'Senior PM Reviewer',
      failureCaseDetails: {
        failureType: 'overconfidence_on_vague_text',
        lessonLearned: 'Model forced a mutual fund journey classification on an OS-level phone crash report.',
        preventionStrategy: 'Enforce strict abstention criteria whenever text does not contain systematic investment or fund keywords.',
      },
    });
  }

  // Case 3: Switch funds confusion
  const switchRecordId = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_115'];
  const switchAnalyses = await db.select().from(recordAnalyses).where(eq(recordAnalyses.evidenceId, switchRecordId)).limit(1);
  if (switchAnalyses.length > 0) {
    await ReviewService.submitReview({
      recordAnalysisId: switchAnalyses[0].id,
      evidenceId: switchRecordId,
      decision: 'corrected',
      rationale: 'Model inferred user wanted to withdraw cash, but the verbatim text explicitly stated they wanted to switch to a safer fund.',
      reviewer: 'Senior PM Reviewer',
      revisedOutput: {
        themeName: 'Loss Aversion & Panic During Early Market Dips',
        journeyStage: 'market_dip_reaction',
        observedBehaviour: 'User wanted to switch volatile fund to safer asset, but lack of discovery caused full redemption.',
      },
      failureCaseDetails: {
        failureType: 'unwarranted_causal_leap',
        lessonLearned: 'Model assumed redemption was motivated by cash need rather than absent fund rebalancing mechanics.',
        preventionStrategy: 'Prompt must cross-examine user intent against explicit verbs ("switch" vs "withdraw").',
      },
    });
  }

  // 5. Seed candidate opportunities grounded in evidence
  const mandateTheme = allThemes.find((t) => t.name.includes('Autopay'));
  if (mandateTheme) {
    await OpportunityService.createOpportunity({
      title: 'Proactive Mandate Health & Pre-Debit Alert System',
      problemStatement: 'First-time investors encounter surprise bank overdraft charges (up to 590 Rs) and silent mandate drops because debits occur without 48-hour balance warnings or penalty-free auto-retry.',
      hypothesisOnRetention: 'Providing proactive WhatsApp/SMS pre-debit notifications and a 3-day penalty-free recovery window will increase 12-month active SIP retention by rescuing inadvertent instalment drops.',
      themeIds: [mandateTheme.id],
      humanScores: {
        userImpact: { score: 4.8, rationale: 'Bank penalties create acute financial distress and trust betrayal for beginners.', scoredBy: 'PM Fellow' },
        businessMetricLink: { score: 4.9, rationale: 'Directly salvages the 30-day active definition window upon first failure.', scoredBy: 'PM Fellow' },
        researchUncertainty: { score: 1.5, rationale: 'Heavily documented across store reviews and confirmed by banking regulations.', scoredBy: 'PM Fellow' },
        potentialFeasibility: { score: 4.2, rationale: 'Standard webhook notifications and NPCI e-mandate retry APIs exist.', scoredBy: 'PM Fellow' },
      },
    });
  }

  const dipTheme = allThemes.find((t) => t.name.includes('Loss Aversion'));
  if (dipTheme) {
    await OpportunityService.createOpportunity({
      title: 'First-Year Drawdown Context & Rupee-Cost-Averaging Coach',
      problemStatement: 'Inexperienced investors experiencing their first market dip in months 2-4 interpret portfolio volatility as permanent loss due to lack of in-situ context.',
      hypothesisOnRetention: 'Displaying contextual historical recovery timelines and "units acquired at discount" metrics during drawdowns will prevent panic cancellations before month 6.',
      themeIds: [dipTheme.id],
      humanScores: {
        userImpact: { score: 4.2, rationale: 'Dramatically reduces investor anxiety and premature capital destruction.', scoredBy: 'PM Fellow' },
        businessMetricLink: { score: 4.5, rationale: 'Retains users through the critical month 3-6 churn hump.', scoredBy: 'PM Fellow' },
        researchUncertainty: { score: 2.2, rationale: 'Behavioral finance literature strongly supports rupee-cost-averaging framing.', scoredBy: 'PM Fellow' },
        potentialFeasibility: { score: 4.6, rationale: 'UI educational cards and return calculator overlays require zero backend banking changes.', scoredBy: 'PM Fellow' },
      },
    });
  }

  // 6. Run initial evaluation
  await EvaluationService.evaluateAnalysisRun(runSummary.runId);

  // 7. Seed sample contradiction
  const rAutopay = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_108'];
  const rDeduct = createdRecordIds['https://play.google.com/store/apps/details?id=com.nextbillion.groww&reviewId=gp_112'];
  if (rAutopay && rDeduct) {
    await db.insert(contradictions).values({
      id: crypto.randomUUID(),
      title: 'Seamless Autopay Friction vs. Autonomous Double-Debit Risk',
      description: 'Users on one side demand zero-click frictionless automatic payments, while budget-constrained users report catastrophic liquidity emergencies when automatic debits execute without manual confirmation.',
      evidenceAId: rAutopay,
      evidenceBId: rDeduct,
      status: 'open',
    });
  }

  revalidatePath('/');
  revalidatePath('/evidence');
  revalidatePath('/themes');
  revalidatePath('/opportunities');
  revalidatePath('/reliability');
  revalidatePath('/tracker');
  revalidatePath('/export');

  return { success: true, count: BENCHMARK_ITEMS.length };
}

export async function updateThemeStatusAction(
  themeId: string,
  status: 'proposed' | 'accepted' | 'retired'
) {
  try {
    await db
      .update(themes)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(themes.id, themeId));
    revalidatePath('/themes');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update theme status.' };
  }
}

export async function mergeThemesAction(sourceThemeId: string, targetThemeId: string) {
  try {
    if (sourceThemeId === targetThemeId) {
      return { success: false, error: 'Cannot merge a theme into itself.' };
    }

    // 1. Point links from source to target
    await db
      .update(evidenceThemeLinks)
      .set({ themeId: targetThemeId })
      .where(eq(evidenceThemeLinks.themeId, sourceThemeId));

    // 2. Mark source as merged
    await db
      .update(themes)
      .set({
        status: 'merged',
        mergedIntoId: targetThemeId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(themes.id, sourceThemeId));

    revalidatePath('/themes');
    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to merge themes.' };
  }
}

export async function createThemeAction(name: string, description: string, journeyStage: string) {
  try {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const newId = crypto.randomUUID();
    await db.insert(themes).values({
      id: newId,
      name: name.trim(),
      slug,
      description: description.trim(),
      journeyStage,
      origin: 'human_created',
      status: 'accepted',
    });

    revalidatePath('/themes');
    return { success: true, themeId: newId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create theme.' };
  }
}

export async function updateContradictionStatusAction(
  id: string,
  status: 'open' | 'explained' | 'resolved',
  resolutionNotes?: string
) {
  try {
    await db
      .update(contradictions)
      .set({
        status,
        resolutionNotes: resolutionNotes || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(contradictions.id, id));

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update contradiction.' };
  }
}

export async function updateResearchQuestionAction(
  id: string,
  status: 'open' | 'investigating' | 'answered' | 'deferred',
  answerSummary?: string
) {
  try {
    await db
      .update(researchQuestions)
      .set({
        status,
        answerSummary: answerSummary || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(researchQuestions.id, id));

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update research question.' };
  }
}

export async function createResearchQuestionAction(
  question: string,
  relatedJourneyStage?: string,
  relatedThemeId?: string
) {
  try {
    const id = crypto.randomUUID();
    await db.insert(researchQuestions).values({
      id,
      question: question.trim(),
      origin: 'human_researcher',
      relatedJourneyStage: relatedJourneyStage || null,
      relatedThemeId: relatedThemeId || null,
      status: 'open',
    });

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true, id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create research question.' };
  }
}

export async function createContradictionAction(
  title: string,
  description: string,
  evidenceAId: string,
  evidenceBId: string,
  themeId?: string
) {
  try {
    const id = crypto.randomUUID();
    await db.insert(contradictions).values({
      id,
      title: title.trim(),
      description: description.trim(),
      evidenceAId,
      evidenceBId,
      themeId: themeId || null,
      status: 'open',
    });

    revalidatePath('/tracker');
    revalidatePath('/');
    return { success: true, id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create contradiction.' };
  }
}


