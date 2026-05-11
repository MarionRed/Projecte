const { Group, Permission, Resource, User } = require("../models");

function permissionAllows(permission, action) {
  if (!permission) return false;
  if (action === "read") return permission.canRead || permission.canWrite;
  return permission.canWrite;
}

function canManageResourcePermissions(actor, resource) {
  if (!actor || !resource) return false;
  if (resource.ownerUserId === actor.id) return true;
  return actor.role === "admin";
}

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

  if (resource.isPrivate && resource.ownerUserId !== user.id) {
    return { allowed: false, reason: "El recurso es privado del propietario" };
  }

  if (resource.ownerUserId === user.id) {
    return { allowed: true, reason: "El usuario es propietario del recurso" };
  }

  const groupIds = user.Groups.map((group) => group.id);
  const groupPermissions = await Permission.findAll({
    where: { identityType: "group", identityId: groupIds, resourceId: resource.id },
  });
  const groupPermission = groupPermissions.find((permission) => permissionAllows(permission, action));

  if (groupPermission) {
    const group = user.Groups.find((item) => item.id === groupPermission.identityId);
    return {
      allowed: true,
      reason: `Permiso directo del grupo ${group?.name || groupPermission.identityId} para ${action} en ${resource.path}`,
    };
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

async function getEffectiveResourceAccess(user, resource) {
  if (!user || !resource?.id) {
    return { canRead: false, canWrite: false, isOwner: false };
  }

  const [readAccess, writeAccess] = await Promise.all([
    explainAccess(user.id, resource.id, "read"),
    explainAccess(user.id, resource.id, "write"),
  ]);

  return {
    canRead: readAccess.allowed,
    canWrite: writeAccess.allowed,
    isOwner: resource.ownerUserId === user.id,
  };
}

module.exports = {
  canManageResourcePermissions,
  explainAccess,
  getEffectiveResourceAccess,
  requireResourceAccess,
};
