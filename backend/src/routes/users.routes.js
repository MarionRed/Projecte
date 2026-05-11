const express = require("express");
const crypto = require("crypto");
const argon2 = require("argon2");
const { authenticate, requireRole } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { idParam, userUpdateSchema } = require("../validators/schemas");
const { sequelize, User, Group, Resource, Permission, UserGroup, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

function isProtectedAdmin(user) {
  return user.role === "admin" || user.username === "admin";
}

router.get("/", asyncRoute(async (req, res) => {
  if (req.user.role === "security") {
    const users = await User.findAll({
      attributes: ["id", "username", "role", "isActive", "failedAttempts", "blockUntil", "passwordResetRequired"],
      where: { role: "user" },
      order: [["id", "ASC"]],
    });
    return res.json({ users });
  }

  if (req.user.role !== "admin") {
    const users = await User.findAll({
      attributes: ["id", "username"],
      where: { isActive: true },
      order: [["id", "ASC"]],
    });
    return res.json({ users });
  }

  const users = await User.findAll({
    attributes: ["id", "username", "role", "isActive", "failedAttempts", "blockUntil", "passwordResetRequired"],
    include: [{ model: Group, attributes: ["id", "name"], through: { attributes: [] } }],
    order: [["id", "ASC"]],
  });
  return res.json({ users });
}));

router.post("/:id/password-reset", requireRole(["admin", "security"]), validate(idParam), asyncRoute(async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (user.role === "admin" || user.role === "security") {
    return res.status(403).json({ message: "Solo se puede recuperar la contrasena de usuarios normales" });
  }

  const temporaryPassword = `Temp-${crypto.randomBytes(5).toString("hex")}!`;
  await user.update({
    passwordHash: await argon2.hash(temporaryPassword),
    passwordResetRequired: true,
    failedAttempts: 0,
    blockUntil: null,
    twoFactorEnabled: false,
  });

  await logEvent(req.user.username, `PASSWORD_RESET_REQUEST_${user.id}`, "SUCCESS");
  return res.json({ temporaryPassword });
}));

router.patch("/:id", requireRole(["admin"]), validate(userUpdateSchema), asyncRoute(async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (isProtectedAdmin(user)) {
    return res.status(403).json({ message: "La cuenta administradora no se puede modificar" });
  }

  await user.update(req.validated.body);
  await logEvent(req.user.username, `UPDATE_USER_${user.id}`, "SUCCESS", JSON.stringify(req.validated.body));
  return res.json({ user });
}));

router.delete("/:id", requireRole(["admin"]), validate(idParam), asyncRoute(async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (isProtectedAdmin(user)) {
    return res.status(403).json({ message: "La cuenta administradora no se puede borrar" });
  }

  await sequelize.transaction(async (transaction) => {
    await UserGroup.destroy({ where: { UserId: user.id }, transaction });
    await Permission.destroy({ where: { identityType: "user", identityId: user.id }, transaction });
    await Group.update({ creatorUserId: null }, { where: { creatorUserId: user.id }, transaction });
    await Resource.update({ ownerUserId: null }, { where: { ownerUserId: user.id }, transaction });
    await user.destroy({ transaction });
  });

  await logEvent(req.user.username, `DELETE_USER_${user.id}`, "SUCCESS");
  return res.status(204).send();
}));

module.exports = router;
