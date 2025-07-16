import { GitHubIssue } from "../models";

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
    const keywords = this.extractKeywords(productArea);
    const finalWeights = { ...this.defaultWeights, ...weights };

    const titleScore = this.calculateTextScore(issue.title, keywords);
    const labelsScore = this.calculateLabelsScore(issue.labels, keywords);
    const descriptionScore = this.calculateTextScore(
      issue.description,
      keywords
    );
    const activityScore = this.calculateActivityScore(issue);

    const totalScore =
      titleScore * finalWeights.title +
      labelsScore * finalWeights.labels +
      descriptionScore * finalWeights.description +
      activityScore * finalWeights.activity;

    return Math.round(totalScore * 100) / 100; // Round to 2 decimal places
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
    const now = new Date();
    const daysSinceUpdate =
      (now.getTime() - issue.updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    // More recent activity gets higher score
    // Score decreases exponentially with age
    if (daysSinceUpdate <= 7) return 1.0;
    if (daysSinceUpdate <= 30) return 0.8;
    if (daysSinceUpdate <= 90) return 0.6;
    if (daysSinceUpdate <= 180) return 0.4;
    if (daysSinceUpdate <= 365) return 0.2;
    return 0.1;
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
