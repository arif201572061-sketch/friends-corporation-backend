const express = require("express");
const db = require("./db");
const verifyCustomer = require("./customerMiddleware");

const router = express.Router();


// =====================================================
// Customer-এর নতুন Order তৈরি
// =====================================================
router.post("/", verifyCustomer, (req, res) => {

  const {
    items,
    delivery_charge,
    payment_method,
    delivery_address,
    customer_phone
  } = req.body;


  // -----------------------------------------------------
  // Basic Validation
  // -----------------------------------------------------

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Cart is empty"
    });
  }


  if (!delivery_address) {
    return res.status(400).json({
      message: "Delivery address is required"
    });
  }


  if (!customer_phone) {
    return res.status(400).json({
      message: "Customer phone is required"
    });
  }


  const deliveryCharge =
    Number(delivery_charge) || 0;


  if (deliveryCharge < 0) {
    return res.status(400).json({
      message: "Invalid delivery charge"
    });
  }


  const paymentMethod =
    payment_method || "cash_on_delivery";


  const allowedPaymentMethods = [
    "cash_on_delivery",
    "online"
  ];


  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      message: "Invalid payment method"
    });
  }


  // -----------------------------------------------------
  // Duplicate Product Check
  // একই Product Cart-এ একাধিকবার থাকলে একত্র করা হবে
  // -----------------------------------------------------

  const mergedItems = {};


  for (const item of items) {

    const productId =
      Number(item.product_id);


    const quantity =
      Number(item.quantity);


    if (
      !productId ||
      !Number.isInteger(productId)
    ) {
      return res.status(400).json({
        message: "Invalid product ID"
      });
    }


    if (
      !quantity ||
      quantity <= 0
    ) {
      return res.status(400).json({
        message: "Invalid quantity"
      });
    }


    if (!mergedItems[productId]) {
      mergedItems[productId] = 0;
    }


    mergedItems[productId] += quantity;
  }


  const productIds =
    Object.keys(mergedItems).map(Number);


  if (productIds.length === 0) {
    return res.status(400).json({
      message: "Cart is empty"
    });
  }


  const placeholders =
    productIds.map(() => "?").join(",");


  // -----------------------------------------------------
  // Product Database থেকে নেওয়া
  // -----------------------------------------------------

  const productSql = `
    SELECT
      id,
      name,
      selling_price,
      buying_price,
      stock,
      unit,
      status
    FROM products
    WHERE id IN (${placeholders})
      AND status = 'active'
  `;


  db.query(
    productSql,
    productIds,
    (err, products) => {

      if (err) {

        console.error(
          "CUSTOMER ORDER PRODUCT ERROR:",
          err
        );

        return res.status(500).json({
          message: "Database error"
        });
      }


      // -------------------------------------------------
      // সব Product পাওয়া গেছে কিনা
      // -------------------------------------------------

      if (
        products.length !==
        productIds.length
      ) {

        return res.status(400).json({
          message:
            "One or more products are unavailable"
        });
      }


      let subtotal = 0;

      const orderItems = [];


      // -------------------------------------------------
      // Product অনুযায়ী Order Item তৈরি
      // -------------------------------------------------

      for (const product of products) {

        const quantity =
          Number(
            mergedItems[product.id]
          );


        const stock =
          Number(product.stock || 0);


        if (quantity > stock) {

          return res.status(400).json({
            message:
              `${product.name} এর পর্যাপ্ত Stock নেই`
          });
        }


        const unitPrice =
          Number(product.selling_price || 0);


        const buyingPrice =
          Number(product.buying_price || 0);


        const itemSubtotal =
          unitPrice * quantity;


        subtotal += itemSubtotal;


        orderItems.push({
          product_id: product.id,
          quantity: quantity,
          unit_price: unitPrice,
          buying_price: buyingPrice,
          subtotal: itemSubtotal
        });
      }


      // -------------------------------------------------
      // Grand Total
      // -------------------------------------------------

      const totalAmount =
        subtotal + deliveryCharge;


      // -------------------------------------------------
      // Order তৈরি
      //
      // নতুন Customer Order সবসময় new_order
      // -------------------------------------------------

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
        VALUES
        (
          ?,
          ?,
          ?,
          ?,
          'pending',
          'new_order',
          ?,
          ?
        )
      `;


      db.query(
        orderSql,
        [
          req.customer.id,
          totalAmount,
          deliveryCharge,
          paymentMethod,
          delivery_address,
          customer_phone
        ],
        (err, orderResult) => {

          if (err) {

            console.error(
              "ORDER CREATE ERROR:",
              err
            );

            return res.status(500).json({
              message:
                "Order creation failed"
            });
          }


          const orderId =
            orderResult.insertId;


          // -------------------------------------------------
          // Order Items Insert
          // -------------------------------------------------

          const itemValues =
            orderItems.map(item => [

              orderId,

              item.product_id,

              item.quantity,

              item.unit_price,

              item.buying_price,

              item.subtotal

            ]);


          const itemsSql = `
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
            itemsSql,
            [itemValues],
            (err) => {

              if (err) {

                console.error(
                  "ORDER ITEMS CREATE ERROR:",
                  err
                );


                // -----------------------------------------
                // Order তৈরি হয়েছিল কিন্তু Items হয়নি
                // তাই Order delete করা হবে
                // -----------------------------------------

                db.query(
                  `
                    DELETE FROM orders
                    WHERE id = ?
                  `,
                  [orderId]
                );


                return res.status(500).json({
                  message:
                    "Order items creation failed"
                });
              }


              // -------------------------------------------------
              // Stock কমানো
              // -------------------------------------------------

              let completed =
                0;


              let stockError =
                false;


              orderItems.forEach(
                item => {

                  const stockSql = `
                    UPDATE products
                    SET stock = stock - ?
                    WHERE id = ?
                      AND stock >= ?
                  `;


                  db.query(
                    stockSql,
                    [
                      item.quantity,
                      item.product_id,
                      item.quantity
                    ],
                    (err, result) => {

                      if (err) {

                        console.error(
                          "STOCK UPDATE ERROR:",
                          err
                        );

                        stockError = true;
                      }


                      if (
                        !err &&
                        result.affectedRows === 0
                      ) {

                        console.error(
                          "STOCK UPDATE FAILED:",
                          item.product_id
                        );

                        stockError = true;
                      }


                      completed++;


                      if (
                        completed ===
                        orderItems.length
                      ) {

                        // -------------------------------------
                        // Stock update-এ সমস্যা হলে
                        // -------------------------------------

                        if (stockError) {

                          console.error(
                            "ORDER STOCK UPDATE FAILED. ORDER ID:",
                            orderId
                          );


                          return res.status(500).json({
                            success: false,
                            message:
                              "Order created but stock update failed. Please contact admin.",
                            order_id:
                              orderId
                          });
                        }


                        // -------------------------------------
                        // সফল Order Response
                        // -------------------------------------

                        return res.status(201).json({

                          success: true,

                          message:
                            "Order placed successfully",

                          order_id:
                            orderId,

                          order_status:
                            "new_order",

                          subtotal:
                            subtotal.toFixed(2),

                          delivery_charge:
                            deliveryCharge.toFixed(2),

                          total_amount:
                            totalAmount.toFixed(2)

                        });
                      }

                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});



// =====================================================
// Customer-এর নিজের সব Order
// =====================================================

router.get(
  "/",
  verifyCustomer,
  (req, res) => {

    const sql = `
      SELECT
        id,
        total_amount,
        delivery_charge,
        payment_method,
        payment_status,
        order_status,
        delivery_address,
        customer_phone,
        created_at,
        updated_at
      FROM orders
      WHERE customer_id = ?
      ORDER BY id DESC
    `;


    db.query(
      sql,
      [req.customer.id],
      (err, results) => {

        if (err) {

          console.error(
            "CUSTOMER ORDERS ERROR:",
            err
          );

          return res.status(500).json({
            message:
              "Database error"
          });
        }


        res.json(results);
      }
    );
  }
);



// =====================================================
// Customer-এর নির্দিষ্ট Order-এর বিস্তারিত
// =====================================================

router.get(
  "/:id",
  verifyCustomer,
  (req, res) => {

    const orderId =
      req.params.id;


    // -------------------------------------------------
    // Order Information
    // -------------------------------------------------

    const orderSql = `
      SELECT
        o.id,
        o.customer_id,
        c.name AS customer_name,
        c.email AS customer_email,
        o.total_amount,
        o.delivery_charge,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.delivery_address,
        o.customer_phone,
        o.created_at,
        o.updated_at
      FROM orders o
      JOIN customers c
        ON o.customer_id = c.id
      WHERE o.id = ?
        AND o.customer_id = ?
    `;


    // -------------------------------------------------
    // Order Items
    // -------------------------------------------------

    const itemsSql = `
      SELECT
        oi.product_id,
        p.name AS product_name,
        p.image_url,
        oi.quantity,
        oi.unit_price,
        oi.subtotal
      FROM order_items oi
      JOIN products p
        ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `;


    db.query(
      orderSql,
      [
        orderId,
        req.customer.id
      ],
      (err, orderResults) => {

        if (err) {

          console.error(
            "CUSTOMER ORDER DETAILS ERROR:",
            err
          );

          return res.status(500).json({
            message:
              "Database error"
          });
        }


        if (
          orderResults.length === 0
        ) {

          return res.status(404).json({
            message:
              "Order not found"
          });
        }


        db.query(
          itemsSql,
          [orderId],
          (err, itemResults) => {

            if (err) {

              console.error(
                "CUSTOMER ORDER ITEMS ERROR:",
                err
              );

              return res.status(500).json({
                message:
                  "Database error"
              });
            }


            res.json({

              order:
                orderResults[0],

              items:
                itemResults

            });
          }
        );
      }
    );
  }
);


module.exports = router;