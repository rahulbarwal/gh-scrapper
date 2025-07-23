#!/usr/bin/env node

import { Command } from "commander";
import * as readline from "readline";
import { ConfigManager, GitHubIssueScraper, JanClient } from "../services";
import { Config } from "../models";
import {
  ErrorHandler,
  ScraperError,
  ErrorContext,
} from "../services/error-handler";

interface CLIOptions {
  repository?: string;
  productArea?: string;
  maxIssues?: number;
  minRelevanceScore?: number;
  outputPath?: string;
  verbose?: boolean;
  interactive?: boolean;
  setup?: boolean;
  // Jan AI options
  janUrl?: string;
  janModel?: string;
  janTemperature?: number;
  janMaxTokens?: number;
  janTimeout?: number;
  noJan?: boolean;
}

class GitHubIssueScraperCLI {
  private program: Command;
  private configManager: ConfigManager;
  private verbose: boolean = false;

  constructor() {
    this.program = new Command();
    this.configManager = new ConfigManager();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name("github-issue-scraper")
      .description(
        "A CLI tool for scraping GitHub issues within specific repositories and product areas, with AI-powered analysis via Jan"
      )
      .version("1.0.0")
      .option(
        "-r, --repository <repo>",
        "GitHub repository in format owner/repo"
      )
      .option(
        "-p, --product-area <area>",
        "Product area or keywords to filter issues"
      )
      .option(
        "-m, --max-issues <number>",
        "Maximum number of issues to process",
        "50"
      )
      .option(
        "-s, --min-relevance-score <score>",
        "Minimum relevance score (0-100)",
        "30"
      )
      .option(
        "-o, --output-path <path>",
        "Output directory for reports",
        "./reports"
      )
      .option("-v, --verbose", "Enable verbose logging")
      .option("-i, --interactive", "Run in interactive mode with prompts")
      .option("--setup", "Show setup instructions for GitHub token")
      // Jan AI options - DEPRECATED: Use environment variables instead
      .option(
        "--jan-url <url>",
        "[DEPRECATED] Use JAN_URL environment variable"
      )
      .option(
        "--jan-model <model>",
        "[DEPRECATED] Use JAN_MODEL environment variable"
      )
      .option(
        "--jan-temperature <temp>",
        "[DEPRECATED] Use JAN_TEMPERATURE environment variable"
      )
      .option(
        "--jan-max-tokens <tokens>",
        "[DEPRECATED] Use JAN_MAX_TOKENS environment variable"
      )
      .option(
        "--jan-timeout <ms>",
        "[DEPRECATED] Use JAN_TIMEOUT environment variable"
      )
      .option("--no-jan", "Disable Jan AI analysis and use fallback scoring")
      .action(async (options: CLIOptions) => {
        this.verbose = options.verbose || false;
        await this.run(options);
      });

    // Add help examples
    this.program.addHelpText(
      "after",
      `
Examples:
  $ github-issue-scraper -r microsoft/vscode -p "editor performance"
  $ github-issue-scraper --repository facebook/react --product-area "hooks" --max-issues 25
  $ github-issue-scraper --interactive
  $ github-issue-scraper --setup
  $ github-issue-scraper -r owner/repo -p "api bugs" --verbose
  $ github-issue-scraper -r owner/repo -p "ui components" --no-jan

Jan AI Configuration (Required for AI Analysis):
  Set these environment variables for Jan AI to work:
  
  export JAN_URL="http://localhost:1337/v1"              # Jan server URL
  export JAN_MODEL="llama-3.2-3b-instruct"              # Model name (required)
  export JAN_TEMPERATURE="0.3"                          # Temperature (optional)
  export JAN_MAX_TOKENS="4000"                          # Max tokens (optional)
  export JAN_TIMEOUT="30000"                            # Timeout in ms (optional)
  
  The tool uses Jan AI (jan.ai) for intelligent issue analysis and workaround detection.
  Make sure Jan is running locally with API server enabled at localhost:1337.
  
  Without proper Jan AI setup, the tool will use fallback analysis (--no-jan is implicit).

Environment Variables:
  GITHUB_TOKEN          GitHub personal access token (required)
  GITHUB_REPOSITORY     Default repository (owner/repo format)
  PRODUCT_AREA          Default product area keywords
  MAX_ISSUES            Default maximum issues to process
  MIN_RELEVANCE_SCORE   Default minimum relevance score
  OUTPUT_PATH           Default output directory
  
  Jan AI Variables (all optional, but JAN_MODEL recommended):
  JAN_URL               Jan AI server URL (default: http://localhost:1337/v1)
  JAN_MODEL             Jan AI model name (REQUIRED for AI analysis)
  JAN_TEMPERATURE       Jan AI temperature (default: 0.3)
  JAN_MAX_TOKENS        Jan AI max tokens (default: 4000)
  JAN_TIMEOUT           Jan AI timeout in milliseconds (default: 30000)

Setup:
  1. Get GitHub token: https://github.com/settings/tokens
  2. Set environment: export GITHUB_TOKEN=your_token_here
  3. Install Jan AI (Recommended):
     → Download from: https://jan.ai
     → Open Jan and go to Settings
     → Enable 'API Server' in Advanced settings
     → Download a model (e.g., Llama 3.2 3B Instruct)
     → Start the model
  4. Set Jan environment: export JAN_MODEL="your-model-name"
  5. Test: github-issue-scraper -r microsoft/vscode -p authentication --max-issues 5
    `
    );
  }

  private log(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info"
  ): void {
    const timestamp = new Date().toISOString();
    const prefix = this.verbose
      ? `[${timestamp}] [${level.toUpperCase()}]`
      : "";

    switch (level) {
      case "error":
        console.error(`${prefix} ❌ ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ⚠️  ${message}`);
        break;
      case "debug":
        if (this.verbose) {
          console.log(`${prefix} 🔍 ${message}`);
        }
        break;
      default:
        console.log(`${prefix} ℹ️  ${message}`);
    }
  }

  private async run(options: CLIOptions): Promise<void> {
    try {
      this.log(
        "Starting GitHub Issue Scraper with Jan AI integration...",
        "debug"
      );

      // Handle setup command
      if (options.setup) {
        this.showSetupInstructions();
        return;
      }

      // Load existing configuration
      await this.configManager.loadConfig();
      this.configManager.setDefaults();

      // Handle interactive mode
      if (options.interactive) {
        await this.runInteractiveMode();
        return;
      }

      // Validate and merge options with config
      const config = await this.validateAndMergeConfig(options);

      // Test Jan AI connection if not disabled
      if (!options.noJan) {
        await this.testJanConnection(config.janConfig);
      }

      this.log(`Configuration validated successfully`, "debug");
      this.log(`Repository: ${config.repository}`);
      this.log(`Product Area: ${config.productArea}`);
      this.log(`Max Issues: ${config.maxIssues}`);
      this.log(`Min Relevance Score: ${config.minRelevanceScore}`);
      this.log(`Output Path: ${config.outputPath}`);

      if (!options.noJan && config.janConfig) {
        this.log(`Jan AI URL: ${config.janConfig.baseUrl}`);
        this.log(
          `Jan AI Model: ${
            config.janConfig.model || "Not specified - will use fallback"
          }`
        );
      } else {
        this.log(`Jan AI: Disabled (using fallback analysis)`);
      }

      // Execute the scraping process
      await this.executeScraping(config);
    } catch (error) {
      this.handleError(error);
      process.exit(1);
    }
  }

  private showSetupInstructions(): void {
    console.log("\n🚀 GitHub Issue Scraper Setup Instructions\n");

    console.log("1️⃣  Get GitHub Personal Access Token:");
    console.log("   → Visit: https://github.com/settings/tokens");
    console.log("   → Click 'Generate new token (classic)'");
    console.log(
      "   → Select scopes: 'repo' (for private repos) or 'public_repo' (for public only)"
    );
    console.log("   → Copy the generated token\n");

    console.log("2️⃣  Set Environment Variable:");
    console.log("   → export GITHUB_TOKEN=your_token_here");
    console.log("   → Add to ~/.bashrc or ~/.zshrc for persistence\n");

    console.log("3️⃣  Install Jan AI (Optional but Recommended):");
    console.log("   → Download from: https://jan.ai");
    console.log("   → Open Jan and go to Settings");
    console.log("   → Enable 'API Server' in Advanced settings");
    console.log("   → Download a model (e.g., Llama 3.2 3B Instruct)");
    console.log("   → Start the model\n");

    console.log("4️⃣  Configure Jan AI Environment:");
    console.log(
      '   → export JAN_MODEL="llama-3.2-3b-instruct"  # Use your model name'
    );
    console.log(
      '   → export JAN_URL="http://localhost:1337/v1"  # Default URL'
    );
    console.log(
      '   → export JAN_MAX_TOKENS="4000"             # Optional: increase for detailed analysis'
    );
    console.log(
      '   → export JAN_TEMPERATURE="0.3"            # Optional: lower for consistent results\n'
    );

    console.log("5️⃣  Test the Setup:");
    console.log(
      "   → github-issue-scraper -r microsoft/vscode -p authentication --max-issues 5\n"
    );

    console.log("✅ You're ready to go!");
  }

  private async runInteractiveMode(): Promise<void> {
    this.log("Running in interactive mode...");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const config = this.configManager.getConfig();

      // Check for GitHub token first
      const githubToken = this.configManager.getGitHubToken();
      if (!githubToken) {
        console.log("\n❌ GitHub token not found!");
        console.log("Please set GITHUB_TOKEN environment variable first.");
        console.log("Run: github-issue-scraper --setup for instructions\n");
        rl.close();
        return;
      }

      // Prompt for missing configuration
      const repository =
        config.repository ||
        (await this.promptUser(rl, "Enter GitHub repository (owner/repo): "));
      const productArea =
        config.productArea ||
        (await this.promptUser(rl, "Enter product area or keywords: "));

      // Optional parameters with defaults
      const maxIssuesInput = await this.promptUser(
        rl,
        `Maximum issues to process (${config.maxIssues || 50}): `
      );
      const maxIssues = maxIssuesInput
        ? parseInt(maxIssuesInput, 10)
        : config.maxIssues || 50;

      const minScoreInput = await this.promptUser(
        rl,
        `Minimum relevance score (${config.minRelevanceScore || 30}): `
      );
      const minRelevanceScore = minScoreInput
        ? parseInt(minScoreInput, 10)
        : config.minRelevanceScore || 30;

      const outputPath =
        (await this.promptUser(
          rl,
          `Output directory (${config.outputPath || "./reports"}): `
        )) ||
        config.outputPath ||
        "./reports";

      // Jan AI configuration - check environment variables first
      const existingJanModel = process.env.JAN_MODEL;

      let useJan = true;
      if (!existingJanModel) {
        const useJanInput = await this.promptUser(
          rl,
          "No JAN_MODEL environment variable found. Use Jan AI anyway? (y/N): "
        );
        useJan = useJanInput.toLowerCase() === "y";
      }

      let janConfig = undefined;
      if (useJan) {
        // Only use environment variables for Jan configuration
        const janUrl = process.env.JAN_URL;
        const janModel = process.env.JAN_MODEL;

        // Show current environment variable values but don't allow overrides
        console.log(`Current Jan AI URL: ${janUrl || "not set"}`);
        console.log(`Current Jan AI Model: ${janModel || "not set"}`);

        if (janModel) {
          janConfig = {
            baseUrl: janUrl,
            model: janModel,
          };
          console.log(
            "✅ Using Jan AI configuration from environment variables"
          );
        } else {
          console.log(
            "⚠️  No JAN_MODEL environment variable set - will use fallback analysis"
          );
          console.log("💡 Set JAN_MODEL environment variable to enable Jan AI");
        }
      }

      rl.close();

      // Validate and run with collected input
      const finalConfig: Config = {
        githubToken,
        repository,
        productArea,
        maxIssues,
        minRelevanceScore,
        outputPath,
        janConfig,
      };

      await this.validateConfigOnly(finalConfig);

      this.log("Interactive configuration completed successfully! ✅");

      // Execute the scraping process
      await this.executeScraping(finalConfig);
    } catch (error) {
      rl.close();
      throw error;
    }
  }

  private async promptUser(
    rl: readline.Interface,
    question: string
  ): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async validateAndMergeConfig(options: CLIOptions): Promise<Config> {
    const context: ErrorContext = {
      operation: "validating configuration",
    };

    // Warn about deprecated Jan AI CLI options
    if (
      options.janUrl ||
      options.janModel ||
      options.janTemperature ||
      options.janMaxTokens ||
      options.janTimeout
    ) {
      this.log(
        "⚠️  Jan AI CLI options are deprecated. Use environment variables instead:",
        "warn"
      );
      if (options.janUrl)
        this.log("   Use JAN_URL instead of --jan-url", "warn");
      if (options.janModel)
        this.log("   Use JAN_MODEL instead of --jan-model", "warn");
      if (options.janTemperature)
        this.log("   Use JAN_TEMPERATURE instead of --jan-temperature", "warn");
      if (options.janMaxTokens)
        this.log("   Use JAN_MAX_TOKENS instead of --jan-max-tokens", "warn");
      if (options.janTimeout)
        this.log("   Use JAN_TIMEOUT instead of --jan-timeout", "warn");
      this.log(
        "   CLI options will be ignored in favor of environment variables",
        "warn"
      );
    }

    try {
      const currentConfig = this.configManager.getConfig();

      // Build Jan AI configuration - use environment variables exclusively
      let janConfig = undefined;
      if (!options.noJan) {
        // Only read from environment variables, ignore CLI options for Jan config
        const baseUrl = process.env.JAN_URL;
        const model = process.env.JAN_MODEL;
        const temperature = process.env.JAN_TEMPERATURE
          ? Number(process.env.JAN_TEMPERATURE)
          : undefined;
        const maxTokens = process.env.JAN_MAX_TOKENS
          ? Number(process.env.JAN_MAX_TOKENS)
          : undefined;
        const timeout = process.env.JAN_TIMEOUT
          ? Number(process.env.JAN_TIMEOUT)
          : undefined;

        // Only create janConfig if we have at least a model or explicit config
        if (
          model ||
          baseUrl ||
          temperature !== undefined ||
          maxTokens !== undefined ||
          timeout !== undefined
        ) {
          janConfig = {
            baseUrl,
            model,
            temperature,
            maxTokens,
            timeout,
          };
        }
      }

      // Merge options with current config
      const mergedConfig: Config = {
        ...currentConfig,
        repository: options.repository || currentConfig.repository || "",
        productArea: options.productArea || currentConfig.productArea || "",
        maxIssues: options.maxIssues
          ? parseInt(String(options.maxIssues), 10)
          : currentConfig.maxIssues || 50,
        minRelevanceScore: options.minRelevanceScore
          ? parseInt(String(options.minRelevanceScore), 10)
          : currentConfig.minRelevanceScore || 30,
        outputPath:
          options.outputPath || currentConfig.outputPath || "./reports",
        githubToken: this.configManager.getGitHubToken() || "",
        janConfig,
      };

      // Validate the final config
      const validatedConfig = await this.validateConfigOnly(
        mergedConfig as Config
      );

      // Save valid configuration
      await this.configManager.saveConfig(mergedConfig);

      return validatedConfig;
    } catch (error: any) {
      if (error instanceof ScraperError) {
        throw error;
      }
      throw ErrorHandler.convertToScraperError(error, context);
    }
  }

  private async validateConfigOnly(config: Config): Promise<Config> {
    const validationErrors: Array<{
      field: string;
      message: string;
      suggestions: Array<{
        action: string;
        description: string;
        priority: "high" | "medium" | "low";
      }>;
    }> = [];

    if (!config.repository) {
      validationErrors.push({
        field: "repository",
        message: "Repository is required",
        suggestions: [
          {
            action: "Use command line option",
            description: "Add -r/--repository owner/repo to your command",
            priority: "high",
          },
          {
            action: "Set environment variable",
            description: "Set GITHUB_REPOSITORY environment variable",
            priority: "high",
          },
          {
            action: "Run interactive mode",
            description: "Use --interactive flag to configure step by step",
            priority: "medium",
          },
        ],
      });
    } else if (!this.isValidRepositoryFormat(config.repository)) {
      validationErrors.push({
        field: "repository",
        message: "Repository format is invalid",
        suggestions: [
          {
            action: "Check repository format",
            description:
              "Repository must be in format 'owner/repo' (e.g., 'microsoft/vscode')",
            priority: "high",
          },
          {
            action: "Verify repository exists",
            description: `Visit https://github.com/${config.repository} to confirm it exists`,
            priority: "medium",
          },
        ],
      });
    }

    if (!config.productArea) {
      validationErrors.push({
        field: "productArea",
        message: "Product area is required",
        suggestions: [
          {
            action: "Use command line option",
            description: "Add -p/--product-area 'keywords' to your command",
            priority: "high",
          },
          {
            action: "Set environment variable",
            description: "Set PRODUCT_AREA environment variable",
            priority: "high",
          },
          {
            action: "Use descriptive keywords",
            description:
              "Examples: 'authentication', 'database performance', 'UI components'",
            priority: "medium",
          },
        ],
      });
    } else if (!this.isValidProductArea(config.productArea)) {
      validationErrors.push({
        field: "productArea",
        message: "Product area must contain meaningful keywords",
        suggestions: [
          {
            action: "Use longer keywords",
            description: "Each keyword should be at least 2 characters long",
            priority: "high",
          },
          {
            action: "Use descriptive terms",
            description: "Examples: 'auth', 'performance', 'ui', 'api'",
            priority: "medium",
          },
        ],
      });
    }

    if (!config.githubToken) {
      validationErrors.push({
        field: "githubToken",
        message: "GitHub token is required",
        suggestions: [
          {
            action: "Set environment variable",
            description: "Set GITHUB_TOKEN environment variable",
            priority: "high",
          },
          {
            action: "Run setup command",
            description: "Use --setup flag to see setup instructions",
            priority: "high",
          },
          {
            action: "Create personal access token",
            description:
              "Visit https://github.com/settings/tokens to create a token",
            priority: "medium",
          },
        ],
      });
    }

    // Validate numeric options
    if (config.maxIssues && (config.maxIssues < 1 || config.maxIssues > 1000)) {
      validationErrors.push({
        field: "maxIssues",
        message: "Max issues must be between 1 and 1000",
        suggestions: [
          {
            action: "Use valid range",
            description: "Set max issues between 1 and 1000",
            priority: "high",
          },
          {
            action: "Use default value",
            description: "Omit the option to use default value (50)",
            priority: "medium",
          },
        ],
      });
    }

    if (
      config.minRelevanceScore &&
      (config.minRelevanceScore < 0 || config.minRelevanceScore > 100)
    ) {
      validationErrors.push({
        field: "minRelevanceScore",
        message: "Min relevance score must be between 0 and 100",
        suggestions: [
          {
            action: "Use valid range",
            description: "Set relevance score between 0 and 100",
            priority: "high",
          },
          {
            action: "Use default value",
            description: "Omit the option to use default value (30)",
            priority: "medium",
          },
        ],
      });
    }

    // Validate Jan AI configuration
    if (config.janConfig) {
      if (
        config.janConfig.temperature !== undefined &&
        (config.janConfig.temperature < 0 || config.janConfig.temperature > 2)
      ) {
        validationErrors.push({
          field: "janTemperature",
          message: "Jan AI temperature must be between 0.0 and 2.0",
          suggestions: [
            {
              action: "Use valid range",
              description: "Set temperature between 0.0 and 2.0",
              priority: "high",
            },
          ],
        });
      }

      if (
        config.janConfig.maxTokens !== undefined &&
        (config.janConfig.maxTokens < 100 || config.janConfig.maxTokens > 50000)
      ) {
        validationErrors.push({
          field: "janMaxTokens",
          message: "Jan AI max tokens must be between 100 and 50000",
          suggestions: [
            {
              action: "Use valid range",
              description: "Set max tokens between 100 and 50000",
              priority: "high",
            },
          ],
        });
      }
    }

    if (validationErrors.length > 0) {
      // Create a comprehensive validation error
      const allSuggestions = validationErrors.flatMap((e) => e.suggestions);

      throw ErrorHandler.handleValidationError(
        `Configuration validation failed: ${validationErrors
          .map((e) => e.message)
          .join(", ")}`,
        { operation: "validating configuration" },
        allSuggestions
      );
    }

    return config;
  }

  private isValidRepositoryFormat(repository: string): boolean {
    // Validate GitHub repository format: owner/repo
    const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    return (
      repoRegex.test(repository) &&
      !repository.includes("//") &&
      repository.split("/").length === 2
    );
  }

  private isValidProductArea(productArea: string): boolean {
    // Validate product area has meaningful content
    const trimmed = productArea.trim();
    if (trimmed.length < 2) return false;

    // Check for at least one word with 2+ characters
    const words = trimmed.split(/\s+/).filter((word) => word.length >= 2);
    return words.length > 0;
  }

  /**
   * Test Jan AI connection and provide helpful feedback
   */
  private async testJanConnection(
    janConfig?: Config["janConfig"]
  ): Promise<void> {
    if (!janConfig) {
      this.log(
        "No Jan AI configuration found - using fallback analysis",
        "warn"
      );
      return;
    }

    this.log("Testing Jan AI connection...", "debug");

    try {
      const janClient = new JanClient(janConfig);
      const connection = await janClient.testConnection();

      if (connection.connected) {
        this.log("Jan AI connection successful ✅", "debug");
      } else {
        this.log(`Jan AI connection failed: ${connection.error}`, "warn");
        this.log("Falling back to manual analysis. To use Jan AI:", "warn");
        this.log("1. Make sure Jan is running (download from jan.ai)", "warn");
        this.log("2. Enable API server in Jan settings", "warn");
        this.log("3. Set JAN_MODEL environment variable", "warn");
        this.log("4. Download a compatible model (e.g., Llama 3.2 3B)", "warn");
      }
    } catch (error: any) {
      this.log(`Jan AI test failed: ${error.message}`, "warn");
      this.log("Will use fallback analysis instead", "warn");

      if (error.message.includes("Jan AI model must be specified")) {
        this.log(
          "💡 Set JAN_MODEL environment variable to enable Jan AI",
          "warn"
        );
      }
    }
  }

  /**
   * Execute the main scraping process
   */
  private async executeScraping(config: Config): Promise<void> {
    this.log("🚀 Starting GitHub issue scraping process...");

    const scraper = new GitHubIssueScraper(
      config.githubToken,
      config.janConfig
    );

    try {
      const result = await scraper.scrapeRepository(config, (progress) => {
        // Show progress updates
        const percentage = Math.round(
          (progress.current / progress.total) * 100
        );

        switch (progress.phase) {
          case "fetching":
            this.log(`📥 ${progress.message} (${percentage}%)`);
            break;
          case "analyzing":
            this.log(
              `🔍 ${progress.message} (${progress.current}/${progress.total})`
            );
            break;
          case "generating":
            this.log(`📝 ${progress.message}`);
            break;
          case "complete":
            this.log(`✅ ${progress.message}`);
            break;
        }
      });

      // Display results summary
      this.log("\n📊 Scraping Results:");
      this.log(
        `   Total Issues Analyzed: ${result.metadata.totalIssuesAnalyzed}`
      );
      this.log(
        `   Relevant Issues Found: ${result.metadata.relevantIssuesFound}`
      );
      this.log(
        `   Average Relevance Score: ${result.metadata.averageRelevanceScore}%`
      );
      this.log(`   Workarounds Found: ${result.metadata.workaroundsFound}`);
      this.log(`   Analysis Method: ${result.metadata.analysisMethod}`);
      if (result.metadata.janConnectionStatus) {
        this.log(`   Jan AI Status: ${result.metadata.janConnectionStatus}`);
      }
      this.log(`   Report Saved: ${result.reportPath}`);

      // Show top issues if verbose
      if (this.verbose && result.issues.length > 0) {
        this.log("\n🔝 Top Relevant Issues:");
        result.issues.slice(0, 5).forEach((issue, index) => {
          this.log(
            `   ${index + 1}. #${issue.number}: ${issue.title} (${
              issue.relevanceScore
            }%)`
          );
          if (issue.janAnalysis) {
            this.log(
              `      🤖 Jan AI: ${issue.janAnalysis.relevanceReasoning}`
            );
            if (issue.janAnalysis.hasWorkaround) {
              this.log(
                `      💡 Workaround: ${issue.janAnalysis.workaroundType} (${issue.janAnalysis.implementationDifficulty})`
              );
            }
          }
          if (issue.workarounds.length > 0) {
            this.log(
              `      🔧 ${issue.workarounds.length} workaround(s) available`
            );
          }
        });
      }

      this.log(`\n🎉 Scraping completed successfully!`);
    } catch (error: any) {
      this.log(`❌ Scraping failed: ${error.message}`, "error");
      throw error;
    }
  }

  /**
   * Handle errors with user-friendly messages and suggestions
   */
  private handleError(error: any): void {
    if (error instanceof ScraperError) {
      // Use the centralized error formatting
      const formattedError = ErrorHandler.formatError(error, this.verbose);
      console.error(formattedError);

      // Provide additional context-specific help for common CLI errors
      this.provideContextualHelp(error);
    } else {
      // Handle regular errors with better context
      const context: ErrorContext = {
        operation: "CLI execution",
      };

      const scraperError = ErrorHandler.convertToScraperError(error, context);
      const formattedError = ErrorHandler.formatError(
        scraperError,
        this.verbose
      );
      console.error(formattedError);

      if (this.verbose && error instanceof Error && error.stack) {
        console.error("\n🔍 Stack trace:", error.stack);
      }
    }
  }

  /**
   * Provide contextual help based on error type
   */
  private provideContextualHelp(error: ScraperError): void {
    switch (error.type) {
      case "AUTHENTICATION":
        console.log("\n🔧 Quick Setup:");
        console.log("   Run: github-issue-scraper --setup");
        console.log("   Or set: export GITHUB_TOKEN=your_token_here");
        break;

      case "REPOSITORY_ACCESS":
        console.log("\n🔧 Repository Help:");
        console.log("   Format: owner/repository-name");
        console.log("   Example: microsoft/vscode");
        console.log("   Check: https://github.com/owner/repository-name");
        break;

      case "EMPTY_RESULTS":
        console.log("\n🔧 Search Tips:");
        console.log("   Try: --min-relevance-score 20");
        console.log(
          "   Use: broader keywords like 'performance' instead of 'slow rendering'"
        );
        console.log("   Add: --verbose for detailed scoring information");
        console.log(
          "   Jan AI: Set JAN_MODEL environment variable for better analysis"
        );
        break;

      case "VALIDATION":
        console.log("\n🔧 Configuration Help:");
        console.log("   Run: github-issue-scraper --help");
        console.log("   Or: github-issue-scraper --interactive");
        break;

      case "NETWORK":
        console.log("\n🔧 Network Troubleshooting:");
        console.log("   Check: Internet connection");
        console.log("   Try: VPN or different network");
        console.log("   Wait: A few minutes and retry");
        console.log(
          "   Jan AI: Check if Jan server is running at localhost:1337"
        );
        console.log("   Jan AI: Verify JAN_MODEL environment variable is set");
        break;
    }
  }

  public async start(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

// Main execution
if (require.main === module) {
  const cli = new GitHubIssueScraperCLI();
  cli.start().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { GitHubIssueScraperCLI };
