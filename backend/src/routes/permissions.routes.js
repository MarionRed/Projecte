const express = require("express");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { permissionSchema, accessCheckSchema, idParam } = require("../validators/schemas");
const { User, Group, Resource, Permission, logEvent } = require("../models");
const { canManageResourcePermissions, explainAccess } = require("../services/accessControl");
const { getPermissionIdentity } = require("../services/resourceManager");

const router = express.Router();

router.use(authenticate);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function canUseGroupPermissionTarget(actor, group) {
  if (!actor || !group) return false;
  if (actor.role === "admin") return true;
  return group.creatorUserId === actor.id || (group.Users || []).some((user) => user.id === actor.id);
}

router.get("/", asyncRoute(async (req, res) => {
  if (req.user.role === "security") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }

  const include = [{ model: Resource }];
  const where = { identityType: "group" };
  if (req.user.role !== "admin") {
    include[0].where = { ownerUserId: req.user.id, isPrivate: false };
  }

  const permissions = await Permission.findAll({
    where,
    include,
    order: [["id", "ASC"]],
  });
  const enriched = await Promise.all(
    permissions.map(async (permission) => {
      const plain = permission.toJSON();
      plain.identity = await getPermissionIdentity(permission);
      return plain;
    }),
  );
  res.json({ permissions: enriched });
}));

router.post("/", validate(permissionSchema), asyncRoute(async (req, res) => {
  if (req.user.role === "security") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }

  const data = req.validated.body;
  const resource = await Resource.findByPk(data.resourceId);
  if (!resource) return res.status(404).json({ message: "Recurso no encontrado" });
  if (resource.isPrivate && req.user.role !== "admin") {
    return res.status(403).json({ message: "Los recursos privados no se pueden compartir" });
  }
  if (!canManageResourcePermissions(req.user, resource)) {
    return res.status(403).json({ message: "No puedes gestionar permisos de este recurso" });
  }

  const target = await Group.findByPk(data.identityId, {
    include: [{ model: User, attributes: ["id"], through: { attributes: [] } }],
  });

  if (!target) return res.status(404).json({ message: "Identidad no encontrada" });
  if (!canUseGroupPermissionTarget(req.user, target)) {
    return res.status(403).json({ message: "No puedes asignar permisos a este grupo" });
  }

  const [permission] = await Permission.findOrCreate({
    where: {
      identityType: data.identityType,
      identityId: data.identityId,
      resourceId: data.resourceId,
    },
    defaults: data,
  });
  await permission.update({ canRead: data.canRead, canWrite: data.canWrite, expiresAt: data.expiresAt || null });
  await logEvent(req.user.username, "UPSERT_PERMISSION", "SUCCESS", JSON.stringify(data));
  return res.status(201).json({ permission });
}));

router.post("/check", validate(accessCheckSchema), asyncRoute(async (req, res) => {
  if (req.user.role === "security") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }

  const { userId, resourceId, action } = req.validated.body;
  const result = await explainAccess(userId, resourceId, action);
  const resource = await Resource.findByPk(resourceId);
  const resourceDetail = resource?.isPrivate ? "recurso privado" : resource?.path || resourceId;

  await logEvent(
    req.user.username,
    `CHECK_${action.toUpperCase()}`,
    result.allowed ? "ALLOWED" : "DENIED",
    `${userId} -> ${resourceDetail}: ${result.reason}`,
  );

  return res.json(result);
}));

router.delete("/:id", validate(idParam), asyncRoute(async (req, res) => {
  if (req.user.role === "security") {
    return res.status(403).json({ message: "Permisos insuficientes" });
  }

  const permission = await Permission.findByPk(req.validated.params.id, {
    include: [{ model: Resource }],
  });
  if (!permission) return res.status(404).json({ message: "Permiso no encontrado" });
  if (permission.identityType !== "group") {
    return res.status(403).json({ message: "Solo se gestionan permisos de grupo" });
  }
  if (!canManageResourcePermissions(req.user, permission.Resource)) {
    return res.status(403).json({ message: "No puedes gestionar permisos de este recurso" });
  }

  await permission.destroy();
  await logEvent(req.user.username, "DELETE_PERMISSION", "SUCCESS");
  return res.status(204).send();
}));

module.exports = router;
