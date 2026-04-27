const jwt = require("jsonwebtoken");
const { User, logEvent } = require("../models");

const jwtSecret = process.env.JWT_SECRET || "iam_clase_secret";

async function authenticate(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: "No autenticado" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findByPk(payload.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Usuario no valido" });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Token no valido" });
  }
}

function requireRole(roles) {
  return async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      await logEvent(req.user.username, "ACCESS_ROLE_PROTECTED", "DENIED", roles.join(","));
      return res.status(403).json({ message: "Permisos insuficientes" });
    }

    return next();
  };
}

module.exports = { authenticate, requireRole, jwtSecret };
