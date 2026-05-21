const express = require("express");
const { Op } = require("sequelize");
const { authenticate } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { logQuerySchema } = require("../validators/schemas");
const { Log, User, Group, Resource } = require("../models");

const router = express.Router();

router.use(authenticate);

function canSeeAllLogs(user) {
  return ["admin", "security"].includes(user.role);
}

function buildLogWhere(req) {
  const { user, action, status, date, search } = req.validated.query;
  const where = {};

  if (!canSeeAllLogs(req.user)) {
    where.actor = req.user.username;
  } else if (user) {
    where.actor = { [Op.like]: `%${user}%` };
  }
  if (action) where.action = { [Op.like]: `%${action}%` };
  if (status) where.status = { [Op.like]: `%${status}%` };
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    if (!Number.isNaN(start.getTime())) {
      where.createdAt = { [Op.between]: [start, end] };
    }
  }
  if (search) {
    where[Op.or] = [
      { actor: { [Op.like]: `%${search}%` } },
      { action: { [Op.like]: `%${search}%` } },
      { status: { [Op.like]: `%${search}%` } },
      { details: { [Op.like]: `%${search}%` } },
    ];
  }

  return where;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

router.get("/", validate(logQuerySchema), asyncRoute(async (req, res) => {
  const query = {
    order: [["createdAt", "DESC"]],
    limit: 200,
    where: buildLogWhere(req),
  };

  const logs = await Log.findAll(query);
  res.json({ logs });
}));

router.get("/export.csv", validate(logQuerySchema), asyncRoute(async (req, res) => {
  if (!canSeeAllLogs(req.user)) {
    return res.status(403).json({ message: "Solo admin/security pueden exportar logs" });
  }

  const logs = await Log.findAll({
    where: buildLogWhere(req),
    order: [["createdAt", "DESC"]],
    limit: 5000,
  });
  const rows = [
    ["fecha", "usuario", "accion", "estado", "detalles"],
    ...logs.map((log) => [log.createdAt.toISOString(), log.actor, log.action, log.status, log.details]),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=iam-logs.csv");
  return res.send(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
}));

router.get("/stats", asyncRoute(async (req, res) => {
  const [totalUsers, activeUsers, totalGroups, totalResources, totalLogs, failedAttempts, deniedAccess, mfaEnabled] = await Promise.all([
    User.count(),
    User.count({ where: { isActive: true } }),
    Group.count(),
    Resource.count(),
    Log.count(),
    Log.count({ where: { status: { [Op.like]: "%FAILED%" } } }),
    Log.count({ where: { [Op.or]: [{ status: "DENIED" }, { status: "BLOCKED" }, { status: "USER_BLOCKED" }, { action: { [Op.like]: "%DENIED%" } }] } }),
    User.count({ where: { twoFactorEnabled: true } }),
  ]);
  res.json({
    stats: { totalUsers, activeUsers, totalGroups, totalResources, totalLogs, failedAttempts, deniedAccess, mfaEnabled },
  });
}));

router.get("/alerts", asyncRoute(async (req, res) => {
  if (!canSeeAllLogs(req.user)) {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }
  const logs = await Log.findAll({
    where: {
      [Op.or]: [
        { status: { [Op.in]: ["USER_BLOCKED", "BLOCKED", "DENIED", "EXPIRED"] } },
        { action: { [Op.like]: "%TRAVERSAL%" } },
        { action: { [Op.like]: "%DENIED%" } },
        { action: { [Op.like]: "%PERMISSION_EXPIRED%" } },
      ],
    },
    order: [["createdAt", "DESC"]],
    limit: 50,
  });
  res.json({ alerts: logs });
}));

module.exports = router;
