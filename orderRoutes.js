const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();

// সব Order দেখা — Admin
router.get("/", verifyToken, (req, res) => {
  const sql = `
    SELECT
      o.id,
      o.customer_id,
      c.name AS customer_name,
      o.employee_id,
      e.name AS employee_name,
      o.total_amount,
      o.delivery_charge,
      o.payment_method,
      o.payment_status,
      o.order_status,
      o.delivery_address,
      o.customer_phone,
      o.created_at
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON o.employee_id = e.id
    ORDER BY o.id DESC
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


// নির্দিষ্ট Order-এর বিস্তারিত দেখা
router.get("/:id", verifyToken, (req, res) => {
  const orderId = req.params.id;

  const orderSql = `
    SELECT
      o.id,
      o.customer_id,
      c.name AS customer_name,
      o.employee_id,
      e.name AS employee_name,
      o.total_amount,
      o.delivery_charge,
      o.payment_method,
      o.payment_status,
      o.order_status,
      o.delivery_address,
      o.customer_phone,
      o.created_at
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON o.employee_id = e.id
    WHERE o.id = ?
  `;

  const itemsSql = `
    SELECT
      oi.id,
      oi.product_id,
      p.name AS product_name,
      p.image_url,
      oi.quantity,
      oi.unit_price,
      oi.subtotal
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `;

  db.query(orderSql, [orderId], (err, orderResults) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    if (orderResults.length === 0) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    db.query(itemsSql, [orderId], (err, itemResults) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      res.json({
        order: orderResults[0],
        items: itemResults
      });
    });
  });
});

module.exports = router;