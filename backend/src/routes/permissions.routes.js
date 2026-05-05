const express = require("express");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { permissionSchema, accessCheckSchema, idParam } = require("../validators/schemas");
const { User, Group, Resource, Permission, logEvent } = require("../models");
const { canManageResourcePermissions, explainAccess } = require("../services/accessControl");
const { getPermissionIdentity } = require("../services/resourceManager");

const router = express.Router();

router.use(authenticate);

function canUseGroupPermissionTarget(actor, group) {
  if (!actor || !group) return false;
  if (["admin", "security"].includes(actor.role)) return true;
  return group.creatorUserId === actor.id || (group.Users || []).some((user) => user.id === actor.id);
}

router.get("/", async (req, res) => {
  const include = [{ model: Resource }];
  if (!["admin", "security"].includes(req.user.role)) {
    include[0].where = { ownerUserId: req.user.id };
  }

  const permissions = await Permission.findAll({
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
});

router.post("/", validate(permissionSchema), async (req, res) => {
  const data = req.validated.body;
  const resource = await Resource.findByPk(data.resourceId);
  if (!resource) return res.status(404).json({ message: "Recurso no encontrado" });
  if (!canManageResourcePermissions(req.user, resource)) {
    return res.status(403).json({ message: "No puedes gestionar permisos de este recurso" });
  }

  const target =
    data.identityType === "user"
      ? await User.findByPk(data.identityId)
      : await Group.findByPk(data.identityId, {
        include: [{ model: User, attributes: ["id"], through: { attributes: [] } }],
      });

  if (!target) return res.status(404).json({ message: "Identidad no encontrada" });
  if (data.identityType === "group" && !canUseGroupPermissionTarget(req.user, target)) {
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
  await permission.update({ canRead: data.canRead, canWrite: data.canWrite });
  await logEvent(req.user.username, "UPSERT_PERMISSION", "SUCCESS", JSON.stringify(data));
  return res.status(201).json({ permission });
});

router.post("/check", validate(accessCheckSchema), async (req, res) => {
  const { userId, resourceId, action } = req.validated.body;
  const result = await explainAccess(userId, resourceId, action);
  const user = await User.findByPk(userId);
  const resource = await Resource.findByPk(resourceId);

  await logEvent(
    req.user.username,
    `CHECK_${action.toUpperCase()}`,
    result.allowed ? "ALLOWED" : "DENIED",
    `${user?.username || userId} -> ${resource?.path || resourceId}: ${result.reason}`,
  );

  return res.json(result);
});

router.delete("/:id", validate(idParam), async (req, res) => {
  const permission = await Permission.findByPk(req.validated.params.id, {
    include: [{ model: Resource }],
  });
  if (!permission) return res.status(404).json({ message: "Permiso no encontrado" });
  if (!canManageResourcePermissions(req.user, permission.Resource)) {
    return res.status(403).json({ message: "No puedes gestionar permisos de este recurso" });
  }

  await permission.destroy();
  await logEvent(req.user.username, "DELETE_PERMISSION", "SUCCESS");
  return res.status(204).send();
});

module.exports = router;
