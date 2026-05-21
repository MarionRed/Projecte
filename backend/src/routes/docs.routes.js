const express = require("express");
const path = require("path");

const router = express.Router();

router.get("/openapi.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../../../docs/openapi.json"));
});

router.get("/postman.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../../../docs/iam-demo.postman_collection.json"));
});

module.exports = router;
