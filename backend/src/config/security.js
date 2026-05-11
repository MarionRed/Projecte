const securityConfig = {
  captchaEnabled: process.env.CAPTCHA_ENABLED !== "false",
  twoFactorEnabled: process.env.TWO_FACTOR_ENABLED !== "false",
};

module.exports = { securityConfig };
