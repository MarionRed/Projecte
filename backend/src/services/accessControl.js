const { Group, Permission, Resource, User } = require("../models");

function ancestorPathsOf(resourcePath) {
  const parts = resourcePath.split("/").filter(Boolean);
  return parts.map((_, index) => `/${parts.slice(0, index + 1).join("/")}`);
}

function permissionAllows(permission, action) {
  if (!permission) return false;
  if (action === "read") return permission.canRead || permission.canWrite;
  return permission.canWrite;
}

function resourceCoversPath(parentPath, childPath) {
  return childPath === parentPath || childPath.startsWith(`${parentPath}/`);
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

  if (resource.ownerUserId === user.id) {
    return { allowed: true, reason: "El usuario es propietario del recurso" };
  }

  const ancestorPaths = ancestorPathsOf(resource.path);
  const ancestorResources = await Resource.findAll({ where: { path: ancestorPaths } });
  const ancestorById = new Map(ancestorResources.map((item) => [item.id, item]));
  const ancestorIds = ancestorResources.map((item) => item.id);

  const ownerAncestor = ancestorResources.find((item) => item.ownerUserId === user.id);
  if (ownerAncestor) {
    return { allowed: true, reason: `El usuario es propietario de ${ownerAncestor.path}` };
  }

  const userPermissions = await Permission.findAll({
    where: { identityType: "user", identityId: user.id, resourceId: ancestorIds },
  });
  const userPermission = userPermissions.find((permission) => permissionAllows(permission, action));

  if (userPermission) {
    const grantedResource = ancestorById.get(userPermission.resourceId);
    const scope = grantedResource && resourceCoversPath(grantedResource.path, resource.path)
      ? ` en ${grantedResource.path}`
      : "";
    return { allowed: true, reason: `Permiso directo de usuario para ${action}${scope}` };
  }

  const groupIds = user.Groups.map((group) => group.id);
  const groupPermissions = await Permission.findAll({
    where: { identityType: "group", identityId: groupIds, resourceId: ancestorIds },
  });
  const groupPermission = groupPermissions.find((permission) => permissionAllows(permission, action));

  if (groupPermission) {
    const group = user.Groups.find((item) => item.id === groupPermission.identityId);
    const grantedResource = ancestorById.get(groupPermission.resourceId);
    const scope = grantedResource && resourceCoversPath(grantedResource.path, resource.path)
      ? ` en ${grantedResource.path}`
      : "";
    return {
      allowed: true,
      reason: `Permiso heredado del grupo ${group?.name || groupPermission.identityId}${scope}`,
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

module.exports = {
  explainAccess,
  requireResourceAccess,
};
