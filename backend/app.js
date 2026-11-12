import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { AppError, ERROR_CODES } from "../shared/errors.js";
import { env, ROOT_DIR } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { requestLogger } from "./middleware/requestLogger.js";

const app = express();

app.disable("x-powered-by");

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestLogger);

app.use(
  helmet({
    // The React app and Leaflet tiles need broader policies than Helmet's
    // defaults, and the bundled frontend is not served inline by this app.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(
        new AppError(ERROR_CODES.FORBIDDEN, "This origin is not allowed to call the API.")
      );
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Token", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
    maxAge: 600,
  })
);

app.use(express.json({ limit: env.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: env.bodyLimit }));

// Uploaded images and the built frontend bundle.
app.use(
  "/uploads",
  express.static(env.uploads.directory, {
    fallthrough: false,
    index: false,
    maxAge: "7d",
    dotfiles: "ignore",
  })
);

app.use(
  "/assets",
  express.static(path.join(ROOT_DIR, "assets"), {
    index: false,
    // The bundle filenames are not content-hashed, so a long cache would keep
    // serving an older build after a redeploy. Revalidate with ETag instead.
    maxAge: 0,
    etag: true,
    dotfiles: "ignore",
  })
);

app.get("/api", (_req, res) => {
  res.json({
    success: true,
    name: "Nagarik Bhopal API",
    version: "1.0.0",
    documentation: "/api/health",
  });
});

app.use("/api", globalLimiter, routes);
app.use("/api", notFound);

const indexHtml = path.join(ROOT_DIR, "index.html");
const deepLinkHtml = (() => {
  try {
    const html = fs.readFileSync(indexHtml, "utf8");
    return html.includes("<base ")
      ? html
      : html.replace(/<head>/i, '<head>\n    <base href="/" />');
  } catch {
    return null;
  }
})();

app.get("/", (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);

  return res.json({
    success: true,
    message: "Nagarik Bhopal API running",
    health: "/api/health",
  });
});

// Client-side routes such as /dashboard are served the SPA shell. A base tag
// keeps the relative asset URLs in index.html resolving from the site root.
app.get(/^\/(?!api\/|uploads\/|assets\/).*/, (req, res, next) => {
  if (!deepLinkHtml) return next();

  return res.type("html").send(deepLinkHtml);
});

app.use(errorHandler);

export default app;
