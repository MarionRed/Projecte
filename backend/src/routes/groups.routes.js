const express = require("express");
const { Op } = require("sequelize");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { groupSchema, membershipSchema, idParam } = require("../validators/schemas");
const { sequelize, Group, User, UserGroup, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

function canManageGroup(actor, group) {
  return ["admin", "security"].includes(actor.role) || group.creatorUserId === actor.id;
}

function groupIncludes() {
  return [
    { model: User, as: "creator", attributes: ["id", "username"] },
    { model: User, attributes: ["id", "username"], through: { attributes: [] } },
  ];
}

router.get("/", async (req, res) => {
  const query = {
    include: groupIncludes(),
    order: [["id", "ASC"]],
  };

  if (!["admin", "security"].includes(req.user.role)) {
    const memberships = await UserGroup.findAll({
      where: { UserId: req.user.id },
      attributes: ["GroupId"],
    });
    const memberGroupIds = memberships.map((membership) => membership.GroupId);

    query.where = {
      [Op.or]: [
        { creatorUserId: req.user.id },
        { id: memberGroupIds.length > 0 ? memberGroupIds : -1 },
      ],
    };
  }

  const groups = await Group.findAll({
    ...query,
  });
  res.json({ groups });
});

router.post("/", validate(groupSchema), async (req, res) => {
  const group = await sequelize.transaction(async (transaction) => {
    const created = await Group.create(
      { ...req.validated.body, creatorUserId: req.user.id },
      { transaction },
    );
    await created.addUser(req.user, { transaction });
    return created;
  });

  await logEvent(req.user.username, "CREATE_GROUP", "SUCCESS", group.name);
  const createdGroup = await Group.findByPk(group.id, { include: groupIncludes() });
  res.status(201).json({ group: createdGroup });
});

router.post("/members", validate(membershipSchema), async (req, res) => {
  const { userId, groupId } = req.validated.body;
  const user = await User.findByPk(userId);
  const group = await Group.findByPk(groupId, { include: groupIncludes() });

  if (!user || !group) {
    return res.status(404).json({ message: "Usuario o grupo no encontrado" });
  }
  if (!canManageGroup(req.user, group)) {
    return res.status(403).json({ message: "No puedes gestionar miembros de este grupo" });
  }

  await group.addUser(user);
  await logEvent(req.user.username, "ADD_GROUP_MEMBER", "SUCCESS", `${user.username} -> ${group.name}`);
  return res.json({ message: "Usuario asignado al grupo" });
});

router.delete("/:groupId/members/:userId", async (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = Number(req.params.userId);
  if (!Number.isInteger(groupId) || groupId <= 0 || !Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "Parametros no validos" });
  }

  const user = await User.findByPk(userId);
  const group = await Group.findByPk(groupId, { include: groupIncludes() });
  if (!user || !group) {
    return res.status(404).json({ message: "Usuario o grupo no encontrado" });
  }
  if (!canManageGroup(req.user, group)) {
    return res.status(403).json({ message: "No puedes gestionar miembros de este grupo" });
  }
  if (!["admin", "security"].includes(req.user.role) && group.creatorUserId === req.user.id && user.id === req.user.id) {
    return res.status(403).json({ message: "El creador no puede quitarse de su propio grupo" });
  }

  await group.removeUser(user);
  await logEvent(req.user.username, "REMOVE_GROUP_MEMBER", "SUCCESS", `${user.username} -/-> ${group.name}`);
  return res.status(204).send();
});

router.delete("/:id", validate(idParam), async (req, res) => {
  const group = await Group.findByPk(req.validated.params.id);
  if (!group) return res.status(404).json({ message: "Grupo no encontrado" });
  if (!canManageGroup(req.user, group)) {
    return res.status(403).json({ message: "No puedes borrar este grupo" });
  }

  await group.destroy();
  await logEvent(req.user.username, "DELETE_GROUP", "SUCCESS", group.name);
  return res.status(204).send();
});

module.exports = router;
