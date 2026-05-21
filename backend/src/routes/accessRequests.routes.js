const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const {
  accessRequestDecisionSchema,
  accessRequestSchema,
} = require("../validators/schemas");
const { AccessRequest, Permission, Resource, User, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

function includeRequestModels() {
  return [
    { model: User, attributes: ["id", "username"] },
    { model: Resource, attributes: ["id", "name", "path", "classification"] },
    { model: User, as: "decidedBy", attributes: ["id", "username"] },
  ];
}

router.get("/", asyncRoute(async (req, res) => {
  const where = req.user.role === "admin" ? {} : { userId: req.user.id };
  const requests = await AccessRequest.findAll({
    where,
    include: includeRequestModels(),
    order: [["createdAt", "DESC"]],
  });
  res.json({ requests });
}));

router.post("/", validate(accessRequestSchema), asyncRoute(async (req, res) => {
  const resource = await Resource.findByPk(req.validated.body.resourceId);
  if (!resource) return res.status(404).json({ message: "Recurso no encontrado" });

  const request = await AccessRequest.create({
    userId: req.user.id,
    resourceId: resource.id,
    action: req.validated.body.action,
    reason: req.validated.body.reason,
  });
  await logEvent(req.user.username, "ACCESS_REQUEST", "PENDING", `${req.validated.body.action} -> ${resource.path}`);
  const created = await AccessRequest.findByPk(request.id, { include: includeRequestModels() });
  return res.status(201).json({ request: created });
}));

router.patch("/:id", requireRole(["admin"]), validate(accessRequestDecisionSchema), asyncRoute(async (req, res) => {
  const request = await AccessRequest.findByPk(req.validated.params.id, {
    include: [{ model: Resource }, { model: User }],
  });
  if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
  if (request.status !== "pending") {
    return res.status(409).json({ message: "La solicitud ya fue resuelta" });
  }

  await request.update({
    status: req.validated.body.status,
    decidedAt: new Date(),
    decidedByUserId: req.user.id,
  });

  if (req.validated.body.status === "approved") {
    await Permission.findOrCreate({
      where: {
        identityType: "user",
        identityId: request.userId,
        resourceId: request.resourceId,
      },
      defaults: {
        identityType: "user",
        identityId: request.userId,
        resourceId: request.resourceId,
        canRead: true,
        canWrite: request.action === "write",
      },
    });
  }

  await logEvent(
    req.user.username,
    "ACCESS_REQUEST_DECISION",
    req.validated.body.status.toUpperCase(),
    `${request.User?.username || request.userId} -> ${request.Resource?.path || request.resourceId}`,
  );
  const updated = await AccessRequest.findByPk(request.id, { include: includeRequestModels() });
  return res.json({ request: updated });
}));

module.exports = router;
