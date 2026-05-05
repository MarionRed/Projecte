const fs = require("fs/promises");
const path = require("path");
const { Op } = require("sequelize");
const { sequelize, Permission, Resource, User, Group } = require("../models");
const { getEffectiveResourceAccess, requireResourceAccess } = require("./accessControl");
const {
  createDiskResource,
  joinResourcePath,
  makeRollbackPath,
  metadataForPath,
  moveDiskResource,
  pathExists,
  readResourceFile,
  removeDiskResource,
  resolveResourcePath,
  scanDiskResources,
  toResourcePath,
  validateResourceName,
  writeResourceFile,
} = require("./localResources");

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function canManageCatalog(actor) {
  return ["admin", "security"].includes(actor?.role);
}

function parentPathOf(resourcePath) {
  const cleanPath = toResourcePath(resourcePath);
  if (cleanPath === "/") return null;
  const index = cleanPath.lastIndexOf("/");
  return index <= 0 ? "/" : cleanPath.slice(0, index);
}

function baseNameOf(resourcePath) {
  const cleanPath = toResourcePath(resourcePath);
  return cleanPath === "/" ? "" : cleanPath.slice(cleanPath.lastIndexOf("/") + 1);
}

async function getResourceOr404(id, options = {}) {
  const resource = await Resource.findByPk(id, options);
  if (!resource) {
    throw httpError("Recurso no encontrado", 404);
  }
  return resource;
}

async function resolveParent(parentId) {
  if (!parentId) return null;
  const parent = await getResourceOr404(parentId);
  if (parent.kind !== "directory") {
    throw httpError("El recurso padre debe ser un directorio");
  }
  return parent;
}

function buildTree(resources) {
  const nodes = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    path: resource.path,
    kind: resource.kind,
    fileType: resource.fileType,
    checksum: resource.checksum,
    ownerUser: resource.ownerUser,
    ownerGroup: resource.ownerGroup,
    Permissions: resource.Permissions || [],
    access: resource.access || null,
    disk: resource.disk || null,
    children: [],
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];

  for (const node of nodes) {
    const resource = resources.find((item) => item.id === node.id);
    if (resource.parentId && byId.has(resource.parentId)) {
      byId.get(resource.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortChildren(items) {
    items.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    items.forEach((item) => sortChildren(item.children));
  }

  sortChildren(roots);
  return roots;
}

async function filterResourcesForActor(resources, actor) {
  if (!actor || ["admin", "security"].includes(actor.role)) {
    return resources;
  }

  const user = await User.findByPk(actor.id, {
    include: [{ model: Group, attributes: ["id"], through: { attributes: [] } }],
  });
  const groupIds = new Set((user?.Groups || []).map((group) => group.id));

  return resources.filter((resource) => {
    if (resource.ownerUserId === actor.id) return true;

    return (resource.Permissions || []).some((permission) => {
      const grantsAccess = permission.canRead || permission.canWrite;
      if (!grantsAccess) return false;
      if (permission.identityType === "user") return permission.identityId === actor.id;
      return groupIds.has(permission.identityId);
    });
  });
}

async function listResourceTree(actor = null) {
  const [resources, diskItems] = await Promise.all([
    Resource.findAll({
      include: [
        { model: User, as: "ownerUser", attributes: ["id", "username"] },
        { model: Group, as: "ownerGroup", attributes: ["id", "name"] },
        { model: Permission },
      ],
      order: [["path", "ASC"]],
    }),
    scanDiskResources(),
  ]);
  const visibleResources = await filterResourcesForActor(resources, actor);
  const diskByPath = new Map(diskItems.map((item) => [item.path, item]));
  const resourcesByPath = new Map(visibleResources.map((resource) => [resource.path, resource]));

  const persisted = await Promise.all(visibleResources.map(async (resource) => {
    const plain = resource.toJSON();
    plain.disk = diskByPath.get(resource.path) || { exists: false };
    plain.access = await getEffectiveResourceAccess(actor, resource);
    return plain;
  }));

  const unpersisted = actor && !["admin", "security"].includes(actor.role)
    ? []
    : diskItems
      .filter((item) => !resourcesByPath.has(item.path))
      .map((item) => ({
        id: null,
        name: item.name,
        path: item.path,
        kind: item.kind,
        parentId: resourcesByPath.get(parentPathOf(item.path))?.id || null,
        fileType: item.kind === "file" ? "text/plain" : null,
        checksum: item.checksum,
        Permissions: [],
        access: { canRead: true, canWrite: true, isOwner: false },
        disk: { ...item, exists: true, persisted: false },
        children: [],
      }));

  return {
    resources: [...persisted, ...unpersisted].sort((left, right) => left.path.localeCompare(right.path)),
    tree: buildTree(persisted),
    unpersisted,
  };
}

async function syncFromDisk() {
  const diskItems = await scanDiskResources();

  return sequelize.transaction(async (transaction) => {
    const existing = await Resource.findAll({ transaction });
    const existingByPath = new Map(existing.map((resource) => [resource.path, resource]));
    const diskByPath = new Map(diskItems.map((item) => [item.path, item]));
    const touched = [];

    for (const item of diskItems) {
      const parentPath = parentPathOf(item.path);
      const parent = parentPath === "/" ? null : existingByPath.get(parentPath);
      const defaults = {
        name: item.name,
        path: item.path,
        kind: item.kind,
        parentId: parent?.id || null,
        fileType: item.kind === "file" ? "text/plain" : null,
        checksum: item.checksum,
      };

      const current = existingByPath.get(item.path);
      if (current) {
        await current.update(defaults, { transaction });
        touched.push(current);
      } else {
        const created = await Resource.create(defaults, { transaction });
        existingByPath.set(item.path, created);
        touched.push(created);
      }
    }

    const stale = existing
      .filter((resource) => !diskByPath.has(resource.path))
      .sort((left, right) => right.path.length - left.path.length);
    for (const resource of stale) {
      await resource.destroy({ transaction });
    }

    return { synced: touched.length, removed: stale.length };
  });
}

async function createResourceWithRollback(data, actor) {
  const parent = await resolveParent(data.parentId);
  if (!parent && !canManageCatalog(actor)) {
    throw httpError("Debes seleccionar una carpeta con permiso de escritura", 403);
  }

  if (parent) {
    await requireResourceAccess(actor, parent, "write");
  }

  const name = validateResourceName(data.name);
  const kind = data.kind;
  const resourcePath = joinResourcePath(parent?.path || "/", name);
  const finalPath = resolveResourcePath(resourcePath);

  if (await pathExists(finalPath)) {
    throw httpError("Ya existe un recurso en esa ruta", 409);
  }

  await createDiskResource(resourcePath, kind, data.content || "");

  try {
    const metadata = await metadataForPath(resourcePath);
    return await sequelize.transaction(async (transaction) => {
      return Resource.create(
        {
          name,
          path: resourcePath,
          kind,
          parentId: parent?.id || null,
          ownerUserId: canManageCatalog(actor) ? data.ownerUserId || actor.id : actor.id,
          ownerGroupId: canManageCatalog(actor) ? data.ownerGroupId || null : null,
          fileType: kind === "file" ? data.fileType || "text/plain" : null,
          checksum: metadata.checksum,
        },
        { transaction },
      );
    });
  } catch (err) {
    await removeDiskResource(resourcePath).catch(() => {});
    throw err;
  }
}

async function readResourceContent(id, actor) {
  const resource = await getResourceOr404(id);
  if (resource.kind !== "file") {
    throw httpError("Solo se puede leer el contenido de ficheros");
  }

  await requireResourceAccess(actor, resource, "read");
  const content = await readResourceFile(resource.path);
  return { resource, content };
}

async function updateResourceContent(id, content, actor) {
  const resource = await getResourceOr404(id);
  if (resource.kind !== "file") {
    throw httpError("Solo se puede editar el contenido de ficheros");
  }

  await requireResourceAccess(actor, resource, "write");

  const oldContent = await readResourceFile(resource.path);
  await writeResourceFile(resource.path, content);

  try {
    const metadata = await metadataForPath(resource.path);
    await sequelize.transaction(async (transaction) => {
      await resource.update({ checksum: metadata.checksum }, { transaction });
    });
    return resource.reload();
  } catch (err) {
    await writeResourceFile(resource.path, oldContent).catch(() => {});
    throw err;
  }
}

async function renameResourceWithRollback(id, data, actor) {
  const resource = await getResourceOr404(id);
  await requireResourceAccess(actor, resource, "write");

  const newName = validateResourceName(data.name);
  const targetPath = joinResourcePath(parentPathOf(resource.path) || "/", newName);
  if (targetPath === resource.path) return resource;
  const targetFinalPath = resolveResourcePath(targetPath);

  if (await pathExists(targetFinalPath)) {
    throw httpError("Ya existe un recurso en la ruta destino", 409);
  }

  const oldPath = resource.path;
  await moveDiskResource(oldPath, targetPath);

  try {
    return await sequelize.transaction(async (transaction) => {
      await resource.update({ name: newName, path: targetPath }, { transaction });

      if (resource.kind === "directory") {
        const children = await Resource.findAll({
          where: { path: { [Op.like]: `${oldPath}/%` } },
          transaction,
        });

        for (const child of children) {
          await child.update(
            { path: child.path.replace(`${oldPath}/`, `${targetPath}/`) },
            { transaction },
          );
        }
      }

      return resource;
    });
  } catch (err) {
    await moveDiskResource(targetPath, oldPath).catch(() => {});
    throw err;
  }
}

async function deleteResourceWithRollback(id, actor) {
  const resource = await getResourceOr404(id);
  await requireResourceAccess(actor, resource, "write");

  const backupPath = await makeRollbackPath(resource.path);
  const finalPath = resolveResourcePath(resource.path);
  await fs.rename(finalPath, backupPath);

  try {
    await sequelize.transaction(async (transaction) => {
      const descendants = await Resource.findAll({
        where: { path: { [Op.like]: `${resource.path}/%` } },
        transaction,
      });
      const descendantIds = descendants.map((item) => item.id);
      if (descendantIds.length > 0) {
        await Permission.destroy({
          where: { resourceId: descendantIds },
          transaction,
        });
        for (const child of descendants.sort((left, right) => right.path.length - left.path.length)) {
          await child.destroy({ transaction });
        }
      }
      await resource.destroy({ transaction });
    });
    await fs.rm(backupPath, { recursive: true, force: true });
  } catch (err) {
    await fs.rename(backupPath, finalPath).catch(() => {});
    throw err;
  }
}

async function getPermissionIdentity(permission) {
  if (permission.identityType === "user") {
    const user = await User.findByPk(permission.identityId, { attributes: ["id", "username"] });
    return user ? { id: user.id, name: user.username, type: "user" } : null;
  }

  const group = await Group.findByPk(permission.identityId, { attributes: ["id", "name"] });
  return group ? { id: group.id, name: group.name, type: "group" } : null;
}

async function listPermissionsForResource(resourceId) {
  const permissions = await Permission.findAll({
    where: { resourceId },
    include: [{ model: Resource }],
    order: [["id", "ASC"]],
  });

  return Promise.all(
    permissions.map(async (permission) => {
      const plain = permission.toJSON();
      plain.identity = await getPermissionIdentity(permission);
      return plain;
    }),
  );
}

module.exports = {
  createResourceWithRollback,
  deleteResourceWithRollback,
  getPermissionIdentity,
  getResourceOr404,
  listPermissionsForResource,
  listResourceTree,
  readResourceContent,
  renameResourceWithRollback,
  syncFromDisk,
  updateResourceContent,
};
