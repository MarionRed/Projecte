const express = require("express");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const speakeasy = require("speakeasy");
const svgCaptcha = require("svg-captcha");
const { securityConfig } = require("../config/security");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { authenticate, jwtSecret } = require("../middleware/auth");
const { completePasswordResetSchema, registerSchema, loginSchema } = require("../validators/schemas");
const { User, logEvent } = require("../models");

const router = express.Router();

router.get("/captcha", (req, res) => {
  const captcha = svgCaptcha.create({ noise: 2, color: true });
  req.session.captcha = captcha.text.trim().toLowerCase();
  res.set("Cache-Control", "no-store");
  res.type("svg").send(captcha.data);
});

function captchaMatches(req, submittedCaptcha) {
  const expectedCaptcha = req.session?.captcha;
  if (req.session) {
    delete req.session.captcha;
  }

  return Boolean(
    expectedCaptcha
      && submittedCaptcha
      && submittedCaptcha.trim().toLowerCase() === expectedCaptcha,
  );
}

router.post("/register", validate(registerSchema), asyncRoute(async (req, res) => {
  const { username, password, captcha } = req.validated.body;

  if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
    await logEvent(username, "REGISTER", "CAPTCHA_FAILED");
    return res.status(400).json({ message: "Captcha incorrecto" });
  }

  const exists = await User.findOne({ where: { username } });
  if (exists) {
    return res.status(409).json({ message: "El usuario ya existe" });
  }

  const secret = speakeasy.generateSecret({
    name: `Control de Accesos (${username})`,
    length: 20,
  });

  const user = await User.create({
    username,
    passwordHash: await argon2.hash(password),
    twoFactorSecret: secret.base32,
    twoFactorEnabled: securityConfig.twoFactorEnabled,
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
  await logEvent(username, "REGISTER", "SUCCESS");

  return res.status(201).json({
    user: { id: user.id, username: user.username, role: user.role },
    qrCodeUrl,
    manualSecret: secret.base32,
  });
}));

router.post("/login", validate(loginSchema), asyncRoute(async (req, res) => {
  const { username, password, twoFactorCode, captcha } = req.validated.body;

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
    const remainingSeconds = Math.ceil((user.blockUntil.getTime() - Date.now()) / 1000);
    await logEvent(username, "LOGIN", "BLOCKED");
    return res.status(403).json({
      message: `Cuenta bloqueada temporalmente. Espera ${remainingSeconds} segundos.`,
    });
  }

  const passwordOk = await argon2.verify(user.passwordHash, password);
  if (!passwordOk) {
    const failedAttempts = user.failedAttempts + 1;
    const blockUntil = failedAttempts >= 3 ? new Date(Date.now() + 30 * 1000) : null;
    await user.update({ failedAttempts, blockUntil });
    await logEvent(username, "LOGIN", failedAttempts >= 3 ? "TEMP_BLOCKED" : "FAILED_PASSWORD");
    return res.status(401).json({ message: "Credenciales incorrectas" });
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

  if (securityConfig.twoFactorEnabled && user.twoFactorEnabled) {
    const verified2FA = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
      window: 1,
    });

    if (!verified2FA) {
      await logEvent(username, "2FA", "FAILED");
      return res.status(401).json({ message: "Codigo 2FA incorrecto" });
    }
  }

  await user.update({ failedAttempts: 0, blockUntil: null });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: "1h" },
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  await logEvent(username, "LOGIN", "SUCCESS");
  return res.json({
    user: { id: user.id, username: user.username, role: user.role },
  });
}));

router.post("/complete-password-reset", validate(completePasswordResetSchema), asyncRoute(async (req, res) => {
  const { resetToken, password, captcha } = req.validated.body;

  if (securityConfig.captchaEnabled && !captchaMatches(req, captcha)) {
    await logEvent("password-reset", "PASSWORD_RESET", "CAPTCHA_FAILED");
    return res.status(400).json({ message: "Captcha incorrecto" });
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, jwtSecret);
  } catch (err) {
    return res.status(401).json({ message: "Token de recuperacion caducado o no valido" });
  }

  if (payload.purpose !== "password-reset") {
    return res.status(401).json({ message: "Token de recuperacion no valido" });
  }

  const user = await User.findByPk(payload.id);
  if (!user || !user.passwordResetRequired) {
    return res.status(404).json({ message: "Solicitud de recuperacion no encontrada" });
  }

  const secret = speakeasy.generateSecret({
    name: `Control de Accesos (${user.username})`,
    length: 20,
  });

  await user.update({
    passwordHash: await argon2.hash(password),
    passwordResetRequired: false,
    failedAttempts: 0,
    blockUntil: null,
    twoFactorSecret: secret.base32,
    twoFactorEnabled: securityConfig.twoFactorEnabled,
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
  await logEvent(user.username, "PASSWORD_RESET", "COMPLETED");
  return res.json({
    message: "Contrasena actualizada",
    qrCodeUrl: securityConfig.twoFactorEnabled ? qrCodeUrl : null,
    manualSecret: securityConfig.twoFactorEnabled ? secret.base32 : null,
  });
}));

router.get("/me", authenticate, asyncRoute(async (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      isActive: req.user.isActive,
    },
  });
}));

router.post("/logout", asyncRoute(async (req, res) => {
  let user = null;
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      user = await User.findByPk(payload.id);
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
}));

module.exports = router;
