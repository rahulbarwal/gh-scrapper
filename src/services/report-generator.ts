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
   * Format a line with proper markdown spacing
   * Ensures proper line breaks around different markdown elements
   */
  private formatMarkdownLine(
    content: string,
    type: "bold" | "heading" | "paragraph" | "list" | "code" = "paragraph"
  ): string {
    switch (type) {
      case "bold":
        // Bold text needs extra spacing when followed by different content
        return `${content}\n\n`;
      case "heading":
        // Headings need space before and after
        return `\n${content}\n\n`;
      case "list":
        // List items get single line break
        return `${content}\n`;
      case "code":
        // Code blocks need extra spacing
        return `${content}\n\n`;
      case "paragraph":
      default:
        // Regular paragraphs get double line break
        return `${content}\n\n`;
    }
  }

  /**
   * Format a bold field with proper spacing
   */
  private formatBoldField(label: string, value: string): string {
    return this.formatMarkdownLine(`**${label}**: ${value}`, "bold");
  }

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
    return this.formatMarkdownLine(
      `# GitHub Issues Report: ${metadata.repositoryName} - ${metadata.productArea}`,
      "heading"
    );
  }

  /**
   * Generate metadata section
   */
  private generateMetadataSection(metadata: ReportMetadata): string {
    let section = this.formatMarkdownLine(`## Summary`, "heading");

    section += this.formatMarkdownLine(
      `- **Repository**: [${metadata.repositoryName}](${metadata.repositoryUrl})`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Product Area**: ${metadata.productArea}`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Total Issues Analyzed**: ${metadata.totalIssuesAnalyzed}`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Relevant Issues Found**: ${metadata.relevantIssuesFound}`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Minimum Relevance Score**: ${metadata.minRelevanceScore}%`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Report Generated**: ${metadata.scrapeDate.toLocaleString()}`,
      "list"
    );
    section += this.formatMarkdownLine(
      `- **Generated By**: ${metadata.generatedBy}`,
      "list"
    );

    return section + "\n";
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

    let summary = this.formatMarkdownLine(
      `## Technical Analysis Summary`,
      "heading"
    );

    // Framework breakdown
    if (frameworkCounts.size > 0) {
      summary += this.formatMarkdownLine(`### Frameworks Mentioned`, "heading");
      Array.from(frameworkCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([framework, count]) => {
          summary += this.formatMarkdownLine(
            `- **${framework}**: ${count} issue(s)`,
            "list"
          );
        });
      summary += "\n";
    }

    // Browser breakdown
    if (browserCounts.size > 0) {
      summary += this.formatMarkdownLine(`### Browsers Mentioned`, "heading");
      Array.from(browserCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([browser, count]) => {
          summary += this.formatMarkdownLine(
            `- **${browser}**: ${count} issue(s)`,
            "list"
          );
        });
      summary += "\n";
    }

    // Workaround analysis
    if (complexityCounts.size > 0) {
      summary += this.formatMarkdownLine(`### Workaround Analysis`, "heading");
      summary += this.formatMarkdownLine(
        `**Complexity Distribution:**`,
        "bold"
      );
      Array.from(complexityCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([complexity, count]) => {
          summary += this.formatMarkdownLine(
            `- ${complexity}: ${count} issue(s)`,
            "list"
          );
        });

      summary += this.formatMarkdownLine(`**Type Distribution:**`, "bold");
      Array.from(typeCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          summary += this.formatMarkdownLine(
            `- ${type}: ${count} issue(s)`,
            "list"
          );
        });
      summary += "\n";
    }

    return summary;
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(issues: GitHubIssue[]): string {
    if (issues.length === 0) {
      let toc = this.formatMarkdownLine(`## Table of Contents`, "heading");
      toc += this.formatMarkdownLine(
        `*No relevant issues found.*`,
        "paragraph"
      );
      return toc;
    }

    let toc = this.formatMarkdownLine(`## Table of Contents`, "heading");

    issues.forEach((issue, index) => {
      const anchor = this.generateAnchor(issue.title);
      toc += this.formatMarkdownLine(
        `${index + 1}. [Issue #${issue.number}: ${issue.title}](#${anchor}) (${
          issue.relevanceScore
        }% relevance)`,
        "list"
      );
    });

    toc += "\n";
    return toc;
  }

  /**
   * Generate issues section
   */
  private generateIssuesSection(issues: GitHubIssue[]): string {
    if (issues.length === 0) {
      let section = this.formatMarkdownLine(`## Issues`, "heading");
      section += this.formatMarkdownLine(
        `*No relevant issues found. Consider broadening your search criteria or lowering the minimum relevance score.*`,
        "paragraph"
      );
      return section;
    }

    let section = this.formatMarkdownLine(`## Issues`, "heading");

    issues.forEach((issue, index) => {
      section += this.formatIssue(issue, index + 1);
      section += this.formatMarkdownLine("\n---", "paragraph");
    });

    return section;
  }

  /**
   * Format individual issue
   */
  private formatIssue(issue: GitHubIssue, index: number): string {
    let formatted = this.formatMarkdownLine(
      `### ${index}. Issue #${issue.number}: ${issue.title}`,
      "heading"
    );

    // Basic information
    formatted += this.formatBoldField(
      "Status",
      issue.state.charAt(0).toUpperCase() + issue.state.slice(1)
    );
    formatted += this.formatBoldField(
      "Created",
      `${issue.createdAt.toLocaleDateString()} by ${issue.author}`
    );
    formatted += this.formatBoldField(
      "Last Updated",
      issue.updatedAt.toLocaleDateString()
    );
    formatted += this.formatBoldField(
      "Relevance Score",
      `${issue.relevanceScore}/100`
    );
    formatted += this.formatBoldField("URL", `[View on GitHub](${issue.url})`);

    // Labels
    if (issue.labels.length > 0) {
      formatted += this.formatBoldField(
        "Labels",
        issue.labels.map((label) => `\`${label}\``).join(", ")
      );
    }

    // Jan AI Analysis Results (if available)
    if (issue.janAnalysis) {
      formatted += this.formatMarkdownLine(`#### Jan AI Analysis`, "heading");
      formatted += this.formatBoldField(
        "Relevance Reasoning",
        issue.janAnalysis.relevanceReasoning
      );
      formatted += this.formatBoldField(
        "Framework",
        issue.janAnalysis.framework
      );
      formatted += this.formatBoldField("Browser", issue.janAnalysis.browser);
      formatted += this.formatBoldField(
        "Has Workaround",
        issue.janAnalysis.hasWorkaround ? "Yes" : "No"
      );

      if (issue.janAnalysis.hasWorkaround) {
        formatted += this.formatBoldField(
          "Workaround Complexity",
          issue.janAnalysis.workaroundComplexity
        );
        formatted += this.formatBoldField(
          "Workaround Type",
          issue.janAnalysis.workaroundType
        );
        formatted += this.formatBoldField(
          "Implementation Difficulty",
          issue.janAnalysis.implementationDifficulty
        );

        if (issue.janAnalysis.workaroundDescription) {
          formatted += this.formatBoldField(
            "Workaround Description",
            issue.janAnalysis.workaroundDescription
          );
        }
      }

      formatted += this.formatBoldField(
        "AI Summary",
        issue.janAnalysis.summary
      );
    }

    // Summary
    if (issue.summary) {
      formatted += this.formatMarkdownLine(`#### Summary`, "heading");
      formatted += this.formatMarkdownLine(issue.summary, "paragraph");
    }

    // Description (truncated if too long)
    if (issue.description) {
      const truncatedDescription = this.truncateText(issue.description, 500);
      formatted += this.formatMarkdownLine(`#### Description`, "heading");
      formatted += this.formatMarkdownLine(truncatedDescription, "paragraph");
    }

    // Workarounds
    if (issue.workarounds.length > 0) {
      formatted += this.formatMarkdownLine(`#### Workarounds`, "heading");

      issue.workarounds.forEach((workaround, idx) => {
        const authorTypeIcon = this.getAuthorTypeIcon(workaround.authorType);
        const effectivenessIcon = this.getEffectivenessIcon(
          workaround.effectiveness
        );

        formatted += this.formatMarkdownLine(
          `${idx + 1}. **${authorTypeIcon} ${
            workaround.author
          }** ${effectivenessIcon}`,
          "list"
        );
        formatted += this.formatMarkdownLine(
          `   ${workaround.description}`,
          "paragraph"
        );
      });
    } else {
      formatted += this.formatMarkdownLine(`#### Workarounds`, "heading");
      formatted += this.formatMarkdownLine(
        `*No workarounds found in the comments.*`,
        "paragraph"
      );
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
    relevantIssues: GitHubIssue[],
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
      relevantIssuesFound: relevantIssues.length,
      minRelevanceScore: config.minRelevanceScore,
      generatedBy: "GitHub Issue Scraper v1.0.0",
    };
  }
}
