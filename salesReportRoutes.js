const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");
const { requireAdmin } = require("./adminPermission");

const router = express.Router();

/*
====================================================
SALES REPORT
GET /api/sales-reports/sales
====================================================
*/

router.get(
  "/sales",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const {
      from_date,
      to_date,
      product_id
    } = req.query;

    let sql = `
      SELECT
        o.id AS order_id,
        o.created_at,

        o.customer_id,
        c.customer_code,
        c.name AS customer_name,
        o.customer_phone,

        o.employee_id,
        e.name AS employee_name,

        oi.product_id,
        p.name AS product_name,
        p.unit,

        oi.quantity,
        oi.unit_price,
        oi.buying_price,
        oi.subtotal,

        (
          oi.subtotal -
          (oi.quantity * oi.buying_price)
        ) AS item_profit,

        o.delivery_charge,
        o.payment_method,
        o.payment_status,
        o.order_status

      FROM order_items oi

      INNER JOIN orders o
        ON oi.order_id = o.id

      LEFT JOIN customers c
        ON o.customer_id = c.id

      LEFT JOIN employees e
        ON o.employee_id = e.id

      LEFT JOIN products p
        ON oi.product_id = p.id

      WHERE 1 = 1
    `;

    const params = [];

    /*
    ================================================
    DATE FILTER
    ================================================
    */

    if (from_date) {

      sql += `
        AND o.created_at >= ?
      `;

      params.push(
        from_date + " 00:00:00"
      );
    }

    if (to_date) {

      sql += `
        AND o.created_at < DATE_ADD(
          ?,
          INTERVAL 1 DAY
        )
      `;

      params.push(
        to_date + " 00:00:00"
      );
    }

    /*
    ================================================
    PRODUCT FILTER
    ================================================
    */

    if (product_id) {

      const productIdNumber =
        Number(product_id);

      if (
        Number.isNaN(productIdNumber) ||
        productIdNumber <= 0
      ) {

        return res.status(400).json({
          message:
            "Invalid product_id"
        });

      }

      sql += `
        AND oi.product_id = ?
      `;

      params.push(
        productIdNumber
      );
    }

    /*
    ================================================
    CANCELLED ORDER বাদ
    ================================================
    */

    sql += `
      AND o.order_status != 'cancelled'
    `;

    /*
    ================================================
    ORDER
    ================================================
    */

    sql += `
      ORDER BY
        o.created_at DESC,
        o.id DESC,
        oi.id DESC
    `;

    /*
    ================================================
    DATABASE QUERY
    ================================================
    */

    db.query(
      sql,
      params,
      (err, results) => {

        if (err) {

          console.error(
            "SALES REPORT DATABASE ERROR:",
            err
          );

          return res.status(500).json({
            message:
              "Database error",
            error:
              err.message
          });
        }

        /*
        ============================================
        SUMMARY CALCULATION
        ============================================
        */

        let totalQuantity = 0;

        let totalSales = 0;

        let totalPurchaseCost = 0;

        let totalProfit = 0;

        const orderIds =
          new Set();

        results.forEach(
          row => {

            const quantity =
              Number(
                row.quantity || 0
              );

            const subtotal =
              Number(
                row.subtotal || 0
              );

            const buyingPrice =
              Number(
                row.buying_price || 0
              );

            const purchaseCost =
              quantity *
              buyingPrice;

            const profit =
              subtotal -
              purchaseCost;

            totalQuantity +=
              quantity;

            totalSales +=
              subtotal;

            totalPurchaseCost +=
              purchaseCost;

            totalProfit +=
              profit;

            orderIds.add(
              row.order_id
            );

          }
        );

        /*
        ============================================
        RESPONSE
        ============================================
        */

        return res.json({

          report_type:
            "sales",

          filters: {

            from_date:
              from_date || null,

            to_date:
              to_date || null,

            product_id:
              product_id || null

          },

          summary: {

            total_orders:
              orderIds.size,

            total_items:
              Number(
                totalQuantity.toFixed(2)
              ),

            total_sales:
              Number(
                totalSales.toFixed(2)
              ),

            total_purchase_cost:
              Number(
                totalPurchaseCost.toFixed(2)
              ),

            total_profit:
              Number(
                totalProfit.toFixed(2)
              )

          },

          data:
            results

        });

      }
    );

  }
);


module.exports = router;