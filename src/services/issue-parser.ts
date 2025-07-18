import { GitHubIssue, Comment, Workaround } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface ParsedIssueContent {
  title: string;
  description: string;
  labels: string[];
  metadata: IssueMetadata;
}

export interface IssueMetadata {
  id: number;
  state: "open" | "closed";
  createdAt: Date;
  updatedAt: Date;
  author: string;
  url: string;
  commentCount: number;
}

export interface WorkaroundPattern {
  keywords: string[];
  codeBlockRequired: boolean;
  weight: number;
}

export interface SummaryOptions {
  maxLength: number;
  includeLabels: boolean;
  includeMetrics: boolean;
}

export class IssueParser {
  private workaroundPatterns: WorkaroundPattern[] = [
    {
      keywords: ["workaround", "work around", "temporary fix", "temp fix"],
      codeBlockRequired: false,
      weight: 1.0,
    },
    {
      keywords: ["solution", "fix", "resolved", "solve"],
      codeBlockRequired: false,
      weight: 0.9,
    },
    {
      keywords: ["try this", "you can", "here's how", "this works"],
      codeBlockRequired: true,
      weight: 0.8,
    },
    {
      keywords: ["patch", "hotfix", "quick fix"],
      codeBlockRequired: false,
      weight: 0.9,
    },
    {
      keywords: ["alternative", "instead", "use this"],
      codeBlockRequired: false,
      weight: 0.7,
    },
  ];

  private codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;

  /**
   * Parse issue content and extract structured information
   */
  parseIssueContent(issue: GitHubIssue): ParsedIssueContent {
    const context: ErrorContext = {
      operation: "parsing issue content",
      issueId: issue.id,
    };

    try {
      return {
        title: this.cleanText(issue.title || ""),
        description: this.cleanText(issue.description || ""),
        labels: Array.isArray(issue.labels) ? issue.labels : [],
        metadata: {
          id: issue.id || 0,
          state: issue.state || "open",
          createdAt: issue.createdAt || new Date(),
          updatedAt: issue.updatedAt || new Date(),
          author: issue.author || "unknown",
          url: issue.url || "",
          commentCount: Array.isArray(issue.comments)
            ? issue.comments.length
            : 0,
        },
      };
    } catch (error: any) {
      throw ErrorHandler.handleParsingError(error, context, issue);
    }
  }

  /**
   * Parse issue content with graceful error handling
   */
  parseIssueContentSafely(issue: any): ParsedIssueContent | null {
    try {
      // Validate required fields
      if (!issue || typeof issue !== "object") {
        return null;
      }

      return this.parseIssueContent(issue as GitHubIssue);
    } catch (error: any) {
      console.warn(
        `Failed to parse issue ${issue?.id || "unknown"}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Analyze comments to identify workaround patterns
   */
  analyzeComments(comments: Comment[]): Comment[] {
    if (!Array.isArray(comments)) {
      console.warn("Invalid comments data provided, expected array");
      return [];
    }

    return comments
      .filter((comment) => {
        // Filter out malformed comments
        if (!comment || typeof comment !== "object") {
          console.warn(
            `Skipping malformed comment: ${JSON.stringify(comment)}`
          );
          return false;
        }
        if (!comment.body || typeof comment.body !== "string") {
          console.warn(`Skipping comment with invalid body: ${comment.id}`);
          return false;
        }
        return true;
      })
      .map((comment) => {
        try {
          return {
            ...comment,
            isWorkaround: this.isWorkaroundComment(comment),
          };
        } catch (error: any) {
          console.warn(
            `Error analyzing comment ${comment.id}: ${error.message}`
          );
          return {
            ...comment,
            isWorkaround: false, // Default to false on error
          };
        }
      });
  }

  /**
   * Extract workarounds from comments with author classification
   */
  extractWorkarounds(comments: Comment[]): Workaround[] {
    const workarounds: Workaround[] = [];

    for (const comment of comments) {
      if (comment.isWorkaround) {
        const workaround = this.createWorkaround(comment);
        if (workaround) {
          workarounds.push(workaround);
        }
      }
    }

    // Sort by effectiveness and author authority
    return this.sortWorkarounds(workarounds);
  }

  /**
   * Generate executive summary for an issue
   */
  generateSummary(
    issue: GitHubIssue,
    options: SummaryOptions = {
      maxLength: 200,
      includeLabels: true,
      includeMetrics: true,
    }
  ): string {
    try {
      // Validate input data
      if (!issue || typeof issue !== "object") {
        console.warn("Invalid issue data provided for summary generation");
        return "Unable to generate summary: invalid issue data";
      }

      // Validate and sanitize options
      const safeOptions = {
        maxLength: Math.max(50, Math.min(1000, options.maxLength || 200)),
        includeLabels: Boolean(options.includeLabels),
        includeMetrics: Boolean(options.includeMetrics),
      };

      const parts: string[] = [];
      let remainingLength = safeOptions.maxLength;

      // Add label information first (shorter, fixed length)
      if (
        safeOptions.includeLabels &&
        Array.isArray(issue.labels) &&
        issue.labels.length > 0
      ) {
        try {
          const validLabels = issue.labels.filter(
            (label) => typeof label === "string" && label.trim().length > 0
          );
          if (validLabels.length > 0) {
            const labelText = `Tagged as: ${validLabels.join(", ")}`;
            parts.push(labelText);
            remainingLength -= labelText.length + 2; // +2 for ". " separator
          }
        } catch (error: any) {
          console.warn(
            `Error processing labels for issue ${issue.id}: ${error.message}`
          );
        }
      }

      // Add metrics and activity info
      if (safeOptions.includeMetrics) {
        try {
          const metrics: string[] = [];

          // Safely get comment count
          const commentCount = Array.isArray(issue.comments)
            ? issue.comments.length
            : 0;
          if (commentCount > 0) {
            metrics.push(`${commentCount} comments`);
          }

          // Safely get workaround count
          const workaroundCount = Array.isArray(issue.workarounds)
            ? issue.workarounds.length
            : 0;
          if (workaroundCount > 0) {
            metrics.push(`${workaroundCount} workarounds available`);
          }

          // Safely calculate days since creation
          try {
            const createdAt =
              issue.createdAt instanceof Date
                ? issue.createdAt
                : new Date(issue.createdAt);
            if (!isNaN(createdAt.getTime())) {
              const daysSinceCreated = Math.floor(
                (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSinceCreated >= 0 && daysSinceCreated < 10000) {
                // Reasonable range
                metrics.push(`${daysSinceCreated} days old`);
              }
            }
          } catch (dateError: any) {
            console.warn(
              `Error calculating age for issue ${issue.id}: ${dateError.message}`
            );
          }

          if (metrics.length > 0) {
            const activityText = `Activity: ${metrics.join(", ")}`;
            parts.push(activityText);
            remainingLength -= activityText.length + 2; // +2 for ". " separator
          }
        } catch (error: any) {
          console.warn(
            `Error processing metrics for issue ${issue.id}: ${error.message}`
          );
        }
      }

      // Use remaining space for description summary
      if (
        remainingLength > 20 &&
        issue.description &&
        typeof issue.description === "string"
      ) {
        try {
          const descriptionSummary = this.summarizeText(
            issue.description,
            Math.max(remainingLength - 2, 20)
          );
          if (descriptionSummary && descriptionSummary.trim().length > 0) {
            parts.unshift(descriptionSummary); // Add at beginning
          }
        } catch (error: any) {
          console.warn(
            `Error summarizing description for issue ${issue.id}: ${error.message}`
          );
        }
      }

      const result = parts.join(". ");

      // Final validation and truncation
      if (result.length > safeOptions.maxLength) {
        return result.substring(0, safeOptions.maxLength - 3) + "...";
      }

      return (
        result ||
        `Issue #${issue.id || "unknown"}: ${
          issue.title || "No title available"
        }`
      );
    } catch (error: any) {
      console.warn(
        `Error generating summary for issue ${issue?.id}: ${error.message}`
      );
      return `Issue #${issue?.id || "unknown"}: Summary generation failed`;
    }
  }

  /**
   * Distinguish between official and community solutions
   */
  classifyWorkarounds(workarounds: Workaround[]): {
    official: Workaround[];
    community: Workaround[];
  } {
    const official = workarounds.filter((w) => w.authorType === "maintainer");
    const community = workarounds.filter((w) => w.authorType !== "maintainer");

    return { official, community };
  }

  /**
   * Check if a comment contains workaround patterns
   */
  private isWorkaroundComment(comment: Comment): boolean {
    const text = comment.body.toLowerCase();
    const hasCodeBlock = this.codeBlockRegex.test(comment.body);

    for (const pattern of this.workaroundPatterns) {
      const hasKeyword = pattern.keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        // If pattern requires code block, check for it
        if (pattern.codeBlockRequired && !hasCodeBlock) {
          continue;
        }
        return true;
      }
    }

    // Additional heuristics
    return (
      this.hasWorkaroundStructure(text) ||
      this.hasStepByStepInstructions(text) ||
      (hasCodeBlock && this.hasActionWords(text))
    );
  }

  /**
   * Create workaround object from comment
   */
  private createWorkaround(comment: Comment): Workaround | null {
    const description = this.extractWorkaroundDescription(comment.body);
    if (!description) return null;

    const effectiveness = this.determineEffectiveness(comment);

    return {
      description,
      author: comment.author,
      authorType: comment.authorType,
      commentId: comment.id,
      effectiveness,
    };
  }

  /**
   * Extract clean workaround description from comment
   */
  private extractWorkaroundDescription(commentBody: string): string {
    // Remove excessive whitespace and normalize
    let description = commentBody.trim().replace(/\s+/g, " ");

    // Limit length for readability
    if (description.length > 500) {
      description = description.substring(0, 497) + "...";
    }

    return description;
  }

  /**
   * Determine workaround effectiveness based on comment characteristics
   */
  private determineEffectiveness(
    comment: Comment
  ): "confirmed" | "suggested" | "partial" {
    const text = comment.body.toLowerCase();

    // Check for confirmation indicators
    if (
      text.includes("confirmed") ||
      text.includes("tested") ||
      text.includes("verified") ||
      comment.authorType === "maintainer"
    ) {
      return "confirmed";
    }

    // Check for partial solution indicators
    if (
      text.includes("partial") ||
      text.includes("workaround") ||
      text.includes("temporary")
    ) {
      return "partial";
    }

    return "suggested";
  }

  /**
   * Sort workarounds by effectiveness and author authority
   */
  private sortWorkarounds(workarounds: Workaround[]): Workaround[] {
    const effectivenessOrder = { confirmed: 3, partial: 2, suggested: 1 };
    const authorTypeOrder = { maintainer: 3, contributor: 2, user: 1 };

    return workarounds.sort((a, b) => {
      // First sort by effectiveness
      const effectivenessCompare =
        effectivenessOrder[b.effectiveness] -
        effectivenessOrder[a.effectiveness];
      if (effectivenessCompare !== 0) return effectivenessCompare;

      // Then by author type
      return authorTypeOrder[b.authorType] - authorTypeOrder[a.authorType];
    });
  }

  /**
   * Check if text has workaround structure patterns
   */
  private hasWorkaroundStructure(text: string): boolean {
    return (
      text.includes("step 1") ||
      text.includes("first,") ||
      text.includes("then,") ||
      text.includes("finally,") ||
      /\d+\.\s/.test(text) // Numbered lists
    );
  }

  /**
   * Check if text has step-by-step instructions
   */
  private hasStepByStepInstructions(text: string): boolean {
    const stepIndicators = [
      "step",
      "first",
      "second",
      "third",
      "next",
      "then",
      "after",
      "finally",
    ];

    let stepCount = 0;
    for (const indicator of stepIndicators) {
      if (text.includes(indicator)) {
        stepCount++;
      }
    }

    return stepCount >= 2;
  }

  /**
   * Check if text has action words indicating solutions
   */
  private hasActionWords(text: string): boolean {
    const actionWords = [
      "install",
      "run",
      "execute",
      "change",
      "modify",
      "update",
      "replace",
      "add",
      "remove",
      "set",
      "configure",
    ];

    return actionWords.some((word) => text.includes(word));
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    if (!text) return "";

    return text
      .trim()
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
      .replace(/\s+/g, " "); // Normalize whitespace
  }

  /**
   * Create a summary of text content
   */
  private summarizeText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;

    // Find the last complete sentence within the limit
    const truncated = text.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );

    if (lastSentenceEnd > maxLength * 0.5) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    // If no good sentence break, truncate at word boundary
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + "...";
    }

    return truncated + "...";
  }
}
