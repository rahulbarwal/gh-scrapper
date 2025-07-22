import { GitHubClient } from "./github-client";
import { ReportGenerator } from "./report-generator";
import { JANClient } from "./jan-client";
import { PromptManager } from "./prompt-manager";
import {
  GitHubIssue,
  Config,
  RawGitHubIssue,
  RawComment,
  LLMAnalysisResponse,
} from "../models";
import {
  ErrorHandler,
  ErrorContext,
  ScraperError,
  ErrorType,
} from "./error-handler";

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
  private janClient: JANClient;
  private promptManager: PromptManager;

  constructor(
    githubToken: string,
    janOptions?: { endpoint?: string; model?: string }
  ) {
    this.githubClient = new GitHubClient(githubToken);
    this.reportGenerator = new ReportGenerator();
    this.janClient = new JANClient(janOptions);
    this.promptManager = new PromptManager();
  }

  /**
   * Main scraping orchestration method
   * Uses LLM analysis through JAN for issue processing
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
      // Configure JAN client with settings from config
      if (config.janEndpoint) {
        this.janClient.updateOptions({
          endpoint: config.janEndpoint,
          model: config.janModel || "llama2",
        });
      }

      // Validate JAN connection before starting
      try {
        await this.janClient.validateConnection();
        console.log("JAN connection validated successfully");
      } catch (error: any) {
        console.error(`JAN connection failed: ${error.message}`);
        throw error; // Rethrow to be handled by ErrorHandler
      }

      // Phase 1: Fetch all repository issues (no manual filtering)
      onProgress?.({
        phase: "fetching",
        current: 0,
        total: 100,
        message: `Fetching all issues from ${config.repository}...`,
      });

      const rawIssues = await this.fetchAllIssues(config, onProgress);

      // Phase 2: LLM Analysis with JAN
      onProgress?.({
        phase: "analyzing",
        current: 0,
        total: rawIssues.length,
        message: "Starting LLM analysis with JAN...",
      });

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
        message: "Generating report from LLM analysis...",
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
   * Phase 2: Perform LLM analysis on issues using JAN
   * Fetches comments, processes issues in batches, and handles LLM responses
   */
  private async prepareLLMAnalysis(
    rawIssues: RawGitHubIssue[],
    config: Config,
    onProgress?: (progress: ScrapingProgress) => void
  ): Promise<GitHubIssue[]> {
    const context: ErrorContext = {
      operation: "LLM analysis of issues",
      repository: config.repository,
      productArea: config.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      // Step 1: Fetch comments for all issues
      const commentsMap = new Map<number, RawComment[]>();

      for (let i = 0; i < rawIssues.length; i++) {
        const rawIssue = rawIssues[i];

        onProgress?.({
          phase: "analyzing",
          current: i,
          total: rawIssues.length * 2, // Double the total to account for both fetching and analysis
          message: `Fetching comments for issue #${rawIssue.number}...`,
        });

        try {
          // Fetch comments for comprehensive LLM analysis
          const comments = await this.githubClient.getIssueComments(
            config.repository,
            rawIssue.number
          );

          // Convert to raw format for LLM processing
          const rawComments: RawComment[] = comments.map((comment) => ({
            id: comment.id,
            user: { login: comment.author },
            body: comment.body,
            created_at: comment.createdAt.toISOString(),
            author_association: comment.authorType.toUpperCase(),
          }));

          commentsMap.set(rawIssue.id, rawComments);
        } catch (error: any) {
          console.warn(
            `Failed to fetch comments for issue #${rawIssue.number}: ${error.message}`
          );
          // Set empty comments array if fetching fails
          commentsMap.set(rawIssue.id, []);
        }
      }

      // Step 2: Configure JAN client with settings from config
      if (config.janEndpoint) {
        this.janClient.updateOptions({
          endpoint: config.janEndpoint,
          model: config.janModel || "llama2",
        });
      }

      // Step 3: Perform LLM analysis using JAN
      onProgress?.({
        phase: "analyzing",
        current: rawIssues.length,
        total: rawIssues.length * 2,
        message: "Analyzing issues with JAN LLM...",
      });

      // Determine optimal batch size based on issue complexity
      const avgIssueSize = this.calculateAverageIssueSize(
        rawIssues,
        commentsMap
      );
      const batchSize = this.determineBatchSize(avgIssueSize);

      console.log(
        `Average issue size: ${avgIssueSize} characters, batch size: ${batchSize} issues`
      );

      // Perform LLM analysis with batching
      let llmAnalysis: LLMAnalysisResponse;
      try {
        llmAnalysis = await this.janClient.analyzeIssues(
          rawIssues,
          commentsMap,
          config.productArea,
          this.promptManager,
          batchSize
        );
      } catch (error: any) {
        // Handle LLM analysis errors with fallback
        console.error(`LLM analysis failed: ${error.message}`);

        if (
          error instanceof ScraperError &&
          error.type === ErrorType.VALIDATION
        ) {
          // Try with smaller batch size as fallback
          console.log("Retrying with smaller batch size...");
          llmAnalysis = await this.janClient.analyzeIssues(
            rawIssues,
            commentsMap,
            config.productArea,
            this.promptManager,
            Math.max(1, Math.floor(batchSize / 2))
          );
        } else {
          throw error;
        }
      }

      // Step 4: Convert LLM analysis results to GitHubIssue format
      const analyzedIssues: GitHubIssue[] = [];

      // Create a map of analyzed issues by ID for quick lookup
      const analyzedIssueMap = new Map(
        llmAnalysis.relevantIssues.map((issue) => [issue.id, issue])
      );

      // Process each raw issue
      for (const rawIssue of rawIssues) {
        // Get LLM analysis for this issue if available
        const llmAnalyzed = analyzedIssueMap.get(rawIssue.id);

        // Get comments for this issue
        const comments = await this.githubClient.getIssueComments(
          config.repository,
          rawIssue.number
        );

        // Create GitHubIssue with LLM analysis if available, otherwise use defaults
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
          // Use LLM analysis if available, otherwise use defaults
          relevanceScore: llmAnalyzed?.relevanceScore || 0,
          category: llmAnalyzed?.category || "uncategorized",
          priority: llmAnalyzed?.priority || "medium",
          summary: llmAnalyzed?.summary || "",
          workarounds: llmAnalyzed?.workarounds || [],
          tags: llmAnalyzed?.tags || [],
          sentiment: llmAnalyzed?.sentiment || "neutral",
        };

        // Only include issues that meet the minimum relevance score threshold
        if (analyzedIssue.relevanceScore >= config.minRelevanceScore) {
          analyzedIssues.push(analyzedIssue);
        }
      }

      // Sort by relevance score (highest first)
      analyzedIssues.sort((a, b) => b.relevanceScore - a.relevanceScore);

      onProgress?.({
        phase: "analyzing",
        current: rawIssues.length * 2,
        total: rawIssues.length * 2,
        message: `LLM analysis complete. Found ${analyzedIssues.length} relevant issues.`,
      });

      return analyzedIssues;
    }, context);
  }

  /**
   * Calculate average issue size in characters to determine optimal batch size
   */
  private calculateAverageIssueSize(
    issues: RawGitHubIssue[],
    commentsMap: Map<number, RawComment[]>
  ): number {
    if (issues.length === 0) return 0;

    let totalSize = 0;

    for (const issue of issues) {
      // Count issue title and body
      let issueSize = (issue.title?.length || 0) + (issue.body?.length || 0);

      // Add comment sizes
      const comments = commentsMap.get(issue.id) || [];
      for (const comment of comments) {
        issueSize += comment.body?.length || 0;
      }

      totalSize += issueSize;
    }

    return Math.floor(totalSize / issues.length);
  }

  /**
   * Determine optimal batch size based on average issue size
   */
  private determineBatchSize(avgIssueSize: number): number {
    // These thresholds can be adjusted based on model capabilities
    if (avgIssueSize > 20000) return 1;
    if (avgIssueSize > 10000) return 2;
    if (avgIssueSize > 5000) return 3;
    if (avgIssueSize > 2000) return 5;
    return 8; // Default for small issues
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
