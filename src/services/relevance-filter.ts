import { GitHubIssue } from "../models";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface RelevanceFilterOptions {
  productArea: string;
  minRelevanceScore: number;
  maxResults?: number;
}

export interface RelevanceWeights {
  title: number;
  labels: number;
  description: number;
  activity: number;
}

export interface KeywordMatch {
  keyword: string;
  matches: number;
  positions: number[];
}

export class RelevanceFilter {
  private readonly defaultWeights: RelevanceWeights = {
    title: 0.4,
    labels: 0.3,
    description: 0.2,
    activity: 0.1,
  };

  private readonly fuzzyThreshold = 0.7; // Minimum similarity for fuzzy matching

  /**
   * Extract keywords from product area input
   */
  extractKeywords(productArea: string): string[] {
    // Split by common delimiters and clean up
    const keywords = productArea
      .toLowerCase()
      .split(/[\s,;|&\-_]+/)
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 2) // Filter out very short words
      .filter((keyword) => !this.isStopWord(keyword));

    // Remove duplicates
    return [...new Set(keywords)];
  }

  /**
   * Calculate relevance score for an issue based on product area
   */
  scoreRelevance(
    issue: GitHubIssue,
    productArea: string,
    weights?: Partial<RelevanceWeights>
  ): number {
    const context: ErrorContext = {
      operation: "calculating relevance score",
      issueId: issue?.id,
      productArea,
    };

    try {
      // Validate input data
      if (!issue || typeof issue !== "object") {
        console.warn(`Skipping malformed issue data: ${JSON.stringify(issue)}`);
        return 0;
      }

      if (
        !productArea ||
        typeof productArea !== "string" ||
        productArea.trim().length === 0
      ) {
        console.warn(`Invalid product area provided: ${productArea}`);
        return 0;
      }

      const keywords = this.extractKeywords(productArea);
      if (keywords.length === 0) {
        console.warn(
          `No valid keywords extracted from product area: ${productArea}`
        );
        return 0;
      }

      const finalWeights = { ...this.defaultWeights, ...weights };

      // Safely calculate scores with fallbacks for malformed data
      const titleScore = this.calculateTextScore(issue.title || "", keywords);
      const labelsScore = this.calculateLabelsScore(
        Array.isArray(issue.labels) ? issue.labels : [],
        keywords
      );
      const descriptionScore = this.calculateTextScore(
        issue.description || "",
        keywords
      );
      const activityScore = this.calculateActivityScore(issue);

      const totalScore =
        titleScore * finalWeights.title +
        labelsScore * finalWeights.labels +
        descriptionScore * finalWeights.description +
        activityScore * finalWeights.activity;

      // Ensure score is within valid range
      const clampedScore = Math.max(0, Math.min(100, totalScore));
      return Math.round(clampedScore * 100) / 100; // Round to 2 decimal places
    } catch (error: any) {
      // Handle scoring errors gracefully
      const parseError = ErrorHandler.handleParsingError(error, context, issue);
      console.warn(ErrorHandler.formatError(parseError, false));
      return 0; // Return 0 score for issues that can't be processed
    }
  }

  /**
   * Filter issues based on relevance threshold
   */
  filterIssues(
    issues: GitHubIssue[],
    options: RelevanceFilterOptions
  ): GitHubIssue[] {
    // Score all issues
    const scoredIssues = issues.map((issue) => ({
      ...issue,
      relevanceScore: this.scoreRelevance(issue, options.productArea),
    }));

    // Filter by minimum score
    const filteredIssues = scoredIssues.filter(
      (issue) => issue.relevanceScore >= options.minRelevanceScore
    );

    // Handle empty results with helpful suggestions
    if (filteredIssues.length === 0) {
      const context: ErrorContext = {
        operation: "filtering issues by relevance",
        productArea: options.productArea,
        additionalInfo: {
          totalIssues: issues.length,
          minRelevanceScore: options.minRelevanceScore,
          keywords: this.extractKeywords(options.productArea),
        },
      };

      throw ErrorHandler.handleEmptyResults(context);
    }

    // Sort by relevance score (descending) and then by activity (recent first)
    const sortedIssues = filteredIssues.sort((a, b) => {
      // Primary sort: relevance score
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      // Secondary sort: activity (updated date)
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    // Limit results if specified
    if (options.maxResults && options.maxResults > 0) {
      return sortedIssues.slice(0, options.maxResults);
    }

    return sortedIssues;
  }

  /**
   * Filter issues with graceful handling of empty results
   */
  filterIssuesWithFallback(
    issues: GitHubIssue[],
    options: RelevanceFilterOptions
  ): { issues: GitHubIssue[]; hasResults: boolean; suggestions?: string[] } {
    try {
      const filteredIssues = this.filterIssues(issues, options);
      return { issues: filteredIssues, hasResults: true };
    } catch (error: any) {
      if (error.type === "EMPTY_RESULTS") {
        // Provide fallback suggestions
        const suggestions = this.generateSearchSuggestions(issues, options);
        return {
          issues: [],
          hasResults: false,
          suggestions: suggestions.map((s) => s.action + ": " + s.description),
        };
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Generate search suggestions for empty results
   */
  private generateSearchSuggestions(
    issues: GitHubIssue[],
    options: RelevanceFilterOptions
  ): Array<{ action: string; description: string }> {
    const suggestions: Array<{ action: string; description: string }> = [];
    const keywords = this.extractKeywords(options.productArea);

    // Analyze why no results were found
    const scoredIssues = issues.map((issue) => ({
      ...issue,
      relevanceScore: this.scoreRelevance(issue, options.productArea),
    }));

    const maxScore = Math.max(...scoredIssues.map((i) => i.relevanceScore));
    // Remove unused avgScore variable
    // const avgScore =
    //   scoredIssues.reduce((sum, i) => sum + i.relevanceScore, 0) /
    //   scoredIssues.length;

    // Suggest lowering threshold if there are issues with decent scores
    if (maxScore > options.minRelevanceScore * 0.7) {
      const suggestedThreshold = Math.floor(maxScore * 0.8);
      suggestions.push({
        action: "Lower relevance threshold",
        description: `Try setting minimum relevance score to ${suggestedThreshold}% (highest found: ${Math.round(
          maxScore
        )}%)`,
      });
    }

    // Suggest broader keywords if current ones are too specific
    if (keywords.length > 3) {
      suggestions.push({
        action: "Use fewer, broader keywords",
        description: `Try using 1-2 main keywords instead of: ${keywords.join(
          ", "
        )}`,
      });
    }

    // Suggest alternative keywords based on common issue patterns
    const commonTerms = this.findCommonTermsInIssues(issues);
    if (commonTerms.length > 0) {
      suggestions.push({
        action: "Try alternative keywords",
        description: `Consider these terms found in issues: ${commonTerms
          .slice(0, 5)
          .join(", ")}`,
      });
    }

    return suggestions;
  }

  /**
   * Find common terms in issues that might be relevant
   */
  private findCommonTermsInIssues(issues: GitHubIssue[]): string[] {
    const termFrequency: Map<string, number> = new Map();

    issues.forEach((issue) => {
      // Extract terms from title and labels (more reliable than description)
      const text = (issue.title + " " + issue.labels.join(" ")).toLowerCase();
      const words = text
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .filter((word) => !this.isStopWord(word))
        .filter((word) => /^[a-zA-Z]+$/.test(word)); // Only alphabetic words

      words.forEach((word) => {
        termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
      });
    });

    // Return terms that appear in at least 10% of issues, sorted by frequency
    const minFrequency = Math.max(1, Math.floor(issues.length * 0.1));
    return Array.from(termFrequency.entries())
      .filter(([_, freq]) => freq >= minFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([term, _]) => term);
  }

  /**
   * Perform fuzzy matching between text and keywords
   */
  fuzzyMatch(text: string, keyword: string): number {
    const normalizedText = text.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();

    // Exact match gets highest score
    if (normalizedText.includes(normalizedKeyword)) {
      return 1.0;
    }

    // Calculate Levenshtein distance for fuzzy matching
    const similarity = this.calculateSimilarity(
      normalizedText,
      normalizedKeyword
    );
    return similarity >= this.fuzzyThreshold ? similarity : 0;
  }

  /**
   * Find keyword matches in text with fuzzy matching
   */
  findKeywordMatches(text: string, keywords: string[]): KeywordMatch[] {
    const matches: KeywordMatch[] = [];
    const normalizedText = text.toLowerCase();

    for (const keyword of keywords) {
      const keywordMatches: KeywordMatch = {
        keyword,
        matches: 0,
        positions: [],
      };

      // Check for exact matches
      const exactMatches = this.findExactMatches(
        normalizedText,
        keyword.toLowerCase()
      );
      keywordMatches.matches += exactMatches.length;
      keywordMatches.positions.push(...exactMatches);

      // Check for fuzzy matches if no exact matches found
      if (exactMatches.length === 0) {
        const words = normalizedText.split(/\s+/);
        words.forEach((word, index) => {
          const similarity = this.fuzzyMatch(word, keyword);
          if (similarity >= this.fuzzyThreshold) {
            keywordMatches.matches += similarity;
            keywordMatches.positions.push(index);
          }
        });
      }

      if (keywordMatches.matches > 0) {
        matches.push(keywordMatches);
      }
    }

    return matches;
  }

  private calculateTextScore(text: string, keywords: string[]): number {
    if (!text || keywords.length === 0) return 0;

    const matches = this.findKeywordMatches(text, keywords);
    if (matches.length === 0) return 0;

    // Calculate score based on keyword coverage and match strength
    const totalKeywords = keywords.length;
    const matchedKeywords = matches.length;
    const totalMatches = matches.reduce((sum, match) => sum + match.matches, 0);

    // Combine keyword coverage (0-1) with match density
    const coverage = matchedKeywords / totalKeywords;
    const density = Math.min(totalMatches / text.split(/\s+/).length, 1);

    return coverage * 0.7 + density * 0.3;
  }

  private calculateLabelsScore(labels: string[], keywords: string[]): number {
    if (!labels || labels.length === 0 || keywords.length === 0) return 0;

    const labelText = labels.join(" ");
    return this.calculateTextScore(labelText, keywords);
  }

  private calculateActivityScore(issue: GitHubIssue): number {
    try {
      const now = new Date();

      // Handle malformed or missing date data
      let updateDate: Date;
      if (
        issue.updatedAt instanceof Date &&
        !isNaN(issue.updatedAt.getTime())
      ) {
        updateDate = issue.updatedAt;
      } else if (
        issue.createdAt instanceof Date &&
        !isNaN(issue.createdAt.getTime())
      ) {
        // Fallback to creation date if update date is invalid
        updateDate = issue.createdAt;
      } else {
        // If both dates are invalid, assume very old issue
        console.warn(
          `Invalid date data for issue ${issue.id}, using default low activity score`
        );
        return 0.1;
      }

      const daysSinceUpdate =
        (now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24);

      // Handle negative values (future dates) or extremely large values
      if (daysSinceUpdate < 0) {
        console.warn(
          `Future date detected for issue ${issue.id}, using current date`
        );
        return 1.0;
      }

      if (daysSinceUpdate > 10000) {
        // More than ~27 years
        console.warn(
          `Extremely old date detected for issue ${issue.id}, using minimum score`
        );
        return 0.1;
      }

      // More recent activity gets higher score
      // Score decreases exponentially with age
      if (daysSinceUpdate <= 7) return 1.0;
      if (daysSinceUpdate <= 30) return 0.8;
      if (daysSinceUpdate <= 90) return 0.6;
      if (daysSinceUpdate <= 180) return 0.4;
      if (daysSinceUpdate <= 365) return 0.2;
      return 0.1;
    } catch (error: any) {
      console.warn(
        `Error calculating activity score for issue ${issue?.id}: ${error.message}`
      );
      return 0.1; // Default to low activity score on error
    }
  }

  private findExactMatches(text: string, keyword: string): number[] {
    const positions: number[] = [];
    let index = 0;

    while ((index = text.indexOf(keyword, index)) !== -1) {
      positions.push(index);
      index += keyword.length;
    }

    return positions;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "by",
      "for",
      "from",
      "has",
      "he",
      "in",
      "is",
      "it",
      "its",
      "of",
      "on",
      "that",
      "the",
      "to",
      "was",
      "will",
      "with",
      "or",
      "but",
      "not",
      "this",
      "have",
      "had",
      "what",
      "when",
      "where",
      "who",
      "which",
      "why",
      "how",
    ]);
    return stopWords.has(word.toLowerCase());
  }
}
