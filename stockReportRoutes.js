const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");
const { requireAdmin } = require("./adminPermission");

const router = express.Router();

/*
==================================================
Purchase / Stock History Report
GET /api/stock-reports/purchase
==================================================

Query:
from_date
to_date
product_id
*/

router.get(
  "/purchase",
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
        sh.id AS history_id,
        sh.product_id,
        p.name AS product_name,
        p.unit,

        sh.quantity,
        sh.purchase_price,
        sh.total_purchase_value,

        sh.added_by_admin_id,
        a.name AS added_by_admin,

        sh.added_by_employee_id,

        sh.created_at

      FROM stock_history sh

      LEFT JOIN products p
        ON sh.product_id = p.id

      LEFT JOIN admins a
        ON sh.added_by_admin_id = a.id

      WHERE 1 = 1
    `;


    const params = [];


    /* =========================================
       FROM DATE
    ========================================= */

    if (from_date) {

      sql += `
        AND sh.created_at >= ?
      `;

      params.push(
        from_date + " 00:00:00"
      );

    }


    /* =========================================
       TO DATE
    ========================================= */

    if (to_date) {

      sql += `
        AND sh.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      `;

      params.push(
        to_date + " 00:00:00"
      );

    }


    /* =========================================
       PRODUCT FILTER
    ========================================= */

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
        AND sh.product_id = ?
      `;

      params.push(
        productIdNumber
      );

    }


    /* =========================================
       ORDER
    ========================================= */

    sql += `
      ORDER BY
        sh.created_at DESC,
        sh.id DESC
    `;


    db.query(
      sql,
      params,
      (err, results) => {

        if (err) {

          console.error(
            "PURCHASE REPORT DATABASE ERROR:",
            err
          );

          return res.status(500).json({
            message:
              "Database error",
            error:
              err.message
          });

        }


        /* =====================================
           SUMMARY
        ===================================== */

        let totalQuantity = 0;
        let totalPurchase = 0;


        results.forEach(
          row => {

            totalQuantity +=
              Number(
                row.quantity || 0
              );

            totalPurchase +=
              Number(
                row.total_purchase_value || 0
              );

          }
        );


        return res.json({

          report_type:
            "purchase",

          filters: {

            from_date:
              from_date || null,

            to_date:
              to_date || null,

            product_id:
              product_id || null

          },

          summary: {

            total_entries:
              results.length,

            total_quantity:
              Number(
                totalQuantity.toFixed(2)
              ),

            total_purchase_value:
              Number(
                totalPurchase.toFixed(2)
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