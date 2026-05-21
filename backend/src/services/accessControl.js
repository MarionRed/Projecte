const { Group, Permission, Resource, User } = require("../models");

function permissionAllows(permission, action) {
  if (!permission) return false;
  if (permission.expiresAt && new Date(permission.expiresAt).getTime() <= Date.now()) {
    return false;
  }
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

  if (resource.classification === "restricted" && action === "write") {
    return { allowed: false, reason: "El recurso esta clasificado como restringido y bloquea escritura no administrativa" };
  }

  if (resource.isPrivate && resource.ownerUserId !== user.id) {
    return { allowed: false, reason: "El recurso es privado del propietario" };
  }

  if (resource.ownerUserId === user.id) {
    return { allowed: true, reason: "El usuario es propietario del recurso" };
  }

  const directPermission = await Permission.findOne({
    where: { identityType: "user", identityId: user.id, resourceId: resource.id },
  });
  if (directPermission) {
    if (directPermission.expiresAt && new Date(directPermission.expiresAt).getTime() <= Date.now()) {
      return { allowed: false, reason: "El permiso directo del usuario ha expirado" };
    }
    if (permissionAllows(directPermission, action)) {
      return { allowed: true, reason: `Permiso directo del usuario para ${action} en ${resource.path}` };
    }
  }

  const groupIds = user.Groups.map((group) => group.id);
  const groupPermissions = await Permission.findAll({
    where: { identityType: "group", identityId: groupIds, resourceId: resource.id },
  });
  const expiredPermission = groupPermissions.find((permission) => permission.expiresAt && new Date(permission.expiresAt).getTime() <= Date.now());
  if (expiredPermission) {
    const group = user.Groups.find((item) => item.id === expiredPermission.identityId);
    return { allowed: false, reason: `El permiso del grupo ${group?.name || expiredPermission.identityId} ha expirado` };
  }
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
