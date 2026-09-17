const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");
const { requireAdmin } = require("./adminPermission");

const router = express.Router();


// =====================================================
// নির্দিষ্ট Order-এর Profit ও Commission হিসাব
// =====================================================

router.get("/order/:orderId", verifyToken, (req, res) => {

  const orderId = req.params.orderId;

  const sql = `
    SELECT
      o.id AS order_id,
      o.employee_id,
      e.name AS employee_name,
      e.commission_percent,

      SUM(
        oi.unit_price * oi.quantity
      ) AS total_sales,

      SUM(
        oi.buying_price * oi.quantity
      ) AS total_cost,

      SUM(
        (oi.unit_price - oi.buying_price) * oi.quantity
      ) AS total_profit

    FROM orders o

    JOIN order_items oi
      ON o.id = oi.order_id

    LEFT JOIN employees e
      ON o.employee_id = e.id

    WHERE o.id = ?

    GROUP BY
      o.id,
      o.employee_id,
      e.name,
      e.commission_percent
  `;

  db.query(sql, [orderId], (err, results) => {

    if (err) {

      console.error(
        "ORDER PROFIT DATABASE ERROR:",
        err
      );

      return res.status(500).json({
        message: "Database error"
      });
    }

    if (results.length === 0) {

      return res.status(404).json({
        message: "Order not found"
      });
    }

    const result = results[0];

    const totalProfit =
      Number(result.total_profit || 0);

    const commissionPercent =
      Number(result.commission_percent || 0);

    const commissionAmount =
      totalProfit > 0
        ? (totalProfit * commissionPercent) / 100
        : 0;

    res.json({

      order_id:
        result.order_id,

      employee_id:
        result.employee_id,

      employee_name:
        result.employee_name,

      total_sales:
        Number(result.total_sales || 0),

      total_cost:
        Number(result.total_cost || 0),

      total_profit:
        totalProfit,

      commission_percent:
        commissionPercent,

      commission_amount:
        commissionAmount

    });

  });

});


// =====================================================
// Business Dashboard Summary
// =====================================================

router.get(
  "/business-summary",
  verifyToken,
  (req, res) => {

    const stockSql = `
      SELECT

        COALESCE(
          SUM(buying_price * stock),
          0
        ) AS stock_cost,

        COALESCE(
          SUM(selling_price * stock),
          0
        ) AS stock_sales_value

      FROM products

      WHERE status = 'active'
    `;

    const salesSql = `
      SELECT

        COALESCE(
          SUM(oi.unit_price * oi.quantity),
          0
        ) AS total_sales,

        COALESCE(
          SUM(oi.buying_price * oi.quantity),
          0
        ) AS total_cost,

        COALESCE(
          SUM(
            (oi.unit_price - oi.buying_price)
            * oi.quantity
          ),
          0
        ) AS total_profit

      FROM orders o

      JOIN order_items oi
        ON o.id = oi.order_id

      WHERE o.order_status = 'delivered'
    `;

    db.query(
      stockSql,
      (stockErr, stockResults) => {

        if (stockErr) {

          console.error(
            "BUSINESS STOCK ERROR:",
            stockErr
          );

          return res.status(500).json({
            message: "Database error"
          });
        }

        db.query(
          salesSql,
          (salesErr, salesResults) => {

            if (salesErr) {

              console.error(
                "BUSINESS SALES ERROR:",
                salesErr
              );

              return res.status(500).json({
                message: "Database error"
              });
            }

            const stock =
              stockResults[0] || {};

            const sales =
              salesResults[0] || {};

            res.json({

              current_stock_cost:
                Number(
                  stock.stock_cost || 0
                ),

              current_stock_sales_value:
                Number(
                  stock.stock_sales_value || 0
                ),

              total_sales:
                Number(
                  sales.total_sales || 0
                ),

              total_cost:
                Number(
                  sales.total_cost || 0
                ),

              total_profit:
                Number(
                  sales.total_profit || 0
                )

            });

          }
        );

      }
    );

  }
);


// =====================================================
// Overall Summary
// =====================================================

router.get(
  "/summary",
  verifyToken,
  (req, res) => {

    const sql = `
      SELECT

        COUNT(DISTINCT o.id)
          AS total_orders,

        COALESCE(
          SUM(
            oi.unit_price * oi.quantity
          ),
          0
        ) AS total_sales,

        COALESCE(
          SUM(
            oi.buying_price * oi.quantity
          ),
          0
        ) AS total_cost,

        COALESCE(
          SUM(
            (oi.unit_price - oi.buying_price)
            * oi.quantity
          ),
          0
        ) AS total_profit

      FROM orders o

      JOIN order_items oi
        ON o.id = oi.order_id

      WHERE o.order_status = 'delivered'
    `;

    db.query(sql, (err, results) => {

      if (err) {

        console.error(
          "SUMMARY DATABASE ERROR:",
          err
        );

        return res.status(500).json({
          message: "Database error"
        });
      }

      const result =
        results[0] || {};

      res.json({

        total_orders:
          Number(
            result.total_orders || 0
          ),

        total_sales:
          Number(
            result.total_sales || 0
          ),

        total_cost:
          Number(
            result.total_cost || 0
          ),

        total_profit:
          Number(
            result.total_profit || 0
          )

      });

    });

  }
);


// =====================================================
// BUSINESS STATEMENT
// =====================================================
// Date range অনুযায়ী:
// - Sales
// - Purchase
// - Profit
// - Order
// - Sold Items
//
// Purchase = stock_history থেকে
// Sales/Profit = delivered orders থেকে
// =====================================================

router.get(
  "/business-statement",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const {
      from_date,
      to_date
    } = req.query;


    // ---------------------------------------------
    // Date validation
    // ---------------------------------------------

    if (
      (from_date && !/^\d{4}-\d{2}-\d{2}$/.test(from_date)) ||
      (to_date && !/^\d{4}-\d{2}-\d{2}$/.test(to_date))
    ) {

      return res.status(400).json({
        message:
          "Date format must be YYYY-MM-DD"
      });

    }


    if (
      from_date &&
      to_date &&
      from_date > to_date
    ) {

      return res.status(400).json({
        message:
          "From date cannot be greater than To date"
      });

    }


    // =================================================
    // SALES QUERY
    // =================================================

    let salesSql = `

      SELECT

        DATE(o.created_at)
          AS report_date,

        COUNT(DISTINCT o.id)
          AS total_orders,

        COALESCE(
          SUM(oi.quantity),
          0
        ) AS total_items,

        COALESCE(
          SUM(
            oi.unit_price * oi.quantity
          ),
          0
        ) AS total_sales,

        COALESCE(
          SUM(
            oi.buying_price * oi.quantity
          ),
          0
        ) AS sales_purchase_cost,

        COALESCE(
          SUM(
            (
              oi.unit_price
              -
              oi.buying_price
            )
            * oi.quantity
          ),
          0
        ) AS total_profit

      FROM orders o

      INNER JOIN order_items oi
        ON o.id = oi.order_id

      WHERE
        o.order_status = 'delivered'

    `;

    const salesParams = [];


    if (from_date) {

      salesSql += `
        AND o.created_at >= ?
      `;

      salesParams.push(
        from_date + " 00:00:00"
      );

    }


    if (to_date) {

      salesSql += `
        AND o.created_at < DATE_ADD(
          ?,
          INTERVAL 1 DAY
        )
      `;

      salesParams.push(
        to_date + " 00:00:00"
      );

    }


    salesSql += `

      GROUP BY
        DATE(o.created_at)

      ORDER BY
        report_date DESC

    `;


    // =================================================
    // PURCHASE QUERY
    // =================================================

    let purchaseSql = `

      SELECT

        DATE(created_at)
          AS report_date,

        COALESCE(
          SUM(total_purchase_value),
          0
        ) AS total_purchase_cost

      FROM stock_history

      WHERE 1 = 1

    `;

    const purchaseParams = [];


    if (from_date) {

      purchaseSql += `
        AND created_at >= ?
      `;

      purchaseParams.push(
        from_date + " 00:00:00"
      );

    }


    if (to_date) {

      purchaseSql += `
        AND created_at < DATE_ADD(
          ?,
          INTERVAL 1 DAY
        )
      `;

      purchaseParams.push(
        to_date + " 00:00:00"
      );

    }


    purchaseSql += `

      GROUP BY
        DATE(created_at)

      ORDER BY
        report_date DESC

    `;


    // =================================================
    // Execute SALES
    // =================================================

    db.query(
      salesSql,
      salesParams,
      (salesErr, salesResults) => {

        if (salesErr) {

          console.error(
            "BUSINESS STATEMENT SALES ERROR:",
            salesErr
          );

          return res.status(500).json({
            message:
              "Sales statement database error",
            error:
              salesErr.message
          });

        }


        // =================================================
        // Execute PURCHASE
        // =================================================

        db.query(
          purchaseSql,
          purchaseParams,
          (purchaseErr, purchaseResults) => {

            if (purchaseErr) {

              console.error(
                "BUSINESS STATEMENT PURCHASE ERROR:",
                purchaseErr
              );

              return res.status(500).json({
                message:
                  "Purchase statement database error",
                error:
                  purchaseErr.message
              });

            }


            // =================================================
            // Merge by Date
            // =================================================

            const dailyMap = {};


            // ---------------------------------------------
            // Sales data
            // ---------------------------------------------

            salesResults.forEach(row => {

              const date =
                row.report_date
                  .toISOString()
                  .slice(0, 10);

              dailyMap[date] = {

                report_date:
                  date,

                total_orders:
                  Number(
                    row.total_orders || 0
                  ),

                total_items:
                  Number(
                    row.total_items || 0
                  ),

                total_purchase_cost:
                  0,

                total_sales:
                  Number(
                    row.total_sales || 0
                  ),

                total_profit:
                  Number(
                    row.total_profit || 0
                  )

              };

            });


            // ---------------------------------------------
            // Purchase data
            // ---------------------------------------------

            purchaseResults.forEach(row => {

              const date =
                row.report_date
                  .toISOString()
                  .slice(0, 10);


              if (!dailyMap[date]) {

                dailyMap[date] = {

                  report_date:
                    date,

                  total_orders:
                    0,

                  total_items:
                    0,

                  total_purchase_cost:
                    0,

                  total_sales:
                    0,

                  total_profit:
                    0

                };

              }


              dailyMap[date]
                .total_purchase_cost =
                  Number(
                    row.total_purchase_cost || 0
                  );

            });


            // =================================================
            // Convert to Array
            // =================================================

            const data =
              Object.values(dailyMap)
                .sort(
                  (a, b) =>
                    b.report_date.localeCompare(
                      a.report_date
                    )
                );


            // =================================================
            // Overall Summary
            // =================================================

            let totalOrders = 0;
            let totalItems = 0;
            let totalPurchaseCost = 0;
            let totalSales = 0;
            let totalProfit = 0;


            data.forEach(row => {

              totalOrders +=
                Number(
                  row.total_orders || 0
                );

              totalItems +=
                Number(
                  row.total_items || 0
                );

              totalPurchaseCost +=
                Number(
                  row.total_purchase_cost || 0
                );

              totalSales +=
                Number(
                  row.total_sales || 0
                );

              totalProfit +=
                Number(
                  row.total_profit || 0
                );

            });


            // =================================================
            // Final Response
            // =================================================

            return res.json({

              report_type:
                "business_statement",

              filters: {

                from_date:
                  from_date || null,

                to_date:
                  to_date || null

              },

              summary: {

                total_orders:
                  Number(
                    totalOrders.toFixed(2)
                  ),

                total_items:
                  Number(
                    totalItems.toFixed(2)
                  ),

                total_purchase_cost:
                  Number(
                    totalPurchaseCost.toFixed(2)
                  ),

                total_sales:
                  Number(
                    totalSales.toFixed(2)
                  ),

                total_profit:
                  Number(
                    totalProfit.toFixed(2)
                  )

              },

              data

            });

          }
        );

      }
    );

  }
);


module.exports = router;