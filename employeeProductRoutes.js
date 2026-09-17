const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();

// Employee-এর জন্য শুধু পণ্য ও Stock দেখা
router.get("/", verifyToken, (req, res) => {

  // শুধু Employee token গ্রহণ করবে
  if (!req.user || req.user.role !== "employee") {
    return res.status(403).json({
      message: "Employee access required."
    });
  }

  const sql = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.selling_price,
      p.stock,
      p.unit,
      p.status,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c
      ON p.category_id = c.id
    ORDER BY p.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Employee product API error:", err);

      return res.status(500).json({
        message: "Database error"
      });
    }

    res.json({
      success: true,
      products: results
    });
  });
});

module.exports = router;