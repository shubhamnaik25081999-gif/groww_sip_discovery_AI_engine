import { z } from 'zod';
import { JourneyStageSchema } from '@/lib/types';

export const ClaimItemSchema = z.object({
  text: z.string().min(1, 'Claim text cannot be empty'),
  type: z.enum(['observation', 'inference']),
  groundingExcerpt: z.string().optional().describe('Direct quote supporting this observation or inference'),
});

export const StructuredAnalysisOutputSchema = z.object({
  theme: z.object({
    name: z.string().min(1, 'Theme name is required'),
    isNewProposal: z.boolean().default(false).describe('True if this feedback does not fit any existing theme'),
    subtheme: z.string().optional().nullable(),
  }).nullable().describe('Primary discovered theme or null if abstaining'),

  abstainReason: z.string().optional().nullable().describe('Reason for abstention if insufficient evidence or off-topic'),

  journeyStage: JourneyStageSchema.describe('Journey stage where this friction or behaviour occurred'),

  observedBehaviour: z.string().min(3, 'Observed behaviour is required').describe('Specific behaviour explicitly reported in the feedback'),

  investorContext: z.object({
    status: z.string().describe('e.g., First-time investor, 6 months in SIP, student, salaried'),
    supportingQuote: z.string().describe('Exact quote from feedback verifying investor status'),
  }).optional().nullable().describe('Only provide if explicitly verified in source text. Null otherwise.'),

  statedFriction: z.object({
    type: z.enum(['concern', 'unmet_need', 'workaround', 'confusion', 'frustration']),
    description: z.string().min(3),
    supportingQuote: z.string().optional(),
  }).optional().nullable(),

  evidenceExcerpt: z.string().min(3, 'Supporting verbatim excerpt is required').describe('Direct verbatim substring from original feedback'),

  claims: z.array(ClaimItemSchema).min(1, 'At least one categorized claim (observation or inference) is required'),

  uncertaintyAnalysis: z.string().min(3, 'Uncertainty and limitations explanation is required'),

  sipContinuationHypothesis: z.object({
    hypothesisText: z.string().min(5),
    label: z.literal('HYPOTHESIS').default('HYPOTHESIS'),
    plausibleMechanism: z.string().min(5).describe('Plausible mechanism connecting this friction to 12-month active SIP continuation'),
  }).optional().nullable().describe('Clearly labelled hypothesis, NOT a causal fact'),

  followUpResearchQuestion: z.string().min(5, 'Actionable follow-up research question is required'),

  selfReportedConfidence: z.enum(['low', 'medium', 'high']).describe('Self-reported model confidence (unvalidated)'),
});

export type StructuredAnalysisOutput = z.infer<typeof StructuredAnalysisOutputSchema>;

export interface GuardValidationResult {
  isValid: boolean;
  guardErrors: string[];
}

/**
 * Enforces safety and anti-hallucination guards on model output:
 * 1. Verbatim excerpt check: evidenceExcerpt MUST be a substring of originalText.
 * 2. Investor context quote check: supportingQuote MUST be a substring of originalText.
 * 3. Hypothesis label check: Any continuation relationship MUST carry the 'HYPOTHESIS' label.
 */
export function validateOutputGuards(
  originalText: string,
  output: StructuredAnalysisOutput
): GuardValidationResult {
  const errors: string[] = [];
  const normalizedOriginal = originalText.toLowerCase().replace(/\s+/g, ' ');

  // 1. Excerpt guard
  if (output.evidenceExcerpt) {
    const normalizedExcerpt = output.evidenceExcerpt.toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedOriginal.includes(normalizedExcerpt)) {
      errors.push(
        `Guard Violation [Excerpt Mismatch]: The cited excerpt "${output.evidenceExcerpt}" is not a verbatim substring of the original evidence.`
      );
    }
  }

  // 2. Investor context quote guard
  if (output.investorContext && output.investorContext.supportingQuote) {
    const normalizedQuote = output.investorContext.supportingQuote.toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedOriginal.includes(normalizedQuote)) {
      errors.push(
        `Guard Violation [Hallucinated Context]: The claimed investor context quote "${output.investorContext.supportingQuote}" cannot be found in the source text.`
      );
    }
  }

  // 3. Hypothesis label guard
  if (output.sipContinuationHypothesis) {
    if (output.sipContinuationHypothesis.label !== 'HYPOTHESIS') {
      errors.push(
        'Guard Violation [Unlabeled Causal Claim]: Potential relationship to SIP continuation must be explicitly labelled with label="HYPOTHESIS".'
      );
    }
  }

  return {
    isValid: errors.length === 0,
    guardErrors: errors,
  };
}
