const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { permissionSchema, accessCheckSchema, idParam } = require("../validators/schemas");
const { User, Group, Resource, Permission, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

async function explainAccess(userId, resourceId, action) {
  const user = await User.findByPk(userId, {
    include: [{ model: Group, attributes: ["id", "name"], through: { attributes: [] } }],
  });
  const resource = await Resource.findByPk(resourceId);

  if (!user || !resource) {
    return { allowed: false, reason: "Usuario o recurso no encontrado" };
  }

  if (user.role === "admin") {
    return { allowed: true, reason: "El rol admin tiene acceso completo" };
  }

  if (resource.ownerUserId === user.id) {
    return { allowed: true, reason: "El usuario es propietario del recurso" };
  }

  const requiredField = action === "read" ? "canRead" : "canWrite";
  const userPermission = await Permission.findOne({
    where: { identityType: "user", identityId: user.id, resourceId: resource.id },
  });

  if (userPermission?.[requiredField]) {
    return { allowed: true, reason: `Permiso directo de usuario para ${action}` };
  }

  const groupIds = user.Groups.map((group) => group.id);
  const groupPermission = await Permission.findOne({
    where: { identityType: "group", identityId: groupIds, resourceId: resource.id },
  });

  if (groupPermission?.[requiredField]) {
    const group = user.Groups.find((item) => item.id === groupPermission.identityId);
    return { allowed: true, reason: `Permiso heredado del grupo ${group?.name || groupPermission.identityId}` };
  }

  return { allowed: false, reason: `No existe permiso ${action} para este usuario ni sus grupos` };
}

router.get("/", async (req, res) => {
  const permissions = await Permission.findAll({
    include: [{ model: Resource }],
    order: [["id", "ASC"]],
  });
  res.json({ permissions });
});

router.post("/", requireRole(["admin", "security"]), validate(permissionSchema), async (req, res) => {
  const data = req.validated.body;
  const resource = await Resource.findByPk(data.resourceId);
  if (!resource) return res.status(404).json({ message: "Recurso no encontrado" });

  const target =
    data.identityType === "user"
      ? await User.findByPk(data.identityId)
      : await Group.findByPk(data.identityId);

  if (!target) return res.status(404).json({ message: "Identidad no encontrada" });

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

router.delete("/:id", requireRole(["admin"]), validate(idParam), async (req, res) => {
  const permission = await Permission.findByPk(req.validated.params.id);
  if (!permission) return res.status(404).json({ message: "Permiso no encontrado" });

  await permission.destroy();
  await logEvent(req.user.username, "DELETE_PERMISSION", "SUCCESS");
  return res.status(204).send();
});

module.exports = router;
