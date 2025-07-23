import { GitHubIssue } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface GeminiAnalysisRequest {
  issue: GitHubIssue;
  productArea: string;
}

export interface GeminiAnalysisResult {
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
  framework: string; // Framework mentioned in the issue (nextjs, vite, astro, etc.) or "N/A"
  browser: string; // Browser mentioned in the issue (chrome, firefox, etc.) or "N/A"
}

export interface GeminiClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export class GeminiClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(config: GeminiClientConfig = {}) {
    // Read exclusively from environment variables
    this.apiKey = process.env.GEMINI_API_KEY || ""; // Required for Gemini
    this.model = process.env.GEMINI_MODEL || "gemini-2.0-flash-001"; // Default to 2.0 flash
    this.maxTokens = process.env.GEMINI_MAX_TOKENS
      ? Number(process.env.GEMINI_MAX_TOKENS)
      : 4000; // Default max tokens
    this.temperature = process.env.GEMINI_TEMPERATURE
      ? Number(process.env.GEMINI_TEMPERATURE)
      : 0.3; // Default temperature
    this.timeout = process.env.GEMINI_TIMEOUT
      ? Number(process.env.GEMINI_TIMEOUT)
      : 120000; // 120 seconds for complex analysis

    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  }

  /**
   * Test connection to Google Gemini API
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    const context: ErrorContext = {
      operation: "testing Gemini AI connection",
      additionalInfo: { model: this.model },
    };

    try {
      if (!this.apiKey) {
        return {
          connected: false,
          error: "GEMINI_API_KEY environment variable is required",
        };
      }

      // Test with a simple generation request
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: "Hello, respond with just 'OK'" }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 10,
              temperature: 0.1,
            },
          }),
          signal: AbortSignal.timeout(this.timeout),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorBody}`
        );
      }

      const result: any = await response.json();

      if (result.candidates && result.candidates.length > 0) {
        return { connected: true };
      } else {
        return {
          connected: false,
          error: "Gemini API returned unexpected response format",
        };
      }
    } catch (error: any) {
      console.warn(`Gemini AI connection test failed: ${error.message}`);
      return {
        connected: false,
        error: `Failed to connect to Gemini AI: ${error.message}`,
      };
    }
  }

  /**
   * Analyze an issue using Gemini AI for relevance and workaround detection
   */
  async analyzeIssue(
    request: GeminiAnalysisRequest
  ): Promise<GeminiAnalysisResult> {
    // Check if API key is configured
    if (!this.apiKey) {
      throw new Error(
        "Gemini API key must be specified via GEMINI_API_KEY environment variable"
      );
    }

    const context: ErrorContext = {
      operation: "analyzing issue with Gemini AI",
      issueId: request.issue.id,
      productArea: request.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      const prompt = this.buildAnalysisPrompt(
        request.issue,
        request.productArea
      );

      // Log prompt size for debugging
      const promptLength = prompt.length;
      const estimatedTokens = Math.ceil(promptLength / 4);

      if (estimatedTokens > this.maxTokens * 0.8) {
        console.warn(
          `Large prompt for issue #${request.issue.number}: ${promptLength} chars (~${estimatedTokens} tokens), max: ${this.maxTokens}`
        );
      }

      let response;
      try {
        response = await fetch(
          `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                maxOutputTokens: this.maxTokens,
                temperature: this.temperature,
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(this.timeout),
          }
        );
      } catch (fetchError: any) {
        // Handle timeout and connection errors with more specific messages
        if (
          fetchError.name === "TimeoutError" ||
          fetchError.message?.includes("timeout")
        ) {
          throw new Error(
            `Gemini AI analysis timed out after ${
              this.timeout / 1000
            } seconds. Consider increasing GEMINI_TIMEOUT environment variable or reducing prompt complexity.`
          );
        }
        if (fetchError.name === "AbortError") {
          throw new Error(
            `Gemini AI request was aborted after ${
              this.timeout / 1000
            } seconds. This usually indicates a timeout.`
          );
        }
        throw new Error(`Gemini AI connection failed: ${fetchError.message}`);
      }

      if (!response.ok) {
        let errorDetails = `${response.status} ${response.statusText}`;

        // Try to get more specific error information
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails += ` - ${errorBody}`;
          }
        } catch {
          // If we can't read the error body, just use the status
        }

        // Add helpful context for common errors
        if (response.status === 400) {
          errorDetails += ` (Possible causes: invalid API key, request too large, or malformed request)`;
        } else if (response.status === 403) {
          errorDetails += ` (Possible causes: invalid API key or quota exceeded)`;
        } else if (response.status === 429) {
          errorDetails += ` (Rate limit exceeded - try again later)`;
        }

        throw new Error(`Gemini AI API error: ${errorDetails}`);
      }

      const result: any = await response.json();
      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error("No response content from Gemini AI");
      }

      // Handle responses that may be wrapped in markdown code blocks or truncated
      let cleanContent = content.trim();

      try {
        // Remove markdown code blocks if present
        if (cleanContent.startsWith("```") && cleanContent.endsWith("```")) {
          // Remove opening and closing code blocks
          cleanContent = cleanContent
            .replace(/^```[\w]*\n?/, "")
            .replace(/\n?```$/, "");
          console.log(
            `Removed markdown code blocks from Gemini AI response for issue #${request.issue.number}`
          );
        }

        // Additional cleanup for common formatting issues
        cleanContent = cleanContent.replace(/^json\n/, ""); // Remove "json" language identifier

        // Check if JSON appears to be truncated
        if (cleanContent.startsWith("{") && !cleanContent.endsWith("}")) {
          console.warn(
            `JSON response appears truncated for issue #${request.issue.number}. Attempting to fix...`
          );

          // Try to find the last complete field and close the JSON
          const lastCompleteField = cleanContent.lastIndexOf('",');
          if (lastCompleteField > 0) {
            cleanContent =
              cleanContent.substring(0, lastCompleteField + 1) + "\n}";
            console.log(
              `Attempted to fix truncated JSON for issue #${request.issue.number}`
            );
          } else {
            // If we can't fix it, create a fallback response
            console.warn(
              `Cannot fix truncated JSON for issue #${request.issue.number}, using fallback`
            );
            return this.createFallbackResult(request.issue);
          }
        }

        const analysis = JSON.parse(cleanContent);
        return this.validateAndNormalizeResult(analysis);
      } catch (parseError: any) {
        console.error(`JSON Parse Error for issue #${request.issue.number}:`);
        console.error(`Original response: ${content.substring(0, 500)}...`);
        console.error(`Cleaned content: ${cleanContent.substring(0, 500)}...`);
        console.error(`Parse error: ${parseError.message}`);

        // If JSON parsing fails, return a fallback result instead of throwing
        console.warn(
          `Using fallback result for issue #${request.issue.number} due to parse error`
        );
        return this.createFallbackResult(request.issue);
      }
    }, context);
  }

  /**
   * Analyze multiple issues in batch
   */
  async analyzeIssuesBatch(
    requests: GeminiAnalysisRequest[]
  ): Promise<GeminiAnalysisResult[]> {
    const results: GeminiAnalysisResult[] = [];

    // Process in smaller batches with longer delays to avoid rate limits
    const batchSize = 5; // Smaller batch size for API rate limits
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          requests.length / batchSize
        )} (${batch.length} issues)...`
      );

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

      // Longer delay between batches to respect API rate limits
      if (i + batchSize < requests.length) {
        console.log(`Waiting 2 seconds before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return results;
  }

  /**
   * Build the analysis prompt for the LLM
   */
  private buildAnalysisPrompt(issue: GitHubIssue, productArea: string): string {
    // Calculate rough token estimate (1 token ≈ 4 characters)
    const maxPromptChars = this.maxTokens * 3; // Leave room for response
    const fixedContentChars = 1500; // Estimate for fixed content and instructions
    const availableChars = maxPromptChars - fixedContentChars;

    // Truncate description intelligently
    const maxDescriptionChars = Math.min(800, availableChars * 0.4);
    const truncatedDescription = this.truncateText(
      issue.description || "No description provided",
      maxDescriptionChars
    );

    // Prepare comments with intelligent truncation
    const maxCommentsChars = Math.min(1200, availableChars * 0.6);
    const commentsText = this.prepareCommentsText(
      issue.comments,
      maxCommentsChars
    );

    const issueContent = `
**GitHub Issue Analysis Request**

**Product Area**: ${productArea}

**Issue #${issue.number}**: ${issue.title}
**Labels**: ${issue.labels.join(", ") || "None"}
**Description**: ${truncatedDescription}
**State**: ${issue.state}
**Created**: ${issue.createdAt.toISOString()}
**Updated**: ${issue.updatedAt.toISOString()}
**Author**: ${issue.author}

**Comments**: ${commentsText}

**Analysis Instructions**:
Please analyze this GitHub issue and provide a JSON response with the following structure:

{
  "relevanceScore": 55,
  "relevanceReasoning": "Brief explanation of why this issue is relevant to the product area",
  "hasWorkaround": true,
  "workaroundComplexity": "simple|moderate|complex|unknown",
  "workaroundType": "usage-level|code-level|architecture-level|unknown",
  "workaroundDescription": "Brief description of the workaround if available",
  "implementationDifficulty": "easy|medium|hard|unknown",
  "summary": "Concise summary of the issue and its impact",
  "framework": "nextjs|vite|astro|react|vue|svelte|N/A",
  "browser": "chrome|firefox|safari|edge|N/A"
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
- framework: Only include if explicitly mentioned (nextjs, vite, astro, react, vue, etc.) - use "N/A" if uncertain or not mentioned
- browser: Only include if explicitly mentioned (chrome, firefox, safari, edge, etc.) - use "N/A" if uncertain or not mentioned

**PRIORITY FRAMEWORK AND BROWSER SCORING**:
The target project uses React + Vite, and primarily supports Firefox and Chrome browsers.

**Framework Priority Adjustments**:
- Issues mentioning "astro", "vue", "svelte", "nextjs": SUBTRACT 10 points (lower priority)
- Issues mentioning other frameworks: SUBTRACT 10 points (not relevant)

**Browser Priority Adjustments**:
- Issues mentioning "safari", "edge": SUBTRACT 10 points (lower priority)
- Issues mentioning other browsers: SUBTRACT 10 points (not supported)

**Feature vs. Bug Scoring**:
- Issues mentioning "feature" or "enhancement": SUBTRACT 10 points to relevance score

**Combined Scoring Logic**:
1. Start with base relevance to "${productArea}" (0-100)
2. Apply framework priority adjustments
3. Apply browser priority adjustments
4. Apply feature vs. bug scoring
5. Ensure final score stays within 0-100 range
6. If issue mentions both high-priority framework AND browser, it should score very highly (85-95+)

Focus on practical analysis that helps developers understand if this issue affects their use of ${productArea} and what they can do about it.

IMPORTANT: Respond ONLY with valid JSON, no additional text or explanations outside the JSON object.
`.trim();

    return issueContent;
  }

  /**
   * Intelligently prepare comments text within character limits
   */
  private prepareCommentsText(comments: any[], maxChars: number): string {
    if (comments.length === 0) {
      return "No comments";
    }

    // Prioritize comments that are more likely to contain workarounds
    const prioritizedComments = comments
      .map((comment, index) => ({
        ...comment,
        originalIndex: index,
        priority: this.calculateCommentPriority(comment),
      }))
      .sort((a, b) => b.priority - a.priority);

    const result: string[] = [];
    let currentChars = 0;

    for (const comment of prioritizedComments) {
      const maxCommentChars = Math.min(300, (maxChars - currentChars) / 2);
      if (maxCommentChars < 50) break; // Not enough space for meaningful content

      const truncatedBody = this.truncateText(comment.body, maxCommentChars);
      const commentText = `- ${comment.author}: ${truncatedBody}`;

      if (currentChars + commentText.length > maxChars) {
        break;
      }

      result.push(commentText);
      currentChars += commentText.length;
    }

    const totalComments = comments.length;
    const includedComments = result.length;

    if (includedComments < totalComments) {
      result.push(
        `... [${
          totalComments - includedComments
        } more comments omitted for brevity]`
      );
    }

    return result.join("\n");
  }

  /**
   * Calculate priority for comments (higher = more likely to contain workarounds)
   */
  private calculateCommentPriority(comment: any): number {
    let priority = 0;
    const bodyLower = comment.body.toLowerCase();

    // Workaround indicators
    if (bodyLower.includes("workaround")) priority += 10;
    if (bodyLower.includes("solution")) priority += 8;
    if (bodyLower.includes("fix")) priority += 6;
    if (bodyLower.includes("resolve")) priority += 6;
    if (bodyLower.includes("temp")) priority += 5;
    if (bodyLower.includes("alternative")) priority += 5;

    // Code indicators
    if (bodyLower.includes("```")) priority += 4;
    if (bodyLower.includes("import ")) priority += 3;
    if (bodyLower.includes("export ")) priority += 3;

    // Authority indicators (maintainers/contributors likely have better solutions)
    if (comment.authorType === "maintainer") priority += 8;
    if (comment.authorType === "contributor") priority += 4;

    return priority;
  }

  /**
   * Intelligently truncate text while preserving meaning
   */
  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    // Try to truncate at sentence boundaries
    const sentences = text.split(/[.!?]+/);
    let result = "";

    for (const sentence of sentences) {
      const candidate = result + sentence + ".";
      if (candidate.length > maxChars) {
        break;
      }
      result = candidate;
    }

    // If no complete sentences fit, truncate at word boundary
    if (result.length === 0) {
      const words = text.split(" ");
      for (const word of words) {
        const candidate = result + (result ? " " : "") + word;
        if (candidate.length > maxChars - 3) {
          break;
        }
        result = candidate;
      }
    }

    return result + (result.length < text.length ? "..." : "");
  }

  /**
   * Validate and normalize the LLM response
   */
  private validateAndNormalizeResult(analysis: any): GeminiAnalysisResult {
    const result: GeminiAnalysisResult = {
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
      framework: String(analysis.framework || "N/A"),
      browser: String(analysis.browser || "N/A"),
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
  private createFallbackResult(issue: GitHubIssue): GeminiAnalysisResult {
    // Try to extract some basic information from the issue
    const issueText = `${issue.title} ${
      issue.description || ""
    } ${issue.labels.join(" ")}`.toLowerCase();

    // Basic framework detection
    let framework = "N/A";
    if (issueText.includes("nextjs") || issueText.includes("next.js"))
      framework = "nextjs";
    else if (issueText.includes("vite")) framework = "vite";
    else if (issueText.includes("astro")) framework = "astro";
    else if (issueText.includes("vue")) framework = "vue";
    else if (issueText.includes("svelte")) framework = "svelte";
    else if (issueText.includes("react")) framework = "react";

    // Basic browser detection
    let browser = "N/A";
    if (issueText.includes("chrome")) browser = "chrome";
    else if (issueText.includes("firefox")) browser = "firefox";
    else if (issueText.includes("safari")) browser = "safari";
    else if (issueText.includes("edge")) browser = "edge";

    // Basic workaround detection
    const hasWorkaround =
      issueText.includes("workaround") ||
      issueText.includes("solution") ||
      issueText.includes("fix") ||
      issue.comments.some((c) => c.body.toLowerCase().includes("workaround"));

    return {
      relevanceScore: 50, // Neutral score when analysis fails
      relevanceReasoning:
        "Analysis failed, manual review required. Basic information extracted from issue content.",
      hasWorkaround,
      workaroundComplexity: hasWorkaround ? "unknown" : "unknown",
      workaroundType: hasWorkaround ? "unknown" : "unknown",
      implementationDifficulty: "unknown",
      summary: `Issue #${issue.number}: ${issue.title}`,
      framework,
      browser,
    };
  }
}
