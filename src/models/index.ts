// Raw GitHub API response models
export interface RawGitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: { login: string };
  html_url: string;
  comments_url: string;
  comments: number;
}

export interface RawComment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
  author_association: string;
}

// LLM Analysis Response Models
export interface LLMAnalysisResponse {
  relevantIssues: AnalyzedIssue[];
  summary: {
    totalAnalyzed: number;
    relevantFound: number;
    topCategories: string[];
    analysisModel: string;
    processingError?: boolean;
    processingErrors?: number;
    totalBatches?: number;
  };
}

export interface AnalyzedIssue {
  id: number;
  title: string;
  relevanceScore: number;
  category: string;
  priority: "high" | "medium" | "low";
  summary: string;
  workarounds: LLMWorkaround[];
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export interface LLMWorkaround {
  description: string;
  author: string;
  authorType: "maintainer" | "contributor" | "user";
  effectiveness: "confirmed" | "suggested" | "partial";
  confidence: number;
}

// Enhanced GitHub Issue interface for LLM-processed data
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
  // LLM-generated fields
  relevanceScore: number;
  category: string;
  priority: "high" | "medium" | "low";
  summary: string;
  workarounds: LLMWorkaround[];
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: Date;
  authorType: "maintainer" | "contributor" | "user";
}

// JAN Client Models
export interface JANClientOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface JANPromptOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  responseFormat?: {
    type: "json_object";
  };
}

export interface JANMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JANCompletionRequest {
  model: string;
  messages: JANMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  response_format?: {
    type: "json_object";
  };
}

export interface JANCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Configuration Model with JAN integration
export interface Config {
  githubToken: string;
  repository: string;
  productArea: string;
  maxIssues: number;
  minRelevanceScore: number;
  outputPath: string;
  janEndpoint: string;
  janModel: string;
  janApiKey?: string;
  janMaxRetries?: number;
  janTimeout?: number;
}
