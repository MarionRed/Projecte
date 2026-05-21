function normalizeIp(rawIp = "") {
  const value = String(rawIp || "").trim();
  if (!value) return "unknown";
  if (value.startsWith("::ffff:")) return value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value;
}

function isPrivateIp(ip) {
  return (
    ip === "127.0.0.1" ||
    ip === "localhost" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

function classifyIp(ip) {
  if (!ip || ip === "unknown") return "unknown";
  if (ip === "127.0.0.1" || ip === "localhost") return "loopback";
  if (isPrivateIp(ip)) return "private";
  if (ip.startsWith("203.0.113.") || ip.startsWith("198.51.100.") || ip.startsWith("192.0.2.")) {
    return "documentation";
  }
  return "public";
}

function approximateGeoForIp(rawIp) {
  const ip = normalizeIp(rawIp);
  const type = classifyIp(ip);
  if (type === "loopback") {
    return { ip, ipType: type, country: "Local", city: "Equipo local", geoLabel: "Local / Equipo" };
  }
  if (type === "private") {
    return { ip, ipType: type, country: "LAN", city: "Red privada", geoLabel: "LAN / Red privada" };
  }
  if (type === "documentation") {
    return { ip, ipType: type, country: "Demo", city: "Rango reservado", geoLabel: "Demo / Rango reservado" };
  }
  if (type === "unknown") {
    return { ip, ipType: type, country: "Unknown", city: "Unknown", geoLabel: "Unknown" };
  }
  return { ip, ipType: type, country: "Internet", city: "Ubicacion aproximada", geoLabel: "Internet / Geo aproximada" };
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return normalizeIp(forwarded || req.ip || req.socket?.remoteAddress || "");
}

function userAgentLabel(userAgent = "") {
  const value = String(userAgent || "");
  const browser =
    value.includes("Edg/") ? "Edge" :
      value.includes("Chrome/") ? "Chrome" :
        value.includes("Firefox/") ? "Firefox" :
          value.includes("Safari/") ? "Safari" :
            value ? "Otro navegador" : "Desconocido";
  const os =
    value.includes("Windows") ? "Windows" :
      value.includes("Mac OS") ? "macOS" :
        value.includes("Linux") ? "Linux" :
          value.includes("Android") ? "Android" :
            value.includes("iPhone") || value.includes("iPad") ? "iOS" : "SO desconocido";
  return `${browser} / ${os}`;
}

function detectSuspiciousLogin({ previousSessions, ip, userAgent }) {
  const reasons = [];
  const normalizedIp = normalizeIp(ip);
  const label = userAgentLabel(userAgent);
  const previous = previousSessions || [];

  if (previous.length === 0) {
    return { suspicious: false, suspiciousReason: "", riskScore: 10 };
  }

  const knownIps = new Set(previous.map((session) => normalizeIp(session.ip)));
  const knownAgents = new Set(previous.map((session) => session.userAgentLabel || userAgentLabel(session.userAgent)));
  const currentIpType = classifyIp(normalizedIp);

  if (!knownIps.has(normalizedIp)) reasons.push("IP nueva para este usuario");
  if (!knownAgents.has(label)) reasons.push("Navegador/dispositivo nuevo");
  if (currentIpType === "public" && previous.some((session) => session.ipType === "private" || session.ipType === "loopback")) {
    reasons.push("Cambio de red local a IP publica");
  }

  const riskScore = Math.min(100, reasons.length * 30 + (currentIpType === "public" ? 10 : 0));
  return {
    suspicious: reasons.length > 0,
    suspiciousReason: reasons.join("; "),
    riskScore,
  };
}

module.exports = {
  approximateGeoForIp,
  clientIp,
  detectSuspiciousLogin,
  normalizeIp,
  userAgentLabel,
};
