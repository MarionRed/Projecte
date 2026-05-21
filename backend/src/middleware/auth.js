const jwt = require("jsonwebtoken");
const { SessionHistory, User, logEvent } = require("../models");

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

    if (payload.sessionId && payload.sessionToken) {
      const session = await SessionHistory.findByPk(payload.sessionId);
      if (!session || session.tokenId !== payload.sessionToken || session.revokedAt) {
        return res.status(401).json({ message: "Sesion revocada" });
      }
      req.sessionRecord = session;
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Token no valido" });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      logEvent(req.user.username, "ACCESS_ROLE_PROTECTED", "DENIED", roles.join(",")).catch(() => {});
      return res.status(403).json({ message: "Permisos insuficientes" });
    }

    return next();
  };
}

module.exports = { authenticate, requireRole, jwtSecret };
