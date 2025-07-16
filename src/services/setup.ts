import * as readline from "readline";
import { ConfigManager } from "./config";
import { AuthenticationService } from "./auth";

export class SetupService {
  private configManager: ConfigManager;
  private authService: AuthenticationService;
  private rl: readline.Interface;

  constructor() {
    this.configManager = new ConfigManager();
    this.authService = new AuthenticationService();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Interactive setup process for first-time configuration
   */
  async runInteractiveSetup(): Promise<boolean> {
    console.log("\n🚀 Welcome to GitHub Issue Scraper Setup!\n");
    console.log(
      "This tool helps you scrape and analyze GitHub issues for specific product areas.\n"
    );

    try {
      // Load existing configuration
      await this.configManager.loadConfig();
      this.configManager.setDefaults();

      // Setup GitHub token
      const tokenSetup = await this.setupGitHubToken();
      if (!tokenSetup) {
        console.log(
          "\n❌ Setup cancelled. GitHub token is required to continue."
        );
        return false;
      }

      // Setup repository
      const repository = await this.setupRepository();
      if (!repository) {
        console.log(
          "\n❌ Setup cancelled. Repository is required to continue."
        );
        return false;
      }

      // Setup product area
      const productArea = await this.setupProductArea();
      if (!productArea) {
        console.log(
          "\n❌ Setup cancelled. Product area is required to continue."
        );
        return false;
      }

      // Setup optional configurations
      await this.setupOptionalConfig();

      // Save configuration
      await this.configManager.saveConfig({
        repository,
        productArea,
      });

      console.log("\n✅ Setup completed successfully!");
      console.log("\nYou can now run the scraper with:");
      console.log(
        `   github-issue-scraper --repo ${repository} --product-area "${productArea}"`
      );
      console.log(
        "\nOr simply run without arguments to use saved configuration."
      );

      return true;
    } catch (error) {
      console.error("\n❌ Setup failed:", error);
      return false;
    } finally {
      this.rl.close();
    }
  }

  /**
   * Setup GitHub token with validation
   */
  private async setupGitHubToken(): Promise<boolean> {
    const existingToken = this.configManager.getGitHubToken();

    if (existingToken) {
      console.log("🔑 Found existing GitHub token, validating...");
      const validation = await this.authService.validateToken(existingToken);

      if (validation.isValid) {
        console.log(
          `✅ Token is valid! Authenticated as: ${
            validation.user?.name || validation.user?.login
          }`
        );
        const useExisting = await this.askQuestion(
          "Use existing token? (y/n): "
        );
        if (useExisting.toLowerCase().startsWith("y")) {
          return true;
        }
      } else {
        console.log(`❌ Existing token is invalid: ${validation.error}`);
      }
    }

    console.log("\n📝 GitHub Token Setup");
    console.log(
      "You need a GitHub Personal Access Token to access the GitHub API."
    );
    console.log("Create one at: https://github.com/settings/tokens");
    console.log(
      "Required scopes: public_repo (or repo for private repositories)\n"
    );

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const token = await this.askQuestion("Enter your GitHub token: ", true);

      if (!token.trim()) {
        console.log("❌ Token cannot be empty.");
        attempts++;
        continue;
      }

      console.log("🔍 Validating token...");
      const validation = await this.authService.validateToken(token.trim());

      if (validation.isValid) {
        console.log(
          `✅ Token validated! Welcome, ${
            validation.user?.name || validation.user?.login
          }`
        );
        console.log(
          `📊 Rate limit: ${validation.rateLimit?.remaining}/${validation.rateLimit?.limit} requests remaining`
        );

        this.configManager.setGitHubToken(token.trim());
        return true;
      } else {
        console.log(`❌ Token validation failed: ${validation.error}`);
        attempts++;

        if (attempts < maxAttempts) {
          console.log(
            `Please try again (${maxAttempts - attempts} attempts remaining).\n`
          );
        }
      }
    }

    console.log(
      "\n❌ Maximum attempts reached. Please check your token and try again later."
    );
    return false;
  }

  /**
   * Setup repository with validation
   */
  private async setupRepository(): Promise<string | null> {
    const existingRepo = this.configManager.getConfig().repository;

    if (existingRepo) {
      console.log(`\n📁 Found existing repository: ${existingRepo}`);
      const useExisting = await this.askQuestion(
        "Use existing repository? (y/n): "
      );
      if (useExisting.toLowerCase().startsWith("y")) {
        return existingRepo;
      }
    }

    console.log("\n📁 Repository Setup");
    console.log(
      "Enter the GitHub repository you want to scrape (format: owner/repository)"
    );
    console.log("Example: microsoft/vscode, facebook/react, etc.\n");

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const repository = await this.askQuestion("Repository (owner/repo): ");

      if (!repository.trim()) {
        console.log("❌ Repository cannot be empty.");
        attempts++;
        continue;
      }

      if (!repository.includes("/") || repository.split("/").length !== 2) {
        console.log("❌ Invalid format. Please use: owner/repository");
        attempts++;
        continue;
      }

      console.log("🔍 Testing repository access...");
      const token = this.configManager.getGitHubToken()!;
      const accessTest = await this.authService.testRepositoryAccess(
        token,
        repository.trim()
      );

      if (accessTest.hasAccess) {
        console.log("✅ Repository access confirmed!");
        return repository.trim();
      } else {
        console.log(`❌ Repository access failed: ${accessTest.error}`);
        attempts++;

        if (attempts < maxAttempts) {
          console.log(
            `Please try again (${maxAttempts - attempts} attempts remaining).\n`
          );
        }
      }
    }

    console.log(
      "\n❌ Maximum attempts reached. Please check the repository name and your permissions."
    );
    return null;
  }

  /**
   * Setup product area
   */
  private async setupProductArea(): Promise<string | null> {
    const existingArea = this.configManager.getConfig().productArea;

    if (existingArea) {
      console.log(`\n🎯 Found existing product area: ${existingArea}`);
      const useExisting = await this.askQuestion(
        "Use existing product area? (y/n): "
      );
      if (useExisting.toLowerCase().startsWith("y")) {
        return existingArea;
      }
    }

    console.log("\n🎯 Product Area Setup");
    console.log("Enter keywords or topics to filter issues by relevance.");
    console.log(
      'Examples: "authentication", "database performance", "UI components", etc.\n'
    );

    const productArea = await this.askQuestion("Product area/keywords: ");

    if (!productArea.trim()) {
      console.log("❌ Product area cannot be empty.");
      return null;
    }

    return productArea.trim();
  }

  /**
   * Setup optional configuration
   */
  private async setupOptionalConfig(): Promise<void> {
    console.log("\n⚙️  Optional Configuration");

    const configureOptional = await this.askQuestion(
      "Configure optional settings? (y/n): "
    );
    if (!configureOptional.toLowerCase().startsWith("y")) {
      return;
    }

    // Max issues
    const maxIssuesInput = await this.askQuestion(
      "Maximum issues to process (default: 50): "
    );
    if (maxIssuesInput.trim()) {
      const maxIssues = parseInt(maxIssuesInput.trim(), 10);
      if (!isNaN(maxIssues) && maxIssues > 0) {
        await this.configManager.saveConfig({ maxIssues });
      }
    }

    // Min relevance score
    const minScoreInput = await this.askQuestion(
      "Minimum relevance score (0-100, default: 30): "
    );
    if (minScoreInput.trim()) {
      const minScore = parseInt(minScoreInput.trim(), 10);
      if (!isNaN(minScore) && minScore >= 0 && minScore <= 100) {
        await this.configManager.saveConfig({ minRelevanceScore: minScore });
      }
    }

    // Output path
    const outputPath = await this.askQuestion(
      "Output directory (default: ./reports): "
    );
    if (outputPath.trim()) {
      await this.configManager.saveConfig({ outputPath: outputPath.trim() });
    }
  }

  /**
   * Ask a question and return the answer
   */
  private askQuestion(
    question: string,
    hideInput: boolean = false
  ): Promise<string> {
    return new Promise((resolve) => {
      if (hideInput) {
        // For sensitive input like tokens
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding("utf8");

        let input = "";
        const onData = (char: string) => {
          if (char === "\r" || char === "\n") {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener("data", onData);
            process.stdout.write("\n");
            resolve(input);
          } else if (char === "\u0003") {
            // Ctrl+C
            process.exit(1);
          } else if (char === "\u007f") {
            // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else {
            input += char;
            process.stdout.write("*");
          }
        };

        process.stdin.on("data", onData);
      } else {
        this.rl.question(question, resolve);
      }
    });
  }
}
