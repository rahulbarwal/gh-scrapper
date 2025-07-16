export interface GitHubIssue {
  id: number;
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
}

export interface Config {
  githubToken: string;
  repository: string;
  productArea: string;
  maxIssues: number;
  minRelevanceScore: number;
  outputPath: string;
}
