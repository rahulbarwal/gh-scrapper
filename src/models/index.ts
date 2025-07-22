export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  description: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: Date;
  updatedAt: Date;
  author: string;
  url: string;
  comments: Comment[];
  relevanceScore: number;
  summary: string;
  workarounds: Workaround[];
  // Jan AI Analysis Results
  janAnalysis?: JanAnalysisResult;
}

export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: Date;
  isWorkaround: boolean;
  authorType: "maintainer" | "contributor" | "user";
}

export interface Workaround {
  description: string;
  author: string;
  authorType: "maintainer" | "contributor" | "user";
  commentId: number;
  effectiveness: "confirmed" | "suggested" | "partial";
  // Additional Jan AI analysis
  complexity?: "simple" | "moderate" | "complex" | "unknown";
  type?: "usage-level" | "code-level" | "architecture-level" | "unknown";
  implementationDifficulty?: "easy" | "medium" | "hard" | "unknown";
}

export interface JanAnalysisResult {
  relevanceScore: number; // 0-100
  relevanceReasoning: string;
  hasWorkaround: boolean;
  workaroundComplexity: "simple" | "moderate" | "complex" | "unknown";
  workaroundType:
    | "usage-level"
    | "code-level"
    | "architecture-level"
    | "unknown";
  workaroundDescription?: string;
  implementationDifficulty: "easy" | "medium" | "hard" | "unknown";
  summary: string;
}

export interface Config {
  githubToken: string;
  repository: string;
  productArea: string;
  maxIssues: number;
  minRelevanceScore: number;
  outputPath: string;
  // Jan AI Configuration
  janConfig?: {
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  };
}

export interface ScrapingMetadata {
  totalIssuesAnalyzed: number;
  relevantIssuesFound: number;
  averageRelevanceScore: number;
  workaroundsFound: number;
  analysisMethod: "jan-ai" | "manual-fallback" | "mixed";
  janConnectionStatus?: string;
}
