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
  }

  /**
   * Set default values for optional configuration
   */
  setDefaults(): void {
    this.config = {
      maxIssues: 50,
      minRelevanceScore: 30,
      outputPath: "./reports",
      ...this.config,
    };
  }
}
