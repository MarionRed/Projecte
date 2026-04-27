const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { idParam, userUpdateSchema } = require("../validators/schemas");
const { User, Group, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  const users = await User.findAll({
    attributes: ["id", "username", "role", "isActive", "failedAttempts", "blockUntil"],
    include: [{ model: Group, attributes: ["id", "name"], through: { attributes: [] } }],
    order: [["id", "ASC"]],
  });
  res.json({ users });
});

router.patch("/:id", requireRole(["admin"]), validate(userUpdateSchema), async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  await user.update(req.validated.body);
  await logEvent(req.user.username, `UPDATE_USER_${user.id}`, "SUCCESS", JSON.stringify(req.validated.body));
  return res.json({ user });
});

router.delete("/:id", requireRole(["admin"]), validate(idParam), async (req, res) => {
  const user = await User.findByPk(req.validated.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  await user.destroy();
  await logEvent(req.user.username, `DELETE_USER_${user.id}`, "SUCCESS");
  return res.status(204).send();
});

module.exports = router;
