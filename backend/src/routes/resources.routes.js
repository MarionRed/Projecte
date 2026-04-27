const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { resourceSchema, idParam } = require("../validators/schemas");
const { Resource, User, Group, Permission, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

const includeOwners = [
  { model: User, as: "ownerUser", attributes: ["id", "username"] },
  { model: Group, as: "ownerGroup", attributes: ["id", "name"] },
  { model: Permission },
];

router.get("/", async (req, res) => {
  const resources = await Resource.findAll({
    include: includeOwners,
    order: [["path", "ASC"]],
  });
  res.json({ resources });
});

router.post("/", requireRole(["admin", "security"]), validate(resourceSchema), async (req, res) => {
  const resource = await Resource.create(req.validated.body);
  await logEvent(req.user.username, "CREATE_RESOURCE", "SUCCESS", resource.path);
  res.status(201).json({ resource });
});

router.delete("/:id", requireRole(["admin"]), validate(idParam), async (req, res) => {
  const resource = await Resource.findByPk(req.validated.params.id);
  if (!resource) return res.status(404).json({ message: "Recurso no encontrado" });

  await resource.destroy();
  await logEvent(req.user.username, "DELETE_RESOURCE", "SUCCESS", resource.path);
  return res.status(204).send();
});

module.exports = router;
