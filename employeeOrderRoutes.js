const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();


// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(
  __dirname,
  "uploads",
  "delivery-proofs"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
}


// =====================================================
// MULTER STORAGE
// =====================================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const ext =
      path.extname(file.originalname)
        .toLowerCase();

    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      ext;

    cb(null, uniqueName);
  }

});


const upload = multer({

  storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];

    if (
      allowedTypes.includes(
        file.mimetype
      )
    ) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "শুধু JPG, JPEG, PNG অথবা WEBP ছবি দেওয়া যাবে।"
        )
      );

    }

  }

});


// =====================================================
// EMPLOYEE ID
// =====================================================

function getEmployeeId(req) {

  return (
    req.user?.id ||
    req.employee?.id ||
    null
  );

}


// =====================================================
// EMPLOYEE AUTH CHECK
// =====================================================

function requireEmployee(req, res, next) {

  const employeeId =
    getEmployeeId(req);

  if (!employeeId) {

    return res.status(401).json({

      message:
        "Employee authentication required."

    });

  }

  next();

}


// =====================================================
// 1. EMPLOYEE-এর ASSIGNED ORDERS
// =====================================================

router.get(
  "/my-orders",
  verifyToken,
  requireEmployee,
  (req, res) => {

    const employeeId =
      getEmployeeId(req);


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
            "EMPLOYEE MY ORDERS ERROR:",
            err.message
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
// 2. SPECIFIC ASSIGNED ORDER DETAILS
// =====================================================

router.get(
  "/my-orders/:id",
  verifyToken,
  requireEmployee,
  (req, res) => {

    const employeeId =
      getEmployeeId(req);

    const orderId =
      req.params.id;


    const orderSql = `

      SELECT

        o.id,

        c.id AS customer_id,

        c.customer_code,

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

        o.updated_at,

        e.id AS employee_id,

        e.name AS employee_name

      FROM orders o

      JOIN customers c
        ON o.customer_id = c.id

      LEFT JOIN employees e
        ON o.employee_id = e.id

      WHERE o.id = ?

        AND o.employee_id = ?

    `;


    const itemsSql = `

      SELECT

        oi.product_id,

        p.name AS product_name,

        p.image_url,

        p.unit,

        oi.quantity,

        oi.unit_price,

        oi.subtotal

      FROM order_items oi

      JOIN products p
        ON oi.product_id = p.id

      WHERE oi.order_id = ?

      ORDER BY oi.id ASC

    `;


    const proofSql = `

      SELECT

        id,

        order_id,

        employee_id,

        receive_photo_url,

        receive_at,

        complete_photo_url,

        complete_at,

        created_at,

        updated_at

      FROM order_delivery_proofs

      WHERE order_id = ?

        AND employee_id = ?

      ORDER BY id DESC

      LIMIT 1

    `;


    db.query(
      orderSql,
      [orderId, employeeId],
      (err, orderResults) => {

        if (err) {

          console.error(
            "EMPLOYEE ORDER DETAILS ERROR:",
            err.message
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
              "Order not found or not assigned to you"

          });

        }


        db.query(
          itemsSql,
          [orderId],
          (itemErr, itemResults) => {

            if (itemErr) {

              return res.status(500).json({

                message:
                  "Database error"

              });

            }


            db.query(
              proofSql,
              [orderId, employeeId],
              (proofErr, proofResults) => {

                if (proofErr) {

                  return res.status(500).json({

                    message:
                      "Database error"

                  });

                }


                res.json({

                  order:
                    orderResults[0],

                  items:
                    itemResults,

                  delivery_proof:
                    proofResults.length > 0
                      ? proofResults[0]
                      : null

                });

              }
            );

          }
        );

      }
    );

  }
);


// =====================================================
// 3. START DELIVERY
// READY FOR DELIVERY → OUT FOR DELIVERY
// =====================================================

router.put(
  "/my-orders/:id/start-delivery",
  verifyToken,
  requireEmployee,
  (req, res) => {

    const employeeId =
      getEmployeeId(req);

    const orderId =
      req.params.id;


    const checkSql = `

      SELECT

        id,

        order_status

      FROM orders

      WHERE id = ?

        AND employee_id = ?

    `;


    db.query(
      checkSql,
      [orderId, employeeId],
      (err, results) => {

        if (err) {

          return res.status(500).json({

            message:
              "Database error"

          });

        }


        if (
          results.length === 0
        ) {

          return res.status(404).json({

            message:
              "Order not found or not assigned to you"

          });

        }


        const currentStatus =
          results[0].order_status;


        if (
          currentStatus !==
          "ready_for_delivery"
        ) {

          return res.status(400).json({

            message:
              "শুধু Ready for Delivery Order-এর Delivery শুরু করা যাবে।"

          });

        }


        const updateSql = `

          UPDATE orders

          SET order_status =
            'out_for_delivery'

          WHERE id = ?

            AND employee_id = ?

            AND order_status =
              'ready_for_delivery'

        `;


        db.query(
          updateSql,
          [orderId, employeeId],
          (updateErr, updateResult) => {

            if (updateErr) {

              console.error(
                "START DELIVERY ERROR:",
                updateErr.message
              );

              return res.status(500).json({

                message:
                  "Database error"

              });

            }


            if (
              updateResult.affectedRows === 0
            ) {

              return res.status(400).json({

                message:
                  "Order status পরিবর্তন করা যায়নি।"

              });

            }


            res.json({

              message:
                "Delivery শুরু হয়েছে।",

              order_id:
                Number(orderId),

              order_status:
                "out_for_delivery"

            });

          }
        );

      }
    );

  }
);


// =====================================================
// 4. CUSTOMER RECEIVE PHOTO
// =====================================================

router.post(
  "/my-orders/:id/receive-photo",
  verifyToken,
  requireEmployee,
  upload.single("receive_photo"),
  (req, res) => {

    const employeeId =
      getEmployeeId(req);

    const orderId =
      req.params.id;


    if (!req.file) {

      return res.status(400).json({

        message:
          "Customer Receive Photo দিন।"

      });

    }


    const checkSql = `

      SELECT

        id,

        order_status

      FROM orders

      WHERE id = ?

        AND employee_id = ?

    `;


    db.query(
      checkSql,
      [orderId, employeeId],
      (err, results) => {

        if (err) {

          return res.status(500).json({

            message:
              "Database error"

          });

        }


        if (
          results.length === 0
        ) {

          return res.status(404).json({

            message:
              "Order not found or not assigned to you"

          });

        }


        const status =
          results[0].order_status;


        if (
          status !==
          "out_for_delivery"
        ) {

          return res.status(400).json({

            message:
              "শুধু Delivery হচ্ছে অবস্থায় Receive Photo দেওয়া যাবে।"

          });

        }


        const photoUrl =
          "/uploads/delivery-proofs/" +
          req.file.filename;


        const findProofSql = `

          SELECT

            id

          FROM order_delivery_proofs

          WHERE order_id = ?

            AND employee_id = ?

          LIMIT 1

        `;


        db.query(
          findProofSql,
          [orderId, employeeId],
          (findErr, proofResults) => {

            if (findErr) {

              return res.status(500).json({

                message:
                  "Database error"

              });

            }


            if (
              proofResults.length > 0
            ) {

              const updateSql = `

                UPDATE order_delivery_proofs

                SET

                  receive_photo_url = ?,

                  receive_at = NOW()

                WHERE id = ?

              `;


              db.query(
                updateSql,
                [
                  photoUrl,
                  proofResults[0].id
                ],
                (updateErr) => {

                  if (updateErr) {

                    return res.status(500).json({

                      message:
                        "Receive Photo save করা যায়নি"

                    });

                  }


                  res.json({

                    message:
                      "Customer Receive Photo সফলভাবে সংরক্ষণ হয়েছে।",

                    order_id:
                      Number(orderId),

                    employee_id:
                      Number(employeeId),

                    receive_photo_url:
                      photoUrl

                  });

                }
              );

            } else {

              const insertSql = `

                INSERT INTO
                  order_delivery_proofs

                (

                  order_id,

                  employee_id,

                  receive_photo_url,

                  receive_at

                )

                VALUES (?, ?, ?, NOW())

              `;


              db.query(
                insertSql,
                [
                  orderId,
                  employeeId,
                  photoUrl
                ],
                (insertErr, insertResult) => {

                  if (insertErr) {

                    return res.status(500).json({

                      message:
                        "Receive Photo save করা যায়নি"

                    });

                  }


                  res.json({

                    message:
                      "Customer Receive Photo সফলভাবে সংরক্ষণ হয়েছে।",

                    proof_id:
                      insertResult.insertId,

                    order_id:
                      Number(orderId),

                    employee_id:
                      Number(employeeId),

                    receive_photo_url:
                      photoUrl

                  });

                }
              );

            }

          }
        );

      }
    );

  }
);


// =====================================================
// 5. COMPLETE ORDER WITH PHOTO
// OUT FOR DELIVERY → DELIVERED
// =====================================================

router.post(
  "/my-orders/:id/complete",
  verifyToken,
  requireEmployee,
  upload.single("complete_photo"),
  (req, res) => {

    const employeeId =
      getEmployeeId(req);

    const orderId =
      req.params.id;


    if (!req.file) {

      return res.status(400).json({

        message:
          "Order Complete করার জন্য Complete Photo দিন।"

      });

    }


    const checkSql = `

      SELECT

        id,

        order_status

      FROM orders

      WHERE id = ?

        AND employee_id = ?

    `;


    db.query(
      checkSql,
      [orderId, employeeId],
      (err, results) => {

        if (err) {

          return res.status(500).json({

            message:
              "Database error"

          });

        }


        if (
          results.length === 0
        ) {

          return res.status(404).json({

            message:
              "Order not found or not assigned to you"

          });

        }


        const currentStatus =
          results[0].order_status;


        if (
          currentStatus !==
          "out_for_delivery"
        ) {

          return res.status(400).json({

            message:
              "শুধু Delivery অবস্থায় Order Complete করা যাবে।"

          });

        }


        const completePhotoUrl =
          "/uploads/delivery-proofs/" +
          req.file.filename;


        const findProofSql = `

          SELECT

            id,

            receive_photo_url

          FROM order_delivery_proofs

          WHERE order_id = ?

            AND employee_id = ?

          LIMIT 1

        `;


        db.query(
          findProofSql,
          [orderId, employeeId],
          (findErr, proofResults) => {

            if (findErr) {

              return res.status(500).json({

                message:
                  "Database error"

              });

            }


            if (
              proofResults.length === 0
            ) {

              return res.status(400).json({

                message:
                  "প্রথমে Customer Receive Photo দিতে হবে।"

              });

            }


            const proof =
              proofResults[0];


            if (
              !proof.receive_photo_url
            ) {

              return res.status(400).json({

                message:
                  "প্রথমে Customer Receive Photo দিতে হবে।"

              });

            }


            const updateProofSql = `

              UPDATE order_delivery_proofs

              SET

                complete_photo_url = ?,

                complete_at = NOW()

              WHERE id = ?

            `;


            db.query(
              updateProofSql,
              [
                completePhotoUrl,
                proof.id
              ],
              (proofUpdateErr) => {

                if (proofUpdateErr) {

                  return res.status(500).json({

                    message:
                      "Complete Photo save করা যায়নি"

                  });

                }


                const updateOrderSql = `

                  UPDATE orders

                  SET

                    order_status =
                      'delivered',

                    updated_at =
                      CURRENT_TIMESTAMP

                  WHERE id = ?

                    AND employee_id = ?

                    AND order_status =
                      'out_for_delivery'

                `;


                db.query(
                  updateOrderSql,
                  [
                    orderId,
                    employeeId
                  ],
                  (orderUpdateErr, orderUpdateResult) => {

                    if (orderUpdateErr) {

                      return res.status(500).json({

                        message:
                          "Order Complete করা যায়নি"

                      });

                    }


                    if (
                      orderUpdateResult.affectedRows === 0
                    ) {

                      return res.status(400).json({

                        message:
                          "Order status পরিবর্তন করা যায়নি।"

                      });

                    }


                    res.json({

                      message:
                        "Order সফলভাবে Complete হয়েছে।",

                      order_id:
                        Number(orderId),

                      employee_id:
                        Number(employeeId),

                      order_status:
                        "delivered",

                      complete_photo_url:
                        completePhotoUrl

                    });

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


// =====================================================
// 6. OLD STATUS API BLOCKED
// =====================================================
// পুরোনো Dashboard যদি এই API call করে,
// তাহলে arbitrary status change বন্ধ থাকবে।

router.put(
  "/my-orders/:id/status",
  verifyToken,
  requireEmployee,
  (req, res) => {

    return res.status(403).json({

      message:
        "Employee সরাসরি Order Status পরিবর্তন করতে পারবে না। Start Delivery এবং Order Complete ব্যবহার করুন।"

    });

  }
);


// =====================================================
// MULTER ERROR HANDLER
// =====================================================

router.use(
  (err, req, res, next) => {

    if (
      err instanceof multer.MulterError
    ) {

      if (
        err.code ===
        "LIMIT_FILE_SIZE"
      ) {

        return res.status(400).json({

          message:
            "ছবির সর্বোচ্চ সাইজ 5 MB।"

        });

      }


      return res.status(400).json({

        message:
          err.message

      });

    }


    if (err) {

      console.error(
        "EMPLOYEE UPLOAD ERROR:",
        err.message
      );


      return res.status(400).json({

        message:
          err.message ||
          "ছবি Upload করা যায়নি"

      });

    }


    next();

  }
);


module.exports = router;