import { GitHubIssue } from "../models";
import { JanClient, JanAnalysisRequest, JanAnalysisResult } from "./jan-client";
import {
  GeminiClient,
  GeminiAnalysisRequest,
  GeminiAnalysisResult,
} from "./gemini-client";
import { ErrorHandler, ErrorContext } from "./error-handler";

export type AIProvider = "jan" | "gemini";

export interface AIAnalysisRequest {
  issue: GitHubIssue;
  productArea: string;
}

export interface AIAnalysisResult {
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

export interface AIProviderConfig {
  provider: AIProvider;
  // Jan-specific config
  janConfig?: {
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  };
  // Gemini-specific config
  geminiConfig?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  };
}

export class AIProviderService {
  private provider: AIProvider;
  private janClient?: JanClient;
  private geminiClient?: GeminiClient;

  constructor(config: AIProviderConfig) {
    this.provider = config.provider;

    // Initialize the appropriate client based on provider
    switch (this.provider) {
      case "jan":
        this.janClient = new JanClient(config.janConfig);
        break;
      case "gemini":
        this.geminiClient = new GeminiClient(config.geminiConfig);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
  }

  /**
   * Test connection to the configured AI provider
   */
  async testConnection(): Promise<{
    connected: boolean;
    error?: string;
    provider: string;
  }> {
    const context: ErrorContext = {
      operation: `testing ${this.provider} AI connection`,
      additionalInfo: { provider: this.provider },
    };

    try {
      let result: { connected: boolean; error?: string };

      switch (this.provider) {
        case "jan":
          if (!this.janClient) {
            throw new Error("Jan client not initialized");
          }
          result = await this.janClient.testConnection();
          break;
        case "gemini":
          if (!this.geminiClient) {
            throw new Error("Gemini client not initialized");
          }
          result = await this.geminiClient.testConnection();
          break;
        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }

      return {
        ...result,
        provider: this.provider,
      };
    } catch (error: any) {
      console.warn(
        `${this.provider} AI connection test failed: ${error.message}`
      );
      return {
        connected: false,
        error: `Failed to connect to ${this.provider} AI: ${error.message}`,
        provider: this.provider,
      };
    }
  }

  /**
   * Analyze an issue using the configured AI provider
   */
  async analyzeIssue(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const context: ErrorContext = {
      operation: `analyzing issue with ${this.provider} AI`,
      issueId: request.issue.id,
      productArea: request.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      switch (this.provider) {
        case "jan": {
          if (!this.janClient) {
            throw new Error("Jan client not initialized");
          }

          const janRequest: JanAnalysisRequest = {
            issue: request.issue,
            productArea: request.productArea,
          };

          const janResult = await this.janClient.analyzeIssue(janRequest);
          return this.normalizeJanResult(janResult);
        }

        case "gemini": {
          if (!this.geminiClient) {
            throw new Error("Gemini client not initialized");
          }

          const geminiRequest: GeminiAnalysisRequest = {
            issue: request.issue,
            productArea: request.productArea,
          };

          const geminiResult = await this.geminiClient.analyzeIssue(
            geminiRequest
          );
          return this.normalizeGeminiResult(geminiResult);
        }

        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }
    }, context);
  }

  /**
   * Analyze multiple issues in batch
   */
  async analyzeIssuesBatch(
    requests: AIAnalysisRequest[]
  ): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];

    switch (this.provider) {
      case "jan": {
        if (!this.janClient) {
          throw new Error("Jan client not initialized");
        }

        const janRequests: JanAnalysisRequest[] = requests.map((req) => ({
          issue: req.issue,
          productArea: req.productArea,
        }));

        const janResults = await this.janClient.analyzeIssuesBatch(janRequests);
        return janResults.map((result) => this.normalizeJanResult(result));
      }

      case "gemini": {
        if (!this.geminiClient) {
          throw new Error("Gemini client not initialized");
        }

        const geminiRequests: GeminiAnalysisRequest[] = requests.map((req) => ({
          issue: req.issue,
          productArea: req.productArea,
        }));

        const geminiResults = await this.geminiClient.analyzeIssuesBatch(
          geminiRequests
        );
        return geminiResults.map((result) =>
          this.normalizeGeminiResult(result)
        );
      }

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  /**
   * Get the current provider name
   */
  getProvider(): AIProvider {
    return this.provider;
  }

  /**
   * Get provider-specific information for logging/reporting
   */
  getProviderInfo(): { provider: string; model?: string } {
    switch (this.provider) {
      case "jan":
        return {
          provider: "Jan AI (Local)",
          model: process.env.JAN_MODEL || "unknown",
        };
      case "gemini":
        return {
          provider: "Google Gemini",
          model: process.env.GEMINI_MODEL || "gemini-2.0-flash-001",
        };
      default:
        return { provider: this.provider };
    }
  }

  /**
   * Create a fallback result when AI analysis fails completely
   */
  createFallbackResult(issue: GitHubIssue): AIAnalysisResult {
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
      relevanceReasoning: `${this.provider} AI analysis failed, manual review required. Basic information extracted from issue content.`,
      hasWorkaround,
      workaroundComplexity: hasWorkaround ? "unknown" : "unknown",
      workaroundType: hasWorkaround ? "unknown" : "unknown",
      implementationDifficulty: "unknown",
      summary: `Issue #${issue.number}: ${issue.title}`,
      framework,
      browser,
    };
  }

  /**
   * Normalize Jan AI result to common interface
   */
  private normalizeJanResult(result: JanAnalysisResult): AIAnalysisResult {
    return {
      relevanceScore: result.relevanceScore,
      relevanceReasoning: result.relevanceReasoning,
      hasWorkaround: result.hasWorkaround,
      workaroundComplexity: result.workaroundComplexity,
      workaroundType: result.workaroundType,
      workaroundDescription: result.workaroundDescription,
      implementationDifficulty: result.implementationDifficulty,
      summary: result.summary,
      framework: result.framework,
      browser: result.browser,
    };
  }

  /**
   * Normalize Gemini AI result to common interface
   */
  private normalizeGeminiResult(
    result: GeminiAnalysisResult
  ): AIAnalysisResult {
    return {
      relevanceScore: result.relevanceScore,
      relevanceReasoning: result.relevanceReasoning,
      hasWorkaround: result.hasWorkaround,
      workaroundComplexity: result.workaroundComplexity,
      workaroundType: result.workaroundType,
      workaroundDescription: result.workaroundDescription,
      implementationDifficulty: result.implementationDifficulty,
      summary: result.summary,
      framework: result.framework,
      browser: result.browser,
    };
  }
}
