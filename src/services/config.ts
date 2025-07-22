import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { Config } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export class ConfigManager {
  private configPath: string;
  private config: Partial<Config> = {};

  constructor() {
    // Store config in user's home directory
    this.configPath = path.join(
      os.homedir(),
      ".github-issue-scraper",
      "config.json"
    );
  }

  /**
   * Load configuration from file and environment variables
   */
  async loadConfig(): Promise<Partial<Config>> {
    const context: ErrorContext = {
      operation: "loading configuration",
      filePath: this.configPath,
    };

    try {
      // Load from environment variables first
      this.loadFromEnvironment();

      // Load from config file if it exists
      if (await fs.pathExists(this.configPath)) {
        try {
          const fileConfig = await fs.readJson(this.configPath);
          this.config = { ...fileConfig, ...this.config }; // env vars take precedence
        } catch (error: any) {
          // Use centralized error handling for file system errors
          const scraperError = ErrorHandler.convertToScraperError(
            error,
            context
          );
          console.warn(
            `Warning: Could not read config file (${scraperError.message}), using environment variables only`
          );
        }
      }

      return this.config;
    } catch (error: any) {
      // Handle unexpected errors during config loading
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: Partial<Config>): Promise<void> {
    const context: ErrorContext = {
      operation: "saving configuration",
      filePath: this.configPath,
    };

    try {
      this.config = { ...this.config, ...config };

      // Ensure config directory exists
      await fs.ensureDir(path.dirname(this.configPath));

      // Save to file (excluding sensitive data that should be in env vars)
      const configToSave = { ...this.config };
      delete configToSave.githubToken; // Don't save token to file

      await fs.writeJson(this.configPath, configToSave, { spaces: 2 });
    } catch (error: any) {
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Partial<Config> {
    return { ...this.config };
  }

  /**
   * Set GitHub token (stores in memory only)
   */
  setGitHubToken(token: string): void {
    this.config.githubToken = token;
  }

  /**
   * Get GitHub token from config or environment
   */
  getGitHubToken(): string | undefined {
    return this.config.githubToken || process.env.GITHUB_TOKEN;
  }

  /**
   * Check if configuration is complete
   */
  isConfigComplete(): boolean {
    return !!(
      this.getGitHubToken() &&
      this.config.repository &&
      this.config.productArea
    );
  }

  /**
   * Get missing configuration fields
   */
  getMissingFields(): string[] {
    const missing: string[] = [];

    if (!this.getGitHubToken()) missing.push("GitHub Token");
    if (!this.config.repository) missing.push("Repository");
    if (!this.config.productArea) missing.push("Product Area");

    return missing;
  }

  /**
   * Validate JAN configuration
   *
   * @returns Object with validation result and any error messages
   */
  validateJANConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if JAN endpoint is set
    if (!this.config.janEndpoint) {
      errors.push("JAN endpoint is not configured");
    } else {
      // Validate URL format
      try {
        new URL(this.config.janEndpoint);
      } catch (error) {
        errors.push(`Invalid JAN endpoint URL: ${this.config.janEndpoint}`);
      }
    }

    // Check if JAN model is set
    if (!this.config.janModel) {
      errors.push("JAN model is not configured");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get JAN endpoint from config or environment
   */
  getJANEndpoint(): string {
    return (
      this.config.janEndpoint ||
      process.env.JAN_ENDPOINT ||
      "http://localhost:1337"
    );
  }

  getJANAPIKey(): string {
    return this.config.janApiKey || process.env.JAN_API_KEY || "";
  }

  /**
   * Get JAN model from config or environment
   */
  getJANModel(): string {
    return this.config.janModel || process.env.JAN_MODEL || "llama2";
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): void {
    if (process.env.GITHUB_TOKEN) {
      this.config.githubToken = process.env.GITHUB_TOKEN;
    }

    if (process.env.GITHUB_REPOSITORY) {
      this.config.repository = process.env.GITHUB_REPOSITORY;
    }

    if (process.env.PRODUCT_AREA) {
      this.config.productArea = process.env.PRODUCT_AREA;
    }

    if (process.env.MAX_ISSUES) {
      this.config.maxIssues = parseInt(process.env.MAX_ISSUES, 10);
    }

    if (process.env.MIN_RELEVANCE_SCORE) {
      this.config.minRelevanceScore = parseInt(
        process.env.MIN_RELEVANCE_SCORE,
        10
      );
    }

    if (process.env.OUTPUT_PATH) {
      this.config.outputPath = process.env.OUTPUT_PATH;
    }

    // JAN-specific configuration
    if (process.env.JAN_ENDPOINT) {
      this.config.janEndpoint = process.env.JAN_ENDPOINT;
    }

    if (process.env.JAN_MODEL) {
      this.config.janModel = process.env.JAN_MODEL;
    }

    // Additional JAN configuration options
    if (process.env.JAN_API_KEY) {
      this.config.janApiKey = process.env.JAN_API_KEY;
    }

    if (process.env.JAN_MAX_RETRIES) {
      const maxRetries = parseInt(process.env.JAN_MAX_RETRIES, 10);
      if (!isNaN(maxRetries) && maxRetries > 0) {
        this.config.janMaxRetries = maxRetries;
      }
    }

    if (process.env.JAN_TIMEOUT) {
      const timeout = parseInt(process.env.JAN_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        this.config.janTimeout = timeout;
      }
    }
  }

  /**
   * Set default values for optional configuration
   */
  setDefaults(): void {
    this.config = {
      maxIssues: 50,
      minRelevanceScore: 30,
      outputPath: "./reports",
      janEndpoint: "http://localhost:1337",
      janModel: "llama2",
      janMaxRetries: 3,
      janTimeout: 60000, // 60 seconds
      ...this.config,
    };
  }
}
