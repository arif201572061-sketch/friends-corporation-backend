const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");
const {
  requireMainAdmin,
  requireAdmin
} = require("./adminPermission");

const router = express.Router();


// =====================================================
// 1. সব Order দেখা
// Main Admin + Sub-Admin
// =====================================================

router.get(
  "/",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT
        o.id,
        o.customer_id,
        c.name AS customer_name,
        c.email AS customer_email,

        o.employee_id,
        e.name AS employee_name,

        o.total_amount,
        o.delivery_charge,

        o.payment_method,
        o.payment_status,

        o.order_status,

        o.delivery_address,
        o.customer_phone,

        o.cancelled_at,
        o.cancellation_reason,

        o.created_at,
        o.updated_at

      FROM orders o

      JOIN customers c
        ON o.customer_id = c.id

      LEFT JOIN employees e
        ON o.employee_id = e.id

      ORDER BY o.id DESC
    `;


    db.query(
      sql,
      (err, results) => {

        if (err) {

          console.error(
            "ADMIN ORDERS ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        res.json(results);
      }
    );
  }
);



// =====================================================
// 2. Order Status অনুযায়ী Count
// Main Admin + Sub-Admin
// =====================================================

router.get(
  "/counts",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT
        order_status,
        COUNT(*) AS total

      FROM orders

      GROUP BY order_status
    `;


    db.query(
      sql,
      (err, results) => {

        if (err) {

          console.error(
            "ORDER COUNT ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        const counts = {

          new_order: 0,

          pending: 0,

          confirmed: 0,

          processing: 0,

          ready_for_delivery: 0,

          out_for_delivery: 0,

          delivered: 0,

          cancelled: 0

        };


        results.forEach(row => {

          const status =
            row.order_status;

          const total =
            Number(row.total) || 0;


          if (
            Object.prototype.hasOwnProperty.call(
              counts,
              status
            )
          ) {

            counts[status] =
              total;

          }

        });


        // ------------------------------------------------
        // Active Notification Count
        //
        // Completed এবং Cancelled বাদ
        // ------------------------------------------------

        const activeNotificationCount =

          counts.new_order +

          counts.pending +

          counts.confirmed +

          counts.processing +

          counts.ready_for_delivery +

          counts.out_for_delivery;


        res.json({

          counts,

          active_notification_count:
            activeNotificationCount

        });

      }
    );
  }
);



// =====================================================
// 3. নির্দিষ্ট Status-এর Order দেখা
// Main Admin + Sub-Admin
// =====================================================

router.get(
  "/status/:status",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const status =
      req.params.status;


    const allowedStatuses = [

      "new_order",

      "pending",

      "confirmed",

      "processing",

      "ready_for_delivery",

      "out_for_delivery",

      "delivered",

      "cancelled"

    ];


    if (
      !allowedStatuses.includes(status)
    ) {

      return res.status(400).json({
        message:
          "Invalid order status"
      });
    }


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

        o.created_at,
        o.updated_at

      FROM orders o

      JOIN customers c
        ON o.customer_id = c.id

      LEFT JOIN employees e
        ON o.employee_id = e.id

      WHERE o.order_status = ?

      ORDER BY o.id DESC
    `;


    db.query(
      sql,
      [status],
      (err, results) => {

        if (err) {

          console.error(
            "STATUS ORDER ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        res.json(results);
      }
    );
  }
);



// =====================================================
// 4. Approve Order
//
// New Order → Pending Order
//
// শুধু Main Admin
// =====================================================

router.put(
  "/:id/approve",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const orderId =
      req.params.id;


    const getOrderSql = `
      SELECT
        id,
        order_status

      FROM orders

      WHERE id = ?
    `;


    db.query(
      getOrderSql,
      [orderId],
      (err, orders) => {

        if (err) {

          console.error(
            "GET ORDER FOR APPROVE ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        if (
          orders.length === 0
        ) {

          return res.status(404).json({
            message:
              "Order not found"
          });
        }


        const currentStatus =
          orders[0].order_status;


        if (
          currentStatus !==
          "new_order"
        ) {

          return res.status(400).json({

            message:
              "Only New Order can be approved",

            current_status:
              currentStatus

          });
        }


        const updateSql = `
          UPDATE orders

          SET
            order_status = 'pending'

          WHERE id = ?

            AND order_status = 'new_order'
        `;


        db.query(
          updateSql,
          [orderId],
          (err, result) => {

            if (err) {

              console.error(
                "ORDER APPROVE ERROR:",
                err
              );

              return res.status(500).json({
                message:
                  "Order approval failed"
              });
            }


            if (
              result.affectedRows === 0
            ) {

              return res.status(400).json({
                message:
                  "Order could not be approved"
              });
            }


            res.json({

              success: true,

              message:
                "Order approved successfully",

              order_id:
                orderId,

              previous_status:
                "new_order",

              new_status:
                "pending"

            });

          }
        );

      }
    );
  }
);



// =====================================================
// 5. Employee-কে Order Assign
//
// শুধু Main Admin
//
// NOTE:
// Assign করলে Status পরিবর্তন হবে না
// =====================================================

router.put(
  "/:id/assign",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const orderId =
      req.params.id;


    const {
      employee_id
    } = req.body;


    if (!employee_id) {

      return res.status(400).json({
        message:
          "Employee ID is required"
      });
    }


    const employeeSql = `
      SELECT
        id,
        name

      FROM employees

      WHERE id = ?

        AND status = 'active'
    `;


    db.query(
      employeeSql,
      [employee_id],
      (err, employees) => {

        if (err) {

          console.error(
            "EMPLOYEE CHECK ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        if (
          employees.length === 0
        ) {

          return res.status(404).json({
            message:
              "Active employee not found"
          });
        }


        const orderSql = `
          UPDATE orders

          SET
            employee_id = ?

          WHERE id = ?
        `;


        db.query(
          orderSql,
          [
            employee_id,
            orderId
          ],
          (err, result) => {

            if (err) {

              console.error(
                "ORDER ASSIGN ERROR:",
                err
              );

              return res.status(500).json({
                message:
                  "Order assignment failed"
              });
            }


            if (
              result.affectedRows === 0
            ) {

              return res.status(404).json({
                message:
                  "Order not found"
              });
            }


            res.json({

              success: true,

              message:
                "Order assigned successfully",

              order_id:
                orderId,

              employee_id:
                employee_id,

              employee_name:
                employees[0].name

            });

          }
        );
      }
    );
  }
);



// =====================================================
// 6. Order Status পরিবর্তন
//
// শুধু Main Admin
// =====================================================

router.put(
  "/:id/status",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const orderId =
      req.params.id;


    const {
      order_status
    } = req.body;


    const allowedStatuses = [

      "pending",

      "confirmed",

      "processing",

      "ready_for_delivery",

      "out_for_delivery",

      "delivered",

      "cancelled"

    ];


    if (
      !allowedStatuses.includes(
        order_status
      )
    ) {

      return res.status(400).json({
        message:
          "Invalid order status"
      });
    }


    const getOrderSql = `
      SELECT
        id,
        order_status

      FROM orders

      WHERE id = ?
    `;


    db.query(
      getOrderSql,
      [orderId],
      (err, orders) => {

        if (err) {

          console.error(
            "GET ORDER STATUS ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }


        if (
          orders.length === 0
        ) {

          return res.status(404).json({
            message:
              "Order not found"
          });
        }


        const currentStatus =
          orders[0].order_status;


        // ------------------------------------------------
        // Delivered / Cancelled Order আর পরিবর্তন করা যাবে না
        // ------------------------------------------------

        if (
          currentStatus === "delivered"
        ) {

          return res.status(400).json({
            message:
              "Completed Order cannot be changed"
          });
        }


        if (
          currentStatus === "cancelled"
        ) {

          return res.status(400).json({
            message:
              "Cancelled Order cannot be changed"
          });
        }


        // ------------------------------------------------
        // Cancel আলাদাভাবে Handle
        // ------------------------------------------------

        if (
          order_status === "cancelled"
        ) {

          return cancelOrder(
            orderId,
            currentStatus,
            req.admin.id,
            res
          );
        }


        // ------------------------------------------------
        // Status Transition Validation
        // ------------------------------------------------

        const validTransitions = {

          pending: [
            "processing",
            "ready_for_delivery"
          ],

          confirmed: [
            "processing",
            "ready_for_delivery"
          ],

          processing: [
            "ready_for_delivery"
          ],

          ready_for_delivery: [
            "out_for_delivery"
          ],

          out_for_delivery: [
            "delivered"
          ]

        };


        const allowedNextStatuses =
          validTransitions[
            currentStatus
          ] || [];


        if (
          !allowedNextStatuses.includes(
            order_status
          )
        ) {

          return res.status(400).json({

            message:
              `Cannot change order from ${currentStatus} to ${order_status}`,

            current_status:
              currentStatus,

            requested_status:
              order_status

          });
        }


        const sql = `
          UPDATE orders

          SET
            order_status = ?

          WHERE id = ?

            AND order_status = ?
        `;


        db.query(
          sql,
          [
            order_status,
            orderId,
            currentStatus
          ],
          (err, result) => {

            if (err) {

              console.error(
                "ORDER STATUS ERROR:",
                err
              );

              return res.status(500).json({
                message:
                  "Database error"
              });
            }


            if (
              result.affectedRows === 0
            ) {

              return res.status(400).json({
                message:
                  "Order status could not be updated"
              });
            }


            res.json({

              success: true,

              message:
                "Order status updated successfully",

              order_id:
                orderId,

              previous_status:
                currentStatus,

              new_status:
                order_status

            });

          }
        );

      }
    );
  }
);



// =====================================================
// 7. Cancel Order Function
//
// Cancel করলে Stock ফেরত যাবে
// =====================================================

function cancelOrder(
  orderId,
  currentStatus,
  adminId,
  res
) {

  const cancellableStatuses = [

    "new_order",

    "pending",

    "confirmed",

    "processing",

    "ready_for_delivery"

  ];


  if (
    !cancellableStatuses.includes(
      currentStatus
    )
  ) {

    return res.status(400).json({

      message:
        "This Order cannot be cancelled at this stage",

      current_status:
        currentStatus

    });
  }


  const reason =
    "Cancelled by Main Admin";


  const updateOrderSql = `
    UPDATE orders

    SET
      order_status = 'cancelled',

      cancelled_at = NOW(),

      cancellation_reason = ?,

      cancelled_by_admin_id = ?

    WHERE id = ?

      AND order_status = ?
  `;


  db.query(
    updateOrderSql,
    [
      reason,
      adminId,
      orderId,
      currentStatus
    ],
    (err, result) => {

      if (err) {

        console.error(
          "ORDER CANCEL ERROR:",
          err
        );

        return res.status(500).json({
          message:
            "Order cancellation failed"
        });
      }


      if (
        result.affectedRows === 0
      ) {

        return res.status(400).json({

          message:
            "Order was already changed or cancelled"

        });
      }


      // ------------------------------------------------
      // Order Items থেকে Stock ফেরত
      // ------------------------------------------------

      const itemsSql = `
        SELECT
          product_id,
          quantity

        FROM order_items

        WHERE order_id = ?
      `;


      db.query(
        itemsSql,
        [orderId],
        (err, items) => {

          if (err) {

            console.error(
              "CANCEL STOCK ITEMS ERROR:",
              err
            );

            return res.status(500).json({

              message:
                "Order cancelled but stock restoration failed. Please check stock."

            });
          }


          if (
            items.length === 0
          ) {

            return res.json({

              success: true,

              message:
                "Order cancelled successfully",

              order_id:
                orderId,

              stock_restored:
                true,

              restored_items:
                0

            });
          }


          let completed =
            0;


          let stockError =
            false;


          items.forEach(
            item => {

              const stockSql = `
                UPDATE products

                SET
                  stock = stock + ?

                WHERE id = ?
              `;


              db.query(
                stockSql,
                [
                  item.quantity,
                  item.product_id
                ],
                err => {

                  if (err) {

                    console.error(
                      "CANCEL STOCK RESTORE ERROR:",
                      err
                    );

                    stockError = true;
                  }


                  completed++;


                  if (
                    completed ===
                    items.length
                  ) {

                    if (
                      stockError
                    ) {

                      return res.status(500).json({

                        success: false,

                        message:
                          "Order cancelled but some stock could not be restored. Please check stock.",

                        order_id:
                          orderId

                      });
                    }


                    return res.json({

                      success: true,

                      message:
                        "Order cancelled and stock restored successfully",

                      order_id:
                        orderId,

                      stock_restored:
                        true,

                      restored_items:
                        items.length

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



// =====================================================
// 8. Employee অনুযায়ী Order দেখা
//
// Main Admin + Sub-Admin
// =====================================================

router.get(
  "/employee/:employeeId",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const employeeId =
      req.params.employeeId;


    const sql = `
      SELECT

        o.id,

        c.name AS customer_name,

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

      WHERE o.employee_id = ?

      ORDER BY o.id DESC
    `;


    db.query(
      sql,
      [employeeId],
      (err, results) => {

        if (err) {

          console.error(
            "EMPLOYEE ORDERS ERROR:",
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
// 9. নির্দিষ্ট Order Details
//
// Main Admin + Sub-Admin
//
// Print Slip-এর জন্যও প্রয়োজনীয় তথ্য
// =====================================================

router.get(
  "/:id/details",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const orderId =
      req.params.id;


    const orderSql = `
      SELECT

        o.id,

        o.customer_id,

        c.name AS customer_name,
        c.email AS customer_email,

        o.employee_id,
        e.name AS employee_name,

        o.total_amount,
        o.delivery_charge,

        o.payment_method,
        o.payment_status,

        o.order_status,

        o.delivery_address,
        o.customer_phone,

        o.cancelled_at,
        o.cancellation_reason,

        o.created_at,
        o.updated_at

      FROM orders o

      JOIN customers c
        ON o.customer_id = c.id

      LEFT JOIN employees e
        ON o.employee_id = e.id

      WHERE o.id = ?
    `;


    const itemsSql = `
      SELECT

        oi.product_id,

        p.name AS product_name,

        p.unit,

        p.image_url,

        oi.quantity,

        oi.unit_price,

        oi.buying_price,

        oi.subtotal

      FROM order_items oi

      JOIN products p
        ON oi.product_id = p.id

      WHERE oi.order_id = ?

      ORDER BY oi.id ASC
    `;


    db.query(
      orderSql,
      [orderId],
      (err, orderResults) => {

        if (err) {

          console.error(
            "ORDER DETAILS ERROR:",
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
                "ORDER ITEMS DETAILS ERROR:",
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