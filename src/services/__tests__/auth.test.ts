import axios from "axios";
import { AuthenticationService } from "../auth";

// Mock axios
jest.mock("axios");
const mockAxios = axios as jest.Mocked<typeof axios>;

describe("AuthenticationService", () => {
  let authService: AuthenticationService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
    };
    mockAxios.create.mockReturnValue(mockClient);
    authService = new AuthenticationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validateToken", () => {
    it("should return valid result for successful authentication", async () => {
      const mockResponse = {
        data: {
          login: "testuser",
          name: "Test User",
          email: "test@example.com",
        },
        headers: {
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": "1640995200",
        },
      };

      mockClient.get.mockResolvedValue(mockResponse);

      const result = await authService.validateToken("valid-token");

      expect(result.isValid).toBe(true);
      expect(result.user).toEqual({
        login: "testuser",
        name: "Test User",
        email: "test@example.com",
      });
      expect(result.rateLimit).toEqual({
        limit: 5000,
        remaining: 4999,
        reset: new Date(1640995200 * 1000),
      });
      expect(mockClient.get).toHaveBeenCalledWith("/user", {
        headers: {
          Authorization: "Bearer valid-token",
        },
      });
    });

    it("should handle 401 unauthorized error", async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 401,
          statusText: "Unauthorized",
        },
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.validateToken("invalid-token");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "GitHub authentication failed. Your token is invalid or expired."
      );
    });

    it("should handle 403 forbidden error", async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "x-ratelimit-remaining": "100", // Not rate limited
          },
        },
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.validateToken("limited-token");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "GitHub access forbidden. Your token may lack required permissions."
      );
    });

    it("should handle network timeout error", async () => {
      const error = {
        code: "ECONNABORTED",
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.validateToken("any-token");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "Request timed out. The GitHub API is taking too long to respond."
      );
    });

    it("should handle network connection error", async () => {
      const error = {
        code: "ENOTFOUND",
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.validateToken("any-token");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "Network connection failed. Unable to reach GitHub API."
      );
    });
  });

  describe("testRepositoryAccess", () => {
    it("should return success for accessible repository", async () => {
      mockClient.get.mockResolvedValue({ data: {} });

      const result = await authService.testRepositoryAccess(
        "valid-token",
        "owner/repo"
      );

      expect(result.hasAccess).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockClient.get).toHaveBeenCalledWith("/repos/owner/repo", {
        headers: {
          Authorization: "Bearer valid-token",
        },
      });
    });

    it("should handle invalid repository format", async () => {
      const result = await authService.testRepositoryAccess(
        "valid-token",
        "invalid-format"
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toBe(
        "Invalid repository format. Expected format: owner/repository"
      );
    });

    it("should handle 404 repository not found", async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 404,
          statusText: "Not Found",
        },
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.testRepositoryAccess(
        "valid-token",
        "owner/nonexistent"
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toBe("Repository not found: owner/nonexistent");
    });

    it("should handle 403 access denied", async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 403,
          statusText: "Forbidden",
        },
      };

      mockClient.get.mockRejectedValue(error);

      const result = await authService.testRepositoryAccess(
        "valid-token",
        "private/repo"
      );

      expect(result.hasAccess).toBe(false);
      expect(result.error).toBe("Access denied to repository: private/repo");
    });
  });

  describe("getAuthenticatedClient", () => {
    it("should create authenticated axios client with correct configuration", () => {
      const token = "test-token";

      authService.getAuthenticatedClient(token);

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: "https://api.github.com",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: "Bearer test-token",
          "User-Agent": "github-issue-scraper/1.0.0",
        },
        timeout: 30000,
      });
    });
  });
});
