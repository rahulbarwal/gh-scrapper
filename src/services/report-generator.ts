import { GitHubIssue, Config } from "../models";
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
   * Generate a comprehensive markdown report from GitHub issues
   */
  async generateReport(
    issues: GitHubIssue[],
    metadata: ReportMetadata,
    config: Config,
    options: ReportGenerationOptions = {}
  ): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };

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

    // Generate technical summary (framework/browser analysis)
    report += this.generateTechnicalSummary(sortedIssues);

    // Generate table of contents
    if (opts.includeTableOfContents) {
      report += this.generateTableOfContents(sortedIssues);
    }

    // Generate issues section
    report += this.generateIssuesSection(sortedIssues);

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

`;
  }

  /**
   * Generate technical summary section with framework and browser statistics
   */
  private generateTechnicalSummary(issues: GitHubIssue[]): string {
    const issuesWithAnalysis = issues.filter((issue) => issue.janAnalysis);

    if (issuesWithAnalysis.length === 0) {
      return "";
    }

    // Count frameworks
    const frameworkCounts = new Map<string, number>();
    const browserCounts = new Map<string, number>();
    const complexityCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();

    issuesWithAnalysis.forEach((issue) => {
      const analysis = issue.janAnalysis!;

      // Framework stats
      if (analysis.framework && analysis.framework !== "N/A") {
        frameworkCounts.set(
          analysis.framework,
          (frameworkCounts.get(analysis.framework) || 0) + 1
        );
      }

      // Browser stats
      if (analysis.browser && analysis.browser !== "N/A") {
        browserCounts.set(
          analysis.browser,
          (browserCounts.get(analysis.browser) || 0) + 1
        );
      }

      // Complexity stats
      if (analysis.hasWorkaround) {
        complexityCounts.set(
          analysis.workaroundComplexity,
          (complexityCounts.get(analysis.workaroundComplexity) || 0) + 1
        );
        typeCounts.set(
          analysis.workaroundType,
          (typeCounts.get(analysis.workaroundType) || 0) + 1
        );
      }
    });

    let summary = `## Technical Analysis Summary\n\n`;

    // Framework breakdown
    if (frameworkCounts.size > 0) {
      summary += `### Frameworks Mentioned\n\n`;
      Array.from(frameworkCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([framework, count]) => {
          summary += `- **${framework}**: ${count} issue(s)\n`;
        });
      summary += `\n`;
    }

    // Browser breakdown
    if (browserCounts.size > 0) {
      summary += `### Browsers Mentioned\n\n`;
      Array.from(browserCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([browser, count]) => {
          summary += `- **${browser}**: ${count} issue(s)\n`;
        });
      summary += `\n`;
    }

    // Workaround analysis
    if (complexityCounts.size > 0) {
      summary += `### Workaround Analysis\n\n`;
      summary += `**Complexity Distribution:**\n`;
      Array.from(complexityCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([complexity, count]) => {
          summary += `- ${complexity}: ${count} issue(s)\n`;
        });

      summary += `\n**Type Distribution:**\n`;
      Array.from(typeCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          summary += `- ${type}: ${count} issue(s)\n`;
        });
      summary += `\n`;
    }

    return summary;
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

    // Jan AI Analysis Results (if available)
    if (issue.janAnalysis) {
      formatted += `#### Jan AI Analysis\n\n`;
      formatted += `**Relevance Reasoning**: ${issue.janAnalysis.relevanceReasoning}\n`;
      formatted += `**Framework**: ${issue.janAnalysis.framework}\n`;
      formatted += `**Browser**: ${issue.janAnalysis.browser}\n`;
      formatted += `**Has Workaround**: ${
        issue.janAnalysis.hasWorkaround ? "Yes" : "No"
      }\n`;

      if (issue.janAnalysis.hasWorkaround) {
        formatted += `**Workaround Complexity**: ${issue.janAnalysis.workaroundComplexity}\n`;
        formatted += `**Workaround Type**: ${issue.janAnalysis.workaroundType}\n`;
        formatted += `**Implementation Difficulty**: ${issue.janAnalysis.implementationDifficulty}\n`;

        if (issue.janAnalysis.workaroundDescription) {
          formatted += `**Workaround Description**: ${issue.janAnalysis.workaroundDescription}\n`;
        }
      }

      formatted += `**AI Summary**: ${issue.janAnalysis.summary}\n\n`;
    }

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
   * Create report metadata from config and issues
   */
  static createMetadata(
    config: Config,
    issues: GitHubIssue[],
    totalAnalyzed: number
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
      totalIssuesAnalyzed: totalAnalyzed,
      relevantIssuesFound: issues.length,
      minRelevanceScore: config.minRelevanceScore,
      generatedBy: "GitHub Issue Scraper v1.0.0",
    };
  }
}
