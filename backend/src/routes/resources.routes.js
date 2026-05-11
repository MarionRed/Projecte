const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const {
  idParam,
  resourceContentSchema,
  resourceSchema,
  resourceUpdateSchema,
} = require("../validators/schemas");
const { logEvent } = require("../models");
const { canManageResourcePermissions, requireResourceAccess } = require("../services/accessControl");
const {
  createResourceWithRollback,
  deleteResourceWithRollback,
  getResourceOr404,
  listPermissionsForResource,
  listResourceTree,
  readResourceContent,
  renameResourceWithRollback,
  syncFromDisk,
  updateResourceContent,
} = require("../services/resourceManager");
const { RESOURCE_ROOT } = require("../services/localResources");

const router = express.Router();

router.use(authenticate);

function logResourceDetail(resource) {
  return resource?.isPrivate ? "recurso privado" : resource?.path;
}

router.get("/", asyncRoute(async (req, res) => {
  const { resources, tree, unpersisted } = await listResourceTree(req.user);
  res.json({ root: RESOURCE_ROOT, resources, tree, unpersisted });
}));

router.post("/sync", requireRole(["admin"]), asyncRoute(async (req, res) => {
  const result = await syncFromDisk();
  await logEvent(req.user.username, "SYNC_RESOURCES", "SUCCESS", JSON.stringify(result));
  res.json(result);
}));

router.get("/:id", validate(idParam), asyncRoute(async (req, res) => {
  const resource = await getResourceOr404(req.validated.params.id);
  await requireResourceAccess(req.user, resource, "read");
  const permissions = (!resource.isPrivate || req.user.role === "admin") && canManageResourcePermissions(req.user, resource)
    ? await listPermissionsForResource(resource.id)
    : [];
  res.json({ resource, permissions });
}));

router.get("/:id/content", validate(idParam), asyncRoute(async (req, res) => {
  const { resource, content } = await readResourceContent(req.validated.params.id, req.user);
  await logEvent(req.user.username, "RESOURCE_READ", "SUCCESS", logResourceDetail(resource));
  res.json({ resource, content });
}));

router.post("/", validate(resourceSchema), asyncRoute(async (req, res) => {
  const resource = await createResourceWithRollback(req.validated.body, req.user);
  await logEvent(req.user.username, "CREATE_RESOURCE", "SUCCESS", logResourceDetail(resource));
  res.status(201).json({ resource });
}));

router.put("/:id/content", validate(resourceContentSchema), asyncRoute(async (req, res) => {
  const resource = await updateResourceContent(
    req.validated.params.id,
    req.validated.body.content,
    req.user,
  );
  await logEvent(req.user.username, "RESOURCE_UPDATE_CONTENT", "SUCCESS", logResourceDetail(resource));
  res.json({ resource });
}));

router.patch("/:id", validate(resourceUpdateSchema), asyncRoute(async (req, res) => {
  const resource = await renameResourceWithRollback(req.validated.params.id, req.validated.body, req.user);
  await logEvent(req.user.username, "RENAME_RESOURCE", "SUCCESS", logResourceDetail(resource));
  res.json({ resource });
}));

router.delete("/:id", validate(idParam), asyncRoute(async (req, res) => {
  await deleteResourceWithRollback(req.validated.params.id, req.user);
  await logEvent(req.user.username, "DELETE_RESOURCE", "SUCCESS", String(req.validated.params.id));
  return res.status(204).send();
}));

module.exports = router;
