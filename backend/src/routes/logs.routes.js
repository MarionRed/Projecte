const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { Log } = require("../models");

const router = express.Router();

router.use(authenticate, requireRole(["admin", "security"]));

router.get("/", async (req, res) => {
  const logs = await Log.findAll({ order: [["createdAt", "DESC"]], limit: 200 });
  res.json({ logs });
});

module.exports = router;
