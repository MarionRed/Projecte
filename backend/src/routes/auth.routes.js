const express = require("express");
const crypto = require("crypto");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const speakeasy = require("speakeasy");
const svgCaptcha = require("svg-captcha");
const { Op } = require("sequelize");
const { securityConfig } = require("../config/security");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { authenticate, jwtSecret } = require("../middleware/auth");
const { approximateGeoForIp, clientIp, detectSuspiciousLogin, userAgentLabel } = require("../services/ipIntel");
const { getSecuritySettings, validatePasswordWithSettings } = require("../services/securitySettings");
const {
  completePasswordResetSchema,
  forgotPasswordSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  verifyMfaSchema,
} = require("../validators/schemas");
const { User, Group, SessionHistory, logEvent } = require("../models");

const router = express.Router();
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

router.get("/captcha", (req, res) => {
  const captcha = svgCaptcha.create({
    noise: 3,
    color: true,
    width: 240,
    height: 80,
    fontSize: 72,
  });
  req.session.captcha = {
    text: captcha.text.trim().toLowerCase(),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  };
  res.set("Cache-Control", "no-store");
  res.type("svg").send(captcha.data);
});

function captchaMatches(req, submittedCaptcha) {
  const storedCaptcha = req.session?.captcha;
  if (req.session) {
    delete req.session.captcha;
  }

  const expectedCaptcha = typeof storedCaptcha === "string"
    ? { text: storedCaptcha, expiresAt: Date.now() + 1 }
    : storedCaptcha;

  return Boolean(
    expectedCaptcha?.text &&
    expectedCaptcha.expiresAt >= Date.now() &&
    submittedCaptcha &&
    submittedCaptcha.trim().toLowerCase() === expectedCaptcha.text,
  );
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicResetLink(req, token) {
  const origin = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || `${req.protocol}://${req.get("host")}`;
  return `${origin}/?resetToken=${encodeURIComponent(token)}`;
}

function publicEmailVerificationLink(req, token) {
  const origin = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || `${req.protocol}://${req.get("host")}`;
  return `${origin}/?verifyEmailToken=${encodeURIComponent(token)}`;
}

async function rejectWeakPassword(res, password) {
  const settings = await getSecuritySettings();
  const result = validatePasswordWithSettings(password, settings);
  if (result.valid) return false;
  res.status(400).json({ message: result.message });
  return true;
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function issueEmailVerification(req, user) {
  if (!user.email) return null;
  const token = generateSecureToken();
  const verificationLink = publicEmailVerificationLink(req, token);
  await user.update({
    emailVerified: false,
    emailVerificationTokenHash: hashResetToken(token),
    emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  await logEvent(user.username, "EMAIL_VERIFICATION_SENT", "PENDING", "Modo demo: enlace generado sin SMTP");
  console.log(`[IAM DEMO] Verificacion email para ${user.username}: ${verificationLink}`);
  return verificationLink;
}

async function createAuthenticatedSession(req, res, user) {
  const sessionToken = crypto.randomUUID();
  const ip = clientIp(req);
  const userAgent = req.get("user-agent") || "";
  const geo = approximateGeoForIp(ip);
  const previousSessions = await SessionHistory.findAll({
    where: { userId: user.id },
    order: [["createdAt", "DESC"]],
    limit: 10,
  });
  const suspicious = detectSuspiciousLogin({ previousSessions, ip, userAgent });

  await user.update({ failedAttempts: 0, blockUntil: null, lastLoginAt: new Date() });
  const sessionRecord = await SessionHistory.create({
    userId: user.id,
    tokenId: sessionToken,
    ip: geo.ip,
    ipType: geo.ipType,
    country: geo.country,
    city: geo.city,
    geoLabel: geo.geoLabel,
    userAgent,
    userAgentLabel: userAgentLabel(userAgent),
    suspicious: suspicious.suspicious,
    suspiciousReason: suspicious.suspiciousReason,
    riskScore: suspicious.riskScore,
  });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, sessionId: sessionRecord.id, sessionToken },
    jwtSecret,
    { expiresIn: "1h" },
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  await logEvent(user.username, "LOGIN", "SUCCESS", `${geo.ip} · ${geo.geoLabel} · ${userAgentLabel(userAgent)}`);
  if (suspicious.suspicious) {
    await logEvent(user.username, "SUSPICIOUS_LOGIN", "HIGH", `${suspicious.suspiciousReason} · ${geo.ip} · ${geo.geoLabel}`);
  }

  return { id: user.id, username: user.username, role: user.role };
}

router.post(
  "/register",
  validate(registerSchema),
  asyncRoute(async (req, res) => {
    const { username, email, password, captcha } = req.validated.body;

    if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
      await logEvent(username, "REGISTER", "CAPTCHA_FAILED");
      return res.status(400).json({ message: "Captcha incorrecto" });
    }

    if (await rejectWeakPassword(res, password)) return;

    const exists = await User.findOne({ where: { username } });
    if (exists) {
      return res.status(409).json({ message: "El usuario ya existe" });
    }

    const secret = speakeasy.generateSecret({
      name: `Control de Accesos (${username})`,
      length: 20,
    });

    const settings = await getSecuritySettings();
    const user = await User.create({
      username,
      email: email || null,
      emailVerified: false,
      passwordHash: await argon2.hash(password),
      twoFactorSecret: secret.base32,
      twoFactorEnabled: securityConfig.twoFactorEnabled || settings.mfaRequired,
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    const devVerificationLink = await issueEmailVerification(req, user);
    await logEvent(username, "REGISTER", "SUCCESS");

    const response = {
      user: { id: user.id, username: user.username, role: user.role },
      qrCodeUrl,
      manualSecret: secret.base32,
      message: user.email
        ? "Usuario creado. Verifica tu email para activar recuperacion de contrasena."
        : "Usuario creado.",
    };
    if (!process.env.SMTP_HOST && devVerificationLink) {
      response.devVerificationLink = devVerificationLink;
    }
    return res.status(201).json(response);
  }),
);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncRoute(async (req, res) => {
    const { emailOrUsername, captcha } = req.validated.body;

    if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
      await logEvent(emailOrUsername, "PASSWORD_RESET_REQUEST", "CAPTCHA_FAILED");
      return res.status(400).json({ message: "Captcha incorrecto" });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [{ username: emailOrUsername }, { email: emailOrUsername }],
      },
    });

    let devResetLink = null;
    await logEvent(emailOrUsername, "PASSWORD_RESET_REQUEST", "REQUESTED");
    if (user && user.isActive && user.email && user.emailVerified) {
      const resetToken = generateSecureToken();
      await user.update({
        passwordResetTokenHash: hashResetToken(resetToken),
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        passwordResetRequired: true,
      });
      devResetLink = publicResetLink(req, resetToken);
      await logEvent(user.username, "PASSWORD_RESET_REQUEST", "TOKEN_CREATED", "Modo demo: enlace generado sin SMTP");
      console.log(`[IAM DEMO] Recuperacion para ${user.username}: ${devResetLink}`);
    } else {
      await logEvent(emailOrUsername, "PASSWORD_RESET_REQUEST", "NOT_SENT_OR_UNVERIFIED");
    }

    const response = {
      message: "Si el correo existe y esta verificado, se ha enviado un enlace de recuperacion.",
    };
    if (process.env.SMTP_HOST || process.env.NODE_ENV === "production") {
      return res.json(response);
    }
    return res.json({ ...response, devResetLink });
  }),
);

router.get(
  "/verify-email",
  validate(verifyEmailSchema),
  asyncRoute(async (req, res) => {
    const tokenHash = hashResetToken(req.validated.query.token);
    const user = await User.findOne({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Token de verificacion caducado o no valido" });
    }

    await user.update({
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    });
    await logEvent(user.username, "EMAIL_VERIFIED", "SUCCESS", user.email || "");
    return res.json({ message: "Email verificado correctamente. Ya puedes usar recuperacion de contrasena." });
  }),
);

router.post(
  "/login",
  validate(loginSchema),
  asyncRoute(async (req, res) => {
    const { username, password, captcha } = req.validated.body;
    const settings = await getSecuritySettings();

    if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
      await logEvent(username, "LOGIN", "CAPTCHA_FAILED");
      return res.status(400).json({ message: "Captcha incorrecto" });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      await logEvent(username, "LOGIN", "USER_NOT_FOUND");
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    if (!user.isActive) {
      await logEvent(username, "LOGIN", "ACCOUNT_DISABLED");
      return res.status(403).json({ message: "Cuenta desactivada" });
    }

    if (user.blockUntil && user.blockUntil.getTime() > Date.now()) {
      const remainingSeconds = Math.ceil(
        (user.blockUntil.getTime() - Date.now()) / 1000,
      );
      await logEvent(username, "LOGIN", "BLOCKED");
      return res.status(403).json({
        message: `Cuenta bloqueada temporalmente. Espera ${remainingSeconds} segundos.`,
      });
    }

    const passwordOk = await argon2.verify(user.passwordHash, password);
    if (!passwordOk) {
      const failedAttempts = user.failedAttempts + 1;
      const blockUntil =
        failedAttempts >= settings.maxFailedAttempts
          ? new Date(Date.now() + settings.lockMinutes * 60 * 1000)
          : null;
      await user.update({ failedAttempts, blockUntil });
      await logEvent(
        username,
        "LOGIN",
        failedAttempts >= settings.maxFailedAttempts ? "USER_BLOCKED" : "FAILED_PASSWORD",
        failedAttempts >= settings.maxFailedAttempts
          ? `Bloqueo temporal de ${settings.lockMinutes} minutos por ${settings.maxFailedAttempts} intentos fallidos`
          : `${failedAttempts}/${settings.maxFailedAttempts}`,
      );
      return res.status(401).json({
        message: failedAttempts >= settings.maxFailedAttempts
          ? `Cuenta bloqueada temporalmente durante ${settings.lockMinutes} minutos por demasiados intentos fallidos.`
          : "Credenciales incorrectas",
      });
    }

    if (user.passwordResetRequired) {
      const resetToken = jwt.sign(
        { id: user.id, username: user.username, purpose: "password-reset" },
        jwtSecret,
        { expiresIn: "15m" },
      );
      await user.update({ failedAttempts: 0, blockUntil: null });
      await logEvent(username, "PASSWORD_RESET_LOGIN", "PENDING");
      return res.json({
        passwordResetRequired: true,
        resetToken,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }

    if (securityConfig.twoFactorEnabled && (user.twoFactorEnabled || settings.mfaRequired)) {
      const mfaToken = jwt.sign(
        { id: user.id, username: user.username, purpose: "mfa-login" },
        jwtSecret,
        { expiresIn: "5m" },
      );
      await user.update({ failedAttempts: 0, blockUntil: null });
      await logEvent(username, "MFA_REQUIRED", "PENDING", "Credenciales primarias correctas");
      return res.json({
        mfaRequired: true,
        mfaToken,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }

    const sessionToken = crypto.randomUUID();
    const ip = clientIp(req);
    const userAgent = req.get("user-agent") || "";
    const geo = approximateGeoForIp(ip);
    const previousSessions = await SessionHistory.findAll({
      where: { userId: user.id },
      order: [["createdAt", "DESC"]],
      limit: 10,
    });
    const suspicious = detectSuspiciousLogin({ previousSessions, ip, userAgent });

    await user.update({ failedAttempts: 0, blockUntil: null, lastLoginAt: new Date() });
    const sessionRecord = await SessionHistory.create({
      userId: user.id,
      tokenId: sessionToken,
      ip: geo.ip,
      ipType: geo.ipType,
      country: geo.country,
      city: geo.city,
      geoLabel: geo.geoLabel,
      userAgent,
      userAgentLabel: userAgentLabel(userAgent),
      suspicious: suspicious.suspicious,
      suspiciousReason: suspicious.suspiciousReason,
      riskScore: suspicious.riskScore,
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, sessionId: sessionRecord.id, sessionToken },
      jwtSecret,
      { expiresIn: "1h" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });

    await logEvent(username, "LOGIN", "SUCCESS", `${geo.ip} · ${geo.geoLabel} · ${userAgentLabel(userAgent)}`);
    if (suspicious.suspicious) {
      await logEvent(username, "SUSPICIOUS_LOGIN", "HIGH", `${suspicious.suspiciousReason} · ${geo.ip} · ${geo.geoLabel}`);
    }
    return res.json({
      user: { id: user.id, username: user.username, role: user.role },
    });
  }),
);

router.post(
  "/verify-mfa",
  validate(verifyMfaSchema),
  asyncRoute(async (req, res) => {
    const { mfaToken, twoFactorCode } = req.validated.body;

    let payload;
    try {
      payload = jwt.verify(mfaToken, jwtSecret);
    } catch (err) {
      await logEvent("mfa", "MFA_FAILED", "TOKEN_INVALID");
      return res.status(401).json({ message: "Verificacion MFA caducada o no valida" });
    }

    if (payload.purpose !== "mfa-login") {
      await logEvent(payload.username || "mfa", "MFA_FAILED", "WRONG_PURPOSE");
      return res.status(401).json({ message: "Verificacion MFA no valida" });
    }

    const user = await User.findByPk(payload.id);
    if (!user || !user.isActive) {
      await logEvent(payload.username || "mfa", "MFA_FAILED", "USER_INVALID");
      return res.status(401).json({ message: "Usuario no valido" });
    }

    const verified2FA = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
      window: 1,
    });

    if (!verified2FA) {
      await logEvent(user.username, "MFA_FAILED", "FAILED");
      return res.status(401).json({ message: "Codigo MFA incorrecto" });
    }

    await logEvent(user.username, "MFA_SUCCESS", "SUCCESS");
    const authenticatedUser = await createAuthenticatedSession(req, res, user);
    return res.json({ user: authenticatedUser });
  }),
);

router.post(
  "/complete-password-reset",
  validate(completePasswordResetSchema),
  asyncRoute(async (req, res) => {
    const { resetToken, password, captcha } = req.validated.body;

    if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
      await logEvent("password-reset", "PASSWORD_RESET", "CAPTCHA_FAILED");
      return res.status(400).json({ message: "Captcha incorrecto" });
    }

    if (await rejectWeakPassword(res, password)) return;

    let user = null;
    try {
      const payload = jwt.verify(resetToken, jwtSecret);
      if (payload.purpose === "password-reset") {
        user = await User.findByPk(payload.id);
      }
    } catch (err) {
      user = await User.findOne({
        where: {
          passwordResetTokenHash: hashResetToken(resetToken),
          passwordResetExpiresAt: { [Op.gt]: new Date() },
        },
      });
    }

    if (!user || !user.passwordResetRequired) {
      return res
        .status(401)
        .json({ message: "Token de recuperacion caducado o no valido" });
    }

    const secret = speakeasy.generateSecret({
      name: `Control de Accesos (${user.username})`,
      length: 20,
    });

    await user.update({
      passwordHash: await argon2.hash(password),
      passwordResetRequired: false,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      failedAttempts: 0,
      blockUntil: null,
      twoFactorSecret: secret.base32,
      twoFactorEnabled: securityConfig.twoFactorEnabled || (await getSecuritySettings()).mfaRequired,
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    await logEvent(user.username, "PASSWORD_RESET_SUCCESS", "SUCCESS");
    return res.json({
      message: "Contrasena actualizada",
      qrCodeUrl: securityConfig.twoFactorEnabled ? qrCodeUrl : null,
      manualSecret: securityConfig.twoFactorEnabled ? secret.base32 : null,
    });
  }),
);

router.get(
  "/me",
  authenticate,
  asyncRoute(async (req, res) => {
    return res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        role: req.user.role,
        isActive: req.user.isActive,
      },
    });
  }),
);

router.get(
  "/profile",
  authenticate,
  asyncRoute(async (req, res) => {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "username", "email", "emailVerified", "role", "isActive", "lastLoginAt", "twoFactorEnabled"],
      include: [{ model: Group, attributes: ["id", "name"], through: { attributes: [] } }],
    });
    return res.json({ user });
  }),
);

router.post(
  "/change-password",
  authenticate,
  validate(require("../validators/schemas").changePasswordSchema),
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.validated.body;
    if (await rejectWeakPassword(res, newPassword)) return;
    const user = await User.findByPk(req.user.id);
    const passwordOk = await argon2.verify(user.passwordHash, currentPassword);
    if (!passwordOk) {
      await logEvent(user.username, "PASSWORD_CHANGE", "FAILED");
      return res.status(401).json({ message: "La contrasena actual no coincide" });
    }
    await user.update({ passwordHash: await argon2.hash(newPassword), passwordResetRequired: false });
    await logEvent(user.username, "PASSWORD_CHANGE", "SUCCESS");
    return res.json({ message: "Contrasena actualizada" });
  }),
);

router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    let user = null;
    const token = req.cookies?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        user = await User.findByPk(payload.id);
        if (payload.sessionId && payload.sessionToken) {
          await SessionHistory.update(
            { revokedAt: new Date() },
            { where: { id: payload.sessionId, tokenId: payload.sessionToken, revokedAt: null } },
          );
        }
      } catch (err) {
        user = null;
      }
    }

    if (user) {
      await logEvent(user.username, "LOGOUT", "SUCCESS");
    }
    res.clearCookie("token");
    res.clearCookie("connect.sid");
    if (req.session) {
      req.session.destroy(() => {});
    }
    return res.json({ message: "Sesion cerrada" });
  }),
);

module.exports = router;
