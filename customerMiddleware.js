const jwt = require("jsonwebtoken");

function verifyCustomer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Access denied. Customer token required."
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (decoded.type !== "customer") {
      return res.status(403).json({
        message: "Customer access required."
      });
    }

    req.customer = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired customer token."
    });
  }
}

module.exports = verifyCustomer;