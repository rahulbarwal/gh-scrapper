import { GitHubClient } from "./github-client";
import { JanClient, JanAnalysisRequest } from "./jan-client";
import { IssueParser } from "./issue-parser";
import { ReportGenerator, ReportMetadata } from "./report-generator";
import { GitHubIssue, Config, ScrapingMetadata } from "../models";
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
  metadata: ScrapingMetadata;
}

export class GitHubIssueScraper {
  private githubClient: GitHubClient;
  private janClient: JanClient;
  private issueParser: IssueParser;
  private reportGenerator: ReportGenerator;

  constructor(githubToken: string, janConfig?: Config["janConfig"]) {
    this.githubClient = new GitHubClient(githubToken);
    this.janClient = new JanClient(janConfig);
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
      // Phase 1: Test Jan AI connection
      onProgress?.({
        phase: "fetching",
        current: 0,
        total: 100,
        message: "Testing Jan AI connection...",
      });

      const connectionStatus = await this.janClient.testConnection();
      let analysisMethod: ScrapingMetadata["analysisMethod"] = "jan-ai";

      if (!connectionStatus.connected) {
        console.error(`Jan AI not available: ${connectionStatus.error}`);
        throw new Error(`Jan AI not available: ${connectionStatus.error}`);
      }

      // Phase 2: Search for relevant issues using GitHub's search API
      onProgress?.({
        phase: "fetching",
        current: 10,
        total: 100,
        message: `Searching for "${config.productArea}" issues in ${config.repository}...`,
      });

      const issuesList = await this.searchRelevantIssues(config, onProgress);

      // Log the initial count of issues found
      console.log(
        `Found ${issuesList.length} issues matching "${config.productArea}"`
      );
      console.log(`Fetching detailed information for each issue...`);

      // Phase 3: Fetch each issue with its comments one by one
      onProgress?.({
        phase: "fetching",
        current: 0,
        total: issuesList.length,
        message: "Fetching detailed issue information...",
      });

      const issuesWithDetails = await this.fetchIssuesWithDetails(
        issuesList,
        config,
        onProgress
      );

      // Phase 4: Analyze complete issues (body + comments) with Jan AI
      onProgress?.({
        phase: "analyzing",
        current: 0,
        total: issuesWithDetails.length,
        message: "Analyzing issues with Jan AI...",
      });

      const analyzedIssues = await this.analyzeCompleteIssuesWithJanAI(
        issuesWithDetails,
        config,
        onProgress
      );

      // Phase 5: Filter by relevance and limit results
      const relevantIssues = analyzedIssues
        .filter((issue) => issue.relevanceScore >= config.minRelevanceScore)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, config.maxIssues);

      // Phase 6: Generate report
      onProgress?.({
        phase: "generating",
        current: 0,
        total: 1,
        message: "Generating report...",
      });

      const reportPath = await this.generateReport(
        relevantIssues,
        config,
        issuesWithDetails.length
      );

      onProgress?.({
        phase: "complete",
        current: 1,
        total: 1,
        message: `Report saved to ${reportPath}`,
      });

      // Calculate metadata
      const workaroundsFound = relevantIssues.reduce(
        (total, issue) => total + issue.workarounds.length,
        0
      );

      const averageRelevanceScore =
        relevantIssues.length > 0
          ? relevantIssues.reduce(
              (sum, issue) => sum + issue.relevanceScore,
              0
            ) / relevantIssues.length
          : 0;

      const metadata: ScrapingMetadata = {
        totalIssuesAnalyzed: issuesWithDetails.length,
        relevantIssuesFound: relevantIssues.length,
        averageRelevanceScore: Math.round(averageRelevanceScore * 100) / 100,
        workaroundsFound,
        analysisMethod,
        janConnectionStatus: connectionStatus.connected
          ? "connected"
          : connectionStatus.error,
      };

      return {
        issues: relevantIssues,
        reportPath,
        metadata,
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
      maxResults: Math.min(config.maxIssues * 3, 300), // Search for more than needed to allow for filtering
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
   * Phase 2: Fetch each issue with its complete details and comments
   */
  private async fetchIssuesWithDetails(
    issues: GitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    const detailedIssues: GitHubIssue[] = [];

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];

      onProgress?.({
        phase: "fetching",
        current: i + 1,
        total: issues.length,
        message: `Fetching details for issue #${issue.number}...`,
      });

      try {
        // Fetch comments for this issue
        const comments = await this.githubClient.getIssueComments(
          config.repository,
          issue.number
        );

        // Create detailed issue object with comments
        const detailedIssue: GitHubIssue = {
          ...issue,
          comments,
          // Initialize default values for properties that will be set by Jan AI
          relevanceScore: 0,
          summary: "",
          workarounds: [],
        };

        detailedIssues.push(detailedIssue);

        console.log(
          `Issue #${issue.number}: ${comments.length} comments fetched`
        );
      } catch (error: any) {
        // Log error but continue with other issues
        console.warn(
          `Failed to fetch details for issue #${issue.number}: ${error.message}`
        );

        // Add issue without comments but with default values
        detailedIssues.push({
          ...issue,
          comments: [],
          relevanceScore: 0,
          summary: "",
          workarounds: [],
        });
      }
    }

    return detailedIssues;
  }

  /**
   * Phase 3: Analyze complete issues (with comments) using Jan AI
   */
  private async analyzeCompleteIssuesWithJanAI(
    issues: GitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    // Prepare analysis requests with complete issue data
    const analysisRequests: JanAnalysisRequest[] = issues.map((issue) => ({
      issue,
      productArea: config.productArea,
    }));

    // Analyze issues in batches
    const analysisResults = await this.janClient.analyzeIssuesBatch(
      analysisRequests
    );

    // Combine issues with analysis results
    const analyzedIssues = issues.map((issue, index) => {
      const analysis = analysisResults[index];

      onProgress?.({
        phase: "analyzing",
        current: index + 1,
        total: issues.length,
        message: `Analyzed issue #${issue.number} (${analysis.relevanceScore}% relevant)`,
      });

      return {
        ...issue,
        relevanceScore: analysis.relevanceScore,
        summary: analysis.summary,
        janAnalysis: analysis,
        workarounds:
          analysis.hasWorkaround && analysis.workaroundDescription
            ? [
                {
                  description: analysis.workaroundDescription,
                  author: "Jan AI Analysis",
                  authorType: "contributor" as const,
                  commentId: -1,
                  effectiveness: "suggested" as const,
                  complexity: analysis.workaroundComplexity,
                  type: analysis.workaroundType,
                  implementationDifficulty: analysis.implementationDifficulty,
                },
              ]
            : [],
      };
    });

    return analyzedIssues;
  }

  /**
   * Phase 4: Generate markdown report
   */
  private async generateReport(
    issues: GitHubIssue[],
    config: Config,
    totalAnalyzed: number
  ): Promise<string> {
    // Use the existing ReportGenerator metadata creation method
    const reportMetadata = ReportGenerator.createMetadata(
      config,
      issues,
      totalAnalyzed
    );

    const report = await this.reportGenerator.generateReport(
      issues,
      reportMetadata,
      config,
      {
        includeTableOfContents: true,
        sortByRelevance: true,
        includeMetadata: true,
      }
    );

    const reportPath = await this.reportGenerator.saveReport(
      report,
      reportMetadata,
      config.outputPath
    );

    return reportPath;
  }
}
