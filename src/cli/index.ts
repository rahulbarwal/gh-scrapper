#!/usr/bin/env node

import { Command } from "commander";
import * as readline from "readline";
import {
  ConfigManager,
  AuthenticationService,
  SetupService,
  GitHubIssueScraper,
} from "../services";
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
  janEndpoint?: string;
  janModel?: string;
  verbose?: boolean;
  interactive?: boolean;
  setup?: boolean;
  testJan?: boolean;
}

class GitHubIssueScraperCLI {
  private program: Command;
  private configManager: ConfigManager;
  private authService: AuthenticationService;
  private setupService: SetupService;
  private verbose: boolean = false;

  constructor() {
    this.program = new Command();
    this.configManager = new ConfigManager();
    this.authService = new AuthenticationService();
    this.setupService = new SetupService();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name("github-issue-scraper")
      .description(
        "A CLI tool for scraping GitHub issues within specific repositories and product areas"
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
      .option(
        "--jan-endpoint <url>",
        "JAN server endpoint URL",
        "http://localhost:1337"
      )
      .option("--jan-model <model>", "JAN model to use for analysis", "llama2")
      .option("-v, --verbose", "Enable verbose logging")
      .option("-i, --interactive", "Run in interactive mode with prompts")
      .option("--setup", "Run initial setup to configure GitHub token")
      .option("--test-jan", "Test JAN connectivity and available models")
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
  $ github-issue-scraper --test-jan
  $ github-issue-scraper -r owner/repo -p "api" --jan-endpoint http://localhost:1337 --jan-model mistral

Environment Variables:
  GITHUB_TOKEN          GitHub personal access token
  GITHUB_REPOSITORY     Default repository (owner/repo format)
  PRODUCT_AREA          Default product area keywords
  MAX_ISSUES            Default maximum issues to process
  MIN_RELEVANCE_SCORE   Default minimum relevance score
  OUTPUT_PATH           Default output directory
  JAN_ENDPOINT          JAN server endpoint URL (default: http://localhost:1337)
  JAN_MODEL             JAN model to use for analysis (default: llama2)
  JAN_API_KEY           JAN API key (if required)
  JAN_MAX_RETRIES       Maximum number of retries for JAN requests
  JAN_TIMEOUT           Timeout in milliseconds for JAN requests

Configuration:
  Configuration is stored in ~/.github-issue-scraper/config.json
  GitHub token should be set via environment variable or --setup command
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
      this.log("Starting GitHub Issue Scraper...", "debug");

      // Handle setup command
      if (options.setup) {
        await this.runSetup();
        return;
      }

      // Load existing configuration
      await this.configManager.loadConfig();
      this.configManager.setDefaults();

      // Handle test-jan command
      if (options.testJan) {
        await this.testJANConnectivity(options);
        return;
      }

      // Handle interactive mode
      if (options.interactive) {
        await this.runInteractiveMode();
        return;
      }

      // Validate and merge options with config
      const config = await this.validateAndMergeConfig(options);

      // Validate GitHub token and repository access
      await this.validateAuthentication(config);

      this.log(`Configuration validated successfully`, "debug");
      this.log(`Repository: ${config.repository}`);
      this.log(`Product Area: ${config.productArea}`);
      this.log(`Max Issues: ${config.maxIssues}`);
      this.log(`Min Relevance Score: ${config.minRelevanceScore}`);
      this.log(`Output Path: ${config.outputPath}`);
      this.log(`JAN Endpoint: ${config.janEndpoint}`);
      this.log(`JAN Model: ${config.janModel}`);

      // Execute the scraping process
      await this.executeScraping(config);
    } catch (error) {
      this.handleError(error);
      process.exit(1);
    }
  }

  /**
   * Test JAN connectivity and available models
   */
  private async testJANConnectivity(options: CLIOptions): Promise<void> {
    this.log("🔍 Testing JAN connectivity...");

    try {
      // Load configuration
      await this.configManager.loadConfig();
      this.configManager.setDefaults();

      // Get JAN endpoint from options or config
      const janEndpoint =
        options.janEndpoint || this.configManager.getJANEndpoint();

      this.log(`Using JAN endpoint: ${janEndpoint}`);

      // Import JANClient dynamically to avoid circular dependencies
      const { JANClient } = await import("../services/jan-client");

      // Create JAN client
      const janClient = new JANClient({ endpoint: janEndpoint });

      // Test connectivity
      this.log("Testing connection to JAN server...");
      const isConnected = await janClient.validateConnection();

      if (isConnected) {
        this.log("✅ Successfully connected to JAN server!");

        // List available models
        try {
          this.log("📋 Retrieving available models...");

          const response = await fetch(`${janEndpoint}/v1/models`);

          if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
          }

          const data = await response.json();
          const models = data.data || [];

          if (models.length === 0) {
            this.log(
              "⚠️  No models available in JAN. Please load a model first."
            );
            return;
          }

          this.log(`\n📋 Available models in JAN (${models.length}):`);
          models.forEach((model: any, index: number) => {
            this.log(`${index + 1}. ${model.id}`);
          });

          // Test selected model
          const modelToTest =
            options.janModel || this.configManager.getJANModel();

          this.log(`\n🔍 Testing model: ${modelToTest}`);

          try {
            await janClient.validateModel(modelToTest);
            this.log(
              `✅ Model '${modelToTest}' is available and ready to use!`
            );

            // Save configuration if successful
            await this.configManager.saveConfig({
              janEndpoint,
              janModel: modelToTest,
            });

            this.log("✅ JAN configuration saved successfully!");
          } catch (error: any) {
            this.log(`❌ Model validation failed: ${error.message}`, "error");
            this.log(
              "Please select a different model or load the model in JAN."
            );
          }
        } catch (error: any) {
          this.log(`❌ Failed to list JAN models: ${error.message}`, "error");
        }
      } else {
        this.log("❌ Failed to connect to JAN server.", "error");
      }
    } catch (error: any) {
      this.log(`❌ JAN connectivity test failed: ${error.message}`, "error");

      if (this.verbose && error instanceof Error && error.stack) {
        this.log(`Stack trace: ${error.stack}`, "debug");
      }
    }
  }

  private async runSetup(): Promise<void> {
    this.log("Running initial setup...");

    try {
      await this.setupService.runInteractiveSetup();
      this.log("Setup completed successfully! ✅");
    } catch (error) {
      this.log(
        `Setup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      process.exit(1);
    }
  }

  private async runInteractiveMode(): Promise<void> {
    this.log("Running in interactive mode...");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const config = this.configManager.getConfig();

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

      // JAN configuration
      const configureJan = await this.promptUser(
        rl,
        "Configure JAN integration? (y/n): "
      );

      let janEndpoint = config.janEndpoint || "http://localhost:1337";
      let janModel = config.janModel || "llama2";

      if (configureJan.toLowerCase().startsWith("y")) {
        const janEndpointInput = await this.promptUser(
          rl,
          `JAN endpoint URL (${janEndpoint}): `
        );

        if (janEndpointInput.trim()) {
          try {
            // Validate URL format
            new URL(janEndpointInput.trim());
            janEndpoint = janEndpointInput.trim();
          } catch (error) {
            this.log(
              "⚠️  Invalid URL format. Using default or previous value.",
              "warn"
            );
          }
        }

        // Test JAN connectivity
        this.log("🔍 Testing JAN server connectivity...");
        try {
          const { JANClient } = await import("../services/jan-client");
          const janClient = new JANClient({ endpoint: janEndpoint });
          const isConnected = await janClient.validateConnection();

          if (isConnected) {
            this.log("✅ Successfully connected to JAN server!");

            // List available models
            try {
              const response = await fetch(`${janEndpoint}/v1/models`);

              if (response.ok) {
                const data = await response.json();
                const models = data.data || [];

                if (models.length > 0) {
                  this.log("\n📋 Available models in JAN:");
                  models.forEach((model: any, index: number) => {
                    this.log(`${index + 1}. ${model.id}`);
                  });

                  const modelChoice = await this.promptUser(
                    rl,
                    `Select a model (1-${models.length}, default: ${janModel}): `
                  );

                  if (modelChoice.trim()) {
                    const choice = parseInt(modelChoice.trim(), 10);
                    if (
                      !isNaN(choice) &&
                      choice >= 1 &&
                      choice <= models.length
                    ) {
                      janModel = models[choice - 1].id;
                    } else {
                      this.log(
                        `⚠️  Invalid choice. Using default or previous value: ${janModel}`,
                        "warn"
                      );
                    }
                  }
                } else {
                  this.log(
                    "⚠️  No models available in JAN. Please load a model first.",
                    "warn"
                  );
                }
              } else {
                this.log(
                  `⚠️  Failed to list models: ${response.status}`,
                  "warn"
                );
              }
            } catch (error: any) {
              this.log(
                `⚠️  Failed to list JAN models: ${error.message}`,
                "warn"
              );
            }
          } else {
            this.log("⚠️  Failed to connect to JAN server.", "warn");
          }
        } catch (error: any) {
          this.log(
            `⚠️  JAN connectivity test failed: ${error.message}`,
            "warn"
          );
        }
      }

      rl.close();

      // Validate and run with collected input
      const finalConfig: Config = {
        githubToken: this.configManager.getGitHubToken() || "",
        repository,
        productArea,
        maxIssues,
        minRelevanceScore,
        outputPath,
        janEndpoint,
        janModel,
      };

      await this.validateAndMergeConfig(finalConfig);
      await this.validateAuthentication(finalConfig);

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

  private async validateAndMergeConfig(
    options: CLIOptions | Config
  ): Promise<Config> {
    const context: ErrorContext = {
      operation: "validating configuration",
    };

    try {
      const currentConfig = this.configManager.getConfig();

      // Merge options with current config
      const mergedConfig: Partial<Config> = {
        ...currentConfig,
        repository: options.repository || currentConfig.repository,
        productArea: options.productArea || currentConfig.productArea,
        maxIssues: options.maxIssues || currentConfig.maxIssues || 50,
        minRelevanceScore:
          options.minRelevanceScore || currentConfig.minRelevanceScore || 30,
        outputPath:
          options.outputPath || currentConfig.outputPath || "./reports",
        githubToken: this.configManager.getGitHubToken(),
        janEndpoint:
          options.janEndpoint ||
          currentConfig.janEndpoint ||
          "http://localhost:1337",
        janModel: options.janModel || currentConfig.janModel || "llama2",
      };

      // Validate required fields with specific error handling
      const validationErrors: Array<{
        field: string;
        message: string;
        suggestions: Array<{
          action: string;
          description: string;
          priority: "high" | "medium" | "low";
        }>;
      }> = [];

      if (!mergedConfig.repository) {
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
              action: "Run interactive setup",
              description: "Use --setup flag to configure interactively",
              priority: "medium",
            },
          ],
        });
      } else if (!this.isValidRepositoryFormat(mergedConfig.repository)) {
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
              description: `Visit https://github.com/${mergedConfig.repository} to confirm it exists`,
              priority: "medium",
            },
          ],
        });
      }

      if (!mergedConfig.productArea) {
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
      } else if (!this.isValidProductArea(mergedConfig.productArea)) {
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

      if (!mergedConfig.githubToken) {
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
              description: "Use --setup flag to configure token interactively",
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
      if (
        mergedConfig.maxIssues &&
        (mergedConfig.maxIssues < 1 || mergedConfig.maxIssues > 1000)
      ) {
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
        mergedConfig.minRelevanceScore &&
        (mergedConfig.minRelevanceScore < 0 ||
          mergedConfig.minRelevanceScore > 100)
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

      if (validationErrors.length > 0) {
        // Create a comprehensive validation error
        const firstError = validationErrors[0];
        const allSuggestions = validationErrors.flatMap((e) => e.suggestions);

        throw ErrorHandler.handleValidationError(
          `Configuration validation failed: ${validationErrors
            .map((e) => e.message)
            .join(", ")}`,
          context,
          allSuggestions
        );
      }

      // Save valid configuration
      await this.configManager.saveConfig(mergedConfig);

      return mergedConfig as Config;
    } catch (error: any) {
      if (error instanceof ScraperError) {
        throw error;
      }
      throw ErrorHandler.convertToScraperError(error, context);
    }
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

  private async validateAuthentication(config: Config): Promise<void> {
    this.log("Validating GitHub authentication...", "debug");

    const authResult = await this.authService.validateToken(config.githubToken);

    if (!authResult.isValid) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }

    this.log(
      `Authenticated as: ${authResult.user?.login} (${authResult.user?.name})`,
      "debug"
    );

    if (authResult.rateLimit) {
      this.log(
        `Rate limit: ${authResult.rateLimit.remaining}/${authResult.rateLimit.limit} remaining`,
        "debug"
      );
    }

    // Test repository access
    this.log("Testing repository access...", "debug");
    const repoAccess = await this.authService.testRepositoryAccess(
      config.githubToken,
      config.repository
    );

    if (!repoAccess.hasAccess) {
      throw new Error(`Repository access failed: ${repoAccess.error}`);
    }

    this.log("Repository access confirmed", "debug");
  }

  /**
   * Execute the main scraping process
   */
  private async executeScraping(config: Config): Promise<void> {
    this.log("🚀 Starting GitHub issue scraping process...");

    const scraper = new GitHubIssueScraper(config.githubToken);

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
          if (issue.workarounds.length > 0) {
            this.log(
              `      💡 ${issue.workarounds.length} workaround(s) available`
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
        break;

      case "JAN_CONNECTION":
        console.log("\n🔧 JAN Connection Help:");
        console.log("   Check: Is JAN running at the configured endpoint?");
        console.log("   Run: github-issue-scraper --test-jan");
        console.log("   Try: --jan-endpoint http://localhost:1337");
        console.log("   Or: Set JAN_ENDPOINT environment variable");
        break;

      case "JAN_MODEL":
        console.log("\n🔧 JAN Model Help:");
        console.log("   Check: Is the model loaded in JAN?");
        console.log("   Run: github-issue-scraper --test-jan");
        console.log("   Try: --jan-model llama2");
        console.log("   Or: Set JAN_MODEL environment variable");
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
