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
   * Sends a completion request to JAN with retry logic
   *
   * @param messages Array of messages for the completion request
   * @param options Additional options for the completion request
   * @returns Promise resolving to the completion response
   * @throws ScraperError if the request fails after all retries
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

    // Use executeWithRetry for automatic retry handling
    return ErrorHandler.executeWithRetry(
      async () => {
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
            throw new ScraperError(
              ErrorType.LLM_SERVICE,
              `Model '${this.options.model}' not found in JAN`,
              context,
              [
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
              ],
              false, // Not retryable - model needs to be loaded
              error
            );
          } else if (error.status === 429) {
            throw new ScraperError(
              ErrorType.LLM_SERVICE,
              "JAN rate limit exceeded or insufficient resources",
              context,
              [
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
              ],
              true, // Retryable
              error
            );
          } else if (error.status === 400) {
            // Check if this is a context length error
            if (
              error.message?.includes("context") ||
              error.message?.includes("token")
            ) {
              throw ErrorHandler.handleLLMContextError(error, context);
            }

            throw new ScraperError(
              ErrorType.LLM_SERVICE,
              `Invalid request to JAN: ${error.message}`,
              context,
              [
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
              ],
              false,
              error
            );
          }

          // Handle other errors
          throw ErrorHandler.convertToScraperError(error, context);
        }
      },
      context,
      this.options.maxRetries
    );
  }

  /**
   * Analyzes GitHub issues using JAN's LLM with comprehensive error handling
   *
   * @param issues Array of raw GitHub issues to analyze
   * @param comments Map of issue ID to comments
   * @param productArea Product area for relevance filtering
   * @param promptManager PromptManager instance for creating prompts
   * @param batchSize Number of issues per batch (default: 5)
   * @returns Promise resolving to LLM analysis response
   * @throws ScraperError if analysis fails after all retries
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
        endpoint: this.options.endpoint,
        issueCount: issues.length,
        productArea,
        batchSize,
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
      const failedBatches: number[] = [];
      let currentBatchSize = batchSize;

      for (let i = 0; i < batches.length; i++) {
        const batchContext: ErrorContext = {
          ...context,
          additionalInfo: {
            ...context.additionalInfo,
            batchNumber: i + 1,
            totalBatches: batches.length,
            currentBatchSize,
          },
        };

        console.log(
          `Processing batch ${i + 1}/${batches.length} (${Math.min(
            currentBatchSize,
            issues.length - i * currentBatchSize
          )} issues)`
        );

        try {
          // Create completion request with JSON response format using retry logic
          const response = await ErrorHandler.executeWithRetry(
            async () => {
              return await this.createCompletion(batches[i], {
                temperature: 0.2, // Lower temperature for more consistent analysis
                responseFormat: { type: "json_object" },
                maxTokens: 4000, // Adjust based on model capabilities
              });
            },
            batchContext,
            this.options.maxRetries
          );

          // Parse and validate the response
          const content = response.choices[0]?.message?.content || "";

          try {
            // Validate response format
            if (!content) {
              throw new Error("Empty response from LLM");
            }

            // Try to parse the response
            const parsedResponse =
              promptManager.parseStructuredResponse(content);

            // Validate required fields in the response
            if (!parsedResponse) {
              throw new Error("Failed to parse LLM response as valid JSON");
            }

            if (!Array.isArray(parsedResponse.relevantIssues)) {
              throw new Error(
                "Missing or invalid 'relevantIssues' array in LLM response"
              );
            }

            if (!parsedResponse.summary) {
              throw new Error("Missing 'summary' object in LLM response");
            }

            // Add the validated response to results
            batchResults.push(parsedResponse);
          } catch (parseError: any) {
            // Handle response parsing errors with fallback strategies
            console.warn(
              `Batch ${i + 1} returned malformed response: ${
                parseError.message
              }`
            );

            // If this is already a small batch (1-2 issues), try with different prompt formatting
            if (currentBatchSize <= 2) {
              console.log("Attempting fallback with simplified prompt...");

              // Try with a simpler prompt format as fallback
              const simplifiedPrompt = this.createSimplifiedPrompt(
                issues.slice(i * currentBatchSize, (i + 1) * currentBatchSize),
                comments,
                productArea,
                promptManager
              );

              try {
                const fallbackResponse = await ErrorHandler.executeWithRetry(
                  async () => {
                    return await this.createCompletion(simplifiedPrompt, {
                      temperature: 0.1,
                      responseFormat: { type: "json_object" },
                      maxTokens: 4000,
                    });
                  },
                  {
                    ...batchContext,
                    operation: "fallback LLM analysis with simplified prompt",
                  },
                  this.options.maxRetries
                );

                const fallbackContent =
                  fallbackResponse.choices[0]?.message?.content || "";

                const fallbackParsed =
                  promptManager.parseStructuredResponse(fallbackContent);

                if (fallbackParsed) {
                  console.log("Fallback successful, using simplified response");
                  batchResults.push(fallbackParsed);
                } else {
                  console.warn(
                    `Failed to parse response even with simplified prompt for batch ${
                      i + 1
                    }`
                  );

                  // Add empty result with graceful degradation
                  batchResults.push(
                    this.createEmptyBatchResult(
                      issues.slice(
                        i * currentBatchSize,
                        (i + 1) * currentBatchSize
                      ),
                      this.options.model
                    )
                  );

                  // Record this batch as failed for reporting
                  failedBatches.push(i + 1);
                }
              } catch (fallbackError) {
                console.error(
                  `Fallback attempt failed for batch ${i + 1}: ${fallbackError}`
                );

                // Add empty result with graceful degradation
                batchResults.push(
                  this.createEmptyBatchResult(
                    issues.slice(
                      i * currentBatchSize,
                      (i + 1) * currentBatchSize
                    ),
                    this.options.model
                  )
                );

                // Record this batch as failed for reporting
                failedBatches.push(i + 1);
              }
            } else {
              // Try processing the batch with smaller size
              const smallerBatchSize = Math.max(
                1,
                Math.floor(currentBatchSize / 2)
              );
              console.log(
                `Retrying with smaller batch size: ${smallerBatchSize}`
              );

              // Process this batch again with smaller size in next iteration
              // Adjust i to reprocess the current batch
              currentBatchSize = smallerBatchSize;
              i--; // Reprocess this batch
              continue;
            }
          }
        } catch (batchError: any) {
          // Handle batch processing errors
          console.error(
            `Error processing batch ${i + 1}: ${batchError.message}`
          );

          // If this is a context length error, reduce batch size and retry
          if (
            batchError.message?.includes("context length") ||
            batchError.message?.includes("token limit") ||
            batchError.type === ErrorType.LLM_CONTEXT
          ) {
            if (currentBatchSize > 1) {
              const smallerBatchSize = Math.max(
                1,
                Math.floor(currentBatchSize / 2)
              );
              console.log(
                `Context length exceeded, retrying with smaller batch size: ${smallerBatchSize}`
              );
              currentBatchSize = smallerBatchSize;
              i--; // Reprocess this batch
              continue;
            }
          }

          // For other errors with small batches, use empty result and continue
          if (currentBatchSize <= 2) {
            console.warn(
              `Using empty result for failed batch ${i + 1} and continuing`
            );

            // Add empty result with graceful degradation
            batchResults.push(
              this.createEmptyBatchResult(
                issues.slice(i * currentBatchSize, (i + 1) * currentBatchSize),
                this.options.model
              )
            );

            // Record this batch as failed for reporting
            failedBatches.push(i + 1);
          } else {
            // For larger batches, reduce size and retry
            const smallerBatchSize = Math.max(
              1,
              Math.floor(currentBatchSize / 2)
            );
            console.log(
              `Error occurred, retrying with smaller batch size: ${smallerBatchSize}`
            );
            currentBatchSize = smallerBatchSize;
            i--; // Reprocess this batch
            continue;
          }
        }
      }

      // Report on any failed batches
      if (failedBatches.length > 0) {
        console.warn(
          `Warning: ${failedBatches.length} out of ${batches.length} batches failed to process properly. ` +
            `Failed batch numbers: ${failedBatches.join(", ")}`
        );
      }

      // Merge batch results
      const mergedResult = this.mergeBatchResults(
        batchResults,
        this.options.model
      );

      // Add metadata about processing failures
      if (failedBatches.length > 0) {
        mergedResult.summary.processingErrors = failedBatches.length;
        mergedResult.summary.totalBatches = batches.length;
      }

      return mergedResult;
    } catch (error: any) {
      // Convert to appropriate error type
      if (
        error.message?.includes("context length") ||
        error.message?.includes("token limit")
      ) {
        throw ErrorHandler.handleLLMContextError(error, context);
      } else if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        throw ErrorHandler.handleLLMServiceError(error, context);
      } else if (
        error instanceof SyntaxError ||
        error.message?.includes("JSON") ||
        error.message?.includes("parse")
      ) {
        throw ErrorHandler.handleLLMResponseError(error, context);
      }

      // Handle other errors
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  /**
   * Creates an empty batch result for graceful degradation
   * Used when LLM analysis fails but we want to continue processing
   */
  private createEmptyBatchResult(
    issues: RawGitHubIssue[],
    modelName: string
  ): LLMAnalysisResponse {
    return {
      relevantIssues: [],
      summary: {
        totalAnalyzed: issues.length,
        relevantFound: 0,
        topCategories: [],
        analysisModel: modelName,
        processingError: true,
      },
    };
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
