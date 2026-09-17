const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();

// সব Active Category দেখা
router.get("/", verifyToken, (req, res) => {
  const sql = `
    SELECT id, name, description, image_url, status, created_at
    FROM categories
    ORDER BY id DESC
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

// নতুন Category যোগ করা
router.post("/", verifyToken, (req, res) => {
  const { name, description, image_url } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Category name is required"
    });
  }

  const sql = `
    INSERT INTO categories (name, description, image_url)
    VALUES (?, ?, ?)
  `;

  db.query(
    sql,
    [name, description || null, image_url || null],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            message: "Category already exists"
          });
        }

        return res.status(500).json({
          message: "Database error"
        });
      }

      res.status(201).json({
        message: "Category created successfully",
        category_id: result.insertId
      });
    }
  );
});

// Category পরিবর্তন করা
router.put("/:id", verifyToken, (req, res) => {
  const { name, description, image_url, status } = req.body;
  const { id } = req.params;

  const sql = `
    UPDATE categories
    SET name = ?, description = ?, image_url = ?, status = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [name, description || null, image_url || null, status || "active", id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      res.json({
        message: "Category updated successfully"
      });
    }
  );
});

module.exports = router;