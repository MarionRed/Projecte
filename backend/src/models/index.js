const { DataTypes } = require("sequelize");
const argon2 = require("argon2");
const { sequelize } = require("../config/database");
const { createDiskResource, pathExists, resolveResourcePath } = require("../services/localResources");

const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: {
    type: DataTypes.ENUM("user", "security", "admin"),
    allowNull: false,
    defaultValue: "user",
  },
  twoFactorSecret: { type: DataTypes.STRING, allowNull: false },
  twoFactorEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  failedAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  blockUntil: { type: DataTypes.DATE, allowNull: true },
});

const Group = sequelize.define("Group", {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.STRING, allowNull: true },
  creatorUserId: { type: DataTypes.INTEGER, allowNull: true },
});

const Resource = sequelize.define("Resource", {
  name: { type: DataTypes.STRING, allowNull: false },
  path: { type: DataTypes.STRING, allowNull: false, unique: true },
  kind: {
    type: DataTypes.ENUM("directory", "file"),
    allowNull: false,
  },
  fileType: { type: DataTypes.STRING, allowNull: true },
  checksum: { type: DataTypes.STRING, allowNull: true },
});

const Permission = sequelize.define(
  "Permission",
  {
    identityType: {
      type: DataTypes.ENUM("user", "group"),
      allowNull: false,
    },
    identityId: { type: DataTypes.INTEGER, allowNull: false },
    canRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    canWrite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["identityType", "identityId", "resourceId"],
      },
    ],
  },
);

const Log = sequelize.define("Log", {
  actor: { type: DataTypes.STRING, allowNull: false, defaultValue: "system" },
  action: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.TEXT, allowNull: true },
});

const UserGroup = sequelize.define("UserGroup", {}, { timestamps: false });

User.belongsToMany(Group, { through: UserGroup });
Group.belongsToMany(User, { through: UserGroup });

User.hasMany(Group, { as: "createdGroups", foreignKey: "creatorUserId" });
Group.belongsTo(User, { as: "creator", foreignKey: "creatorUserId" });

User.hasMany(Resource, { as: "ownedResources", foreignKey: "ownerUserId" });
Resource.belongsTo(User, { as: "ownerUser", foreignKey: "ownerUserId" });

Group.hasMany(Resource, { as: "ownedResources", foreignKey: "ownerGroupId" });
Resource.belongsTo(Group, { as: "ownerGroup", foreignKey: "ownerGroupId" });

Resource.hasMany(Resource, { as: "children", foreignKey: "parentId" });
Resource.belongsTo(Resource, { as: "parent", foreignKey: "parentId" });

Resource.hasMany(Permission, { foreignKey: "resourceId", onDelete: "CASCADE" });
Permission.belongsTo(Resource, { foreignKey: "resourceId" });

async function logEvent(actor, action, status, details = null) {
  await Log.create({ actor, action, status, details });
}

async function ensureSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const groupsTable = await queryInterface.describeTable("Groups");
  if (!groupsTable.creatorUserId) {
    await queryInterface.addColumn("Groups", "creatorUserId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
    });
  }
}

async function seedDemoData() {
  const adminPassword = await argon2.hash("Admin123!");
  const userPassword = await argon2.hash("User123!");

  const [admin] = await User.findOrCreate({
    where: { username: "admin" },
    defaults: {
      passwordHash: adminPassword,
      role: "admin",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorEnabled: false,
    },
  });

  const [alice] = await User.findOrCreate({
    where: { username: "alice" },
    defaults: {
      passwordHash: userPassword,
      role: "user",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorEnabled: false,
    },
  });

  const [profesores] = await Group.findOrCreate({
    where: { name: "profesores" },
    defaults: { description: "Grupo con permisos de gestion academica", creatorUserId: admin.id },
  });
  const [alumnos] = await Group.findOrCreate({
    where: { name: "alumnos" },
    defaults: { description: "Grupo con acceso de lectura" },
  });

  if (!profesores.creatorUserId) {
    await profesores.update({ creatorUserId: admin.id });
  }
  await admin.addGroup(profesores);
  await alice.addGroup(alumnos);

  if (!(await pathExists(resolveResourcePath("/clase")))) {
    await createDiskResource("/clase", "directory");
  }
  if (!(await pathExists(resolveResourcePath("/clase/apuntes")))) {
    await createDiskResource("/clase/apuntes", "directory");
  }
  if (!(await pathExists(resolveResourcePath("/clase/apuntes/tema1.txt")))) {
    await createDiskResource("/clase/apuntes/tema1.txt", "file", "Contenido de ejemplo para el tema 1.\n");
  }

  const [root] = await Resource.findOrCreate({
    where: { path: "/clase" },
    defaults: { name: "clase", kind: "directory", ownerUserId: admin.id },
  });
  const [apuntes] = await Resource.findOrCreate({
    where: { path: "/clase/apuntes" },
    defaults: {
      name: "apuntes",
      kind: "directory",
      parentId: root.id,
      ownerUserId: admin.id,
    },
  });
  const [tema1] = await Resource.findOrCreate({
    where: { path: "/clase/apuntes/tema1.txt" },
    defaults: {
      name: "tema1.txt",
      kind: "file",
      fileType: "text/plain",
      checksum: "demo-checksum-001",
      parentId: apuntes.id,
      ownerUserId: admin.id,
    },
  });

  await Permission.findOrCreate({
    where: {
      identityType: "group",
      identityId: alumnos.id,
      resourceId: tema1.id,
    },
    defaults: { canRead: true, canWrite: false },
  });
  await Permission.findOrCreate({
    where: {
      identityType: "group",
      identityId: profesores.id,
      resourceId: tema1.id,
    },
    defaults: { canRead: true, canWrite: true },
  });
}

module.exports = {
  sequelize,
  User,
  Group,
  Resource,
  Permission,
  Log,
  UserGroup,
  ensureSchema,
  logEvent,
  seedDemoData,
};
