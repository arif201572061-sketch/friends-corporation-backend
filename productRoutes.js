const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();

// সব Product দেখা
router.get("/", verifyToken, (req, res) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.buying_price,
      p.selling_price,
      p.stock,
      p.unit,
      p.commission_percent,
      p.status,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c
      ON p.category_id = c.id
    ORDER BY p.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    res.json(results);
  });
});

// নতুন Product যোগ করা
router.post("/", verifyToken, (req, res) => {
  const {
    name,
    category_id,
    description,
    image_url,
    buying_price,
    selling_price,
    stock,
    unit,
    commission_percent
  } = req.body;

  if (!name || selling_price === undefined) {
    return res.status(400).json({
      message: "Product name and selling price are required"
    });
  }

  const sql = `
    INSERT INTO products
    (
      name,
      category_id,
      description,
      image_url,
      buying_price,
      selling_price,
      stock,
      unit,
      commission_percent
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      name,
      category_id || null,
      description || null,
      image_url || null,
      buying_price || 0,
      selling_price,
      stock || 0,
      unit || "piece",
      commission_percent || 0
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      res.status(201).json({
        message: "Product created successfully",
        product_id: result.insertId
      });
    }
  );
});

// Product পরিবর্তন করা
router.put("/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  const {
    name,
    category_id,
    description,
    image_url,
    buying_price,
    selling_price,
    stock,
    unit,
    commission_percent,
    status
  } = req.body;

  const sql = `
    UPDATE products
    SET
      name = ?,
      category_id = ?,
      description = ?,
      image_url = ?,
      buying_price = ?,
      selling_price = ?,
      stock = ?,
      unit = ?,
      commission_percent = ?,
      status = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      name,
      category_id || null,
      description || null,
      image_url || null,
      buying_price || 0,
      selling_price,
      stock || 0,
      unit || "piece",
      commission_percent || 0,
      status || "active",
      id
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      res.json({
        message: "Product updated successfully"
      });
    }
  );
});

module.exports = router;