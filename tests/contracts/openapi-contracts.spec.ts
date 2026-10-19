import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(__dirname, "../..");
const openapiPath = resolve(rootDir, "contracts/openapi.json");
const examplesPath = resolve(rootDir, "fixtures/catalog/examples.json");

test.describe("Independent Contract Verification: OpenAPI Schemas and Fixtures", () => {
  const openapi = JSON.parse(readFileSync(openapiPath, "utf8"));
  const examples = JSON.parse(readFileSync(examplesPath, "utf8"));

  test("All candidate endpoints start with /api/v1", () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      expect(
        path.startsWith("/api/v1"),
        `Path ${path} must start with /api/v1`
      ).toBe(true);
    }
  });

  test("Contract includes mandatory candidate routes", () => {
    const paths = Object.keys(openapi.paths);
    const requiredPaths = [
      "/api/v1/health/live",
      "/api/v1/health/ready",
      "/api/v1/catalog/products",
      "/api/v1/catalog/products/{slug}",
      "/api/v1/catalog/categories",
      "/api/v1/catalog/facets",
      "/api/v1/locations/metros",
      "/api/v1/me/bootstrap",
      "/api/v1/me",
      "/api/v1/me/preferences",
      "/api/v1/me/lender-profile",
      "/api/v1/lender/products",
      "/api/v1/lender/products/{id}",
    ];

    for (const reqPath of requiredPaths) {
      expect(paths, `OpenAPI missing required route ${reqPath}`).toContain(reqPath);
    }
  });

  test("Standard Error envelope schema is defined with code, message, details, request_id", () => {
    const schemas = openapi.components?.schemas;
    expect(schemas, "OpenAPI components.schemas must be defined").toBeDefined();

    const errorSchema = schemas["Error"];
    expect(errorSchema, "Error schema must exist in openapi.json").toBeDefined();

    const errorBodySchema = schemas["ErrorBody"];
    expect(errorBodySchema, "ErrorBody schema must exist in openapi.json").toBeDefined();

    // Verify Error schema has error property and request_id
    expect(errorSchema.properties?.error).toBeDefined();
    expect(errorSchema.properties?.request_id).toBeDefined();

    // Verify ErrorBody has code, message, details
    expect(errorBodySchema.properties?.code).toBeDefined();
    expect(errorBodySchema.properties?.message).toBeDefined();
    expect(errorBodySchema.properties?.details).toBeDefined();
  });

  test("Write schemas do not accept caller-controlled owner ID, lender ID, or admin role", () => {
    const schemas = openapi.components?.schemas;
    const writeSchemas = ["ProductWrite", "UserWrite", "LenderProfileWrite", "ProductPatch"];

    for (const name of writeSchemas) {
      const schema = schemas[name];
      if (schema?.properties) {
        expect(
          schema.properties.user_id,
          `${name} must not allow client user_id`
        ).toBeUndefined();
        expect(
          schema.properties.lender_profile_id,
          `${name} must not allow client lender_profile_id`
        ).toBeUndefined();
        expect(
          schema.properties.is_admin,
          `${name} must not allow client is_admin`
        ).toBeUndefined();
        expect(
          schema.properties.role,
          `${name} must not allow client role string override`
        ).toBeUndefined();
      }
    }
  });

  test("Examples fixture provides request/response examples for declared operations", () => {
    expect(examples.cases).toBeDefined();
    expect(Array.isArray(examples.cases)).toBe(true);
    expect(examples.cases.length).toBeGreaterThanOrEqual(15);

    // Verify each case has operation_id, request, response with status
    for (const opCase of examples.cases) {
      expect(opCase.operation_id, "Example case must have operation_id").toBeTruthy();
      expect(opCase.request, `Case ${opCase.operation_id} must have request`).toBeDefined();
      expect(opCase.response, `Case ${opCase.operation_id} must have response`).toBeDefined();
      expect(typeof opCase.response.status).toBe("number");
    }
  });
});

