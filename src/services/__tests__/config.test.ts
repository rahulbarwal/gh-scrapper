import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ConfigManager } from "../config";

// Mock fs-extra
jest.mock("fs-extra");
const mockedFs = fs as jest.Mocked<typeof fs>;

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  const testConfigPath = path.join(
    os.homedir(),
    ".github-issue-scraper",
    "config.json"
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigManager();
  });

  describe("loadConfig", () => {
    it("should load configuration from file", async () => {
      const mockConfig = {
        repository: "test/repo",
        productArea: "test-area",
        janEndpoint: "http://custom-jan:8080",
        janModel: "custom-model",
      };

      mockedFs.pathExists.mockResolvedValueOnce(true);
      mockedFs.readJson.mockResolvedValueOnce(mockConfig);

      const config = await configManager.loadConfig();

      expect(config).toEqual(mockConfig);
      expect(mockedFs.pathExists).toHaveBeenCalledWith(testConfigPath);
      expect(mockedFs.readJson).toHaveBeenCalledWith(testConfigPath);
    });

    it("should load configuration from environment variables", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "env/repo";
      process.env.JAN_ENDPOINT = "http://env-jan:8080";
      process.env.JAN_MODEL = "env-model";

      mockedFs.pathExists.mockResolvedValueOnce(false);

      const config = await configManager.loadConfig();

      expect(config.githubToken).toEqual("test-token");
      expect(config.repository).toEqual("env/repo");
      expect(config.janEndpoint).toEqual("http://env-jan:8080");
      expect(config.janModel).toEqual("env-model");

      // Clean up
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.JAN_ENDPOINT;
      delete process.env.JAN_MODEL;
    });

    it("should prioritize environment variables over file config", async () => {
      process.env.JAN_ENDPOINT = "http://env-jan:8080";
      process.env.JAN_MODEL = "env-model";

      const mockConfig = {
        repository: "test/repo",
        productArea: "test-area",
        janEndpoint: "http://file-jan:8080",
        janModel: "file-model",
      };

      mockedFs.pathExists.mockResolvedValueOnce(true);
      mockedFs.readJson.mockResolvedValueOnce(mockConfig);

      const config = await configManager.loadConfig();

      expect(config.repository).toEqual("test/repo");
      expect(config.productArea).toEqual("test-area");
      expect(config.janEndpoint).toEqual("http://env-jan:8080");
      expect(config.janModel).toEqual("env-model");

      // Clean up
      delete process.env.JAN_ENDPOINT;
      delete process.env.JAN_MODEL;
    });
  });

  describe("validateJANConfig", () => {
    it("should validate valid JAN configuration", async () => {
      await configManager.saveConfig({
        janEndpoint: "http://valid-jan:8080",
        janModel: "valid-model",
      });

      const validation = configManager.validateJANConfig();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should detect missing JAN endpoint", async () => {
      await configManager.saveConfig({
        janModel: "valid-model",
      });

      const validation = configManager.validateJANConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain("JAN endpoint is not configured");
    });

    it("should detect invalid JAN endpoint URL", async () => {
      await configManager.saveConfig({
        janEndpoint: "invalid-url",
        janModel: "valid-model",
      });

      const validation = configManager.validateJANConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain("Invalid JAN endpoint URL");
    });

    it("should detect missing JAN model", async () => {
      await configManager.saveConfig({
        janEndpoint: "http://valid-jan:8080",
      });

      const validation = configManager.validateJANConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain("JAN model is not configured");
    });
  });

  describe("getJANEndpoint and getJANModel", () => {
    it("should get JAN endpoint from config", async () => {
      await configManager.saveConfig({
        janEndpoint: "http://config-jan:8080",
      });

      const endpoint = configManager.getJANEndpoint();
      expect(endpoint).toEqual("http://config-jan:8080");
    });

    it("should get JAN endpoint from environment", async () => {
      process.env.JAN_ENDPOINT = "http://env-jan:8080";

      const endpoint = configManager.getJANEndpoint();
      expect(endpoint).toEqual("http://env-jan:8080");

      // Clean up
      delete process.env.JAN_ENDPOINT;
    });

    it("should use default JAN endpoint if not configured", () => {
      const endpoint = configManager.getJANEndpoint();
      expect(endpoint).toEqual("http://localhost:1337");
    });

    it("should get JAN model from config", async () => {
      await configManager.saveConfig({
        janModel: "config-model",
      });

      const model = configManager.getJANModel();
      expect(model).toEqual("config-model");
    });

    it("should get JAN model from environment", async () => {
      process.env.JAN_MODEL = "env-model";

      const model = configManager.getJANModel();
      expect(model).toEqual("env-model");

      // Clean up
      delete process.env.JAN_MODEL;
    });

    it("should use default JAN model if not configured", () => {
      const model = configManager.getJANModel();
      expect(model).toEqual("llama2");
    });
  });

  describe("setDefaults", () => {
    it("should set default values for optional configuration", () => {
      configManager.setDefaults();
      const config = configManager.getConfig();

      expect(config.maxIssues).toEqual(50);
      expect(config.minRelevanceScore).toEqual(30);
      expect(config.outputPath).toEqual("./reports");
      expect(config.janEndpoint).toEqual("http://localhost:1337");
      expect(config.janModel).toEqual("llama2");
      expect(config.janMaxRetries).toEqual(3);
      expect(config.janTimeout).toEqual(60000);
    });

    it("should not override existing values", async () => {
      await configManager.saveConfig({
        maxIssues: 100,
        janEndpoint: "http://custom-jan:8080",
        janModel: "custom-model",
      });

      configManager.setDefaults();
      const config = configManager.getConfig();

      expect(config.maxIssues).toEqual(100);
      expect(config.janEndpoint).toEqual("http://custom-jan:8080");
      expect(config.janModel).toEqual("custom-model");
      expect(config.minRelevanceScore).toEqual(30); // Default
    });
  });
});
