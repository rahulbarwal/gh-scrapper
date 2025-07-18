import { ErrorHandler, ScraperError, ErrorType } from "../error-handler";
import { GitHubClient } from "../github-client";
import { RelevanceFilter } from "../relevance-filter";
import { ReportGenerator } from "../report-generator";
import { ConfigManager } from "../config";

describe("Error Handling Integration", () => {
  describe("Service Integration Error Handling", () => {
    it("should handle GitHub client errors gracefully", async () => {
      // Test with invalid token
      const client = new GitHubClient("invalid-token");

      try {
        await client.getRepositoryIssues("nonexistent/repo");
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(ScraperError);
        expect(error.type).toBe(ErrorType.AUTHENTICATION);
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
      }
    });

    it("should handle relevance filter empty results", () => {
      const filter = new RelevanceFilter();
      const mockIssues = [
        {
          id: 1,
          title: "Unrelated issue",
          description: "This is about something else",
          labels: ["bug"],
          state: "open" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: "user",
          url: "https://github.com/test/test/issues/1",
          comments: [],
          relevanceScore: 0,
          summary: "",
          workarounds: [],
        },
      ];

      try {
        filter.filterIssues(mockIssues, {
          productArea: "authentication",
          minRelevanceScore: 50,
        });
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(ScraperError);
        expect(error.type).toBe(ErrorType.EMPTY_RESULTS);
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
      }
    });

    it("should handle report generator file system errors", async () => {
      const generator = new ReportGenerator();
      const mockMetadata = {
        repositoryName: "test-repo",
        repositoryUrl: "https://github.com/test/repo",
        productArea: "test",
        scrapeDate: new Date(),
        totalIssuesAnalyzed: 10,
        relevantIssuesFound: 5,
        minRelevanceScore: 30,
        generatedBy: "test",
      };

      try {
        // Try to save to an invalid path
        await generator.saveReport(
          "# Test Report",
          mockMetadata,
          "/invalid/path/that/does/not/exist"
        );
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(ScraperError);
        expect(error.type).toBe(ErrorType.FILE_SYSTEM);
        expect(error.suggestions).toBeDefined();
      }
    });

    it("should handle config manager file system errors gracefully", async () => {
      // Create a config manager with an invalid path
      const configManager = new ConfigManager();

      // Mock fs.readJson to throw an error
      const originalReadJson = require("fs-extra").readJson;
      require("fs-extra").readJson = jest
        .fn()
        .mockRejectedValue(new Error("ENOENT: no such file or directory"));

      try {
        // This should handle the error gracefully and continue
        const config = await configManager.loadConfig();
        expect(config).toBeDefined();
      } catch (error: any) {
        // If an error is thrown, it should be a ScraperError
        expect(error).toBeInstanceOf(ScraperError);
      }

      // Restore original method
      require("fs-extra").readJson = originalReadJson;
    });
  });

  describe("Error Recovery and Retry Logic", () => {
    it("should demonstrate retry logic with network errors", async () => {
      let attemptCount = 0;
      const maxAttempts = 3;

      const flakyOperation = async () => {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          // Create a proper network error that will be classified as retryable
          const networkError = new ScraperError(
            ErrorType.NETWORK,
            "Network timeout",
            { operation: "test network operation" },
            [],
            true // isRetryable
          );
          throw networkError;
        }
        return "success";
      };

      const result = await ErrorHandler.executeWithRetry(
        flakyOperation,
        { operation: "test network operation" },
        maxAttempts - 1
      );

      expect(result).toBe("success");
      expect(attemptCount).toBe(maxAttempts);
    });

    it("should stop retrying non-retryable errors", async () => {
      let attemptCount = 0;

      const authFailureOperation = async () => {
        attemptCount++;
        const authError = new Error("Unauthorized");
        (authError as any).response = { status: 401 };
        (authError as any).isAxiosError = true;
        throw authError;
      };

      try {
        await ErrorHandler.executeWithRetry(
          authFailureOperation,
          { operation: "test auth operation" },
          3
        );
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(ScraperError);
        expect(error.type).toBe(ErrorType.AUTHENTICATION);
        expect(attemptCount).toBe(1); // Should not retry auth errors
      }
    });
  });

  describe("Error Message Quality and User Experience", () => {
    it("should provide contextual suggestions for different error types", () => {
      const testCases = [
        {
          errorType: ErrorType.AUTHENTICATION,
          expectedSuggestions: [
            "Check your GitHub token",
            "Generate a new token",
          ],
        },
        {
          errorType: ErrorType.REPOSITORY_ACCESS,
          expectedSuggestions: [
            "Check repository name",
            "Verify repository exists",
          ],
        },
        {
          errorType: ErrorType.EMPTY_RESULTS,
          expectedSuggestions: [
            "Broaden search terms",
            "Lower relevance threshold",
          ],
        },
        {
          errorType: ErrorType.NETWORK,
          expectedSuggestions: [
            "Check internet connection",
            "Check DNS settings",
          ],
        },
      ];

      testCases.forEach(({ errorType, expectedSuggestions }) => {
        const error = new ScraperError(
          errorType,
          `Test ${errorType} error`,
          { operation: "test operation" },
          expectedSuggestions.map((suggestion) => ({
            action: suggestion,
            description: `Description for ${suggestion}`,
            priority: "high" as const,
          }))
        );

        const formatted = ErrorHandler.formatError(error, true);

        expectedSuggestions.forEach((suggestion) => {
          expect(formatted).toContain(suggestion);
        });
      });
    });

    it("should format errors consistently across different contexts", () => {
      const contexts = [
        { operation: "fetching issues", repository: "owner/repo" },
        { operation: "parsing data", issueId: 123 },
        { operation: "saving file", filePath: "/path/to/file" },
      ];

      contexts.forEach((context) => {
        const error = new ScraperError(
          ErrorType.VALIDATION,
          "Test validation error",
          context,
          [
            {
              action: "Test action",
              description: "Test description",
              priority: "medium",
            },
          ]
        );

        const formatted = ErrorHandler.formatError(error, true);

        expect(formatted).toContain("❌ Test validation error");
        expect(formatted).toContain("📍 Context:");
        expect(formatted).toContain("💡 Suggestions:");
        expect(formatted).toContain("⚠️ Test action: Test description");
      });
    });
  });

  describe("Error Handling Performance", () => {
    it("should handle large numbers of errors efficiently", () => {
      const startTime = Date.now();
      const errors = [];

      // Generate and handle 1000 errors
      for (let i = 0; i < 1000; i++) {
        const error = new Error(`Test error ${i}`);
        const scraperError = ErrorHandler.convertToScraperError(error, {
          operation: `test operation ${i}`,
        });
        errors.push(scraperError);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 1000 errors in less than 1 second
      expect(duration).toBeLessThan(1000);
      expect(errors).toHaveLength(1000);
      errors.forEach((error) => {
        expect(error).toBeInstanceOf(ScraperError);
      });
    });

    it("should format errors efficiently", () => {
      const error = new ScraperError(
        ErrorType.VALIDATION,
        "Performance test error",
        { operation: "performance test" },
        Array.from({ length: 50 }, (_, i) => ({
          action: `Action ${i}`,
          description: `Description ${i}`,
          priority: "medium" as const,
        }))
      );

      const startTime = Date.now();
      const formatted = ErrorHandler.formatError(error, true);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should format in less than 100ms
      expect(formatted).toContain("❌ Performance test error");
      expect(formatted).toContain("💡 Suggestions:");
    });
  });
});
