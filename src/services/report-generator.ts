import {
  GitHubIssue,
  Config,
  LLMAnalysisResponse,
  AnalyzedIssue,
  LLMWorkaround,
} from "../models";
import * as fs from "fs-extra";
import * as path from "path";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface ReportMetadata {
  repositoryName: string;
  repositoryUrl: string;
  productArea: string;
  scrapeDate: Date;
  totalIssuesAnalyzed: number;
  relevantIssuesFound: number;
  minRelevanceScore: number;
  generatedBy: string;
  analysisModel?: string;
  processingStats?: {
    batchCount?: number;
    totalTokensUsed?: number;
    analysisTime?: number;
  };
}

export interface ReportGenerationOptions {
  includeTableOfContents?: boolean;
  sortByRelevance?: boolean;
  includeMetadata?: boolean;
  customTemplate?: string;
}

export class ReportGenerator {
  private readonly defaultOptions: Required<ReportGenerationOptions> = {
    includeTableOfContents: true,
    sortByRelevance: true,
    includeMetadata: true,
    customTemplate: "",
  };

  /**
   * Generate a comprehensive markdown report from LLM-analyzed GitHub issues
   */
  async generateReport(
    issues: GitHubIssue[],
    metadata: ReportMetadata,
    config: Config,
    options: ReportGenerationOptions = {},
    llmAnalysis?: LLMAnalysisResponse
  ): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };

    // If LLM analysis is provided, use it instead of raw issues
    if (llmAnalysis) {
      return this.generateLLMDrivenReport(llmAnalysis, metadata, config, opts);
    }

    // Sort issues if requested
    const sortedIssues = opts.sortByRelevance
      ? this.sortIssuesByRelevance(issues)
      : issues;

    let report = "";

    // Generate header
    report += this.generateHeader(metadata);

    // Generate metadata section
    if (opts.includeMetadata) {
      report += this.generateMetadataSection(metadata);
    }

    // Generate table of contents
    if (opts.includeTableOfContents) {
      report += this.generateTableOfContents(sortedIssues);
    }

    // Generate issues section
    report += this.generateIssuesSection(sortedIssues);

    return report;
  }

  /**
   * Generate a comprehensive markdown report from LLM analysis results
   */
  private async generateLLMDrivenReport(
    llmAnalysis: LLMAnalysisResponse,
    metadata: ReportMetadata,
    config: Config,
    options: Required<ReportGenerationOptions>
  ): Promise<string> {
    // Update metadata with LLM analysis information
    const enhancedMetadata = {
      ...metadata,
      analysisModel:
        llmAnalysis.summary.analysisModel || metadata.analysisModel,
      relevantIssuesFound: llmAnalysis.relevantIssues.length,
      totalIssuesAnalyzed:
        llmAnalysis.summary.totalAnalyzed || metadata.totalIssuesAnalyzed,
    };

    let report = "";

    // Generate header
    report += this.generateHeader(enhancedMetadata);

    // Generate LLM-enhanced metadata section
    if (options.includeMetadata) {
      report += this.generateLLMMetadataSection(enhancedMetadata, llmAnalysis);
    }

    // Generate table of contents with LLM-analyzed issues
    if (options.includeTableOfContents) {
      report += this.generateLLMTableOfContents(llmAnalysis.relevantIssues);
    }

    // Generate issues section with LLM analysis
    report += this.generateLLMIssuesSection(llmAnalysis.relevantIssues);

    return report;
  }

  /**
   * Save report to file with proper naming convention and comprehensive error handling
   */
  async saveReport(
    report: string,
    metadata: ReportMetadata,
    outputPath: string
  ): Promise<string> {
    const filename = this.generateFilename(metadata);
    const fullPath = path.join(outputPath, filename);

    const context: ErrorContext = {
      operation: "saving report to file",
      filePath: fullPath,
      repository: metadata.repositoryName,
      productArea: metadata.productArea,
    };

    return ErrorHandler.executeWithRetry(async () => {
      try {
        // Validate inputs
        if (!report || typeof report !== "string") {
          throw ErrorHandler.handleValidationError(
            "Invalid report content provided",
            context,
            [
              {
                action: "Check report generation",
                description: "Ensure the report was generated successfully",
                priority: "high",
              },
            ]
          );
        }

        if (!outputPath || typeof outputPath !== "string") {
          throw ErrorHandler.handleValidationError(
            "Invalid output path provided",
            context,
            [
              {
                action: "Specify valid output path",
                description:
                  "Provide a valid directory path for saving the report",
                priority: "high",
              },
            ]
          );
        }

        // Check if output path is writable
        try {
          await fs.access(path.dirname(outputPath), fs.constants.W_OK);
        } catch (accessError: any) {
          if (accessError.code === "ENOENT") {
            // Directory doesn't exist, try to create it
            await fs.ensureDir(outputPath);
          } else {
            throw accessError;
          }
        }

        // Ensure output directory exists
        await fs.ensureDir(outputPath);

        // Check available disk space (basic check)
        const stats = await fs.stat(outputPath);
        if (!stats.isDirectory()) {
          throw ErrorHandler.handleValidationError(
            "Output path is not a directory",
            context,
            [
              {
                action: "Use directory path",
                description: "Specify a directory path, not a file path",
                priority: "high",
              },
            ]
          );
        }

        // Write report to file with atomic operation (write to temp file first)
        const tempPath = fullPath + ".tmp";
        await fs.writeFile(tempPath, report, "utf8");

        // Move temp file to final location (atomic operation)
        await fs.move(tempPath, fullPath, { overwrite: true });

        // Verify file was written correctly
        const writtenContent = await fs.readFile(fullPath, "utf8");
        if (writtenContent.length !== report.length) {
          throw new Error(
            "File write verification failed - content length mismatch"
          );
        }

        return fullPath;
      } catch (error: any) {
        // Clean up temp file if it exists
        const tempPath = fullPath + ".tmp";
        try {
          await fs.remove(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }

        throw ErrorHandler.convertToScraperError(error, context);
      }
    }, context);
  }

  /**
   * Validate report content before saving
   */
  validateReportContent(report: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!report || typeof report !== "string") {
      errors.push("Report content is empty or invalid");
      return { isValid: false, errors };
    }

    if (report.trim().length === 0) {
      errors.push("Report content is empty");
    }

    if (report.length < 100) {
      errors.push("Report content seems too short (less than 100 characters)");
    }

    if (!report.includes("# GitHub Issues Report")) {
      errors.push("Report doesn't contain expected header format");
    }

    if (!report.includes("## Summary")) {
      errors.push("Report doesn't contain summary section");
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Generate filename based on repository and product area
   */
  private generateFilename(metadata: ReportMetadata): string {
    const repoName = metadata.repositoryName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    const productArea = metadata.productArea
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .substring(0, 30); // Limit length

    const timestamp = metadata.scrapeDate.toISOString().split("T")[0]; // YYYY-MM-DD format

    return `github-issues-${repoName}-${productArea}-${timestamp}.md`;
  }

  /**
   * Sort issues by relevance score (highest first)
   */
  private sortIssuesByRelevance(issues: GitHubIssue[]): GitHubIssue[] {
    return [...issues].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Generate report header
   */
  private generateHeader(metadata: ReportMetadata): string {
    return `# GitHub Issues Report: ${metadata.repositoryName} - ${metadata.productArea}

`;
  }

  /**
   * Generate metadata section
   */
  private generateMetadataSection(metadata: ReportMetadata): string {
    return `## Summary

- **Repository**: [${metadata.repositoryName}](${metadata.repositoryUrl})
- **Product Area**: ${metadata.productArea}
- **Total Issues Analyzed**: ${metadata.totalIssuesAnalyzed}
- **Relevant Issues Found**: ${metadata.relevantIssuesFound}
- **Minimum Relevance Score**: ${metadata.minRelevanceScore}%
- **Report Generated**: ${metadata.scrapeDate.toLocaleString()}
- **Generated By**: ${metadata.generatedBy}
${
  metadata.analysisModel
    ? `- **Analysis Model**: ${metadata.analysisModel}`
    : ""
}

`;
  }

  /**
   * Generate LLM-enhanced metadata section
   */
  private generateLLMMetadataSection(
    metadata: ReportMetadata,
    llmAnalysis: LLMAnalysisResponse
  ): string {
    const topCategories =
      llmAnalysis.summary.topCategories &&
      llmAnalysis.summary.topCategories.length > 0
        ? `- **Top Categories**: ${llmAnalysis.summary.topCategories.join(
            ", "
          )}\n`
        : "";

    const processingStats = metadata.processingStats
      ? `
### Processing Statistics
- **Batch Count**: ${metadata.processingStats.batchCount || "N/A"}
- **Total Tokens Used**: ${metadata.processingStats.totalTokensUsed || "N/A"}
- **Analysis Time**: ${
          metadata.processingStats.analysisTime
            ? `${(metadata.processingStats.analysisTime / 1000).toFixed(
                2
              )} seconds`
            : "N/A"
        }
`
      : "";

    return `## Analysis Summary

- **Repository**: [${metadata.repositoryName}](${metadata.repositoryUrl})
- **Product Area**: ${metadata.productArea}
- **Total Issues Analyzed**: ${metadata.totalIssuesAnalyzed}
- **Relevant Issues Found**: ${metadata.relevantIssuesFound}
- **Minimum Relevance Score**: ${metadata.minRelevanceScore}%
- **Report Generated**: ${metadata.scrapeDate.toLocaleString()}
- **Generated By**: ${metadata.generatedBy}
- **Analysis Model**: ${
      metadata.analysisModel || llmAnalysis.summary.analysisModel || "Unknown"
    }
${topCategories}
${processingStats}
`;
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(issues: GitHubIssue[]): string {
    if (issues.length === 0) {
      return `## Table of Contents

*No relevant issues found.*

`;
    }

    let toc = `## Table of Contents

`;

    issues.forEach((issue, index) => {
      const anchor = this.generateAnchor(issue.title);
      toc += `${index + 1}. [Issue #${issue.id}: ${issue.title}](#${anchor}) (${
        issue.relevanceScore
      }% relevance)\n`;
    });

    toc += "\n";
    return toc;
  }

  /**
   * Generate table of contents for LLM-analyzed issues
   */
  private generateLLMTableOfContents(issues: AnalyzedIssue[]): string {
    if (issues.length === 0) {
      return `## Table of Contents

*No relevant issues found.*

`;
    }

    let toc = `## Table of Contents

`;

    // Group issues by priority
    const highPriority = issues.filter((issue) => issue.priority === "high");
    const mediumPriority = issues.filter(
      (issue) => issue.priority === "medium"
    );
    const lowPriority = issues.filter((issue) => issue.priority === "low");

    // Add high priority issues
    if (highPriority.length > 0) {
      toc += `### High Priority Issues\n\n`;
      highPriority.forEach((issue, index) => {
        const anchor = this.generateAnchor(`high-${issue.id}-${issue.title}`);
        toc += `- [Issue #${issue.id}: ${issue.title}](#${anchor}) (${issue.relevanceScore}% relevance)\n`;
      });
      toc += "\n";
    }

    // Add medium priority issues
    if (mediumPriority.length > 0) {
      toc += `### Medium Priority Issues\n\n`;
      mediumPriority.forEach((issue, index) => {
        const anchor = this.generateAnchor(`medium-${issue.id}-${issue.title}`);
        toc += `- [Issue #${issue.id}: ${issue.title}](#${anchor}) (${issue.relevanceScore}% relevance)\n`;
      });
      toc += "\n";
    }

    // Add low priority issues
    if (lowPriority.length > 0) {
      toc += `### Low Priority Issues\n\n`;
      lowPriority.forEach((issue, index) => {
        const anchor = this.generateAnchor(`low-${issue.id}-${issue.title}`);
        toc += `- [Issue #${issue.id}: ${issue.title}](#${anchor}) (${issue.relevanceScore}% relevance)\n`;
      });
      toc += "\n";
    }

    return toc;
  }

  /**
   * Generate issues section
   */
  private generateIssuesSection(issues: GitHubIssue[]): string {
    if (issues.length === 0) {
      return `## Issues

*No relevant issues found. Consider broadening your search criteria or lowering the minimum relevance score.*

`;
    }

    let section = `## Issues

`;

    issues.forEach((issue, index) => {
      section += this.formatIssue(issue, index + 1);
      section += "\n---\n\n";
    });

    return section;
  }

  /**
   * Generate issues section from LLM analysis results
   */
  private generateLLMIssuesSection(issues: AnalyzedIssue[]): string {
    if (issues.length === 0) {
      return `## Issues

*No relevant issues found. Consider broadening your search criteria or adjusting the LLM analysis parameters.*

`;
    }

    let section = `## Issues by Priority

`;

    // Group issues by priority
    const highPriority = issues.filter((issue) => issue.priority === "high");
    const mediumPriority = issues.filter(
      (issue) => issue.priority === "medium"
    );
    const lowPriority = issues.filter((issue) => issue.priority === "low");

    // Add high priority issues
    if (highPriority.length > 0) {
      section += `### High Priority Issues\n\n`;
      highPriority.forEach((issue) => {
        section += this.formatLLMAnalyzedIssue(issue, "high");
        section += "\n---\n\n";
      });
    }

    // Add medium priority issues
    if (mediumPriority.length > 0) {
      section += `### Medium Priority Issues\n\n`;
      mediumPriority.forEach((issue) => {
        section += this.formatLLMAnalyzedIssue(issue, "medium");
        section += "\n---\n\n";
      });
    }

    // Add low priority issues
    if (lowPriority.length > 0) {
      section += `### Low Priority Issues\n\n`;
      lowPriority.forEach((issue) => {
        section += this.formatLLMAnalyzedIssue(issue, "low");
        section += "\n---\n\n";
      });
    }

    return section;
  }

  /**
   * Format individual issue
   */
  private formatIssue(issue: GitHubIssue, index: number): string {
    let formatted = `### ${index}. Issue #${issue.id}: ${issue.title}

`;

    // Basic information
    formatted += `**Status**: ${
      issue.state.charAt(0).toUpperCase() + issue.state.slice(1)
    }\n`;
    formatted += `**Created**: ${issue.createdAt.toLocaleDateString()} by ${
      issue.author
    }\n`;
    formatted += `**Last Updated**: ${issue.updatedAt.toLocaleDateString()}\n`;
    formatted += `**Relevance Score**: ${issue.relevanceScore}/100\n`;
    formatted += `**URL**: [View on GitHub](${issue.url})\n`;

    // Labels
    if (issue.labels.length > 0) {
      formatted += `**Labels**: ${issue.labels
        .map((label) => `\`${label}\``)
        .join(", ")}\n`;
    }

    formatted += "\n";

    // Summary
    if (issue.summary) {
      formatted += `#### Summary\n\n${issue.summary}\n\n`;
    }

    // Description (truncated if too long)
    if (issue.description) {
      const truncatedDescription = this.truncateText(issue.description, 500);
      formatted += `#### Description\n\n${truncatedDescription}\n\n`;
    }

    // Workarounds
    if (issue.workarounds.length > 0) {
      formatted += `#### Workarounds\n\n`;

      issue.workarounds.forEach((workaround, idx) => {
        const authorTypeIcon = this.getAuthorTypeIcon(workaround.authorType);
        const effectivenessIcon = this.getEffectivenessIcon(
          workaround.effectiveness
        );

        formatted += `${idx + 1}. **${authorTypeIcon} ${
          workaround.author
        }** ${effectivenessIcon}\n`;
        formatted += `   ${workaround.description}\n\n`;
      });
    } else {
      formatted += `#### Workarounds\n\n*No workarounds found in the comments.*\n\n`;
    }

    return formatted;
  }

  /**
   * Format individual LLM-analyzed issue
   */
  private formatLLMAnalyzedIssue(
    issue: AnalyzedIssue,
    priority: string
  ): string {
    const priorityEmoji = this.getPriorityEmoji(priority);
    const sentimentEmoji = this.getSentimentEmoji(issue.sentiment);
    const anchor = this.generateAnchor(
      `${priority}-${issue.id}-${issue.title}`
    );

    let formatted = `#### Issue #${issue.id}: ${issue.title} {#${anchor}}

`;

    // Basic information with LLM analysis
    formatted += `**LLM Analysis**: ${issue.summary}\n`;
    formatted += `**Relevance Score**: ${issue.relevanceScore}/100\n`;
    formatted += `**Category**: ${issue.category}\n`;
    formatted += `**Priority**: ${priorityEmoji} ${
      priority.charAt(0).toUpperCase() + priority.slice(1)
    }\n`;
    formatted += `**Sentiment**: ${sentimentEmoji} ${
      issue.sentiment.charAt(0).toUpperCase() + issue.sentiment.slice(1)
    }\n`;

    // Tags from LLM analysis
    if (issue.tags && issue.tags.length > 0) {
      formatted += `**Tags**: ${issue.tags
        .map((tag) => `\`${tag}\``)
        .join(", ")}\n`;
    }

    formatted += "\n";

    // Workarounds with confidence levels
    if (issue.workarounds && issue.workarounds.length > 0) {
      formatted += `##### Identified Workarounds\n\n`;

      issue.workarounds.forEach((workaround, idx) => {
        const authorTypeIcon = this.getAuthorTypeIcon(workaround.authorType);
        const effectivenessIcon = this.getEffectivenessIcon(
          workaround.effectiveness
        );
        const confidenceBar = this.getConfidenceBar(workaround.confidence);

        formatted += `${idx + 1}. **${authorTypeIcon} ${
          workaround.authorType.charAt(0).toUpperCase() +
          workaround.authorType.slice(1)
        }** (${workaround.author}) ${effectivenessIcon}\n`;
        formatted += `   **Confidence**: ${workaround.confidence}% ${confidenceBar}\n`;
        formatted += `   ${workaround.description}\n\n`;
      });
    } else {
      formatted += `##### Workarounds\n\n*No workarounds identified by LLM analysis.*\n\n`;
    }

    return formatted;
  }

  /**
   * Generate anchor for table of contents
   */
  private generateAnchor(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + "...";
    }

    return truncated + "...";
  }

  /**
   * Get icon for author type
   */
  private getAuthorTypeIcon(authorType: string): string {
    switch (authorType) {
      case "maintainer":
        return "👨‍💻";
      case "contributor":
        return "🤝";
      case "user":
        return "👤";
      default:
        return "❓";
    }
  }

  /**
   * Get icon for effectiveness
   */
  private getEffectivenessIcon(effectiveness: string): string {
    switch (effectiveness) {
      case "confirmed":
        return "✅";
      case "suggested":
        return "💡";
      case "partial":
        return "⚠️";
      default:
        return "❓";
    }
  }

  /**
   * Get emoji for priority level
   */
  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟠";
      case "low":
        return "🟢";
      default:
        return "⚪";
    }
  }

  /**
   * Get emoji for sentiment
   */
  private getSentimentEmoji(sentiment: string): string {
    switch (sentiment) {
      case "positive":
        return "😀";
      case "neutral":
        return "😐";
      case "negative":
        return "😞";
      default:
        return "❓";
    }
  }

  /**
   * Get visual confidence bar
   */
  private getConfidenceBar(confidence: number): string {
    const fullBlocks = Math.floor(confidence / 10);
    let bar = "";

    for (let i = 0; i < 10; i++) {
      if (i < fullBlocks) {
        bar += "█";
      } else {
        bar += "░";
      }
    }

    return bar;
  }

  /**
   * Create report metadata from config and issues
   */
  static createMetadata(
    config: Config,
    issues: GitHubIssue[],
    totalAnalyzed: number,
    llmAnalysis?: LLMAnalysisResponse,
    processingStats?: {
      batchCount?: number;
      totalTokensUsed?: number;
      analysisTime?: number;
    }
  ): ReportMetadata {
    const repoUrl = config.repository.startsWith("http")
      ? config.repository
      : `https://github.com/${config.repository}`;

    const repoName = config.repository.includes("/")
      ? config.repository.split("/").pop() || config.repository
      : config.repository;

    return {
      repositoryName: repoName,
      repositoryUrl: repoUrl,
      productArea: config.productArea,
      scrapeDate: new Date(),
      totalIssuesAnalyzed: llmAnalysis?.summary.totalAnalyzed || totalAnalyzed,
      relevantIssuesFound: llmAnalysis?.relevantIssues.length || issues.length,
      minRelevanceScore: config.minRelevanceScore,
      generatedBy: "GitHub Issue Scraper v1.0.0",
      analysisModel: llmAnalysis?.summary.analysisModel || config.janModel,
      processingStats: processingStats,
    };
  }
}
