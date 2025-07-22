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
        console.warn(`Jan AI not available: ${connectionStatus.error}`);
        analysisMethod = "manual-fallback";
      }

      // Phase 2: Search for relevant issues using GitHub's search API
      onProgress?.({
        phase: "fetching",
        current: 10,
        total: 100,
        message: `Searching for "${config.productArea}" issues in ${config.repository}...`,
      });

      const searchResults = await this.searchRelevantIssues(config, onProgress);

      // Phase 3: Analyze issues with Jan AI or fallback
      onProgress?.({
        phase: "analyzing",
        current: 0,
        total: searchResults.length,
        message: connectionStatus.connected
          ? "Analyzing issues with Jan AI..."
          : "Using fallback analysis...",
      });

      const analyzedIssues = await this.analyzeIssuesWithJanAI(
        searchResults,
        config,
        connectionStatus.connected,
        onProgress
      );

      // Phase 4: Fetch detailed comments for relevant issues
      const detailedIssues = await this.enrichIssuesWithDetails(
        analyzedIssues,
        config,
        onProgress
      );

      // Phase 5: Generate report
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

      const metadata: ScrapingMetadata = {
        totalIssuesAnalyzed: searchResults.length,
        relevantIssuesFound: detailedIssues.length,
        averageRelevanceScore: Math.round(averageRelevanceScore * 100) / 100,
        workaroundsFound,
        analysisMethod,
        janConnectionStatus: connectionStatus.connected
          ? "connected"
          : connectionStatus.error,
      };

      return {
        issues: detailedIssues,
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
   * Phase 2: Analyze issues with Jan AI for relevance and workarounds
   */
  private async analyzeIssuesWithJanAI(
    issues: GitHubIssue[],
    config: Config,
    useJanAI: boolean,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    if (!useJanAI) {
      // Fallback: basic relevance scoring
      return this.fallbackAnalysis(issues, config, onProgress);
    }

    // Prepare analysis requests
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

    // Filter by relevance threshold and limit results
    const relevantIssues = analyzedIssues
      .filter((issue) => issue.relevanceScore >= config.minRelevanceScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, config.maxIssues);

    return relevantIssues;
  }

  /**
   * Fallback analysis when Jan AI is not available
   */
  private async fallbackAnalysis(
    issues: GitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    const keywords = config.productArea.toLowerCase().split(/[\s,;|&\-_]+/);

    const scoredIssues = issues.map((issue, index) => {
      // Simple keyword-based scoring
      let score = 0;
      const titleLower = issue.title.toLowerCase();
      const descLower = (issue.description || "").toLowerCase();
      const labelsLower = issue.labels.join(" ").toLowerCase();

      keywords.forEach((keyword) => {
        if (titleLower.includes(keyword)) score += 40;
        if (labelsLower.includes(keyword)) score += 30;
        if (descLower.includes(keyword)) score += 20;
      });

      score = Math.min(100, score);

      onProgress?.({
        phase: "analyzing",
        current: index + 1,
        total: issues.length,
        message: `Fallback analysis for issue #${issue.number} (${score}% relevant)`,
      });

      return {
        ...issue,
        relevanceScore: score,
        summary: `Issue #${issue.number}: ${issue.title}`,
        workarounds: [],
      };
    });

    // Filter and sort
    return scoredIssues
      .filter((issue) => issue.relevanceScore >= config.minRelevanceScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, config.maxIssues);
  }

  /**
   * Phase 3: Enrich relevant issues with detailed comments
   */
  private async enrichIssuesWithDetails(
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
        message: `Fetching details for issue #${issue.number}...`,
      });

      try {
        // Fetch comments for this issue
        const comments = await this.githubClient.getIssueComments(
          config.repository,
          issue.number
        );

        // Analyze comments for additional workarounds (if not already done by Jan AI)
        const analyzedComments = this.issueParser.analyzeComments(comments);

        // Extract traditional workarounds from comments
        const commentWorkarounds =
          this.issueParser.extractWorkarounds(analyzedComments);

        // Combine Jan AI workarounds with comment-based ones
        const allWorkarounds = [...issue.workarounds, ...commentWorkarounds];

        // Create detailed issue object
        const detailedIssue: GitHubIssue = {
          ...issue,
          comments: analyzedComments,
          workarounds: allWorkarounds,
        };

        detailedIssues.push(detailedIssue);
      } catch (error: any) {
        // Log error but continue with other issues
        console.warn(
          `Failed to enrich issue #${issue.number}: ${error.message}`
        );

        // Add issue without detailed analysis
        detailedIssues.push({
          ...issue,
          comments: [],
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
    // Use the existing ReportGenerator metadata creation method
    const reportMetadata = ReportGenerator.createMetadata(
      config,
      issues,
      issues.length
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
