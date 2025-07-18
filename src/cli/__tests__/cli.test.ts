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
