import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  AnalysisInputRecord,
  KnownThemePromptItem,
  AIAnalysisResult,
  AIProviderError,
} from './provider';
import {
  StructuredAnalysisOutput,
  StructuredAnalysisOutputSchema,
  validateOutputGuards,
} from './schema';

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly modelVersion = '3.8-flash';
  readonly promptVersion = '2026-10-discovery-v1';
  readonly schemaVersion = '1.0.0';

  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  async analyzeRecord(
    record: AnalysisInputRecord,
    knownThemes: KnownThemePromptItem[]
  ): Promise<AIAnalysisResult> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        'Missing Gemini API Key. Please configure GEMINI_API_KEY in .env.local to run live AI analysis.',
        'MISSING_API_KEY',
        false
      );
    }

    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }

    const startTime = Date.now();

    const knownThemesText =
      knownThemes.length > 0
        ? knownThemes
            .map(
              (t) =>
                `- "${t.name}" (Stage: ${t.journeyStage}): ${t.description}`
            )
            .join('\n')
        : 'None registered yet. Propose new themes as appropriate.';

    const systemPrompt = `You are the lead Discovery Research Analyst for the Groww SIP Intelligence Lab (NextLeap PM Fellowship Graduation Project).
Your business objective is discovering why first-time mutual fund investors stop or continue their systematic investment plans (SIPs) 12 months after initiation.

CRITICAL DISCOVERY RULES:
1. EVIDENCE FIRST: Base observations strictly on what the user explicitly stated. Never invent context or motives.
2. VERBATIM EXCERPT: The "evidenceExcerpt" field MUST be an EXACT verbatim substring copied character-for-character from the original text.
3. INVESTOR CONTEXT: Only populate "investorContext" if the text explicitly states it (e.g. "I am a first time investor", "started my first SIP 2 months ago"). If unstated, set to null.
4. CLAIMS SEPARATION: Clearly categorize every claim as either "observation" (directly reported in text) or "inference" (logical analytical deduction).
5. HYPOTHESIS, NOT FACT: Relationships to 12-month active SIP continuation MUST be formulated as testable hypotheses with label="HYPOTHESIS". Do not assert unproven causality.
6. ABSTENTION: If the text is off-topic, spam, or too vague to derive insight, abstain with a clear reason.
7. THEMES: If the feedback matches an existing theme, use it. If it reveals a novel friction pattern, propose a new theme name and set isNewProposal=true.

Existing Known Themes:
${knownThemesText}

Return valid JSON conforming to this schema:
{
  "theme": { "name": "string", "isNewProposal": boolean, "subtheme": "string | null" } | null,
  "abstainReason": "string | null",
  "journeyStage": "discovery_intent" | "mandate_kyc_setup" | "first_instalment" | "market_dip_reaction" | "autopay_failure_recovery" | "continuation_milestone" | "pause_cancellation" | "unclear",
  "observedBehaviour": "string",
  "investorContext": { "status": "string", "supportingQuote": "string" } | null,
  "statedFriction": { "type": "concern" | "unmet_need" | "workaround" | "confusion" | "frustration", "description": "string", "supportingQuote": "string" } | null,
  "evidenceExcerpt": "string (MUST BE VERBATIM SUBSTRING)",
  "claims": [ { "text": "string", "type": "observation" | "inference", "groundingExcerpt": "string" } ],
  "uncertaintyAnalysis": "string",
  "sipContinuationHypothesis": { "hypothesisText": "string", "label": "HYPOTHESIS", "plausibleMechanism": "string" } | null,
  "followUpResearchQuestion": "string",
  "selfReportedConfidence": "low" | "medium" | "high"
}`;

    const userPrompt = `Analyze this investor feedback:
Source URL: ${record.sourceUrl}
Platform: ${record.platform}
Collection Date: ${record.collectedAt}
Investor Context (Recorded): ${record.investorContext || 'None stated'}
Journey Stage (Recorded): ${record.journeyStage || 'unclear'}
Original Verbatim Feedback:
"""
${record.originalText}
"""`;

    let rawOutput = '';
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const response = await this.client.interactions.create({
          model: this.modelName,
          input: `${systemPrompt}\n\n${userPrompt}`,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
          },
        });

        rawOutput = response.output_text || '';
        break;
      } catch (err: any) {
        const status = err.status || err.statusCode;
        const msg = err.message || '';

        // Check for 429 rate limit
        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          retryCount++;
          if (retryCount <= maxRetries) {
            // Exponential backoff
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          throw new AIProviderError(
            `Gemini rate limit exceeded (429): ${msg}. Consider testing with FakeProvider or waiting a few moments.`,
            'RATE_LIMIT_429',
            true
          );
        }

        // Check for network timeout
        if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
          throw new AIProviderError(`Gemini request timed out: ${msg}`, 'TIMEOUT', true);
        }

        throw new AIProviderError(
          `Gemini API execution error: ${msg}`,
          'PROVIDER_UNAVAILABLE',
          false
        );
      }
    }

    const latencyMs = Date.now() - startTime;

    // Parse and validate with Zod
    let parsedJson: any;
    try {
      // Clean potential markdown backticks if model wrapped JSON
      const cleaned = rawOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      parsedJson = JSON.parse(cleaned);
    } catch (parseError: any) {
      return {
        provider: this.providerName,
        model: this.modelName,
        modelVersion: this.modelVersion,
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
        rawOutput,
        validationStatus: 'invalid',
        validationErrors: [`Malformed JSON output from model: ${parseError.message}`],
        errorType: 'MALFORMED_OUTPUT',
        latencyMs,
      };
    }

    const zodResult = StructuredAnalysisOutputSchema.safeParse(parsedJson);
    if (!zodResult.success) {
      const validationErrors = zodResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      return {
        provider: this.providerName,
        model: this.modelName,
        modelVersion: this.modelVersion,
        promptVersion: this.promptVersion,
        schemaVersion: this.schemaVersion,
        rawOutput,
        parsedOutput: parsedJson as StructuredAnalysisOutput,
        validationStatus: 'invalid',
        validationErrors,
        errorType: 'SCHEMA_VALIDATION_ERROR',
        latencyMs,
      };
    }

    const structuredData = zodResult.data;

    // Execute hallucination and safety guards
    const guardResult = validateOutputGuards(record.originalText, structuredData);

    return {
      provider: this.providerName,
      model: this.modelName,
      modelVersion: this.modelVersion,
      promptVersion: this.promptVersion,
      schemaVersion: this.schemaVersion,
      rawOutput,
      parsedOutput: structuredData,
      validationStatus: guardResult.isValid ? 'valid' : 'guard_failed',
      validationErrors: guardResult.guardErrors,
      errorType: guardResult.isValid ? undefined : 'GUARD_VIOLATION',
      latencyMs,
    };
  }
}
