const { z } = require("zod");

const idParam = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const passwordPolicyMessage = "La contrasena no cumple la politica de seguridad configurada";
const passwordSchema = z.string().min(1).max(120);

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(40),
    email: z.string().email().max(160).optional().or(z.literal("")).default(""),
    password: passwordSchema,
    captcha: z.string().optional().default(""),
  }),
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    captcha: z.string().optional().default(""),
  }),
});

const verifyMfaSchema = z.object({
  body: z.object({
    mfaToken: z.string().min(1),
    twoFactorCode: z.string().min(4).max(12),
  }),
});

const completePasswordResetSchema = z.object({
  body: z.object({
    resetToken: z.string().min(1),
    password: passwordSchema,
    captcha: z.string().optional().default(""),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    emailOrUsername: z.string().min(1).max(160),
    captcha: z.string().optional().default(""),
  }),
});

const verifyEmailSchema = z.object({
  query: z.object({
    token: z.string().min(1),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(120),
    newPassword: passwordSchema,
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
    classification: z.enum(["public", "internal", "confidential", "restricted"]).optional().default("internal"),
    content: z.string().max(1024 * 1024).optional().default(""),
    contentBase64: z.string().max(20 * 1024 * 1024).optional().nullable(),
    fileType: z.string().max(80).optional().nullable(),
    parentId: z.number().int().positive().optional().nullable(),
    ownerUserId: z.number().int().positive().optional().nullable(),
    ownerGroupId: z.number().int().positive().optional().nullable(),
    sharedGroupIds: z.array(z.number().int().positive()).max(50).optional().default([]),
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
    identityType: z.enum(["group"]),
    identityId: z.number().int().positive(),
    resourceId: z.number().int().positive(),
    canRead: z.boolean().default(false),
    canWrite: z.boolean().default(false),
    expiresAt: z.string().datetime().optional().nullable(),
  }),
});

const accessCheckSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    resourceId: z.number().int().positive(),
    action: z.enum(["read", "write"]),
  }),
});

const logQuerySchema = z.object({
  query: z.object({
    user: z.string().max(80).optional().default(""),
    action: z.string().max(80).optional().default(""),
    status: z.string().max(80).optional().default(""),
    date: z.string().max(20).optional().default(""),
    search: z.string().max(160).optional().default(""),
  }),
});

const accessRequestSchema = z.object({
  body: z.object({
    resourceId: z.number().int().positive(),
    action: z.enum(["read", "write"]),
    reason: z.string().max(300).optional().default(""),
  }),
});

const accessRequestDecisionSchema = z.object({
  params: idParam.shape.params,
  body: z.object({
    status: z.enum(["approved", "rejected"]),
  }),
});

const securitySettingsSchema = z.object({
  body: z.object({
    maxFailedAttempts: z.number().int().min(2).max(20),
    lockMinutes: z.number().int().min(1).max(120),
    passwordMinLength: z.number().int().min(8).max(64),
    requireUppercase: z.boolean(),
    requireLowercase: z.boolean(),
    requireNumber: z.boolean(),
    requireSymbol: z.boolean(),
    mfaRequired: z.boolean(),
  }),
});

const attackSimulationSchema = z.object({
  body: z.object({
    attackType: z.enum(["path_traversal", "brute_force", "permission_probe", "token_tamper"]),
    target: z.string().min(1).max(180).optional().default("/clase/apuntes/tema1.txt"),
  }),
});

const taskSchema = z.object({
  body: z.object({
    text: z.string().trim().min(1).max(180),
    dueDate: z.string().max(20).optional().nullable().default(null),
  }),
});

const taskUpdateSchema = z.object({
  params: idParam.shape.params,
  body: z.object({
    completed: z.boolean(),
  }),
});

module.exports = {
  attackSimulationSchema,
  accessRequestDecisionSchema,
  accessRequestSchema,
  changePasswordSchema,
  completePasswordResetSchema,
  forgotPasswordSchema,
  verifyEmailSchema,
  verifyMfaSchema,
  idParam,
  logQuerySchema,
  passwordPolicyMessage,
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
  securitySettingsSchema,
  taskSchema,
  taskUpdateSchema,
};
