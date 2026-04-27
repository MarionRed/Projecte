const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  idParam,
  resourceContentSchema,
  resourceSchema,
  resourceUpdateSchema,
} = require("../validators/schemas");
const { logEvent } = require("../models");
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

router.get("/", async (req, res) => {
  const { resources, tree, unpersisted } = await listResourceTree();
  res.json({ root: RESOURCE_ROOT, resources, tree, unpersisted });
});

router.post("/sync", requireRole(["admin", "security"]), async (req, res) => {
  const result = await syncFromDisk();
  await logEvent(req.user.username, "SYNC_RESOURCES", "SUCCESS", JSON.stringify(result));
  res.json(result);
});

router.get("/:id", validate(idParam), async (req, res) => {
  const resource = await getResourceOr404(req.validated.params.id);
  const permissions = await listPermissionsForResource(resource.id);
  res.json({ resource, permissions });
});

router.get("/:id/content", validate(idParam), async (req, res) => {
  const { resource, content } = await readResourceContent(req.validated.params.id, req.user);
  await logEvent(req.user.username, "RESOURCE_READ", "SUCCESS", resource.path);
  res.json({ resource, content });
});

router.post("/", requireRole(["admin", "security"]), validate(resourceSchema), async (req, res) => {
  const resource = await createResourceWithRollback(req.validated.body, req.user);
  await logEvent(req.user.username, "CREATE_RESOURCE", "SUCCESS", resource.path);
  res.status(201).json({ resource });
});

router.put("/:id/content", requireRole(["admin", "security"]), validate(resourceContentSchema), async (req, res) => {
  const resource = await updateResourceContent(
    req.validated.params.id,
    req.validated.body.content,
    req.user,
  );
  await logEvent(req.user.username, "RESOURCE_UPDATE_CONTENT", "SUCCESS", resource.path);
  res.json({ resource });
});

router.patch("/:id", requireRole(["admin", "security"]), validate(resourceUpdateSchema), async (req, res) => {
  const resource = await renameResourceWithRollback(req.validated.params.id, req.validated.body, req.user);
  await logEvent(req.user.username, "RENAME_RESOURCE", "SUCCESS", resource.path);
  res.json({ resource });
});

router.delete("/:id", requireRole(["admin", "security"]), validate(idParam), async (req, res) => {
  await deleteResourceWithRollback(req.validated.params.id, req.user);
  await logEvent(req.user.username, "DELETE_RESOURCE", "SUCCESS", String(req.validated.params.id));
  return res.status(204).send();
});

module.exports = router;
