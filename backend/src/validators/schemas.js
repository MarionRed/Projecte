const { z } = require("zod");

const idParam = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(40),
    password: z.string().min(6).max(120),
    captcha: z.string().optional().default(""),
  }),
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    twoFactorCode: z.string().optional().default(""),
    captcha: z.string().optional().default(""),
  }),
});

const userUpdateSchema = z.object({
  params: idParam.shape.params,
  body: z.object({
    role: z.enum(["user", "security"]).optional(),
    isActive: z.boolean().optional(),
  }),
});

const groupSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60),
    description: z.string().max(200).optional().default(""),
  }),
});

const membershipSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    groupId: z.number().int().positive(),
  }),
});

const resourceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    kind: z.enum(["directory", "file"]),
    content: z.string().max(1024 * 1024).optional().default(""),
    fileType: z.string().max(80).optional().nullable(),
    parentId: z.number().int().positive().optional().nullable(),
    ownerUserId: z.number().int().positive().optional().nullable(),
    ownerGroupId: z.number().int().positive().optional().nullable(),
  }),
});

const resourceUpdateSchema = z.object({
  params: idParam.shape.params,
  body: z.object({
    name: z.string().min(1).max(120),
  }),
});

const resourceContentSchema = z.object({
  params: idParam.shape.params,
  body: z.object({
    content: z.string().max(1024 * 1024).default(""),
  }),
});

const permissionSchema = z.object({
  body: z.object({
    identityType: z.enum(["user", "group"]),
    identityId: z.number().int().positive(),
    resourceId: z.number().int().positive(),
    canRead: z.boolean().default(false),
    canWrite: z.boolean().default(false),
  }),
});

const accessCheckSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    resourceId: z.number().int().positive(),
    action: z.enum(["read", "write"]),
  }),
});

module.exports = {
  idParam,
  registerSchema,
  loginSchema,
  userUpdateSchema,
  groupSchema,
  membershipSchema,
  resourceSchema,
  resourceUpdateSchema,
  resourceContentSchema,
  permissionSchema,
  accessCheckSchema,
};
