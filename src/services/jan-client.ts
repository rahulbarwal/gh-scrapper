import { OpenAI } from "openai";
import axios from "axios";
import {
  JANClientOptions,
  JANPromptOptions,
  JANMessage,
  JANCompletionRequest,
  JANCompletionResponse,
  LLMAnalysisResponse,
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
   * Will be implemented in task 4
   */
  async analyzeIssues(
    issues: any[],
    productArea: string
  ): Promise<LLMAnalysisResponse> {
    throw new Error("Not implemented - will be implemented in task 4");
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
