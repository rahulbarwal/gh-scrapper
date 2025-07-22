import { GitHubIssue } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface JanAnalysisRequest {
  issue: GitHubIssue;
  productArea: string;
}

export interface JanAnalysisResult {
  relevanceScore: number; // 0-100
  relevanceReasoning: string;
  hasWorkaround: boolean;
  workaroundComplexity: "simple" | "moderate" | "complex" | "unknown";
  workaroundType:
    | "usage-level"
    | "code-level"
    | "architecture-level"
    | "unknown";
  workaroundDescription?: string;
  implementationDifficulty: "easy" | "medium" | "hard" | "unknown";
  summary: string;
}

export interface JanClientConfig {
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export class JanClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly timeout: number;

  constructor(config: JanClientConfig = {}) {
    // Use environment variables exclusively, with minimal fallbacks only for critical settings
    this.baseUrl =
      process.env.JAN_URL || config.baseUrl || "http://localhost:1337/v1";
    this.model = process.env.JAN_MODEL || config.model || ""; // No default model - must be specified
    this.maxTokens = process.env.JAN_MAX_TOKENS
      ? Number(process.env.JAN_MAX_TOKENS)
      : config.maxTokens || 4000; // Increased default max tokens
    this.temperature = process.env.JAN_TEMPERATURE
      ? Number(process.env.JAN_TEMPERATURE)
      : config.temperature || 0.3;
    this.timeout = process.env.JAN_TIMEOUT
      ? Number(process.env.JAN_TIMEOUT)
      : config.timeout || 30000;

    // Validate that model is specified
    if (!this.model) {
      throw new Error(
        "Jan AI model must be specified via JAN_MODEL environment variable or config"
      );
    }
  }

  /**
   * Test connection to Jan AI local server
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    const context: ErrorContext = {
      operation: "testing Jan AI connection",
      additionalInfo: { baseUrl: this.baseUrl },
    };

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const models: any = await response.json();

      // Check if our preferred model is available
      const modelAvailable = models.data?.some((m: any) => m.id === this.model);

      return {
        connected: true,
        error: modelAvailable
          ? undefined
          : `Model "${
              this.model
            }" not available. Available models: ${models.data
              ?.map((m: any) => m.id)
              .join(", ")}`,
      };
    } catch (error: any) {
      console.warn(`Jan AI connection test failed: ${error.message}`);
      return {
        connected: false,
        error: `Failed to connect to Jan AI at ${this.baseUrl}: ${error.message}`,
      };
    }
  }

  /**
   * Analyze an issue using Jan AI for relevance and workaround detection
   */
  async analyzeIssue(request: JanAnalysisRequest): Promise<JanAnalysisResult> {
    const context: ErrorContext = {
      operation: "analyzing issue with Jan AI",
      issueId: request.issue.id,
      productArea: request.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      const prompt = this.buildAnalysisPrompt(
        request.issue,
        request.productArea
      );

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer jan-api-key", // Jan doesn't require real auth for local usage
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are an expert software engineer analyzing GitHub issues for relevance and workarounds. Always respond with valid JSON only, no additional text.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(
          `Jan AI API error: ${response.status} ${response.statusText}`
        );
      }

      const result: any = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No response content from Jan AI");
      }

      try {
        const analysis = JSON.parse(content);
        return this.validateAndNormalizeResult(analysis);
      } catch (parseError: any) {
        throw new Error(
          `Failed to parse Jan AI response as JSON: ${parseError.message}. Response: ${content}`
        );
      }
    }, context);
  }

  /**
   * Analyze multiple issues in batch
   */
  async analyzeIssuesBatch(
    requests: JanAnalysisRequest[]
  ): Promise<JanAnalysisResult[]> {
    const results: JanAnalysisResult[] = [];

    // Process in batches of 3 to avoid overwhelming the local server
    const batchSize = 3;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      const batchPromises = batch.map((request) =>
        this.analyzeIssue(request).catch((error) => {
          console.warn(
            `Failed to analyze issue ${request.issue.number}: ${error.message}`
          );
          return this.createFallbackResult(request.issue);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to be gentle on local server
      if (i + batchSize < requests.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Build the analysis prompt for the LLM
   */
  private buildAnalysisPrompt(issue: GitHubIssue, productArea: string): string {
    const issueContent = `
**GitHub Issue Analysis Request**

**Product Area**: ${productArea}

**Issue #${issue.number}**: ${issue.title}
**Labels**: ${issue.labels.join(", ") || "None"}
**Description**: ${issue.description || "No description provided"}
**State**: ${issue.state}
**Created**: ${issue.createdAt.toISOString()}
**Updated**: ${issue.updatedAt.toISOString()}
**Author**: ${issue.author}

**Comments**: ${
      issue.comments.length > 0
        ? issue.comments
            .map(
              (c) =>
                `- ${c.author}: ${c.body.substring(0, 200)}${
                  c.body.length > 200 ? "..." : ""
                }`
            )
            .join("\n")
        : "No comments"
    }

**Analysis Instructions**:
Please analyze this GitHub issue and provide a JSON response with the following structure:

{
  "relevanceScore": 85,
  "relevanceReasoning": "Brief explanation of why this issue is relevant to the product area",
  "hasWorkaround": true,
  "workaroundComplexity": "simple|moderate|complex|unknown",
  "workaroundType": "usage-level|code-level|architecture-level|unknown",
  "workaroundDescription": "Brief description of the workaround if available",
  "implementationDifficulty": "easy|medium|hard|unknown",
  "summary": "Concise summary of the issue and its impact"
}

**Scoring Guidelines**:
- relevanceScore: 0-100, how relevant is this issue to "${productArea}"
- relevanceReasoning: Explain the relevance in 1-2 sentences
- hasWorkaround: Does the issue or comments mention any workarounds?
- workaroundComplexity: How complex is the workaround to understand?
- workaroundType: 
  - "usage-level": Can be solved by changing how the component/feature is used
  - "code-level": Requires code changes in the consuming application
  - "architecture-level": Requires changes to the core library/framework
- implementationDifficulty: How hard would it be to implement the workaround?
- summary: 1-2 sentences about the issue's core problem and impact

Focus on practical analysis that helps developers understand if this issue affects their use of ${productArea} and what they can do about it.
`.trim();

    return issueContent;
  }

  /**
   * Validate and normalize the LLM response
   */
  private validateAndNormalizeResult(analysis: any): JanAnalysisResult {
    const result: JanAnalysisResult = {
      relevanceScore: Math.max(
        0,
        Math.min(100, Number(analysis.relevanceScore) || 0)
      ),
      relevanceReasoning: String(
        analysis.relevanceReasoning || "No reasoning provided"
      ),
      hasWorkaround: Boolean(analysis.hasWorkaround),
      workaroundComplexity: this.normalizeEnum(
        analysis.workaroundComplexity,
        ["simple", "moderate", "complex", "unknown"],
        "unknown"
      ),
      workaroundType: this.normalizeEnum(
        analysis.workaroundType,
        ["usage-level", "code-level", "architecture-level", "unknown"],
        "unknown"
      ),
      workaroundDescription: analysis.workaroundDescription
        ? String(analysis.workaroundDescription)
        : undefined,
      implementationDifficulty: this.normalizeEnum(
        analysis.implementationDifficulty,
        ["easy", "medium", "hard", "unknown"],
        "unknown"
      ),
      summary: String(analysis.summary || "No summary provided"),
    };

    return result;
  }

  /**
   * Normalize enum values to ensure they match expected types
   */
  private normalizeEnum<T extends string>(
    value: any,
    allowedValues: T[],
    defaultValue: T
  ): T {
    const normalizedValue = String(value).toLowerCase();
    return allowedValues.find((v) => v === normalizedValue) || defaultValue;
  }

  /**
   * Create a fallback result when LLM analysis fails
   */
  private createFallbackResult(issue: GitHubIssue): JanAnalysisResult {
    return {
      relevanceScore: 50, // Neutral score when analysis fails
      relevanceReasoning: "Analysis failed, manual review required",
      hasWorkaround: false,
      workaroundComplexity: "unknown",
      workaroundType: "unknown",
      implementationDifficulty: "unknown",
      summary: `Issue #${issue.number}: ${issue.title}`,
    };
  }
}
