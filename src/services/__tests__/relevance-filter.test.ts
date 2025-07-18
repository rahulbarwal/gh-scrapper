import { RelevanceFilter } from "../relevance-filter";
import { GitHubIssue } from "../../models";
import { ScraperError } from "../error-handler";

describe("RelevanceFilter", () => {
  let filter: RelevanceFilter;
  let mockIssues: GitHubIssue[];

  beforeEach(() => {
    filter = new RelevanceFilter();

    // Create mock issues for testing
    mockIssues = [
      {
        id: 1,
        title: "Authentication bug in login system",
        description: "Users cannot authenticate with OAuth provider",
        labels: ["bug", "authentication", "oauth"],
        state: "open",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-15"),
        author: "user1",
        url: "https://github.com/repo/issues/1",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
      {
        id: 2,
        title: "Performance issue with database queries",
        description: "Database queries are slow when handling large datasets",
        labels: ["performance", "database"],
        state: "open",
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-20"),
        author: "user2",
        url: "https://github.com/repo/issues/2",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
      {
        id: 3,
        title: "UI component styling problems",
        description:
          "Button components have inconsistent styling across browsers",
        labels: ["ui", "styling", "frontend"],
        state: "open",
        createdAt: new Date("2024-01-03"),
        updatedAt: new Date("2024-01-25"),
        author: "user3",
        url: "https://github.com/repo/issues/3",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
    ];
  });

  describe("extractKeywords", () => {
    it("should extract keywords from simple product area", () => {
      const keywords = filter.extractKeywords("authentication login");
      expect(keywords).toEqual(["authentication", "login"]);
    });

    it("should handle multiple delimiters", () => {
      const keywords = filter.extractKeywords("auth,login;oauth|security");
      expect(keywords).toEqual(["auth", "login", "oauth", "security"]);
    });

    it("should filter out short words and stop words", () => {
      const keywords = filter.extractKeywords(
        "authentication and login with oauth"
      );
      expect(keywords).toEqual(["authentication", "login", "oauth"]);
    });

    it("should remove duplicates", () => {
      const keywords = filter.extractKeywords("auth auth login login");
      expect(keywords).toEqual(["auth", "login"]);
    });

    it("should handle empty input", () => {
      const keywords = filter.extractKeywords("");
      expect(keywords).toEqual([]);
    });
  });

  describe("scoreRelevance", () => {
    it("should give high score for exact title match", () => {
      const score = filter.scoreRelevance(mockIssues[0], "authentication");
      expect(score).toBeGreaterThan(0.3); // Should be high due to title weight
    });

    it("should give high score for label match", () => {
      const score = filter.scoreRelevance(mockIssues[0], "oauth");
      expect(score).toBeGreaterThan(0.2); // Should be decent due to label weight
    });

    it("should give low score for no matches", () => {
      const score = filter.scoreRelevance(mockIssues[0], "unrelated topic");
      expect(score).toBeLessThan(0.1);
    });

    it("should consider activity in scoring", () => {
      const recentIssue = {
        ...mockIssues[0],
        updatedAt: new Date(), // Very recent
      };
      const oldIssue = {
        ...mockIssues[0],
        updatedAt: new Date("2023-01-01"), // Old
      };

      const recentScore = filter.scoreRelevance(recentIssue, "authentication");
      const oldScore = filter.scoreRelevance(oldIssue, "authentication");

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it("should use custom weights when provided", () => {
      const customWeights = {
        title: 0.8,
        labels: 0.1,
        description: 0.05,
        activity: 0.05,
      };

      const defaultScore = filter.scoreRelevance(
        mockIssues[0],
        "authentication"
      );
      const customScore = filter.scoreRelevance(
        mockIssues[0],
        "authentication",
        customWeights
      );

      // With higher title weight, score should be different
      expect(customScore).not.toEqual(defaultScore);
    });
  });

  describe("fuzzyMatch", () => {
    it("should return 1.0 for exact matches", () => {
      const similarity = filter.fuzzyMatch("authentication", "auth");
      expect(similarity).toBe(1.0);
    });

    it("should return high similarity for similar words", () => {
      const similarity = filter.fuzzyMatch("authentication", "authenticate");
      expect(similarity).toBeGreaterThan(0.7);
    });

    it("should return 0 for very different words", () => {
      const similarity = filter.fuzzyMatch("authentication", "database");
      expect(similarity).toBe(0);
    });

    it("should be case insensitive", () => {
      const similarity = filter.fuzzyMatch("AUTHENTICATION", "auth");
      expect(similarity).toBe(1.0);
    });
  });

  describe("findKeywordMatches", () => {
    it("should find exact keyword matches", () => {
      const matches = filter.findKeywordMatches("authentication bug in login", [
        "auth",
        "login",
      ]);

      expect(matches).toHaveLength(2);
      expect(matches[0].keyword).toBe("auth");
      expect(matches[0].matches).toBeGreaterThan(0);
      expect(matches[1].keyword).toBe("login");
      expect(matches[1].matches).toBeGreaterThan(0);
    });

    it("should find fuzzy matches when no exact matches exist", () => {
      const matches = filter.findKeywordMatches("authenticate user", [
        "authentication",
      ]);

      expect(matches).toHaveLength(1);
      expect(matches[0].keyword).toBe("authentication");
      expect(matches[0].matches).toBeGreaterThan(0);
    });

    it("should return empty array for no matches", () => {
      const matches = filter.findKeywordMatches("completely unrelated text", [
        "auth",
        "login",
      ]);
      expect(matches).toHaveLength(0);
    });
  });

  describe("filterIssues", () => {
    it("should filter issues by minimum relevance score", () => {
      const options = {
        productArea: "authentication",
        minRelevanceScore: 0.2,
      };

      const filtered = filter.filterIssues(mockIssues, options);

      // Should include the authentication issue, exclude others
      expect(filtered.length).toBeLessThanOrEqual(mockIssues.length);
      expect(filtered.every((issue) => issue.relevanceScore >= 0.2)).toBe(true);
    });

    it("should sort by relevance score descending", () => {
      const options = {
        productArea: "authentication database",
        minRelevanceScore: 0,
      };

      const filtered = filter.filterIssues(mockIssues, options);

      // Check that scores are in descending order
      for (let i = 1; i < filtered.length; i++) {
        expect(filtered[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          filtered[i].relevanceScore
        );
      }
    });

    it("should sort by activity when relevance scores are equal", () => {
      // Create issues with same relevance but different update times
      const sameRelevanceIssues = [
        {
          ...mockIssues[0],
          updatedAt: new Date("2024-01-10"),
        },
        {
          ...mockIssues[0],
          id: 999,
          updatedAt: new Date("2024-01-20"), // More recent
        },
      ];

      const options = {
        productArea: "authentication",
        minRelevanceScore: 0,
      };

      const filtered = filter.filterIssues(sameRelevanceIssues, options);

      // More recent issue should come first when relevance is equal
      expect(filtered[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
        filtered[1].updatedAt.getTime()
      );
    });

    it("should limit results when maxResults is specified", () => {
      const options = {
        productArea: "authentication database performance",
        minRelevanceScore: 0,
        maxResults: 2,
      };

      const filtered = filter.filterIssues(mockIssues, options);
      expect(filtered.length).toBeLessThanOrEqual(2);
    });

    it("should throw ScraperError when no issues meet threshold", () => {
      const options = {
        productArea: "completely unrelated topic",
        minRelevanceScore: 0.5,
      };

      expect(() => filter.filterIssues(mockIssues, options)).toThrow(
        "No relevant issues found"
      );
    });

    it("should assign relevance scores to all filtered issues", () => {
      const options = {
        productArea: "authentication",
        minRelevanceScore: 0,
      };

      const filtered = filter.filterIssues(mockIssues, options);

      filtered.forEach((issue) => {
        expect(typeof issue.relevanceScore).toBe("number");
        expect(issue.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(issue.relevanceScore).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("filterIssuesWithFallback", () => {
    it("should return issues when results are found", () => {
      const options = {
        productArea: "authentication",
        minRelevanceScore: 0,
      };

      const result = filter.filterIssuesWithFallback(mockIssues, options);

      expect(result.hasResults).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.suggestions).toBeUndefined();
    });

    it("should return suggestions when no results are found", () => {
      const options = {
        productArea: "completely unrelated topic",
        minRelevanceScore: 0.9,
      };

      const result = filter.filterIssuesWithFallback(mockIssues, options);

      expect(result.hasResults).toBe(false);
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it("should provide helpful suggestions for empty results", () => {
      const options = {
        productArea: "nonexistent feature",
        minRelevanceScore: 0.8,
      };

      const result = filter.filterIssuesWithFallback(mockIssues, options);

      expect(result.suggestions).toContain(
        expect.stringContaining("Lower relevance threshold")
      );
    });
  });

  describe("edge cases", () => {
    it("should throw ScraperError for empty issues array", () => {
      const options = {
        productArea: "authentication",
        minRelevanceScore: 0,
      };

      expect(() => filter.filterIssues([], options)).toThrow(
        "No relevant issues found"
      );
    });

    it("should handle issues with empty descriptions", () => {
      const issueWithEmptyDescription = {
        ...mockIssues[0],
        description: "",
      };

      const score = filter.scoreRelevance(
        issueWithEmptyDescription,
        "authentication"
      );
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("should handle issues with empty labels", () => {
      const issueWithEmptyLabels = {
        ...mockIssues[0],
        labels: [],
      };

      const score = filter.scoreRelevance(
        issueWithEmptyLabels,
        "authentication"
      );
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("should handle very long product area strings", () => {
      const longProductArea =
        "authentication login oauth security user management session handling token validation password reset email verification two factor authentication biometric login social media login single sign on ldap active directory saml jwt bearer tokens refresh tokens access control authorization permissions roles groups";

      const keywords = filter.extractKeywords(longProductArea);
      expect(keywords.length).toBeGreaterThan(10);

      const score = filter.scoreRelevance(mockIssues[0], longProductArea);
      expect(typeof score).toBe("number");
    });
  });
});
