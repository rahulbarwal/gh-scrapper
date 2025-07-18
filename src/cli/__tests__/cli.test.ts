import { GitHubIssueScraperCLI } from "../index";

describe("GitHubIssueScraperCLI", () => {
  let cli: GitHubIssueScraperCLI;

  beforeEach(() => {
    cli = new GitHubIssueScraperCLI();
  });

  describe("CLI instantiation", () => {
    it("should create CLI instance without errors", () => {
      expect(cli).toBeInstanceOf(GitHubIssueScraperCLI);
    });
  });

  describe("Repository validation", () => {
    it("should validate correct repository format", () => {
      const validRepos = [
        "microsoft/vscode",
        "facebook/react",
        "owner/repo",
        "test-owner/test-repo",
        "owner123/repo456",
      ];

      // Access private method for testing via type assertion
      const cliAny = cli as any;

      validRepos.forEach((repo) => {
        expect(cliAny.isValidRepositoryFormat(repo)).toBe(true);
      });
    });

    it("should reject invalid repository formats", () => {
      const invalidRepos = [
        "invalid",
        "owner/repo/extra",
        "/repo",
        "owner/",
        "owner//repo",
        "",
        "owner repo",
      ];

      const cliAny = cli as any;

      invalidRepos.forEach((repo) => {
        expect(cliAny.isValidRepositoryFormat(repo)).toBe(false);
      });
    });
  });

  describe("Error handling", () => {
    let consoleSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, "log").mockImplementation();
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("should handle ScraperError with formatted output", () => {
      const cliAny = cli as any;
      const {
        ScraperError,
        ErrorType,
      } = require("../../services/error-handler");

      const mockError = new ScraperError(
        ErrorType.AUTHENTICATION,
        "GitHub authentication failed",
        { operation: "test" },
        [
          {
            action: "Check token",
            description: "Verify your token",
            priority: "high",
          },
        ]
      );

      // Mock the ErrorHandler.formatError method
      const originalFormatError = require("../../services/error-handler")
        .ErrorHandler.formatError;
      require("../../services/error-handler").ErrorHandler.formatError = jest
        .fn()
        .mockReturnValue("Formatted error");

      cliAny.handleError(mockError);

      expect(consoleErrorSpy).toHaveBeenCalledWith("Formatted error");
      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Quick Setup:");

      // Restore original method
      require("../../services/error-handler").ErrorHandler.formatError =
        originalFormatError;
    });

    it("should provide contextual help for authentication errors", () => {
      const cliAny = cli as any;
      const mockError = {
        type: "AUTHENTICATION",
        message: "Auth failed",
        context: { operation: "test" },
        suggestions: [],
      };

      cliAny.provideContextualHelp(mockError);

      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Quick Setup:");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Run: github-issue-scraper --setup"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Or set: export GITHUB_TOKEN=your_token_here"
      );
    });

    it("should provide contextual help for repository errors", () => {
      const cliAny = cli as any;
      const mockError = {
        type: "REPOSITORY_ACCESS",
        message: "Repo not found",
        context: { operation: "test" },
        suggestions: [],
      };

      cliAny.provideContextualHelp(mockError);

      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Repository Help:");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Format: owner/repository-name"
      );
      expect(consoleSpy).toHaveBeenCalledWith("   Example: microsoft/vscode");
    });

    it("should provide contextual help for empty results", () => {
      const cliAny = cli as any;
      const mockError = {
        type: "EMPTY_RESULTS",
        message: "No results found",
        context: { operation: "test" },
        suggestions: [],
      };

      cliAny.provideContextualHelp(mockError);

      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Search Tips:");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Try: --min-relevance-score 20"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Use: broader keywords like 'performance' instead of 'slow rendering'"
      );
    });

    it("should provide contextual help for validation errors", () => {
      const cliAny = cli as any;
      const mockError = {
        type: "VALIDATION",
        message: "Validation failed",
        context: { operation: "test" },
        suggestions: [],
      };

      cliAny.provideContextualHelp(mockError);

      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Configuration Help:");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Run: github-issue-scraper --help"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Or: github-issue-scraper --interactive"
      );
    });

    it("should provide contextual help for network errors", () => {
      const cliAny = cli as any;
      const mockError = {
        type: "NETWORK",
        message: "Network failed",
        context: { operation: "test" },
        suggestions: [],
      };

      cliAny.provideContextualHelp(mockError);

      expect(consoleSpy).toHaveBeenCalledWith("\n🔧 Network Troubleshooting:");
      expect(consoleSpy).toHaveBeenCalledWith("   Check: Internet connection");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   Try: VPN or different network"
      );
    });

    it("should handle regular errors by converting to ScraperError", () => {
      const cliAny = cli as any;
      const regularError = new Error("Regular error message");

      // Mock ErrorHandler methods
      const originalConvertToScraperError =
        require("../../services/error-handler").ErrorHandler
          .convertToScraperError;
      const originalFormatError = require("../../services/error-handler")
        .ErrorHandler.formatError;

      const mockScraperError = {
        type: "UNKNOWN",
        message: "Converted error",
        context: { operation: "CLI execution" },
        suggestions: [],
      };

      require("../../services/error-handler").ErrorHandler.convertToScraperError =
        jest.fn().mockReturnValue(mockScraperError);
      require("../../services/error-handler").ErrorHandler.formatError = jest
        .fn()
        .mockReturnValue("Formatted converted error");

      cliAny.handleError(regularError);

      expect(consoleErrorSpy).toHaveBeenCalledWith("Formatted converted error");

      // Restore original methods
      require("../../services/error-handler").ErrorHandler.convertToScraperError =
        originalConvertToScraperError;
      require("../../services/error-handler").ErrorHandler.formatError =
        originalFormatError;
    });
  });

  describe("Product area validation", () => {
    it("should validate meaningful product areas", () => {
      const validAreas = [
        "authentication",
        "database performance",
        "UI components",
        "api bugs",
        "editor performance",
      ];

      const cliAny = cli as any;

      validAreas.forEach((area) => {
        expect(cliAny.isValidProductArea(area)).toBe(true);
      });
    });

    it("should reject invalid product areas", () => {
      const invalidAreas = ["", "a", " ", "  ", "x"];

      const cliAny = cli as any;

      invalidAreas.forEach((area) => {
        expect(cliAny.isValidProductArea(area)).toBe(false);
      });
    });
  });
});
