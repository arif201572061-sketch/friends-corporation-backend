const verifyToken = require("./authMiddleware");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  const sql = "SELECT * FROM admins WHERE email = ? AND status = 'active'";

  db.query(sql, [email], async (err, results) => {
    if (err) {
  console.error("ADMIN LOGIN DATABASE ERROR:", err);

  return res.status(500).json({
    message: "Database error",
    error: err.message
  });
}

    if (results.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const admin = results[0];

    const passwordMatch = await bcrypt.compare(
      password,
      admin.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        role: admin.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );

    res.json({
      message: "Login successful",
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  });
});
router.get("/me", verifyToken, (req, res) => {
  const sql = `
    SELECT id, name, email, role, status, created_at
    FROM admins
    WHERE id = ?
  `;

  db.query(sql, [req.admin.id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Admin not found"
      });
    }

    res.json({
      admin: results[0]
    });
  });
});
module.exports = router;