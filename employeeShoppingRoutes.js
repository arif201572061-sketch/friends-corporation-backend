const express = require("express");
const router = express.Router();

const db = require("./db");
const jwt = require("jsonwebtoken");


/* =====================================================
   EMPLOYEE AUTHENTICATION
===================================================== */

function verifyToken(req, res, next) {

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Token required."
    });
  }

  const parts =
    authHeader.split(" ");

  const token =
    parts.length === 2
      ? parts[1]
      : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Invalid authorization header."
    });
  }

  try {

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token."
    });

  }

}


/* =====================================================
   REQUIRE EMPLOYEE
===================================================== */

async function requireEmployee(
  req,
  res,
  next
) {

  try {

    if (
      !req.user ||
      !req.user.id
    ) {
      return res.status(401).json({
        success: false,
        message: "Employee authentication required."
      });
    }

    /*
      Employee JWT অবশ্যই role employee হতে হবে
    */

    if (
      req.user.role &&
      req.user.role !== "employee"
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee access required."
      });
    }

    const result =
      await db.query(
        `
        SELECT
          id,
          name,
          phone,
          email,
          address,
          zone,
          commission_percent,
          status
        FROM employees
        WHERE id = $1
        LIMIT 1
        `,
        [req.user.id]
      );

    if (
      !result.rows ||
      result.rows.length === 0
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee account not found."
      });
    }

    const employee =
      result.rows[0];

    if (
      employee.status &&
      employee.status !== "active"
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee account is inactive."
      });
    }

    req.employee =
      employee;

    next();

  } catch (error) {

    console.error(
      "EMPLOYEE AUTH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Employee authentication failed."
    });

  }

}


/* =====================================================
   GET PRODUCTS
===================================================== */

router.get(
  "/products",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
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
            ON c.id = p.category_id

          WHERE
            p.status = 'active'

          ORDER BY
            p.name ASC
          `
        );

      return res.json({
        success: true,
        products: result.rows
      });

    } catch (error) {

      console.error(
        "PRODUCT LOAD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Products load failed."
      });

    }

  }
);


/* =====================================================
   FIND CUSTOMER BY PHONE
===================================================== */

router.get(
  "/customer",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const phone =
        String(
          req.query.phone || ""
        ).trim();

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Customer phone required."
        });
      }

      const result =
        await db.query(
          `
          SELECT
            id,
            name,
            phone,
            email,
            address

          FROM customers

          WHERE phone = $1

          LIMIT 1
          `,
          [phone]
        );

      return res.json({
        success: true,
        customer:
          result.rows.length
            ? result.rows[0]
            : null
      });

    } catch (error) {

      console.error(
        "CUSTOMER SEARCH ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Customer search failed."
      });

    }

  }
);


/* =====================================================
   CREATE EMPLOYEE ORDER
===================================================== */

router.post(
  "/orders",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    const client =
      await db.connect();

    try {

      const {
        items,
        customer_id,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_charge,
        payment_method
      } = req.body;


      /* -------------------------------------------------
         BASIC VALIDATION
      ------------------------------------------------- */

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty."
        });
      }


      if (
        !customer_phone ||
        !String(customer_phone).trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Customer phone is required."
        });
      }


      if (
        !delivery_address ||
        !String(delivery_address).trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Delivery address is required."
        });
      }


      const allowedPaymentMethods = [
        "cash_on_delivery",
        "online"
      ];

      const selectedPaymentMethod =
        payment_method ||
        "cash_on_delivery";


      if (
        !allowedPaymentMethods.includes(
          selectedPaymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method."
        });
      }


      /* -------------------------------------------------
         MERGE DUPLICATE PRODUCTS
      ------------------------------------------------- */

      const mergedItems = {};

      for (const item of items) {

        const productId =
          Number(item.product_id);

        const quantity =
          Number(item.quantity);

        if (
          !Number.isInteger(productId) ||
          productId <= 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid product."
          });
        }

        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid product quantity."
          });
        }

        if (
          !mergedItems[productId]
        ) {
          mergedItems[productId] = 0;
        }

        mergedItems[productId] +=
          quantity;
      }


      /* -------------------------------------------------
         START DATABASE TRANSACTION
      ------------------------------------------------- */

      await client.query(
        "BEGIN"
      );


      const productIds =
        Object.keys(
          mergedItems
        );


      const productsResult =
        await client.query(
          `
          SELECT
            id,
            name,
            selling_price,
            buying_price,
            stock,
            status

          FROM products

          WHERE id = ANY($1::int[])

          FOR UPDATE
          `,
          [productIds]
        );


      if (
        productsResult.rows.length !==
        productIds.length
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          success: false,
          message: "One or more products were not found."
        });

      }


      let subtotal = 0;

      const orderItems = [];


      /* -------------------------------------------------
         CHECK STOCK
      ------------------------------------------------- */

      for (
        const product
        of productsResult.rows
      ) {

        const quantity =
          mergedItems[
            product.id
          ];

        const stock =
          Number(product.stock || 0);

        if (
          product.status !== "active"
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(400).json({
            success: false,
            message:
              `${product.name} is not available.`
          });

        }


        if (
          stock < quantity
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(400).json({
            success: false,
            message:
              `${product.name} stock is insufficient. Available: ${stock}`
          });

        }


        const sellingPrice =
          Number(
            product.selling_price || 0
          );

        const itemSubtotal =
          sellingPrice *
          quantity;

        subtotal +=
          itemSubtotal;


        orderItems.push({
          product_id:
            product.id,

          product_name:
            product.name,

          quantity,

          selling_price:
            sellingPrice,

          buying_price:
            Number(
              product.buying_price || 0
            ),

          subtotal:
            itemSubtotal
        });

      }


      const deliveryCharge =
        Number(
          delivery_charge || 0
        );


      const totalAmount =
        subtotal +
        deliveryCharge;


      /* -------------------------------------------------
         CUSTOMER
      ------------------------------------------------- */

      let finalCustomerId =
        customer_id || null;


      if (!finalCustomerId) {

        const customerResult =
          await client.query(
            `
            SELECT
              id

            FROM customers

            WHERE phone = $1

            LIMIT 1
            `,
            [
              String(
                customer_phone
              ).trim()
            ]
          );


        if (
          customerResult.rows.length
        ) {

          finalCustomerId =
            customerResult.rows[0].id;

        } else {

          const newCustomerResult =
            await client.query(
              `
              INSERT INTO customers
              (
                name,
                phone,
                address
              )

              VALUES
              ($1, $2, $3)

              RETURNING id
              `,
              [
                customer_name ||
                  "Customer",

                String(
                  customer_phone
                ).trim(),

                String(
                  delivery_address
                ).trim()
              ]
            );

          finalCustomerId =
            newCustomerResult
              .rows[0]
              .id;

        }

      }


      /* -------------------------------------------------
         CREATE ORDER
      ------------------------------------------------- */

      const orderResult =
        await client.query(
          `
          INSERT INTO orders
          (
            customer_id,
            employee_id,
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
            $1,
            $2,
            $3,
            $4,
            $5,
            'pending',
            'new_order',
            $6,
            $7
          )

          RETURNING
            id,
            customer_id,
            employee_id,
            total_amount,
            delivery_charge,
            payment_method,
            payment_status,
            order_status,
            delivery_address,
            customer_phone,
            created_at
          `,
          [
            finalCustomerId,
            req.employee.id,
            totalAmount,
            deliveryCharge,
            selectedPaymentMethod,
            String(
              delivery_address
            ).trim(),
            String(
              customer_phone
            ).trim()
          ]
        );


      const order =
        orderResult.rows[0];


      /* -------------------------------------------------
         INSERT ORDER ITEMS
      ------------------------------------------------- */

      for (
        const item
        of orderItems
      ) {

        await client.query(
          `
          INSERT INTO order_items
          (
            order_id,
            product_id,
            quantity,
            unit_price,
            buying_price,
            subtotal
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          `,
          [
            order.id,
            item.product_id,
            item.quantity,
            item.selling_price,
            item.buying_price,
            item.subtotal
          ]
        );


        /* -------------------------------------------------
           REDUCE STOCK
        ------------------------------------------------- */

        await client.query(
          `
          UPDATE products

          SET stock =
            stock - $1

          WHERE id = $2
          `,
          [
            item.quantity,
            item.product_id
          ]
        );

      }


      await client.query(
        "COMMIT"
      );


      return res.status(201).json({

        success: true,

        message:
          "Order placed successfully.",

        order_id:
          order.id,

        employee_id:
          req.employee.id,

        subtotal,

        delivery_charge:
          deliveryCharge,

        total_amount:
          totalAmount,

        order_status:
          order.order_status

      });


    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}


      console.error(
        "CREATE EMPLOYEE ORDER ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          "Order creation failed.",
        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined
      });


    } finally {

      client.release();

    }

  }
);


/* =====================================================
   GET MY ORDERS
===================================================== */

router.get(
  "/orders",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
          SELECT
            o.id,
            o.customer_id,
            o.employee_id,
            o.total_amount,
            o.delivery_charge,
            o.payment_method,
            o.payment_status,
            o.order_status,
            o.delivery_address,
            o.customer_phone,
            o.created_at,

            COALESCE(
              c.name,
              'Customer'
            ) AS customer_name

          FROM orders o

          LEFT JOIN customers c
            ON c.id = o.customer_id

          WHERE
            o.employee_id = $1

          ORDER BY
            o.created_at DESC
          `,
          [
            req.employee.id
          ]
        );


      return res.json({
        success: true,
        orders:
          result.rows
      });

    } catch (error) {

      console.error(
        "MY ORDERS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Orders load failed."
      });

    }

  }
);


/* =====================================================
   PENDING ORDER NOTIFICATION
=====================================================

   delivered / cancelled
   হলে notification থেকে বাদ যাবে।

   অন্য সব status
   pending হিসেবে ধরা হবে।
===================================================== */

router.get(
  "/pending-orders",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
          SELECT
            o.id,
            o.customer_id,
            o.employee_id,

            COALESCE(
              c.name,
              'Customer'
            ) AS customer_name,

            o.customer_phone,
            o.delivery_address,

            o.total_amount,
            o.delivery_charge,

            o.payment_method,
            o.payment_status,

            o.order_status,

            o.created_at

          FROM orders o

          LEFT JOIN customers c
            ON c.id = o.customer_id

          WHERE
            o.employee_id = $1

            AND COALESCE(
              o.order_status,
              'new_order'
            ) NOT IN
            (
              'delivered',
              'cancelled',
              'completed'
            )

          ORDER BY
            o.created_at DESC
          `,
          [
            req.employee.id
          ]
        );


      return res.json({

        success: true,

        count:
          result.rows.length,

        orders:
          result.rows

      });


    } catch (error) {

      console.error(
        "PENDING ORDERS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Pending orders load failed."
      });

    }

  }
);


/* =====================================================
   SINGLE ORDER DETAILS
===================================================== */

router.get(
  "/orders/:id",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const orderId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID."
        });
      }


      /*
        Employee ID দিয়ে filter করা হয়েছে।
        তাই অন্য Employee-এর order
        দেখা যাবে না।
      */

      const orderResult =
        await db.query(
          `
          SELECT
            o.id,
            o.customer_id,
            o.employee_id,

            COALESCE(
              c.name,
              'Customer'
            ) AS customer_name,

            o.customer_phone,
            o.delivery_address,

            o.total_amount,
            o.delivery_charge,

            o.payment_method,
            o.payment_status,

            o.order_status,

            o.created_at

          FROM orders o

          LEFT JOIN customers c
            ON c.id = o.customer_id

          WHERE
            o.id = $1

            AND o.employee_id = $2

          LIMIT 1
          `,
          [
            orderId,
            req.employee.id
          ]
        );


      if (
        orderResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found."
        });
      }


      const order =
        orderResult.rows[0];


      const itemsResult =
        await db.query(
          `
          SELECT
            oi.id,
            oi.product_id,

            COALESCE(
              p.name,
              'Product'
            ) AS product_name,

            oi.quantity,

            oi.unit_price,
            oi.buying_price,
            oi.subtotal

          FROM order_items oi

          LEFT JOIN products p
            ON p.id = oi.product_id

          WHERE
            oi.order_id = $1

          ORDER BY
            oi.id ASC
          `,
          [
            orderId
          ]
        );


      order.items =
        itemsResult.rows;


      return res.json({

        success: true,

        order

      });


    } catch (error) {

      console.error(
        "ORDER DETAILS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Order details load failed."
      });

    }

  }
);


/* =====================================================
   SALES SUMMARY
===================================================== */

router.get(
  "/sales-summary",
  verifyToken,
  requireEmployee,
  async (req, res) => {

    try {

      const employeeId =
        req.employee.id;


      const employeeResult =
        await db.query(
          `
          SELECT
            commission_percent

          FROM employees

          WHERE id = $1

          LIMIT 1
          `,
          [
            employeeId
          ]
        );


      const commissionPercent =
        Number(
          employeeResult.rows[0]
            ?.commission_percent || 0
        );


      const result =
        await db.query(
          `
          SELECT

            COUNT(
              DISTINCT o.id
            )::int
            AS total_orders,

            COALESCE(
              SUM(o.total_amount),
              0
            ) AS total_sales,

            COALESCE(
              SUM(
                oi.buying_price *
                oi.quantity
              ),
              0
            ) AS total_cost

          FROM orders o

          LEFT JOIN order_items oi
            ON oi.order_id = o.id

          WHERE
            o.employee_id = $1

            AND o.order_status =
              'delivered'
          `,
          [
            employeeId
          ]
        );


      const row =
        result.rows[0];


      const totalSales =
        Number(
          row.total_sales || 0
        );

      const totalCost =
        Number(
          row.total_cost || 0
        );

      const profit =
        totalSales -
        totalCost;


      const commission =
        profit > 0
          ? (
              profit *
              commissionPercent
            ) / 100
          : 0;


      return res.json({

        success: true,

        employee_id:
          employeeId,

        total_orders:
          Number(
            row.total_orders || 0
          ),

        total_sales:
          totalSales,

        total_cost:
          totalCost,

        profit,

        commission_percent:
          commissionPercent,

        commission,

        company_net_profit:
          profit -
          commission

      });


    } catch (error) {

      console.error(
        "SALES SUMMARY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Sales summary load failed."
      });

    }

  }
);


module.exports =
  router;