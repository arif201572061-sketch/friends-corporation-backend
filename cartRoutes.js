const express = require("express");
const db = require("./db");
const verifyCustomer = require("./customerMiddleware");

const router = express.Router();

// Cart দেখা
router.get("/", verifyCustomer, (req, res) => {
  const sql = `
    SELECT
      c.id,
      c.product_id,
      p.name,
      p.image_url,
      p.selling_price,
      p.unit,
      p.stock,
      c.quantity,
      (p.selling_price * c.quantity) AS subtotal
    FROM carts c
    JOIN products p ON c.product_id = p.id
    WHERE c.customer_id = ?
    ORDER BY c.id DESC
  `;

  db.query(sql, [req.customer.id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    res.json(results);
  });
});


// Cart-এ Product যোগ করা
router.post("/", verifyCustomer, (req, res) => {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({
      message: "Product and valid quantity are required"
    });
  }

  const productSql = `
    SELECT id, selling_price, stock, status
    FROM products
    WHERE id = ? AND status = 'active'
  `;

  db.query(productSql, [product_id], (err, products) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    if (products.length === 0) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    const product = products[0];

    if (quantity > product.stock) {
      return res.status(400).json({
        message: "Requested quantity is not available"
      });
    }

    const cartSql = `
      SELECT id, quantity
      FROM carts
      WHERE customer_id = ? AND product_id = ?
    `;

    db.query(
      cartSql,
      [req.customer.id, product_id],
      (err, carts) => {
        if (err) {
          return res.status(500).json({
            message: "Database error"
          });
        }

        if (carts.length > 0) {
          const newQuantity = Number(carts[0].quantity) + Number(quantity);

          if (newQuantity > product.stock) {
            return res.status(400).json({
              message: "Cart quantity exceeds available stock"
            });
          }

          const updateSql = `
            UPDATE carts
            SET quantity = ?
            WHERE id = ?
          `;

          db.query(
            updateSql,
            [newQuantity, carts[0].id],
            (err) => {
              if (err) {
                return res.status(500).json({
                  message: "Database error"
                });
              }

              res.json({
                message: "Cart quantity updated"
              });
            }
          );
        } else {
          const insertSql = `
            INSERT INTO carts
            (customer_id, product_id, quantity)
            VALUES (?, ?, ?)
          `;

          db.query(
            insertSql,
            [req.customer.id, product_id, quantity],
            (err, result) => {
              if (err) {
                return res.status(500).json({
                  message: "Database error"
                });
              }

              res.status(201).json({
                message: "Product added to cart",
                cart_id: result.insertId
              });
            }
          );
        }
      }
    );
  });
});


// Quantity পরিবর্তন
router.put("/:id", verifyCustomer, (req, res) => {
  const { quantity } = req.body;
  const cartId = req.params.id;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({
      message: "Quantity must be greater than 0"
    });
  }

  const sql = `
    SELECT
      c.id,
      p.stock
    FROM carts c
    JOIN products p ON c.product_id = p.id
    WHERE c.id = ? AND c.customer_id = ?
  `;

  db.query(
    sql,
    [cartId, req.customer.id],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: "Cart item not found"
        });
      }

      if (quantity > results[0].stock) {
        return res.status(400).json({
          message: "Quantity exceeds available stock"
        });
      }

      const updateSql = `
        UPDATE carts
        SET quantity = ?
        WHERE id = ? AND customer_id = ?
      `;

      db.query(
        updateSql,
        [quantity, cartId, req.customer.id],
        (err) => {
          if (err) {
            return res.status(500).json({
              message: "Database error"
            });
          }

          res.json({
            message: "Cart quantity updated"
          });
        }
      );
    }
  );
});


// Cart থেকে Product Remove
router.delete("/:id", verifyCustomer, (req, res) => {
  const cartId = req.params.id;

  const sql = `
    DELETE FROM carts
    WHERE id = ? AND customer_id = ?
  `;

  db.query(
    sql,
    [cartId, req.customer.id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      res.json({
        message: "Product removed from cart"
      });
    }
  );
});

module.exports = router;