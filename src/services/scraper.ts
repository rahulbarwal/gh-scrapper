import { GitHubClient } from "./github-client";
import { RelevanceFilter } from "./relevance-filter";
import { IssueParser } from "./issue-parser";
import { ReportGenerator } from "./report-generator";
import { GitHubIssue, Config } from "../models";
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
  private relevanceFilter: RelevanceFilter;
  private issueParser: IssueParser;
  private reportGenerator: ReportGenerator;

  constructor(githubToken: string) {
    this.githubClient = new GitHubClient(githubToken);
    this.relevanceFilter = new RelevanceFilter();
    this.issueParser = new IssueParser();
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * Main scraping orchestration method
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
      // Phase 1: Search for relevant issues using GitHub's search API
      onProgress?.({
        phase: "fetching",
        current: 0,
        total: 100,
        message: `Searching for "${config.productArea}" issues in ${config.repository}...`,
      });

      const searchResults = await this.searchRelevantIssues(config, onProgress);

      // Phase 2: Score and filter the search results for final relevance
      onProgress?.({
        phase: "analyzing",
        current: 0,
        total: searchResults.length,
        message: "Scoring search results for relevance...",
      });

      const filteredIssues = await this.scoreAndFilterIssues(
        searchResults,
        config,
        onProgress
      );

      // Phase 3: Analyze each relevant issue in detail
      const detailedIssues = await this.analyzeIssuesInDetail(
        filteredIssues,
        config,
        onProgress
      );

      // Phase 4: Generate report
      onProgress?.({
        phase: "generating",
        current: 0,
        total: 1,
        message: "Generating report...",
      });

      const reportPath = await this.generateReport(detailedIssues, config);

      onProgress?.({
        phase: "complete",
        current: 1,
        total: 1,
        message: `Report saved to ${reportPath}`,
      });

      // Calculate metadata
      const workaroundsFound = detailedIssues.reduce(
        (total, issue) => total + issue.workarounds.length,
        0
      );

      const averageRelevanceScore =
        detailedIssues.length > 0
          ? detailedIssues.reduce(
              (sum, issue) => sum + issue.relevanceScore,
              0
            ) / detailedIssues.length
          : 0;

      return {
        issues: detailedIssues,
        reportPath,
        metadata: {
          totalIssuesAnalyzed: searchResults.length,
          relevantIssuesFound: detailedIssues.length,
          averageRelevanceScore: Math.round(averageRelevanceScore * 100) / 100,
          workaroundsFound,
        },
      };
    }, context);
  }

  /**
   * Phase 1: Search for issues using GitHub's search API with product area keywords
   */
  private async searchRelevantIssues(
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    // Use GitHub's search API to find issues matching the product area
    const searchOptions = {
      query: config.productArea,
      repository: config.repository,
      state: "open" as const,
      sort: "updated" as const,
      order: "desc" as const,
      maxResults: Math.min(config.maxIssues * 2, 200), // Search for more than needed to allow for filtering
    };

    const issues = await this.githubClient.searchIssues(searchOptions);

    onProgress?.({
      phase: "fetching",
      current: issues.length,
      total: searchOptions.maxResults,
      message: `Found ${issues.length} issues matching "${config.productArea}"`,
    });

    return issues;
  }

  /**
   * Phase 2: Score and filter the search results for final relevance
   */
  private async scoreAndFilterIssues(
    issues: GitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    // Score all search results for more precise relevance
    const scoredIssues = issues.map((issue, index) => {
      const relevanceScore = this.relevanceFilter.scoreRelevance(
        issue,
        config.productArea
      );

      onProgress?.({
        phase: "analyzing",
        current: index + 1,
        total: issues.length,
        message: `Scoring issue #${issue.number} (${Math.round(
          relevanceScore
        )}% relevant)`,
      });

      return {
        ...issue,
        relevanceScore,
      };
    });

    // Filter by relevance threshold and limit to max results
    const filterOptions = {
      productArea: config.productArea,
      minRelevanceScore: config.minRelevanceScore,
      maxResults: config.maxIssues,
    };

    const relevantIssues = this.relevanceFilter.filterIssues(
      scoredIssues,
      filterOptions
    );

    return relevantIssues;
  }

  /**
   * Phase 3: Analyze each relevant issue in detail (comments, workarounds)
   */
  private async analyzeIssuesInDetail(
    issues: GitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    const detailedIssues: GitHubIssue[] = [];

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];

      onProgress?.({
        phase: "analyzing",
        current: i + 1,
        total: issues.length,
        message: `Analyzing issue #${issue.number} in detail...`,
      });

      try {
        // Fetch comments for this issue
        const comments = await this.githubClient.getIssueComments(
          config.repository,
          issue.number
        );

        // Analyze comments for workarounds
        const analyzedComments = this.issueParser.analyzeComments(comments);

        // Extract workarounds
        const workarounds =
          this.issueParser.extractWorkarounds(analyzedComments);

        // Generate summary
        const summary = this.issueParser.generateSummary(issue, {
          maxLength: 200,
          includeLabels: true,
          includeMetrics: true,
        });

        // Create detailed issue object
        const detailedIssue: GitHubIssue = {
          ...issue,
          comments: analyzedComments,
          workarounds,
          summary,
        };

        detailedIssues.push(detailedIssue);
      } catch (error: any) {
        // Log error but continue with other issues
        console.warn(
          `Failed to analyze issue #${issue.number}: ${error.message}`
        );

        // Add issue without detailed analysis
        detailedIssues.push({
          ...issue,
          comments: [],
          workarounds: [],
          summary: `Issue #${issue.number}: ${issue.title}`,
        });
      }
    }

    return detailedIssues;
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
