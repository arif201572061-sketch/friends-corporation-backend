const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const {
  requireAdmin
} = require("./adminPermission");

const router = express.Router();


// ======================================================
// HELPER
// ======================================================

function validEmployeeId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
}


// ======================================================
// COMMISSION CALCULATOR
// ======================================================

function calculateCommission(
  profit,
  paymentType,
  commissionPercent
) {
  const safeProfit = Number(profit || 0);
  const safePercent = Number(commissionPercent || 0);

  if (paymentType === "commission") {
    return (safeProfit * safePercent) / 100;
  }

  return 0;
}


// ======================================================
// ALL EMPLOYEE PERFORMANCE
//
// GET /api/employee-performance/all
//
// Main Admin + Sub Admin
//
// Delivered orders only:
// Sales
// Purchase Cost
// Profit
// Commission
// Company Net Profit
// ======================================================

router.get(
  "/all",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT

        e.id AS employee_id,
        e.user_id,
        e.name,
        e.profile_photo,
        e.phone,
        e.email,
        e.address,
        e.zone,
        e.commission_percent,
        e.salary,
        e.payment_type,
        e.status,
        e.created_at,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status <> 'cancelled'
            THEN o.id
          END
        ) AS total_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'delivered'
            THEN o.id
          END
        ) AS delivered_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'cancelled'
            THEN o.id
          END
        ) AS cancelled_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'ready_for_delivery'
            THEN o.id
          END
        ) AS ready_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'out_for_delivery'
            THEN o.id
          END
        ) AS delivery_orders,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.subtotal
              ELSE 0
            END
          ),
          0
        ) AS total_sales,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.buying_price * oi.quantity
              ELSE 0
            END
          ),
          0
        ) AS total_purchase_cost,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN
                oi.subtotal -
                (
                  oi.buying_price * oi.quantity
                )
              ELSE 0
            END
          ),
          0
        ) AS total_profit

      FROM employees e

      LEFT JOIN orders o
        ON o.employee_id = e.id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      GROUP BY
        e.id,
        e.user_id,
        e.name,
        e.profile_photo,
        e.phone,
        e.email,
        e.address,
        e.zone,
        e.commission_percent,
        e.salary,
        e.payment_type,
        e.status,
        e.created_at

      ORDER BY
        total_sales DESC,
        delivered_orders DESC,
        e.id ASC
    `;

    db.query(
      sql,
      (err, results) => {

        if (err) {
          console.error(
            "ALL EMPLOYEE PERFORMANCE ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        let totalSales = 0;
        let totalPurchaseCost = 0;
        let totalProfit = 0;
        let totalCommission = 0;
        let companyNetProfit = 0;
        let totalOrders = 0;
        let totalDeliveredOrders = 0;

        const employees = results.map(
          (employee, index) => {

            const sales =
              Number(employee.total_sales || 0);

            const purchaseCost =
              Number(employee.total_purchase_cost || 0);

            const profit =
              Number(employee.total_profit || 0);

            const commissionPercent =
              Number(employee.commission_percent || 0);

            const commission =
              calculateCommission(
                profit,
                employee.payment_type,
                commissionPercent
              );

            const netProfit =
              profit - commission;

            totalSales += sales;
            totalPurchaseCost += purchaseCost;
            totalProfit += profit;
            totalCommission += commission;
            companyNetProfit += netProfit;

            totalOrders +=
              Number(employee.total_orders || 0);

            totalDeliveredOrders +=
              Number(employee.delivered_orders || 0);

            return {

              rank: index + 1,

              employee_id:
                Number(employee.employee_id),

              user_id:
                employee.user_id,

              name:
                employee.name,

              profile_photo:
                employee.profile_photo,

              phone:
                employee.phone,

              email:
                employee.email,

              address:
                employee.address,

              zone:
                employee.zone,

              commission_percent:
                commissionPercent,

              salary:
                Number(employee.salary || 0),

              payment_type:
                employee.payment_type,

              status:
                employee.status,

              total_orders:
                Number(employee.total_orders || 0),

              delivered_orders:
                Number(employee.delivered_orders || 0),

              cancelled_orders:
                Number(employee.cancelled_orders || 0),

              ready_orders:
                Number(employee.ready_orders || 0),

              delivery_orders:
                Number(employee.delivery_orders || 0),

              total_sales:
                sales,

              total_purchase_cost:
                purchaseCost,

              total_profit:
                profit,

              commission:
                commission,

              company_net_profit:
                netProfit
            };
          }
        );

        return res.json({

          success: true,

          summary: {

            total_employees:
              employees.length,

            total_orders:
              totalOrders,

            total_delivered_orders:
              totalDeliveredOrders,

            total_sales:
              totalSales,

            total_purchase_cost:
              totalPurchaseCost,

            total_profit:
              totalProfit,

            total_commission:
              totalCommission,

            company_net_profit:
              companyNetProfit
          },

          employees:
            employees
        });
      }
    );
  }
);


// ======================================================
// SINGLE EMPLOYEE PERFORMANCE
//
// GET /api/employee-performance/employee/:employeeId
// ======================================================

router.get(
  "/employee/:employeeId",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      Number(req.params.employeeId);

    if (!validEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID"
      });
    }

    const sql = `
      SELECT

        e.id AS employee_id,
        e.user_id,
        e.name,
        e.profile_photo,
        e.phone,
        e.email,
        e.address,
        e.zone,
        e.commission_percent,
        e.salary,
        e.payment_type,
        e.status,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status <> 'cancelled'
            THEN o.id
          END
        ) AS total_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'delivered'
            THEN o.id
          END
        ) AS completed_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'cancelled'
            THEN o.id
          END
        ) AS cancelled_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'ready_for_delivery'
            THEN o.id
          END
        ) AS ready_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'out_for_delivery'
            THEN o.id
          END
        ) AS delivery_orders,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.subtotal
              ELSE 0
            END
          ),
          0
        ) AS total_sales,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.buying_price * oi.quantity
              ELSE 0
            END
          ),
          0
        ) AS total_purchase_cost,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN
                oi.subtotal -
                (
                  oi.buying_price * oi.quantity
                )
              ELSE 0
            END
          ),
          0
        ) AS total_profit

      FROM employees e

      LEFT JOIN orders o
        ON o.employee_id = e.id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE e.id = ?

      GROUP BY
        e.id,
        e.user_id,
        e.name,
        e.profile_photo,
        e.phone,
        e.email,
        e.address,
        e.zone,
        e.commission_percent,
        e.salary,
        e.payment_type,
        e.status
    `;

    db.query(
      sql,
      [employeeId],
      (err, results) => {

        if (err) {
          console.error(
            "SINGLE EMPLOYEE PERFORMANCE ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        if (results.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Employee not found"
          });
        }

        const employee =
          results[0];

        const sales =
          Number(employee.total_sales || 0);

        const purchaseCost =
          Number(employee.total_purchase_cost || 0);

        const profit =
          Number(employee.total_profit || 0);

        const commissionPercent =
          Number(employee.commission_percent || 0);

        const commission =
          calculateCommission(
            profit,
            employee.payment_type,
            commissionPercent
          );

        const netProfit =
          profit - commission;

        return res.json({

          success: true,

          employee: {

            employee_id:
              Number(employee.employee_id),

            user_id:
              employee.user_id,

            name:
              employee.name,

            profile_photo:
              employee.profile_photo,

            phone:
              employee.phone,

            email:
              employee.email,

            address:
              employee.address,

            zone:
              employee.zone,

            commission_percent:
              commissionPercent,

            salary:
              Number(employee.salary || 0),

            payment_type:
              employee.payment_type,

            status:
              employee.status
          },

          performance: {

            total_orders:
              Number(employee.total_orders || 0),

            completed_orders:
              Number(employee.completed_orders || 0),

            cancelled_orders:
              Number(employee.cancelled_orders || 0),

            ready_orders:
              Number(employee.ready_orders || 0),

            delivery_orders:
              Number(employee.delivery_orders || 0),

            total_sales:
              sales,

            total_purchase_cost:
              purchaseCost,

            total_profit:
              profit,

            estimated_commission:
              commission,

            company_net_profit:
              netProfit
          }
        });
      }
    );
  }
);


// ======================================================
// CURRENT MONTH PERFORMANCE
//
// GET /api/employee-performance/employee/:employeeId/monthly
// ======================================================

router.get(
  "/employee/:employeeId/monthly",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      Number(req.params.employeeId);

    if (!validEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID"
      });
    }

    const sql = `
      SELECT

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.subtotal
              ELSE 0
            END
          ),
          0
        ) AS monthly_sales,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.buying_price * oi.quantity
              ELSE 0
            END
          ),
          0
        ) AS monthly_purchase_cost,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN
                oi.subtotal -
                (
                  oi.buying_price * oi.quantity
                )
              ELSE 0
            END
          ),
          0
        ) AS monthly_profit

      FROM orders o

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?

        AND o.order_status = 'delivered'

        AND YEAR(o.updated_at) = YEAR(CURDATE())

        AND MONTH(o.updated_at) = MONTH(CURDATE())
    `;

    db.query(
      sql,
      [employeeId],
      (err, results) => {

        if (err) {
          console.error(
            "EMPLOYEE MONTHLY PERFORMANCE ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        const row =
          results[0] || {};

        return res.json({

          success: true,

          employee_id:
            employeeId,

          current_month: {

            sales:
              Number(row.monthly_sales || 0),

            purchase_cost:
              Number(row.monthly_purchase_cost || 0),

            profit:
              Number(row.monthly_profit || 0)
          }
        });
      }
    );
  }
);


// ======================================================
// EMPLOYEE ORDERS FOR ADMIN
//
// GET /api/employee-performance/employee/:employeeId/orders
// ======================================================

router.get(
  "/employee/:employeeId/orders",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      Number(req.params.employeeId);

    if (!validEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID"
      });
    }

    const sql = `
      SELECT

        o.id AS order_id,

        o.customer_id,

        c.customer_code,

        c.name AS customer_name,

        c.phone AS customer_phone,

        c.email AS customer_email,

        o.total_amount,

        o.delivery_charge,

        o.payment_method,

        o.payment_status,

        o.order_status,

        o.delivery_address,

        o.customer_phone AS order_customer_phone,

        o.created_at,

        o.updated_at,

        COALESCE(
          SUM(oi.subtotal),
          0
        ) AS product_sales,

        COALESCE(
          SUM(
            oi.buying_price * oi.quantity
          ),
          0
        ) AS purchase_cost,

        COALESCE(
          SUM(
            oi.subtotal -
            (
              oi.buying_price * oi.quantity
            )
          ),
          0
        ) AS profit

      FROM orders o

      LEFT JOIN customers c
        ON c.id = o.customer_id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?

      GROUP BY
        o.id,
        o.customer_id,
        c.customer_code,
        c.name,
        c.phone,
        c.email,
        o.total_amount,
        o.delivery_charge,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.delivery_address,
        o.customer_phone,
        o.created_at,
        o.updated_at

      ORDER BY
        o.id DESC
    `;

    db.query(
      sql,
      [employeeId],
      (err, results) => {

        if (err) {
          console.error(
            "ADMIN EMPLOYEE ORDERS ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        return res.json({

          success: true,

          employee_id:
            employeeId,

          orders:
            results
        });
      }
    );
  }
);


// ======================================================
// EMPLOYEE ORDER DETAILS
//
// GET /api/employee-performance/employee/:employeeId/orders/:orderId
// ======================================================

router.get(
  "/employee/:employeeId/orders/:orderId",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      Number(req.params.employeeId);

    const orderId =
      Number(req.params.orderId);

    if (
      !validEmployeeId(employeeId) ||
      !validEmployeeId(orderId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid employee or order ID"
      });
    }

    const orderSql = `
      SELECT

        o.id AS order_id,

        o.customer_id,

        c.customer_code,

        c.name AS customer_name,

        c.phone AS customer_phone,

        c.email AS customer_email,

        c.address AS customer_address,

        o.total_amount,

        o.delivery_charge,

        o.payment_method,

        o.payment_status,

        o.order_status,

        o.delivery_address,

        o.customer_phone AS order_customer_phone,

        o.created_at,

        o.updated_at,

        o.cancelled_at,

        o.cancellation_reason

      FROM orders o

      LEFT JOIN customers c
        ON c.id = o.customer_id

      WHERE
        o.id = ?

        AND o.employee_id = ?

      LIMIT 1
    `;

    /*
      Product image is temporarily returned as NULL
      so this route does not depend on the exact
      image-column name inside the products table.
    */

    const itemsSql = `
      SELECT

        oi.id,

        oi.product_id,

        p.name AS product_name,

        NULL AS product_image,

        oi.quantity,

        oi.buying_price,

        oi.unit_price,

        oi.subtotal

      FROM order_items oi

      LEFT JOIN products p
        ON p.id = oi.product_id

      WHERE
        oi.order_id = ?

      ORDER BY
        oi.id ASC
    `;

    db.query(
      orderSql,
      [
        orderId,
        employeeId
      ],
      (orderErr, orderResults) => {

        if (orderErr) {
          console.error(
            "ADMIN ORDER DETAIL ERROR:",
            orderErr
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: orderErr.message
          });
        }

        if (orderResults.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Order not found"
          });
        }

        db.query(
          itemsSql,
          [orderId],
          (itemErr, itemResults) => {

            if (itemErr) {
              console.error(
                "ADMIN ORDER ITEMS ERROR:",
                itemErr
              );

              return res.status(500).json({
                success: false,
                message: "Database error",
                error: itemErr.message
              });
            }

            return res.json({

              success: true,

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


// ======================================================
// EMPLOYEE STATEMENT FOR ADMIN
//
// GET /api/employee-performance/employee/:employeeId/statement
//
// Optional:
// ?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
// ======================================================

router.get(
  "/employee/:employeeId/statement",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      Number(req.params.employeeId);

    if (!validEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID"
      });
    }

    const {
      from_date,
      to_date
    } = req.query;

    let sql = `
      SELECT

        o.id AS order_id,

        o.customer_id,

        c.customer_code,

        c.name AS customer_name,

        c.phone AS customer_phone,

        c.email AS customer_email,

        o.total_amount,

        o.delivery_charge,

        o.payment_method,

        o.payment_status,

        o.order_status,

        o.created_at,

        o.updated_at,

        COALESCE(
          SUM(oi.subtotal),
          0
        ) AS product_sales,

        COALESCE(
          SUM(
            oi.buying_price * oi.quantity
          ),
          0
        ) AS purchase_cost,

        COALESCE(
          SUM(
            oi.subtotal -
            (
              oi.buying_price * oi.quantity
            )
          ),
          0
        ) AS profit

      FROM orders o

      LEFT JOIN customers c
        ON c.id = o.customer_id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?
    `;

    const params = [
      employeeId
    ];

    if (from_date) {
      sql += `
        AND DATE(o.created_at) >= ?
      `;

      params.push(from_date);
    }

    if (to_date) {
      sql += `
        AND DATE(o.created_at) <= ?
      `;

      params.push(to_date);
    }

    sql += `
      GROUP BY
        o.id,
        o.customer_id,
        c.customer_code,
        c.name,
        c.phone,
        c.email,
        o.total_amount,
        o.delivery_charge,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.created_at,
        o.updated_at

      ORDER BY
        o.id DESC
    `;

    db.query(
      sql,
      params,
      (err, results) => {

        if (err) {
          console.error(
            "ADMIN EMPLOYEE STATEMENT ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        let totalSales = 0;
        let totalPurchaseCost = 0;
        let totalProfit = 0;

        let completedOrders = 0;
        let cancelledOrders = 0;

        results.forEach(
          row => {

            if (row.order_status === "delivered") {

              totalSales +=
                Number(row.product_sales || 0);

              totalPurchaseCost +=
                Number(row.purchase_cost || 0);

              totalProfit +=
                Number(row.profit || 0);

              completedOrders++;
            }

            if (row.order_status === "cancelled") {
              cancelledOrders++;
            }
          }
        );

        const employeeSql = `
          SELECT

            id,
            name,
            user_id,
            commission_percent,
            salary,
            payment_type,
            status

          FROM employees

          WHERE id = ?

          LIMIT 1
        `;

        db.query(
          employeeSql,
          [employeeId],
          (employeeErr, employeeResults) => {

            if (employeeErr) {
              console.error(
                "STATEMENT EMPLOYEE ERROR:",
                employeeErr
              );

              return res.status(500).json({
                success: false,
                message: "Database error",
                error: employeeErr.message
              });
            }

            if (employeeResults.length === 0) {
              return res.status(404).json({
                success: false,
                message: "Employee not found"
              });
            }

            const employee =
              employeeResults[0];

            const commissionPercent =
              Number(
                employee.commission_percent || 0
              );

            const commission =
              calculateCommission(
                totalProfit,
                employee.payment_type,
                commissionPercent
              );

            const netProfit =
              totalProfit - commission;

            return res.json({

              success: true,

              employee: {

                employee_id:
                  Number(employee.id),

                user_id:
                  employee.user_id,

                name:
                  employee.name,

                commission_percent:
                  commissionPercent,

                salary:
                  Number(employee.salary || 0),

                payment_type:
                  employee.payment_type,

                status:
                  employee.status
              },

              summary: {

                total_orders:
                  results.length,

                completed_orders:
                  completedOrders,

                cancelled_orders:
                  cancelledOrders,

                total_sales:
                  totalSales,

                total_purchase_cost:
                  totalPurchaseCost,

                total_profit:
                  totalProfit,

                total_commission:
                  commission,

                company_net_profit:
                  netProfit
              },

              data:
                results
            });
          }
        );
      }
    );
  }
);


// ======================================================
// OLD EMPLOYEE LOGIN PERFORMANCE
//
// Kept for compatibility.
// New Employee Dashboard does not need employee login.
// ======================================================

router.get(
  "/my-performance",
  verifyToken,
  (req, res) => {

    const employeeId =
      req.user?.id ||
      req.employee?.id ||
      null;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message:
          "Employee authentication required."
      });
    }

    const summarySql = `
      SELECT

        COUNT(
          DISTINCT CASE
            WHEN o.order_status <> 'cancelled'
            THEN o.id
          END
        ) AS total_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'delivered'
            THEN o.id
          END
        ) AS completed_orders,

        COUNT(
          DISTINCT CASE
            WHEN o.order_status = 'cancelled'
            THEN o.id
          END
        ) AS cancelled_orders,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.subtotal
              ELSE 0
            END
          ),
          0
        ) AS total_sales,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.buying_price * oi.quantity
              ELSE 0
            END
          ),
          0
        ) AS total_purchase_cost,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN
                oi.subtotal -
                (
                  oi.buying_price * oi.quantity
                )
              ELSE 0
            END
          ),
          0
        ) AS total_profit

      FROM orders o

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?
    `;

    const monthlySql = `
      SELECT

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN oi.subtotal
              ELSE 0
            END
          ),
          0
        ) AS monthly_sales,

        COALESCE(
          SUM(
            CASE
              WHEN o.order_status = 'delivered'
              THEN
                oi.subtotal -
                (
                  oi.buying_price * oi.quantity
                )
              ELSE 0
            END
          ),
          0
        ) AS monthly_profit

      FROM orders o

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?

        AND o.order_status = 'delivered'

        AND YEAR(o.updated_at) = YEAR(CURDATE())

        AND MONTH(o.updated_at) = MONTH(CURDATE())
    `;

    db.query(
      summarySql,
      [employeeId],
      (summaryErr, summaryResults) => {

        if (summaryErr) {
          console.error(
            "MY PERFORMANCE ERROR:",
            summaryErr
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: summaryErr.message
          });
        }

        db.query(
          monthlySql,
          [employeeId],
          (monthlyErr, monthlyResults) => {

            if (monthlyErr) {
              console.error(
                "MY MONTHLY PERFORMANCE ERROR:",
                monthlyErr
              );

              return res.status(500).json({
                success: false,
                message: "Database error",
                error: monthlyErr.message
              });
            }

            const summary =
              summaryResults[0] || {};

            const monthly =
              monthlyResults[0] || {};

            return res.json({

              success: true,

              employee_id:
                employeeId,

              summary: {

                total_orders:
                  Number(summary.total_orders || 0),

                completed_orders:
                  Number(summary.completed_orders || 0),

                cancelled_orders:
                  Number(summary.cancelled_orders || 0),

                total_sales:
                  Number(summary.total_sales || 0),

                total_purchase_cost:
                  Number(
                    summary.total_purchase_cost || 0
                  ),

                total_profit:
                  Number(summary.total_profit || 0)
              },

              current_month: {

                sales:
                  Number(monthly.monthly_sales || 0),

                profit:
                  Number(monthly.monthly_profit || 0)
              }
            });
          }
        );
      }
    );
  }
);


// ======================================================
// OLD EMPLOYEE STATEMENT
//
// Kept for compatibility.
// ======================================================

router.get(
  "/my-statement",
  verifyToken,
  (req, res) => {

    const employeeId =
      req.user?.id ||
      req.employee?.id ||
      null;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message:
          "Employee authentication required."
      });
    }

    const {
      from_date,
      to_date
    } = req.query;

    let sql = `
      SELECT

        o.id AS order_id,

        o.customer_id,

        c.customer_code,

        c.name AS customer_name,

        o.total_amount,

        o.delivery_charge,

        o.payment_method,

        o.payment_status,

        o.order_status,

        o.created_at,

        o.updated_at,

        COALESCE(
          SUM(oi.subtotal),
          0
        ) AS product_sales,

        COALESCE(
          SUM(
            oi.buying_price * oi.quantity
          ),
          0
        ) AS purchase_cost,

        COALESCE(
          SUM(
            oi.subtotal -
            (
              oi.buying_price * oi.quantity
            )
          ),
          0
        ) AS profit

      FROM orders o

      LEFT JOIN customers c
        ON c.id = o.customer_id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE
        o.employee_id = ?
    `;

    const params = [
      employeeId
    ];

    if (from_date) {
      sql += `
        AND DATE(o.created_at) >= ?
      `;

      params.push(from_date);
    }

    if (to_date) {
      sql += `
        AND DATE(o.created_at) <= ?
      `;

      params.push(to_date);
    }

    sql += `
      GROUP BY

        o.id,
        o.customer_id,
        c.customer_code,
        c.name,
        o.total_amount,
        o.delivery_charge,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.created_at,
        o.updated_at

      ORDER BY
        o.id DESC
    `;

    db.query(
      sql,
      params,
      (err, results) => {

        if (err) {
          console.error(
            "MY STATEMENT ERROR:",
            err
          );

          return res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message
          });
        }

        let totalSales = 0;
        let totalPurchaseCost = 0;
        let totalProfit = 0;

        let completedOrders = 0;
        let cancelledOrders = 0;

        results.forEach(
          row => {

            if (row.order_status === "delivered") {

              totalSales +=
                Number(row.product_sales || 0);

              totalPurchaseCost +=
                Number(row.purchase_cost || 0);

              totalProfit +=
                Number(row.profit || 0);

              completedOrders++;
            }

            if (row.order_status === "cancelled") {
              cancelledOrders++;
            }
          }
        );

        return res.json({

          success: true,

          employee_id:
            employeeId,

          summary: {

            total_orders:
              results.length,

            completed_orders:
              completedOrders,

            cancelled_orders:
              cancelledOrders,

            total_sales:
              totalSales,

            total_purchase_cost:
              totalPurchaseCost,

            total_profit:
              totalProfit
          },

          data:
            results
        });
      }
    );
  }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;