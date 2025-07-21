import { OpenAI } from "openai";
import axios from "axios";
import {
  JANClientOptions,
  JANPromptOptions,
  JANMessage,
  JANCompletionRequest,
  JANCompletionResponse,
  LLMAnalysisResponse,
  RawGitHubIssue,
  RawComment,
  AnalyzedIssue,
} from "../models";
import {
  ErrorHandler,
  ErrorContext,
  ScraperError,
  ErrorType,
  ErrorSuggestion,
} from "./error-handler";

/**
 * JAN Client Service
 *
 * Handles communication with JAN's OpenAI-compatible API for LLM analysis.
 * Provides connection validation, model validation, and error handling.
 */
export class JANClient {
  private client: OpenAI;
  private options: JANClientOptions;

  /**
   * Creates a new JAN client with the specified options
   *
   * @param options Configuration options for the JAN client
   */
  constructor(options: Partial<JANClientOptions> = {}) {
    this.options = {
      endpoint: options.endpoint || "http://localhost:1337",
      model: options.model || "llama2",
      apiKey: options.apiKey || "not-needed", // JAN typically doesn't require an API key
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000,
    };

    // Initialize OpenAI client with JAN's endpoint
    this.client = new OpenAI({
      baseURL: this.options.endpoint,
      apiKey: this.options.apiKey,
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries,
    });
  }

  /**
   * Validates connection to JAN server
   *
   * @returns Promise resolving to true if connection is successful
   * @throws ScraperError if connection fails
   */
  async validateConnection(): Promise<boolean> {
    const context: ErrorContext = {
      operation: "validating JAN server connection",
      additionalInfo: { endpoint: this.options.endpoint },
    };

    try {
      // Try to connect to JAN's health endpoint
      const response = await axios.get(`${this.options.endpoint}/health`, {
        timeout: 5000, // Short timeout for quick validation
      });

      if (response.status === 200) {
        return true;
      }

      throw new Error(`JAN server returned status code: ${response.status}`);
    } catch (error: any) {
      // Handle specific connection errors
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Start JAN server",
            description: "Ensure JAN is running on your machine",
            priority: "high",
          },
          {
            action: "Check endpoint configuration",
            description: `Verify the JAN endpoint (${this.options.endpoint}) is correct`,
            priority: "high",
          },
          {
            action: "Check network settings",
            description:
              "Ensure there are no firewall or network issues blocking the connection",
            priority: "medium",
          },
        ];

        throw new ScraperError(
          ErrorType.NETWORK,
          `Cannot connect to JAN server at ${this.options.endpoint}. Is JAN running?`,
          context,
          suggestions,
          true, // Retryable
          error
        );
      }

      // Handle other errors
      throw ErrorHandler.handleNetworkError(error, context);
    }
  }

  /**
   * Validates that the specified model is loaded in JAN
   *
   * @param model The model name to validate (defaults to the configured model)
   * @returns Promise resolving to true if model is available
   * @throws ScraperError if model validation fails
   */
  async validateModel(model: string = this.options.model): Promise<boolean> {
    const context: ErrorContext = {
      operation: "validating JAN model availability",
      additionalInfo: { model, endpoint: this.options.endpoint },
    };

    try {
      // First ensure we can connect to JAN
      await this.validateConnection();

      // Check if the model is available by listing models
      const response = await axios.get(`${this.options.endpoint}/v1/models`, {
        timeout: this.options.timeout,
      });

      if (response.status !== 200) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      // Check if the requested model is in the list
      const models = response.data.data || [];
      const modelExists = models.some((m: any) => m.id === model);

      if (!modelExists) {
        const availableModels = models.map((m: any) => m.id).join(", ");

        const suggestions: ErrorSuggestion[] = [
          {
            action: "Load the model in JAN",
            description: `Open JAN interface and load the '${model}' model`,
            priority: "high",
          },
          {
            action: "Use an available model",
            description: `Choose from available models: ${
              availableModels || "No models available"
            }`,
            priority: "high",
          },
          {
            action: "Check model name",
            description:
              "Verify the model name is correct and matches exactly what's in JAN",
            priority: "medium",
          },
        ];

        throw new ScraperError(
          ErrorType.VALIDATION,
          `Model '${model}' is not loaded in JAN. Available models: ${
            availableModels || "None"
          }`,
          context,
          suggestions,
          false
        );
      }

      return true;
    } catch (error: any) {
      // If it's already a ScraperError, just rethrow it
      if (error instanceof ScraperError) {
        throw error;
      }

      // Handle specific model validation errors
      if (error.response?.status === 404) {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Check JAN version",
            description:
              "Ensure you're using a JAN version with OpenAI-compatible API",
            priority: "high",
          },
          {
            action: "Check endpoint URL",
            description: "Verify the JAN endpoint URL is correct",
            priority: "high",
          },
        ];

        throw new ScraperError(
          ErrorType.VALIDATION,
          "JAN API endpoint not found. JAN may not support the OpenAI-compatible API.",
          context,
          suggestions,
          false,
          error
        );
      }

      // For test mocking purposes
      if (error.status === 404) {
        throw new ScraperError(
          ErrorType.VALIDATION,
          `JAN API endpoint not found at ${this.options.endpoint}`,
          context,
          [],
          false,
          error
        );
      }

      // Handle other errors
      throw ErrorHandler.handleValidationError(
        `Failed to validate model: ${error.message || "Unknown error"}`,
        context
      );
    }
  }

  /**
   * Sends a completion request to JAN
   *
   * @param messages Array of messages for the completion request
   * @param options Additional options for the completion request
   * @returns Promise resolving to the completion response
   * @throws ScraperError if the request fails
   */
  async createCompletion(
    messages: JANMessage[],
    options: JANPromptOptions = {}
  ): Promise<JANCompletionResponse> {
    const context: ErrorContext = {
      operation: "creating JAN completion",
      additionalInfo: {
        model: this.options.model,
        endpoint: this.options.endpoint,
      },
    };

    try {
      // Validate connection and model before sending request
      await this.validateModel();

      // Create the completion request
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        response_format: options.responseFormat,
      });

      // Convert the response to the expected format
      return {
        id: response.id,
        object: response.object,
        created: response.created,
        model: response.model,
        choices: response.choices.map((choice) => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content || "",
          },
          finish_reason: choice.finish_reason,
        })),
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      // Handle specific OpenAI client errors
      if (error.status === 404) {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Check model name",
            description: `Verify that '${this.options.model}' is correctly loaded in JAN`,
            priority: "high",
          },
          {
            action: "List available models",
            description:
              "Use JAN's interface to see which models are available",
            priority: "high",
          },
        ];

        throw new ScraperError(
          ErrorType.VALIDATION,
          `Model '${this.options.model}' not found in JAN`,
          context,
          suggestions,
          false,
          error
        );
      } else if (error.status === 429) {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Wait and retry",
            description:
              "JAN is processing too many requests, wait and try again",
            priority: "high",
          },
          {
            action: "Check JAN resources",
            description: "Ensure JAN has sufficient system resources",
            priority: "medium",
          },
        ];

        throw new ScraperError(
          ErrorType.RATE_LIMIT,
          "JAN rate limit exceeded or insufficient resources",
          context,
          suggestions,
          true, // Retryable
          error
        );
      } else if (error.status === 400) {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Check request format",
            description: "Verify the completion request format is valid",
            priority: "high",
          },
          {
            action: "Reduce input size",
            description:
              "The input may be too large for the model's context window",
            priority: "high",
          },
        ];

        throw new ScraperError(
          ErrorType.VALIDATION,
          `Invalid request to JAN: ${error.message}`,
          context,
          suggestions,
          false,
          error
        );
      }

      // Handle other errors
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  /**
   * Analyzes GitHub issues using JAN's LLM
   *
   * @param issues Array of raw GitHub issues to analyze
   * @param comments Map of issue ID to comments
   * @param productArea Product area for relevance filtering
   * @param promptManager PromptManager instance for creating prompts
   * @param batchSize Number of issues per batch (default: 5)
   * @returns Promise resolving to LLM analysis response
   * @throws ScraperError if analysis fails
   */
  async analyzeIssues(
    issues: RawGitHubIssue[],
    comments: Map<number, RawComment[]>,
    productArea: string,
    promptManager: any,
    batchSize: number = 5
  ): Promise<LLMAnalysisResponse> {
    const context: ErrorContext = {
      operation: "analyzing issues with LLM",
      additionalInfo: {
        model: this.options.model,
        issueCount: issues.length,
        productArea,
      },
    };

    try {
      // Validate connection and model before starting analysis
      await this.validateModel();

      // Create batches of issues to process within context limits
      const batches = promptManager.createBatchPrompts(
        issues,
        comments,
        productArea,
        batchSize
      );

      console.log(
        `Processing ${issues.length} issues in ${batches.length} batches`
      );

      // Process each batch and collect results
      const batchResults: LLMAnalysisResponse[] = [];

      for (let i = 0; i < batches.length; i++) {
        console.log(
          `Processing batch ${i + 1}/${batches.length} (${Math.min(
            batchSize,
            issues.length - i * batchSize
          )} issues)`
        );

        // Create completion request with JSON response format
        const response = await this.createCompletion(batches[i], {
          temperature: 0.2, // Lower temperature for more consistent analysis
          responseFormat: { type: "json_object" },
          maxTokens: 4000, // Adjust based on model capabilities
        });

        // Parse and validate the response
        const content = response.choices[0]?.message?.content || "";
        const parsedResponse = promptManager.parseStructuredResponse(content);

        if (!parsedResponse) {
          // Handle malformed response
          console.warn(
            `Batch ${
              i + 1
            } returned malformed response, retrying with smaller batch`
          );

          // If this is already a small batch (1-2 issues), try with different prompt formatting
          if (batchSize <= 2) {
            // Try with a simpler prompt format as fallback
            const simplifiedPrompt = this.createSimplifiedPrompt(
              issues.slice(i * batchSize, (i + 1) * batchSize),
              comments,
              productArea,
              promptManager
            );

            const fallbackResponse = await this.createCompletion(
              simplifiedPrompt,
              {
                temperature: 0.1,
                responseFormat: { type: "json_object" },
                maxTokens: 4000,
              }
            );

            const fallbackContent =
              fallbackResponse.choices[0]?.message?.content || "";
            const fallbackParsed =
              promptManager.parseStructuredResponse(fallbackContent);

            if (fallbackParsed) {
              batchResults.push(fallbackParsed);
            } else {
              console.warn(
                `Failed to parse response even with simplified prompt for batch ${
                  i + 1
                }`
              );
              // Add empty result to maintain batch count
              batchResults.push({
                relevantIssues: [],
                summary: {
                  totalAnalyzed: 0,
                  relevantFound: 0,
                  topCategories: [],
                  analysisModel: this.options.model,
                },
              });
            }
          } else {
            // Try processing the batch with smaller size
            const smallerBatchSize = Math.max(1, Math.floor(batchSize / 2));
            console.log(
              `Retrying with smaller batch size: ${smallerBatchSize}`
            );

            // Process this batch again with smaller size in next iteration
            // Adjust i to reprocess the current batch
            batchSize = smallerBatchSize;
            i--; // Reprocess this batch
            continue;
          }
        } else {
          batchResults.push(parsedResponse);
        }
      }

      // Merge batch results
      const mergedResult = this.mergeBatchResults(
        batchResults,
        this.options.model
      );
      return mergedResult;
    } catch (error: any) {
      // Handle specific LLM analysis errors
      if (error.message?.includes("context length")) {
        const suggestions: ErrorSuggestion[] = [
          {
            action: "Reduce batch size",
            description: "Try analyzing fewer issues at once",
            priority: "high",
          },
          {
            action: "Use a model with larger context window",
            description: "Switch to a model that can handle more tokens",
            priority: "medium",
          },
        ];

        throw new ScraperError(
          ErrorType.VALIDATION,
          "LLM context length exceeded during analysis",
          context,
          suggestions,
          true, // Retryable
          error
        );
      }

      // Handle other errors
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  /**
   * Creates a simplified prompt for fallback analysis
   * Used when standard prompt fails to produce valid response
   */
  private createSimplifiedPrompt(
    issues: RawGitHubIssue[],
    comments: Map<number, RawComment[]>,
    productArea: string,
    promptManager: any
  ): JANMessage[] {
    return [
      {
        role: "system",
        content: `Analyze GitHub issues for relevance to "${productArea}". Return JSON with relevant issues.`,
      },
      {
        role: "user",
        content: `Analyze these GitHub issues for the product area "${productArea}":
${issues
  .map((issue) => {
    const issueComments = comments.get(issue.id) || [];
    return promptManager.formatIssueData(issue, issueComments);
  })
  .join("\n\n")}

Return a JSON object with this structure:
{
  "relevantIssues": [
    {
      "id": number,
      "title": string,
      "relevanceScore": number (0-100),
      "category": string,
      "priority": "high"|"medium"|"low",
      "summary": string,
      "workarounds": [
        {
          "description": string,
          "author": string,
          "authorType": "maintainer"|"contributor"|"user",
          "effectiveness": "confirmed"|"suggested"|"partial",
          "confidence": number (0-100)
        }
      ],
      "tags": string[],
      "sentiment": "positive"|"neutral"|"negative"
    }
  ],
  "summary": {
    "totalAnalyzed": number,
    "relevantFound": number,
    "topCategories": string[],
    "analysisModel": string
  }
}`,
      },
    ];
  }

  /**
   * Merges multiple batch results into a single response
   */
  private mergeBatchResults(
    batchResults: LLMAnalysisResponse[],
    modelName: string
  ): LLMAnalysisResponse {
    // Combine all relevant issues
    const allRelevantIssues: AnalyzedIssue[] = [];
    let totalAnalyzed = 0;
    const categoryCount: Record<string, number> = {};

    for (const result of batchResults) {
      if (result.relevantIssues) {
        allRelevantIssues.push(...result.relevantIssues);
      }

      if (result.summary) {
        totalAnalyzed += result.summary.totalAnalyzed || 0;

        // Count categories for determining top categories
        if (result.summary.topCategories) {
          for (const category of result.summary.topCategories) {
            categoryCount[category] = (categoryCount[category] || 0) + 1;
          }
        }
      }
    }

    // Sort categories by frequency to find top categories
    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category]) => category);

    return {
      relevantIssues: allRelevantIssues,
      summary: {
        totalAnalyzed,
        relevantFound: allRelevantIssues.length,
        topCategories,
        analysisModel: modelName,
      },
    };
  }

  /**
   * Gets the current JAN client options
   *
   * @returns The current JAN client options
   */
  getOptions(): JANClientOptions {
    return { ...this.options };
  }

  /**
   * Updates the JAN client options
   *
   * @param options New options to apply
   */
  updateOptions(options: Partial<JANClientOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };

    // Reinitialize the client with new options
    this.client = new OpenAI({
      baseURL: this.options.endpoint,
      apiKey: this.options.apiKey,
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries,
    });
  }
}
