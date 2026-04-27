const path = require("path");
const { Sequelize } = require("sequelize");

const storage = path.resolve(process.env.DATABASE_STORAGE || path.resolve(__dirname, "../../iam.sqlite"));

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage,
  logging: false,
});

module.exports = { sequelize };
