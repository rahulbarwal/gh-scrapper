import { GitHubClient } from "./github-client";
import { ReportGenerator } from "./report-generator";
import { GitHubIssue, Config, RawGitHubIssue } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface ScrapingProgress {
  phase: "fetching" | "analyzing" | "generating" | "complete";
  current: number;
  total: number;
  message: string;
}

export interface ScrapingResult {
  issues: GitHubIssue[];
  reportPath: string;
  metadata: {
    totalIssuesAnalyzed: number;
    relevantIssuesFound: number;
    averageRelevanceScore: number;
    workaroundsFound: number;
  };
}

export class GitHubIssueScraper {
  private githubClient: GitHubClient;
  private reportGenerator: ReportGenerator;

  constructor(githubToken: string) {
    this.githubClient = new GitHubClient(githubToken);
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * Main scraping orchestration method
   * Updated to use LLM analysis instead of manual scoring
   */
  async scrapeRepository(
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<ScrapingResult> {
    const context: ErrorContext = {
      operation: "scraping repository",
      repository: config.repository,
      productArea: config.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      // Phase 1: Fetch all repository issues (no manual filtering)
      onProgress?.({
        phase: "fetching",
        current: 0,
        total: 100,
        message: `Fetching all issues from ${config.repository}...`,
      });

      const rawIssues = await this.fetchAllIssues(config, onProgress);

      // Phase 2: LLM Analysis (placeholder - will be implemented in task 4)
      onProgress?.({
        phase: "analyzing",
        current: 0,
        total: rawIssues.length,
        message: "Preparing for LLM analysis...",
      });

      // TODO: Replace with actual LLM analysis in task 4
      const analyzedIssues = await this.prepareLLMAnalysis(
        rawIssues,
        config,
        onProgress
      );

      // Phase 3: Generate report from LLM results
      onProgress?.({
        phase: "generating",
        current: 0,
        total: 1,
        message: "Generating report...",
      });

      const reportPath = await this.generateReport(analyzedIssues, config);

      onProgress?.({
        phase: "complete",
        current: 1,
        total: 1,
        message: `Report saved to ${reportPath}`,
      });

      // Calculate metadata
      const workaroundsFound = analyzedIssues.reduce(
        (total, issue) => total + issue.workarounds.length,
        0
      );

      const averageRelevanceScore =
        analyzedIssues.length > 0
          ? analyzedIssues.reduce(
              (sum, issue) => sum + issue.relevanceScore,
              0
            ) / analyzedIssues.length
          : 0;

      return {
        issues: analyzedIssues,
        reportPath,
        metadata: {
          totalIssuesAnalyzed: rawIssues.length,
          relevantIssuesFound: analyzedIssues.length,
          averageRelevanceScore: Math.round(averageRelevanceScore * 100) / 100,
          workaroundsFound,
        },
      };
    }, context);
  }

  /**
   * Phase 1: Fetch all repository issues without manual filtering
   * LLM will handle relevance determination
   */
  private async fetchAllIssues(
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<RawGitHubIssue[]> {
    // Fetch all issues from repository - LLM will determine relevance
    const issues = await this.githubClient.getRepositoryIssues(
      config.repository,
      {
        state: "open",
        sort: "updated",
        direction: "desc",
      },
      {
        maxPages: Math.ceil(config.maxIssues / 100), // Fetch enough pages to get maxIssues
      }
    );

    // Convert to raw format for LLM processing
    const rawIssues: RawGitHubIssue[] = issues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.description,
      labels: issue.labels.map((label) => ({ name: label })),
      state: issue.state,
      created_at: issue.createdAt.toISOString(),
      updated_at: issue.updatedAt.toISOString(),
      user: { login: issue.author },
      html_url: issue.url,
      comments_url: `https://api.github.com/repos/${config.repository}/issues/${issue.number}/comments`,
      comments: issue.comments.length,
    }));

    onProgress?.({
      phase: "fetching",
      current: rawIssues.length,
      total: config.maxIssues,
      message: `Fetched ${rawIssues.length} issues for LLM analysis`,
    });

    return rawIssues.slice(0, config.maxIssues);
  }

  /**
   * Phase 2: Prepare issues for LLM analysis
   * This is a placeholder that will be replaced with actual JAN LLM integration in task 4
   * All manual analysis logic has been removed as per task 1
   */
  private async prepareLLMAnalysis(
    rawIssues: RawGitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    const analyzedIssues: GitHubIssue[] = [];

    for (let i = 0; i < rawIssues.length; i++) {
      const rawIssue = rawIssues[i];

      onProgress?.({
        phase: "analyzing",
        current: i + 1,
        total: rawIssues.length,
        message: `Preparing issue #${rawIssue.number} for LLM analysis...`,
      });

      try {
        // Fetch comments for comprehensive LLM analysis
        const comments = await this.githubClient.getIssueComments(
          config.repository,
          rawIssue.number
        );

        // Create a placeholder analyzed issue
        // This will be replaced with actual LLM analysis in task 4
        const analyzedIssue: GitHubIssue = {
          id: rawIssue.id,
          number: rawIssue.number,
          title: rawIssue.title,
          description: rawIssue.body || "",
          labels: rawIssue.labels.map((label) => label.name),
          state: rawIssue.state,
          createdAt: new Date(rawIssue.created_at),
          updatedAt: new Date(rawIssue.updated_at),
          author: rawIssue.user.login,
          url: rawIssue.html_url,
          comments: comments,
          // These placeholder values will be replaced with LLM-generated values in task 4
          relevanceScore: 0,
          category: "",
          priority: "medium",
          summary: "",
          workarounds: [],
          tags: [],
          sentiment: "neutral",
        };

        analyzedIssues.push(analyzedIssue);
      } catch (error: any) {
        console.warn(
          `Failed to fetch comments for issue #${rawIssue.number}: ${error.message}`
        );

        // Add issue without comments
        analyzedIssues.push({
          id: rawIssue.id,
          number: rawIssue.number,
          title: rawIssue.title,
          description: rawIssue.body || "",
          labels: rawIssue.labels.map((label) => label.name),
          state: rawIssue.state,
          createdAt: new Date(rawIssue.created_at),
          updatedAt: new Date(rawIssue.updated_at),
          author: rawIssue.user.login,
          url: rawIssue.html_url,
          comments: [],
          relevanceScore: 0,
          category: "",
          priority: "medium",
          summary: "",
          workarounds: [],
          tags: [],
          sentiment: "neutral",
        });
      }
    }

    return analyzedIssues;
  }

  /**
   * Phase 4: Generate markdown report
   */
  private async generateReport(
    issues: GitHubIssue[],
    config: Config
  ): Promise<string> {
    const metadata = ReportGenerator.createMetadata(
      config,
      issues,
      issues.length
    );

    const report = await this.reportGenerator.generateReport(
      issues,
      metadata,
      config,
      {
        includeTableOfContents: true,
        sortByRelevance: true,
        includeMetadata: true,
      }
    );

    const reportPath = await this.reportGenerator.saveReport(
      report,
      metadata,
      config.outputPath
    );

    return reportPath;
  }
}
