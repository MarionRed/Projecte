const express = require("express");
const { authenticate } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { Log } = require("../models");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncRoute(async (req, res) => {
  const query = {
    order: [["createdAt", "DESC"]],
    limit: 200,
  };

  if (!["admin", "security"].includes(req.user.role)) {
    query.where = { actor: req.user.username };
  }

  const logs = await Log.findAll(query);
  res.json({ logs });
}));

module.exports = router;
