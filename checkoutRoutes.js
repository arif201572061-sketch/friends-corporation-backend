const express = require("express");
const db = require("./db");
const verifyCustomer = require("./customerMiddleware");

const router = express.Router();


// Cart Checkout / Order Place
router.post("/place-order", verifyCustomer, (req, res) => {
  const {
    delivery_address,
    customer_phone,
    payment_method
  } = req.body;

  if (!delivery_address || !customer_phone) {
    return res.status(400).json({
      message: "Delivery address and phone are required"
    });
  }

  const allowedPaymentMethods = [
    "cash_on_delivery",
    "online"
  ];

  const selectedPaymentMethod =
    payment_method || "cash_on_delivery";

  if (!allowedPaymentMethods.includes(selectedPaymentMethod)) {
    return res.status(400).json({
      message: "Invalid payment method"
    });
  }

  const cartSql = `
    SELECT
      c.product_id,
      c.quantity,
      p.name,
      p.selling_price,
      p.buying_price,
      p.stock,
      p.status
    FROM carts c
    JOIN products p
      ON c.product_id = p.id
    WHERE c.customer_id = ?
  `;

  db.query(
    cartSql,
    [req.customer.id],
    (err, cartItems) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      if (cartItems.length === 0) {
        return res.status(400).json({
          message: "Your cart is empty"
        });
      }

      let totalAmount = 0;

      for (const item of cartItems) {
        if (item.status !== "active") {
          return res.status(400).json({
            message: `${item.name} is currently unavailable`
          });
        }

        if (Number(item.quantity) > Number(item.stock)) {
          return res.status(400).json({
            message: `${item.name} does not have enough stock`
          });
        }

        totalAmount +=
          Number(item.selling_price) *
          Number(item.quantity);
      }

      // আপাতত Delivery Charge 0 রাখা হচ্ছে
      const deliveryCharge = 0;

      const finalTotal =
        totalAmount + deliveryCharge;

      const orderSql = `
        INSERT INTO orders
        (
          customer_id,
          total_amount,
          delivery_charge,
          payment_method,
          payment_status,
          order_status,
          delivery_address,
          customer_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const paymentStatus =
        selectedPaymentMethod === "cash_on_delivery"
          ? "pending"
          : "pending";

      db.query(
        orderSql,
        [
          req.customer.id,
          finalTotal,
          deliveryCharge,
          selectedPaymentMethod,
          paymentStatus,
          "pending",
          delivery_address,
          customer_phone
        ],
        (err, orderResult) => {
          if (err) {
            return res.status(500).json({
              message: "Order creation failed"
            });
          }

          const orderId = orderResult.insertId;

          const itemValues = cartItems.map(item => [
  orderId,
  item.product_id,
  item.quantity,
  item.selling_price,
  item.buying_price,
  Number(item.selling_price) *
    Number(item.quantity)
]);

          const itemSql = `
           INSERT INTO order_items
(
  order_id,
  product_id,
  quantity,
  unit_price,
  buying_price,
  subtotal
)
            VALUES ?
          `;

          db.query(
            itemSql,
            [itemValues],
            (err) => {
              if (err) {
                return res.status(500).json({
                  message: "Order items creation failed"
                });
              }

              // Stock কমানো
              const stockUpdates = cartItems.map(item => {
                return new Promise((resolve, reject) => {
                  const updateSql = `
                    UPDATE products
                    SET stock = stock - ?
                    WHERE id = ?
                  `;

                  db.query(
                    updateSql,
                    [item.quantity, item.product_id],
                    (err) => {
                      if (err) {
                        reject(err);
                      } else {
                        resolve();
                      }
                    }
                  );
                });
              });

              Promise.all(stockUpdates)
                .then(() => {

                  // Cart খালি করা
                  const clearCartSql = `
                    DELETE FROM carts
                    WHERE customer_id = ?
                  `;

                  db.query(
                    clearCartSql,
                    [req.customer.id],
                    (err) => {
                      if (err) {
                        return res.status(500).json({
                          message: "Cart clearing failed"
                        });
                      }

                      res.status(201).json({
                        message: "Order placed successfully",
                        order_id: orderId,
                        total_amount: finalTotal
                      });
                    }
                  );
                })
                .catch(() => {
                  res.status(500).json({
                    message: "Stock update failed"
                  });
                });
            }
          );
        }
      );
    }
  );
});

module.exports = router;