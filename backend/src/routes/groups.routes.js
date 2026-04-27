const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { groupSchema, membershipSchema, idParam } = require("../validators/schemas");
const { Group, User, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const groups = await Group.findAll({
    include: [{ model: User, attributes: ["id", "username"], through: { attributes: [] } }],
    order: [["id", "ASC"]],
  });
  res.json({ groups });
});

router.post("/", requireRole(["admin", "security"]), validate(groupSchema), async (req, res) => {
  const group = await Group.create(req.validated.body);
  await logEvent(req.user.username, "CREATE_GROUP", "SUCCESS", group.name);
  res.status(201).json({ group });
});

router.post("/members", requireRole(["admin", "security"]), validate(membershipSchema), async (req, res) => {
  const { userId, groupId } = req.validated.body;
  const user = await User.findByPk(userId);
  const group = await Group.findByPk(groupId);

  if (!user || !group) {
    return res.status(404).json({ message: "Usuario o grupo no encontrado" });
  }

  await group.addUser(user);
  await logEvent(req.user.username, "ADD_GROUP_MEMBER", "SUCCESS", `${user.username} -> ${group.name}`);
  return res.json({ message: "Usuario asignado al grupo" });
});

router.delete("/:id", requireRole(["admin"]), validate(idParam), async (req, res) => {
  const group = await Group.findByPk(req.validated.params.id);
  if (!group) return res.status(404).json({ message: "Grupo no encontrado" });

  await group.destroy();
  await logEvent(req.user.username, "DELETE_GROUP", "SUCCESS", group.name);
  return res.status(204).send();
});

module.exports = router;
