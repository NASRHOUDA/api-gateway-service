process.env.INTERNAL_API_KEY = "test-internal-key-123";

jest.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: jest.fn((options) => (req, res) => {
    res.json({ proxied: true, target: options.target });
  }),
}));

const request = require("supertest");
const app = require("../app");

describe("api-gateway-service", () => {
  it("GET /health should return status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", gateway: "up" });
  });

  it("GET /api/auth/* should be proxied", async () => {
    const res = await request(app).get("/api/auth/whatever");
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  it("GET /api/tasks should be proxied", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  it("unknown route should return 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found in gateway" });
  });

  it("GET /internal/tasks/* without internal key should be forbidden", async () => {
    const res = await request(app).get("/internal/tasks/overdue");
    expect(res.status).toBe(403);
  });

  it("GET /internal/tasks/* with wrong internal key should be forbidden", async () => {
    const res = await request(app)
      .get("/internal/tasks/overdue")
      .set("x-internal-api-key", "wrong-key");
    expect(res.status).toBe(403);
  });

  it("GET /internal/tasks/* with correct internal key should be proxied", async () => {
    const res = await request(app)
      .get("/internal/tasks/overdue")
      .set("x-internal-api-key", "test-internal-key-123");
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  it("GET /internal/users/* with correct internal key should be proxied", async () => {
    const res = await request(app)
      .get("/internal/users/abc")
      .set("x-internal-api-key", "test-internal-key-123");
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });
});
