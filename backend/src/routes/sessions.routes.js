const express = require("express");
const { authenticate } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { idParam } = require("../validators/schemas");
const { SessionHistory, User, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncRoute(async (req, res) => {
  const where = req.user.role === "admin" ? {} : { userId: req.user.id };
  const sessions = await SessionHistory.findAll({
    where,
    include: [{ model: User, attributes: ["id", "username"] }],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
  res.json({ sessions });
}));

router.patch("/:id/revoke", validate(idParam), asyncRoute(async (req, res) => {
  const session = await SessionHistory.findByPk(req.validated.params.id, {
    include: [{ model: User, attributes: ["id", "username"] }],
  });
  if (!session) return res.status(404).json({ message: "Sesion no encontrada" });
  if (req.user.role !== "admin" && session.userId !== req.user.id) {
    return res.status(403).json({ message: "No puedes revocar esta sesion" });
  }

  await session.update({ revokedAt: session.revokedAt || new Date() });
  await logEvent(req.user.username, "REVOKE_SESSION", "SUCCESS", `${session.User?.username || session.userId} #${session.id}`);
  return res.json({ session });
}));

module.exports = router;
