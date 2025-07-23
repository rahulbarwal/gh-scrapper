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
  framework: string; // Framework mentioned in the issue (nextjs, vite, astro, etc.) or "N/A"
  browser: string; // Browser mentioned in the issue (chrome, firefox, etc.) or "N/A"
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
      : config.timeout || 90000; // Increased to 90 seconds for complex analysis

    // Only validate model if Jan AI features will be used
    // The scraper will handle fallback when Jan AI is not available
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Only add authorization header if API key is provided
      if (process.env.JAN_API_KEY) {
        headers.Authorization = `Bearer ${process.env.JAN_API_KEY}`;
      }

      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers,
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
    // Check if model is configured
    if (!this.model) {
      throw new Error(
        "Jan AI model must be specified via JAN_MODEL environment variable or config"
      );
    }

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

      // Log prompt size for debugging
      const promptLength = prompt.length;
      const estimatedTokens = Math.ceil(promptLength / 4);

      if (estimatedTokens > this.maxTokens * 0.8) {
        console.warn(
          `Large prompt for issue #${request.issue.number}: ${promptLength} chars (~${estimatedTokens} tokens), max: ${this.maxTokens}`
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Only add authorization header if API key is provided
      if (process.env.JAN_API_KEY) {
        headers.Authorization = `Bearer ${process.env.JAN_API_KEY}`;
      }

      let response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: "system",
                content: `You are an expert software engineer analyzing GitHub issues for relevance and workarounds. 
                  CRITICAL REQUIREMENTS:
                  - Always respond with valid JSON only, no additional text or explanations outside the JSON
                  - Code quotes should use exactly 3 backticks both before and after, no language specification
                  - MUST extract and include framework information (nextjs, vite, astro, vue, etc.) - if none found, use "N/A"
                  - MUST extract and include browser information (chrome, firefox, safari, edge, etc.) - if none found, use "N/A"
                  - Look for framework and browser mentions in issue title, description, labels, and comments
                  - Be thorough in extracting technical details from the issue content`,
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
      } catch (fetchError: any) {
        // Handle timeout and connection errors with more specific messages
        if (
          fetchError.name === "TimeoutError" ||
          fetchError.message?.includes("timeout")
        ) {
          throw new Error(
            `Jan AI analysis timed out after ${
              this.timeout / 1000
            } seconds. Consider increasing JAN_TIMEOUT environment variable or reducing prompt complexity.`
          );
        }
        if (fetchError.name === "AbortError") {
          throw new Error(
            `Jan AI request was aborted after ${
              this.timeout / 1000
            } seconds. This usually indicates a timeout.`
          );
        }
        throw new Error(`Jan AI connection failed: ${fetchError.message}`);
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
          errorDetails += ` (Possible causes: request too large, invalid model, or malformed JSON)`;
        }

        throw new Error(`Jan AI API error: ${errorDetails}`);
      }

      const result: any = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No response content from Jan AI");
      }

      // Handle responses that may be wrapped in markdown code blocks
      let cleanContent = content.trim();

      try {
        // Remove markdown code blocks if present
        if (cleanContent.startsWith("```") && cleanContent.endsWith("```")) {
          // Remove opening and closing code blocks
          cleanContent = cleanContent
            .replace(/^```[\w]*\n?/, "")
            .replace(/\n?```$/, "");
          console.log(
            `Removed markdown code blocks from Jan AI response for issue #${request.issue.number}`
          );
        }

        // Additional cleanup for common formatting issues
        cleanContent = cleanContent.replace(/^json\n/, ""); // Remove "json" language identifier

        const analysis = JSON.parse(cleanContent);
        return this.validateAndNormalizeResult(analysis);
      } catch (parseError: any) {
        console.error(`JSON Parse Error for issue #${request.issue.number}:`);
        console.error(`Original response: ${content}`);
        console.error(`Cleaned content: ${cleanContent}`);
        console.error(`Parse error: ${parseError.message}`);

        throw new Error(
          `Failed to parse Jan AI response as JSON: ${
            parseError.message
          }. Response: ${content.substring(0, 200)}...`
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

    // Process in smaller batches with longer delays to avoid timeouts
    const batchSize = 2; // Reduced from 3 to 2 for better timeout handling
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

      // Longer delay between batches to prevent overwhelming the local server
      if (i + batchSize < requests.length) {
        console.log(`Waiting 3 seconds before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Increased from 1s to 3s
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
- framework: Extract any framework mentioned (nextjs, vite, astro, react, vue, etc.) or "N/A" if none found
- browser: Extract any browser mentioned (chrome, firefox, safari, edge, etc.) or "N/A" if none found

**PRIORITY FRAMEWORK AND BROWSER SCORING**:
The target project uses React + Vite, and primarily supports Firefox and Chrome browsers.

**Framework Priority Adjustments**:
- Issues mentioning "react" or "vite": ADD 10 points to relevance score
- Issues mentioning "astro", "vue", "svelte", "nextjs": SUBTRACT 10 points (lower priority)
- Issues mentioning other frameworks: SUBTRACT 10 points (not relevant)

**Browser Priority Adjustments**:
- Issues mentioning "firefox" or "chrome": ADD 10 points to relevance score
- Issues mentioning "safari", "edge": SUBTRACT 10 points (lower priority)
- Issues mentioning other browsers: SUBTRACT 10 points (not supported)

**Feature vs. Bug Scoring**:
- Issues mentioning "bug" or "fix": ADD 10 points to relevance score
- Issues mentioning "feature" or "enhancement": SUBTRACT 10 points to relevance score

**Combined Scoring Logic**:
1. Start with base relevance to "${productArea}" (0-100)
2. Apply framework priority adjustments
3. Apply browser priority adjustments
4. Apply feature vs. bug scoring
5. Ensure final score stays within 0-100 range
6. If issue mentions both high-priority framework AND browser, it should score very highly (85-95+)

Focus on practical analysis that helps developers understand if this issue affects their use of ${productArea} and what they can do about it.
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
  private createFallbackResult(issue: GitHubIssue): JanAnalysisResult {
    return {
      relevanceScore: 50, // Neutral score when analysis fails
      relevanceReasoning: "Analysis failed, manual review required",
      hasWorkaround: false,
      workaroundComplexity: "unknown",
      workaroundType: "unknown",
      implementationDifficulty: "unknown",
      summary: `Issue #${issue.number}: ${issue.title}`,
      framework: "N/A",
      browser: "N/A",
    };
  }
}
