const { DataTypes } = require("sequelize");
const argon2 = require("argon2");
const { sequelize } = require("../config/database");
const { createDiskResource, pathExists, resolveResourcePath } = require("../services/localResources");

const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  email: { type: DataTypes.STRING, allowNull: true, unique: true },
  emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  emailVerificationTokenHash: { type: DataTypes.STRING, allowNull: true },
  emailVerificationExpiresAt: { type: DataTypes.DATE, allowNull: true },
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
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  passwordResetTokenHash: { type: DataTypes.STRING, allowNull: true },
  passwordResetExpiresAt: { type: DataTypes.DATE, allowNull: true },
  passwordResetRequired: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
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
  isPrivate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  classification: {
    type: DataTypes.ENUM("public", "internal", "confidential", "restricted"),
    allowNull: false,
    defaultValue: "internal",
  },
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
    expiresAt: { type: DataTypes.DATE, allowNull: true },
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

const SessionHistory = sequelize.define("SessionHistory", {
  tokenId: { type: DataTypes.STRING, allowNull: true },
  ip: { type: DataTypes.STRING, allowNull: true },
  ipType: { type: DataTypes.STRING, allowNull: true },
  country: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  geoLabel: { type: DataTypes.STRING, allowNull: true },
  userAgent: { type: DataTypes.TEXT, allowNull: true },
  userAgentLabel: { type: DataTypes.STRING, allowNull: true },
  suspicious: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  suspiciousReason: { type: DataTypes.TEXT, allowNull: true },
  riskScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
});

const AccessRequest = sequelize.define("AccessRequest", {
  action: {
    type: DataTypes.ENUM("read", "write"),
    allowNull: false,
  },
  reason: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    allowNull: false,
    defaultValue: "pending",
  },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
});

const SecuritySetting = sequelize.define("SecuritySetting", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  value: { type: DataTypes.TEXT, allowNull: false },
});

const UserTask = sequelize.define("UserTask", {
  text: { type: DataTypes.STRING, allowNull: false },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  completedAt: { type: DataTypes.DATE, allowNull: true },
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

User.hasMany(SessionHistory, { foreignKey: "userId", onDelete: "CASCADE" });
SessionHistory.belongsTo(User, { foreignKey: "userId" });

User.hasMany(AccessRequest, { foreignKey: "userId", onDelete: "CASCADE" });
AccessRequest.belongsTo(User, { foreignKey: "userId" });
User.hasMany(AccessRequest, { as: "decisions", foreignKey: "decidedByUserId" });
AccessRequest.belongsTo(User, { as: "decidedBy", foreignKey: "decidedByUserId" });
Resource.hasMany(AccessRequest, { foreignKey: "resourceId", onDelete: "CASCADE" });
AccessRequest.belongsTo(Resource, { foreignKey: "resourceId" });

User.hasMany(UserTask, { foreignKey: "userId", onDelete: "CASCADE" });
UserTask.belongsTo(User, { foreignKey: "userId" });

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

  const resourcesTable = await queryInterface.describeTable("Resources");
  if (!resourcesTable.isPrivate) {
    await queryInterface.addColumn("Resources", "isPrivate", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
  if (!resourcesTable.classification) {
    await queryInterface.addColumn("Resources", "classification", {
      type: DataTypes.ENUM("public", "internal", "confidential", "restricted"),
      allowNull: false,
      defaultValue: "internal",
    });
  }

  const usersTable = await queryInterface.describeTable("Users");
  if (!usersTable.email) {
    await queryInterface.addColumn("Users", "email", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!usersTable.emailVerified) {
    await queryInterface.addColumn("Users", "emailVerified", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
  if (!usersTable.emailVerificationTokenHash) {
    await queryInterface.addColumn("Users", "emailVerificationTokenHash", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!usersTable.emailVerificationExpiresAt) {
    await queryInterface.addColumn("Users", "emailVerificationExpiresAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!usersTable.lastLoginAt) {
    await queryInterface.addColumn("Users", "lastLoginAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!usersTable.passwordResetTokenHash) {
    await queryInterface.addColumn("Users", "passwordResetTokenHash", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!usersTable.passwordResetExpiresAt) {
    await queryInterface.addColumn("Users", "passwordResetExpiresAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!usersTable.passwordResetRequired) {
    await queryInterface.addColumn("Users", "passwordResetRequired", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  const permissionsTable = await queryInterface.describeTable("Permissions");
  if (!permissionsTable.expiresAt) {
    await queryInterface.addColumn("Permissions", "expiresAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }

  const sessionsTable = await queryInterface.describeTable("SessionHistories");
  if (!sessionsTable.tokenId) {
    await queryInterface.addColumn("SessionHistories", "tokenId", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!sessionsTable.revokedAt) {
    await queryInterface.addColumn("SessionHistories", "revokedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  const sessionColumns = {
    ipType: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    geoLabel: { type: DataTypes.STRING, allowNull: true },
    userAgentLabel: { type: DataTypes.STRING, allowNull: true },
    suspicious: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    suspiciousReason: { type: DataTypes.TEXT, allowNull: true },
    riskScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  };
  for (const [column, definition] of Object.entries(sessionColumns)) {
    if (!sessionsTable[column]) {
      await queryInterface.addColumn("SessionHistories", column, definition);
    }
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
      email: "admin@example.local",
      emailVerified: true,
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorEnabled: false,
    },
  });

  const [alice] = await User.findOrCreate({
    where: { username: "alice" },
    defaults: {
      passwordHash: userPassword,
      role: "user",
      email: "alice@example.local",
      emailVerified: true,
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorEnabled: false,
    },
  });

  if (admin.email && !admin.emailVerified) {
    await admin.update({ emailVerified: true });
  }
  if (alice.email && !alice.emailVerified) {
    await alice.update({ emailVerified: true });
  }

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
      classification: "internal",
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
      classification: "public",
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
  AccessRequest,
  SecuritySetting,
  UserTask,
  UserGroup,
  SessionHistory,
  ensureSchema,
  logEvent,
  seedDemoData,
};
