import { IssueParser } from "../issue-parser";
import { GitHubIssue, Comment, Workaround } from "../../models";

describe("IssueParser", () => {
  let parser: IssueParser;

  beforeEach(() => {
    parser = new IssueParser();
  });

  describe("parseIssueContent", () => {
    it("should extract and clean issue content correctly", () => {
      const issue: GitHubIssue = {
        id: 123,
        title: "  Test Issue Title  ",
        description: "This is a test description\n\n\nwith multiple lines",
        labels: ["bug", "enhancement"],
        state: "open",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
        author: "testuser",
        url: "https://github.com/test/repo/issues/123",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      };

      const result = parser.parseIssueContent(issue);

      expect(result.title).toBe("Test Issue Title");
      expect(result.description).toBe(
        "This is a test description with multiple lines"
      );
      expect(result.labels).toEqual(["bug", "enhancement"]);
      expect(result.metadata.id).toBe(123);
      expect(result.metadata.state).toBe("open");
      expect(result.metadata.author).toBe("testuser");
      expect(result.metadata.commentCount).toBe(0);
    });
  });

  describe("analyzeComments", () => {
    it("should identify workaround comments correctly", () => {
      const comments: Comment[] = [
        {
          id: 1,
          author: "user1",
          body: "Here's a workaround that works for me: ```code here```",
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "user",
        },
        {
          id: 2,
          author: "user2",
          body: "I have the same problem",
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "user",
        },
        {
          id: 3,
          author: "maintainer",
          body: "Try this solution: step 1, step 2, step 3",
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "maintainer",
        },
      ];

      const result = parser.analyzeComments(comments);

      expect(result[0].isWorkaround).toBe(true); // Has "workaround" keyword and code block
      expect(result[1].isWorkaround).toBe(false); // No workaround indicators
      expect(result[2].isWorkaround).toBe(true); // Has "solution" keyword and step structure
    });

    it("should detect code block workarounds", () => {
      const comments: Comment[] = [
        {
          id: 1,
          author: "user1",
          body: "You can try this: ```npm install package```",
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "user",
        },
      ];

      const result = parser.analyzeComments(comments);
      expect(result[0].isWorkaround).toBe(true);
    });

    it("should detect step-by-step instructions", () => {
      const comments: Comment[] = [
        {
          id: 1,
          author: "user1",
          body: "First, install the package. Then, configure it. Finally, restart the service.",
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "user",
        },
      ];

      const result = parser.analyzeComments(comments);
      expect(result[0].isWorkaround).toBe(true);
    });
  });

  describe("extractWorkarounds", () => {
    it("should extract workarounds from identified comments", () => {
      const comments: Comment[] = [
        {
          id: 1,
          author: "maintainer1",
          body: "This is a confirmed fix that has been tested",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "maintainer",
        },
        {
          id: 2,
          author: "user1",
          body: "Here's a temporary workaround until the fix is released",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "user",
        },
        {
          id: 3,
          author: "contributor1",
          body: "Try this solution, it might help",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "contributor",
        },
      ];

      const result = parser.extractWorkarounds(comments);

      expect(result).toHaveLength(3);
      expect(result[0].authorType).toBe("maintainer"); // Should be sorted first
      expect(result[0].effectiveness).toBe("confirmed");
      expect(result[1].effectiveness).toBe("partial"); // Has "workaround" keyword
      expect(result[2].effectiveness).toBe("suggested");
    });

    it("should sort workarounds by effectiveness and authority", () => {
      const comments: Comment[] = [
        {
          id: 1,
          author: "user1",
          body: "Try this suggestion",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "user",
        },
        {
          id: 2,
          author: "maintainer1",
          body: "This is confirmed to work",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "maintainer",
        },
        {
          id: 3,
          author: "contributor1",
          body: "This is a partial workaround",
          createdAt: new Date(),
          isWorkaround: true,
          authorType: "contributor",
        },
      ];

      const result = parser.extractWorkarounds(comments);

      // Should be sorted: confirmed maintainer, partial contributor, suggested user
      expect(result[0].author).toBe("maintainer1");
      expect(result[0].effectiveness).toBe("confirmed");
      expect(result[1].author).toBe("contributor1");
      expect(result[1].effectiveness).toBe("partial");
      expect(result[2].author).toBe("user1");
      expect(result[2].effectiveness).toBe("suggested");
    });
  });

  describe("generateSummary", () => {
    it("should generate comprehensive summary with all options", () => {
      const issue: GitHubIssue = {
        id: 123,
        title: "Test Issue",
        description:
          "This is a detailed description of the issue that explains the problem in depth and provides context for understanding the situation.",
        labels: ["bug", "high-priority"],
        state: "open",
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        updatedAt: new Date(),
        author: "testuser",
        url: "https://github.com/test/repo/issues/123",
        comments: [
          {
            id: 1,
            author: "user1",
            body: "comment1",
            createdAt: new Date(),
            isWorkaround: false,
            authorType: "user",
          },
          {
            id: 2,
            author: "user2",
            body: "comment2",
            createdAt: new Date(),
            isWorkaround: false,
            authorType: "user",
          },
        ],
        relevanceScore: 85,
        summary: "",
        workarounds: [
          {
            description: "workaround1",
            author: "user1",
            authorType: "user",
            commentId: 1,
            effectiveness: "suggested",
          },
        ],
      };

      const result = parser.generateSummary(issue);

      expect(result).toContain("This is a detailed description");
      expect(result).toContain("Tagged as: bug, high-priority");
      expect(result).toContain("2 comments");
      expect(result).toContain("1 workarounds available");
      expect(result).toContain("7 days old");
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it("should respect maxLength option", () => {
      const issue: GitHubIssue = {
        id: 123,
        title: "Test Issue",
        description:
          "This is a very long description that should be truncated when the maxLength option is set to a small value to test the summarization functionality.",
        labels: [],
        state: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        author: "testuser",
        url: "https://github.com/test/repo/issues/123",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      };

      const result = parser.generateSummary(issue, {
        maxLength: 50,
        includeLabels: false,
        includeMetrics: false,
      });

      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should handle empty description gracefully", () => {
      const issue: GitHubIssue = {
        id: 123,
        title: "Test Issue",
        description: "",
        labels: ["bug"],
        state: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        author: "testuser",
        url: "https://github.com/test/repo/issues/123",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      };

      const result = parser.generateSummary(issue);

      expect(result).toContain("Tagged as: bug");
      expect(result).not.toContain("undefined");
    });
  });

  describe("classifyWorkarounds", () => {
    it("should separate official and community workarounds", () => {
      const workarounds: Workaround[] = [
        {
          description: "Official fix from maintainer",
          author: "maintainer1",
          authorType: "maintainer",
          commentId: 1,
          effectiveness: "confirmed",
        },
        {
          description: "Community workaround",
          author: "user1",
          authorType: "user",
          commentId: 2,
          effectiveness: "suggested",
        },
        {
          description: "Contributor solution",
          author: "contributor1",
          authorType: "contributor",
          commentId: 3,
          effectiveness: "partial",
        },
      ];

      const result = parser.classifyWorkarounds(workarounds);

      expect(result.official).toHaveLength(1);
      expect(result.official[0].author).toBe("maintainer1");
      expect(result.community).toHaveLength(2);
      expect(result.community.map((w) => w.author)).toEqual([
        "user1",
        "contributor1",
      ]);
    });

    it("should handle empty workarounds array", () => {
      const result = parser.classifyWorkarounds([]);

      expect(result.official).toHaveLength(0);
      expect(result.community).toHaveLength(0);
    });
  });

  describe("workaround detection patterns", () => {
    it("should detect various workaround keywords", () => {
      const testCases = [
        "Here's a workaround for this issue",
        "This is a temporary fix",
        "Try this solution",
        "Here's how to resolve this",
        "You can use this alternative approach",
        "This patch should help",
      ];

      testCases.forEach((body) => {
        const comment: Comment = {
          id: 1,
          author: "user1",
          body,
          createdAt: new Date(),
          isWorkaround: false,
          authorType: "user",
        };

        const result = parser.analyzeComments([comment]);
        expect(result[0].isWorkaround).toBe(true);
      });
    });

    it("should require code blocks for certain patterns", () => {
      const comment: Comment = {
        id: 1,
        author: "user1",
        body: "You can try this approach", // Has "you can" but no code block
        createdAt: new Date(),
        isWorkaround: false,
        authorType: "user",
      };

      const result = parser.analyzeComments([comment]);
      expect(result[0].isWorkaround).toBe(false);

      // Now with code block
      comment.body = "You can try this: ```npm install fix```";
      const resultWithCode = parser.analyzeComments([comment]);
      expect(resultWithCode[0].isWorkaround).toBe(true);
    });

    it("should detect numbered lists as workarounds", () => {
      const comment: Comment = {
        id: 1,
        author: "user1",
        body: "1. First step\n2. Second step\n3. Third step",
        createdAt: new Date(),
        isWorkaround: false,
        authorType: "user",
      };

      const result = parser.analyzeComments([comment]);
      expect(result[0].isWorkaround).toBe(true);
    });
  });

  describe("text cleaning and normalization", () => {
    it("should clean and normalize text properly", () => {
      const issue: GitHubIssue = {
        id: 123,
        title: "  Title with   extra   spaces  ",
        description: "Description\r\nwith\n\n\n\nmultiple\nline\nbreaks",
        labels: [],
        state: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        author: "testuser",
        url: "https://github.com/test/repo/issues/123",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      };

      const result = parser.parseIssueContent(issue);

      expect(result.title).toBe("Title with extra spaces");
      expect(result.description).toBe("Description with multiple line breaks");
    });
  });
});
