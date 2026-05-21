const { SecuritySetting } = require("../models");

const DEFAULT_SECURITY_SETTINGS = {
  maxFailedAttempts: 5,
  lockMinutes: 5,
  passwordMinLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  mfaRequired: false,
};

function coerceBoolean(value, fallback) {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return fallback;
}

function normalizeSettings(input = {}) {
  return {
    maxFailedAttempts: Math.min(20, Math.max(2, Number(input.maxFailedAttempts ?? DEFAULT_SECURITY_SETTINGS.maxFailedAttempts))),
    lockMinutes: Math.min(120, Math.max(1, Number(input.lockMinutes ?? DEFAULT_SECURITY_SETTINGS.lockMinutes))),
    passwordMinLength: Math.min(64, Math.max(8, Number(input.passwordMinLength ?? DEFAULT_SECURITY_SETTINGS.passwordMinLength))),
    requireUppercase: coerceBoolean(input.requireUppercase, DEFAULT_SECURITY_SETTINGS.requireUppercase),
    requireLowercase: coerceBoolean(input.requireLowercase, DEFAULT_SECURITY_SETTINGS.requireLowercase),
    requireNumber: coerceBoolean(input.requireNumber, DEFAULT_SECURITY_SETTINGS.requireNumber),
    requireSymbol: coerceBoolean(input.requireSymbol, DEFAULT_SECURITY_SETTINGS.requireSymbol),
    mfaRequired: coerceBoolean(input.mfaRequired, DEFAULT_SECURITY_SETTINGS.mfaRequired),
  };
}

async function getSecuritySettings() {
  const rows = await SecuritySetting.findAll();
  const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
  return normalizeSettings({ ...DEFAULT_SECURITY_SETTINGS, ...stored });
}

async function saveSecuritySettings(input) {
  const settings = normalizeSettings(input);
  await Promise.all(
    Object.entries(settings).map(([key, value]) =>
      SecuritySetting.upsert({ key, value: JSON.stringify(value) }),
    ),
  );
  return settings;
}

function validatePasswordWithSettings(password, settings) {
  const errors = [];
  if (String(password || "").length < settings.passwordMinLength) {
    errors.push(`minimo ${settings.passwordMinLength} caracteres`);
  }
  if (settings.requireUppercase && !/[A-Z]/.test(password)) errors.push("una mayuscula");
  if (settings.requireLowercase && !/[a-z]/.test(password)) errors.push("una minuscula");
  if (settings.requireNumber && !/\d/.test(password)) errors.push("un numero");
  if (settings.requireSymbol && !/[^A-Za-z0-9]/.test(password)) errors.push("un simbolo");

  return {
    valid: errors.length === 0,
    message: errors.length === 0 ? "" : `La contrasena debe tener ${errors.join(", ")}.`,
  };
}

module.exports = {
  DEFAULT_SECURITY_SETTINGS,
  getSecuritySettings,
  saveSecuritySettings,
  validatePasswordWithSettings,
};
