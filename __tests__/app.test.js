process.env.INTERNAL_API_KEY = "test-internal-key-123";
jest.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: jest.fn((options) => (req, res) => {
    res.json({ proxied: true, target: options.target });
  }),
}));
const request = require("supertest");
const { createProxyMiddleware } = require("http-proxy-middleware");
const app = require("../app");

describe("api-gateway-service", () => {
  it("GET /health should return status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", gateway: "up" });
  });

  it("GET /metrics should return prometheus metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.text).toEqual(expect.stringContaining("http_request_duration_seconds"));
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

  it("unknown route should be proxied to frontend (catch-all fallback)", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
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

  describe("proxyErrorHandler", () => {
    it("logue l'erreur et repond 502 si headers pas encore envoyes", () => {
      const authOptions = createProxyMiddleware.mock.calls[0][0];
      const req = { path: "/api/auth/login", method: "POST" };
      const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };

      authOptions.onError(new Error("ECONNREFUSED"), req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({ error: "Bad Gateway: auth-service unreachable" });
    });

    it("ne repond rien si headers deja envoyes", () => {
      const authOptions = createProxyMiddleware.mock.calls[0][0];
      const req = { path: "/api/auth/login", method: "POST" };
      const res = { headersSent: true, status: jest.fn().mockReturnThis(), json: jest.fn() };

      authOptions.onError(new Error("boom"), req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
