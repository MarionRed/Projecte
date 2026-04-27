const { Group, Permission, Resource, User } = require("../models");

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

async function requireResourceAccess(user, resource, action) {
  const result = await explainAccess(user.id, resource.id, action);
  if (!result.allowed) {
    throw Object.assign(new Error(result.reason), { statusCode: 403 });
  }
  return result;
}

module.exports = {
  explainAccess,
  requireResourceAccess,
};
