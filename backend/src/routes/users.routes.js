const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { idParam, userUpdateSchema } = require("../validators/schemas");
const { User, Group, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

function isProtectedAdmin(user) {
  return user.role === "admin" || user.username === "admin";
}

router.get("/", async (req, res) => {
  if (!["admin", "security"].includes(req.user.role)) {
    const users = await User.findAll({
      attributes: ["id", "username"],
      where: { isActive: true },
      order: [["id", "ASC"]],
    });
    return res.json({ users });
  }

  const users = await User.findAll({
    attributes: ["id", "username", "role", "isActive", "failedAttempts", "blockUntil"],
    include: [{ model: Group, attributes: ["id", "name"], through: { attributes: [] } }],
    order: [["id", "ASC"]],
  });
  return res.json({ users });
});

router.patch("/:id", requireRole(["admin"]), validate(userUpdateSchema), async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (isProtectedAdmin(user)) {
    return res.status(403).json({ message: "La cuenta administradora no se puede modificar" });
  }

  await user.update(req.validated.body);
  await logEvent(req.user.username, `UPDATE_USER_${user.id}`, "SUCCESS", JSON.stringify(req.validated.body));
  return res.json({ user });
});

router.delete("/:id", requireRole(["admin"]), validate(idParam), async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (isProtectedAdmin(user)) {
    return res.status(403).json({ message: "La cuenta administradora no se puede borrar" });
  }

  await user.destroy();
  await logEvent(req.user.username, `DELETE_USER_${user.id}`, "SUCCESS");
  return res.status(204).send();
});

module.exports = router;
