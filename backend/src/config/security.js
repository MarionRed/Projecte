const securityConfig = {
  captchaEnabled: process.env.CAPTCHA_ENABLED === "true",
  twoFactorEnabled: process.env.TWO_FACTOR_ENABLED === "true",
};

module.exports = { securityConfig };
