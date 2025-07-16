import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ConfigManager } from "../config";

// Mock fs-extra
jest.mock("fs-extra");

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  const mockConfigPath = path.join(
    os.homedir(),
    ".github-issue-scraper",
    "config.json"
  );

  beforeEach(() => {
    configManager = new ConfigManager();
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.PRODUCT_AREA;
  });

  describe("loadConfig", () => {
    it("should load configuration from environment variables", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.PRODUCT_AREA = "test-area";

      (fs.pathExists as jest.Mock).mockResolvedValue(false);

      const config = await configManager.loadConfig();

      expect(config.githubToken).toBe("test-token");
      expect(config.repository).toBe("owner/repo");
      expect(config.productArea).toBe("test-area");
    });

    it("should load configuration from file when it exists", async () => {
      const fileConfig = {
        repository: "file/repo",
        productArea: "file-area",
        maxIssues: 100,
      };

      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.readJson as jest.Mock).mockResolvedValue(fileConfig);

      const config = await configManager.loadConfig();

      expect(config.repository).toBe("file/repo");
      expect(config.productArea).toBe("file-area");
      expect(config.maxIssues).toBe(100);
    });

    it("should prioritize environment variables over file config", async () => {
      process.env.GITHUB_REPOSITORY = "env/repo";

      const fileConfig = {
        repository: "file/repo",
        productArea: "file-area",
      };

      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.readJson as jest.Mock).mockResolvedValue(fileConfig);

      const config = await configManager.loadConfig();

      expect(config.repository).toBe("env/repo"); // env takes precedence
      expect(config.productArea).toBe("file-area"); // file value used when env not set
    });
  });

  describe("saveConfig", () => {
    it("should save configuration to file without token", async () => {
      const configToSave = {
        repository: "test/repo",
        productArea: "test-area",
        maxIssues: 50,
      };

      (fs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeJson as jest.Mock).mockResolvedValue(undefined);

      await configManager.saveConfig(configToSave);

      expect(fs.ensureDir).toHaveBeenCalledWith(path.dirname(mockConfigPath));
      expect(fs.writeJson).toHaveBeenCalledWith(mockConfigPath, configToSave, {
        spaces: 2,
      });
    });

    it("should exclude GitHub token from saved file", async () => {
      const configToSave = {
        githubToken: "secret-token",
        repository: "test/repo",
        productArea: "test-area",
      };

      (fs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeJson as jest.Mock).mockResolvedValue(undefined);

      await configManager.saveConfig(configToSave);

      const savedConfig = (fs.writeJson as jest.Mock).mock.calls[0][1];
      expect(savedConfig.githubToken).toBeUndefined();
      expect(savedConfig.repository).toBe("test/repo");
    });
  });

  describe("isConfigComplete", () => {
    it("should return true when all required fields are present", () => {
      configManager.setGitHubToken("test-token");
      configManager["config"] = {
        githubToken: "test-token",
        repository: "test/repo",
        productArea: "test-area",
      };

      expect(configManager.isConfigComplete()).toBe(true);
    });

    it("should return false when required fields are missing", () => {
      configManager["config"] = {
        repository: "test/repo",
        // missing token and productArea
      };

      expect(configManager.isConfigComplete()).toBe(false);
    });
  });

  describe("getMissingFields", () => {
    it("should return array of missing required fields", () => {
      configManager["config"] = {
        repository: "test/repo",
        // missing token and productArea
      };

      const missing = configManager.getMissingFields();
      expect(missing).toContain("GitHub Token");
      expect(missing).toContain("Product Area");
      expect(missing).not.toContain("Repository");
    });

    it("should return empty array when all fields are present", () => {
      configManager.setGitHubToken("test-token");
      configManager["config"] = {
        githubToken: "test-token",
        repository: "test/repo",
        productArea: "test-area",
      };

      const missing = configManager.getMissingFields();
      expect(missing).toHaveLength(0);
    });
  });

  describe("setDefaults", () => {
    it("should set default values for optional configuration", () => {
      configManager.setDefaults();
      const config = configManager.getConfig();

      expect(config.maxIssues).toBe(50);
      expect(config.minRelevanceScore).toBe(30);
      expect(config.outputPath).toBe("./reports");
    });

    it("should not override existing values", () => {
      configManager["config"] = {
        maxIssues: 100,
        outputPath: "./custom",
      };

      configManager.setDefaults();
      const config = configManager.getConfig();

      expect(config.maxIssues).toBe(100); // existing value preserved
      expect(config.minRelevanceScore).toBe(30); // default set
      expect(config.outputPath).toBe("./custom"); // existing value preserved
    });
  });
});
