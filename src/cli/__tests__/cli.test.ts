import { GitHubIssueScraperCLI } from "../index";
import { ConfigManager } from "../../services/config";
import { AuthenticationService } from "../../services/auth";
import { SetupService } from "../../services/setup";

// Mock dependencies
jest.mock("../../services/config");
jest.mock("../../services/auth");
jest.mock("../../services/setup");
jest.mock("../../services/jan-client", () => ({
  JANClient: jest.fn().mockImplementation(() => ({
    validateConnection: jest.fn().mockResolvedValue(true),
    validateModel: jest.fn().mockResolvedValue(true),
    getOptions: jest.fn().mockReturnValue({
      endpoint: "http://localhost:1337",
      model: "llama2",
    }),
  })),
}));

// Mock fetch for model listing
global.fetch = jest.fn().mockImplementation((url) => {
  if (url.includes("/v1/models")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: "llama2" }, { id: "mistral" }, { id: "gpt-3.5-turbo" }],
        }),
    });
  }
  return Promise.reject(new Error(`Unexpected URL: ${url}`));
}) as jest.Mock;

describe("GitHubIssueScraperCLI", () => {
  let cli: GitHubIssueScraperCLI;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  let mockSetupService: jest.Mocked<SetupService>;

  // Mock console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    jest.clearAllMocks();

    // Silence console output during tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Setup mocks
    mockConfigManager = new ConfigManager() as jest.Mocked<ConfigManager>;
    mockAuthService =
      new AuthenticationService() as jest.Mocked<AuthenticationService>;
    mockSetupService = new SetupService() as jest.Mocked<SetupService>;

    // Mock loadConfig to return empty config
    mockConfigManager.loadConfig = jest.fn().mockResolvedValue({});
    mockConfigManager.getConfig = jest.fn().mockReturnValue({});
    mockConfigManager.saveConfig = jest.fn().mockResolvedValue(undefined);
    mockConfigManager.setDefaults = jest.fn();
    mockConfigManager.getGitHubToken = jest.fn().mockReturnValue("mock-token");
    mockConfigManager.getJANEndpoint = jest
      .fn()
      .mockReturnValue("http://localhost:1337");
    mockConfigManager.getJANModel = jest.fn().mockReturnValue("llama2");

    // Mock auth service
    mockAuthService.validateToken = jest.fn().mockResolvedValue({
      isValid: true,
      user: { login: "testuser", name: "Test User" },
      rateLimit: { limit: 5000, remaining: 4999 },
    });
    mockAuthService.testRepositoryAccess = jest.fn().mockResolvedValue({
      hasAccess: true,
    });

    // Mock setup service
    mockSetupService.runInteractiveSetup = jest.fn().mockResolvedValue(true);

    // Create CLI instance
    cli = new GitHubIssueScraperCLI();
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe("JAN configuration", () => {
    it("should handle --test-jan option", async () => {
      // Mock process.argv
      process.argv = ["node", "cli.js", "--test-jan"];

      // Start CLI
      await cli.start();

      // Verify JAN connectivity test was called
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Testing JAN connectivity")
      );
    });

    it("should handle custom JAN endpoint", async () => {
      // Mock process.argv
      process.argv = ["node", "cli.js", "--jan-endpoint", "http://custom:8080"];

      // Mock validateAndMergeConfig to capture the config
      let capturedConfig: any;
      (cli as any).validateAndMergeConfig = jest
        .fn()
        .mockImplementation((options) => {
          capturedConfig = options;
          return Promise.resolve({
            githubToken: "mock-token",
            repository: "owner/repo",
            productArea: "test",
            maxIssues: 50,
            minRelevanceScore: 30,
            outputPath: "./reports",
            janEndpoint: options.janEndpoint,
            janModel: options.janModel || "llama2",
          });
        });

      // Mock validateAuthentication
      (cli as any).validateAuthentication = jest.fn().mockResolvedValue(true);

      // Mock executeScraping
      (cli as any).executeScraping = jest.fn().mockResolvedValue({});

      // Start CLI
      await cli.start();

      // Verify custom endpoint was used
      expect(capturedConfig.janEndpoint).toBe("http://custom:8080");
    });

    it("should handle custom JAN model", async () => {
      // Mock process.argv
      process.argv = ["node", "cli.js", "--jan-model", "mistral"];

      // Mock validateAndMergeConfig to capture the config
      let capturedConfig: any;
      (cli as any).validateAndMergeConfig = jest
        .fn()
        .mockImplementation((options) => {
          capturedConfig = options;
          return Promise.resolve({
            githubToken: "mock-token",
            repository: "owner/repo",
            productArea: "test",
            maxIssues: 50,
            minRelevanceScore: 30,
            outputPath: "./reports",
            janEndpoint: options.janEndpoint || "http://localhost:1337",
            janModel: options.janModel,
          });
        });

      // Mock validateAuthentication
      (cli as any).validateAuthentication = jest.fn().mockResolvedValue(true);

      // Mock executeScraping
      (cli as any).executeScraping = jest.fn().mockResolvedValue({});

      // Start CLI
      await cli.start();

      // Verify custom model was used
      expect(capturedConfig.janModel).toBe("mistral");
    });
  });
});
