const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const helmet = require("helmet");
const path = require("path");

require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/users.routes");
const groupRoutes = require("./routes/groups.routes");
const resourceRoutes = require("./routes/resources.routes");
const permissionRoutes = require("./routes/permissions.routes");
const logRoutes = require("./routes/logs.routes");
const appResourceRoutes = require("./routes/appResources.routes");

const app = express();

app.use(helmet());
if (process.env.CORS_ORIGIN) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }));
}
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "iam_clase_session",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, sameSite: "lax" },
  }),
);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/app/resources", appResourceRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/logs", logRoutes);

const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");

app.use(express.static(frontendDistPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(frontendDistPath, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.statusCode || 500)
    .json({ message: err.message || "Error interno del servidor" });
});

module.exports = app;
