const express = require("express");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const speakeasy = require("speakeasy");
const svgCaptcha = require("svg-captcha");
const { securityConfig } = require("../config/security");
const { validate } = require("../middleware/validate");
const { authenticate, jwtSecret } = require("../middleware/auth");
const { registerSchema, loginSchema } = require("../validators/schemas");
const { User, logEvent } = require("../models");

const router = express.Router();

router.get("/captcha", (req, res) => {
  const captcha = svgCaptcha.create({ noise: 2, color: true });
  req.session.captcha = captcha.text;
  res.type("svg").send(captcha.data);
});

router.post("/register", validate(registerSchema), async (req, res) => {
  const { username, password, captcha } = req.validated.body;

  if (securityConfig.captchaEnabled && captcha !== req.session.captcha) {
    await logEvent(username, "REGISTER", "CAPTCHA_FAILED");
    return res.status(400).json({ message: "Captcha incorrecto" });
  }

  const exists = await User.findOne({ where: { username } });
  if (exists) {
    return res.status(409).json({ message: "El usuario ya existe" });
  }

  const secret = speakeasy.generateSecret({
    name: `AccessGuard IAM (${username})`,
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
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { username, password, twoFactorCode, captcha } = req.validated.body;

  if (securityConfig.captchaEnabled && captcha !== req.session.captcha) {
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
});

router.get("/me", authenticate, async (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      isActive: req.user.isActive,
    },
  });
});

router.post("/logout", authenticate, async (req, res) => {
  await logEvent(req.user.username, "LOGOUT", "SUCCESS");
  res.clearCookie("token");
  return res.json({ message: "Sesion cerrada" });
});

module.exports = router;
