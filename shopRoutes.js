const express = require("express");
const db = require("./db");

const router = express.Router();

// Customer-এর জন্য সব Active Product
router.get("/products", (req, res) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.selling_price,
      p.stock,
      p.unit,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c
      ON p.category_id = c.id
    WHERE p.status = 'active'
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


// নির্দিষ্ট Product দেখা
router.get("/products/:id", (req, res) => {
  const productId = req.params.id;

  const sql = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.selling_price,
      p.stock,
      p.unit,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c
      ON p.category_id = c.id
    WHERE p.id = ?
      AND p.status = 'active'
  `;

  db.query(sql, [productId], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    res.json(results[0]);
  });
});


// Category অনুযায়ী Product
router.get("/categories/:categoryId/products", (req, res) => {
  const categoryId = req.params.categoryId;

  const sql = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.selling_price,
      p.stock,
      p.unit
    FROM products p
    WHERE p.category_id = ?
      AND p.status = 'active'
    ORDER BY p.id DESC
  `;

  db.query(sql, [categoryId], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    res.json(results);
  });
});

module.exports = router;