function requireMainAdmin(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({
      message: "Admin authentication required."
    });
  }

  if (req.admin.role !== "main_admin") {
    return res.status(403).json({
      message: "Only Main Admin can perform this action."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({
      message: "Admin authentication required."
    });
  }

  if (
    req.admin.role !== "main_admin" &&
    req.admin.role !== "sub_admin"
  ) {
    return res.status(403).json({
      message: "Admin access denied."
    });
  }

  next();
}

module.exports = {
  requireMainAdmin,
  requireAdmin
};