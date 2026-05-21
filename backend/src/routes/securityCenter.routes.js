const express = require("express");
const { Op } = require("sequelize");
const { authenticate, requireRole } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { attackSimulationSchema, securitySettingsSchema } = require("../validators/schemas");
const { Group, Log, Resource, SessionHistory, User, logEvent } = require("../models");
const { getSecuritySettings, saveSecuritySettings } = require("../services/securitySettings");

const router = express.Router();

router.use(authenticate);
router.use(requireRole(["admin", "security"]));

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function since24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function eventTypeFor(log) {
  const action = log.action.toUpperCase();
  const status = log.status.toUpperCase();
  const details = String(log.details || "").toUpperCase();
  if (action.includes("TRAVERSAL")) return "path_traversal_attempt";
  if (action.includes("SUSPICIOUS_LOGIN")) return "suspicious_login";
  if (action.includes("SIMULATED_ATTACK")) return "simulated_attack_blocked";
  if (status.includes("USER_BLOCKED") || status === "BLOCKED") return "account_locked";
  if (action.includes("LOGIN") && (status.includes("FAILED") || status.includes("NOT_FOUND"))) return "login_fail";
  if (action.includes("DENIED") || status === "DENIED") return "permission_denied";
  if (action.includes("PASSWORD_RECOVERY") || action.includes("PASSWORD_RESET")) return "password_reset";
  if (action.includes("PASSWORD_CHANGE")) return "password_change";
  if (action.includes("ROLE_CHANGE") || action.includes("UPDATE_USER")) return "role_change";
  if (action.includes("MFA_DISABLED") || action.includes("2FA_DISABLED")) return "mfa_disabled";
  if (action.includes("PERMISSION_EXPIRED") || status === "EXPIRED" || details.includes("EXPIR")) return "permission_expired";
  return "security_event";
}

function severityFor(log) {
  const action = log.action.toUpperCase();
  const status = log.status.toUpperCase();
  const details = String(log.details || "").toUpperCase();
  if (action.includes("TRAVERSAL") || action.includes("SIMULATED_ATTACK")) return "CRITICAL";
  if (action.includes("SUSPICIOUS_LOGIN")) return "HIGH";
  if (status.includes("USER_BLOCKED") || status === "BLOCKED") return "HIGH";
  if (action.includes("ROLE_CHANGE") || action.includes("REVOKE_SESSION")) return "HIGH";
  if (status === "DENIED" || action.includes("DENIED") || details.includes("EXPIR")) return "MEDIUM";
  if (status.includes("FAILED") || action.includes("PASSWORD")) return "MEDIUM";
  return "LOW";
}

function securityWhere(since = null) {
  const where = {
    [Op.or]: [
      { action: { [Op.like]: "%LOGIN%" } },
      { action: { [Op.like]: "%DENIED%" } },
      { action: { [Op.like]: "%TRAVERSAL%" } },
      { action: { [Op.like]: "%SUSPICIOUS_LOGIN%" } },
      { action: { [Op.like]: "%SIMULATED_ATTACK%" } },
      { action: { [Op.like]: "%PASSWORD%" } },
      { action: { [Op.like]: "%ROLE_CHANGE%" } },
      { action: { [Op.like]: "%MFA%" } },
      { action: { [Op.like]: "%2FA%" } },
      { action: { [Op.like]: "%REVOKE_SESSION%" } },
      { details: { [Op.like]: "%expir%" } },
      { status: { [Op.in]: ["DENIED", "FAILED_PASSWORD", "USER_BLOCKED", "BLOCKED", "EXPIRED"] } },
    ],
  };
  if (since) where.createdAt = { [Op.gte]: since };
  return where;
}

function enrichLog(log, sessionByUser = new Map()) {
  const plain = log.toJSON();
  const session = sessionByUser.get(log.actor);
  return {
    ...plain,
    eventType: eventTypeFor(log),
    severity: severityFor(log),
    ip: session?.ip || null,
    geoLabel: session?.geoLabel || null,
    suspicious: Boolean(session?.suspicious),
    suspiciousReason: session?.suspiciousReason || null,
  };
}

function calculateThreatLevel(events) {
  const severities = events.map((event) => event.severity);
  const critical = severities.filter((severity) => severity === "CRITICAL").length;
  const high = severities.filter((severity) => severity === "HIGH").length;
  const medium = severities.filter((severity) => severity === "MEDIUM").length;

  if (critical > 0) return "CRITICAL";
  if (high > 0 || medium >= 8) return "HIGH";
  if (medium >= 3 || events.length >= 6) return "MEDIUM";
  return "LOW";
}

async function buildMetrics() {
  const today = startOfToday();
  const recentSince = since24Hours();

  const [
    totalUsers,
    activeUsers,
    sessionsRegistered,
    logsToday,
    failedAttempts,
    deniedAccess,
    suspiciousLogins,
    restrictedResources,
    mfaEnabled,
    totalGroups,
    totalResources,
    totalLogs,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { isActive: true } }),
    SessionHistory.count(),
    Log.count({ where: { createdAt: { [Op.gte]: today } } }),
    Log.count({ where: { createdAt: { [Op.gte]: recentSince }, status: { [Op.like]: "%FAILED%" } } }),
    Log.count({
      where: {
        createdAt: { [Op.gte]: recentSince },
        [Op.or]: [{ status: "DENIED" }, { action: { [Op.like]: "%DENIED%" } }],
      },
    }),
    Log.count({ where: { createdAt: { [Op.gte]: recentSince }, action: "SUSPICIOUS_LOGIN" } }),
    Resource.count({ where: { classification: "restricted" } }),
    User.count({ where: { twoFactorEnabled: true } }),
    Group.count(),
    Resource.count(),
    Log.count(),
  ]);

  const [recentLogs, recentSessions, securityLogs] = await Promise.all([
    Log.findAll({ order: [["createdAt", "DESC"]], limit: 80 }),
    SessionHistory.findAll({
      include: [{ model: User, attributes: ["username"] }],
      order: [["createdAt", "DESC"]],
      limit: 120,
    }),
    Log.findAll({ where: securityWhere(recentSince), order: [["createdAt", "DESC"]], limit: 80 }),
  ]);

  const sessionByUser = new Map();
  for (const session of recentSessions) {
    const username = session.User?.username;
    if (username && !sessionByUser.has(username)) sessionByUser.set(username, session);
  }

  const securityEvents = securityLogs.map((log) => enrichLog(log, sessionByUser));
  const alerts = securityEvents.filter((event) => ["MEDIUM", "HIGH", "CRITICAL"].includes(event.severity)).slice(0, 20);

  return {
    cards: {
      totalUsers,
      activeUsers,
      sessionsRegistered,
      logsToday,
      failedAttempts,
      deniedAccess,
      suspiciousLogins,
      restrictedResources,
      mfaEnabled,
      totalGroups,
      totalResources,
      totalLogs,
    },
    threatLevel: calculateThreatLevel(securityEvents),
    alerts,
    recentActivity: recentLogs.slice(0, 30).map((log) => enrichLog(log, sessionByUser)),
    securityEvents: securityEvents.slice(0, 40),
  };
}

router.get("/metrics", asyncRoute(async (req, res) => {
  await logEvent(req.user.username, "view_security_center", "SUCCESS", `ip=${req.ip}`);
  const metrics = await buildMetrics();
  return res.json({ metrics });
}));

router.get("/report.csv", asyncRoute(async (req, res) => {
  const metrics = await buildMetrics();
  await logEvent(req.user.username, "EXPORT_SOC_REPORT", "SUCCESS", `threat=${metrics.threatLevel}`);

  const rows = [
    ["seccion", "clave", "valor", "fecha", "usuario", "accion", "estado", "nivel", "ip", "detalle"],
    ["summary", "threatLevel", metrics.threatLevel, "", "", "", "", "", "", ""],
    ...Object.entries(metrics.cards).map(([key, value]) => ["summary", key, value, "", "", "", "", "", "", ""]),
    ...metrics.securityEvents.map((event) => [
      "event",
      event.eventType,
      "",
      new Date(event.createdAt).toISOString(),
      event.actor,
      event.action,
      event.status,
      event.severity,
      event.ip || "",
      event.details || "",
    ]),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=iam-soc-report.csv");
  return res.send(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
}));

router.get("/settings", asyncRoute(async (req, res) => {
  const settings = await getSecuritySettings();
  return res.json({ settings });
}));

router.patch("/settings", validate(securitySettingsSchema), asyncRoute(async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Solo admin puede cambiar la configuracion" });
  }
  const settings = await saveSecuritySettings(req.validated.body);
  await logEvent(req.user.username, "UPDATE_SECURITY_SETTINGS", "SUCCESS", JSON.stringify(settings));
  return res.json({ settings });
}));

function simulationForAttack(attackType, target) {
  const payloads = {
    path_traversal: `GET /api/app/resources/${target || "../../.env"}`,
    brute_force: "POST /api/auth/login x5 credenciales invalidas",
    permission_probe: `POST /api/permissions/check recurso=${target}`,
    token_tamper: "Cookie token=jwt.modificado.manual",
  };
  const labels = {
    path_traversal: "Path traversal bloqueado",
    brute_force: "Brute force contenido",
    permission_probe: "Sondeo de permisos denegado",
    token_tamper: "JWT manipulado rechazado",
  };
  const controls = {
    path_traversal: "Validacion de rutas + directorio permitido",
    brute_force: "Politica de bloqueo temporal",
    permission_probe: "RBAC/ABAC + auditoria",
    token_tamper: "Verificacion de firma JWT",
  };

  return {
    title: labels[attackType],
    payload: payloads[attackType],
    control: controls[attackType],
    verdict: "BLOCKED",
    severity: attackType === "path_traversal" || attackType === "token_tamper" ? "CRITICAL" : "HIGH",
    timeline: [
      { step: "Entrada recibida", status: "captured" },
      { step: "Normalizacion y validacion", status: "inspected" },
      { step: controls[attackType], status: "matched" },
      { step: "Evento registrado en logs/SOC", status: "logged" },
      { step: "Ataque bloqueado", status: "blocked" },
    ],
  };
}

router.post("/simulate-attack", validate(attackSimulationSchema), asyncRoute(async (req, res) => {
  const { attackType, target } = req.validated.body;
  const simulation = simulationForAttack(attackType, target);
  await logEvent(
    req.user.username,
    "SIMULATED_ATTACK_BLOCKED",
    simulation.severity,
    `${attackType} · ${simulation.payload} · ${simulation.control}`,
  );
  if (attackType === "path_traversal") {
    await logEvent(req.user.username, "PATH_TRAVERSAL", "DENIED", `simulacion visual: ${simulation.payload}`);
  }
  return res.json({ simulation });
}));

module.exports = router;
