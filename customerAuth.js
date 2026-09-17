const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();


// =====================================================
// Helper: Generate 6 Digit OTP
// =====================================================

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}


// =====================================================
// Helper: Generate Customer Code
// Example: CUST000001
// =====================================================

function generateCustomerCode(callback) {

  db.query(
    "SELECT customer_code FROM customers ORDER BY id DESC LIMIT 1",
    (err, results) => {

      if (err) {
        return callback(err);
      }

      let nextNumber = 1;

      if (
        results.length > 0 &&
        results[0].customer_code
      ) {

        const lastCode =
          results[0].customer_code;

        const lastNumber =
          parseInt(
            lastCode.replace("CUST", ""),
            10
          );

        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }

      }

      const customerCode =
        "CUST" +
        String(nextNumber).padStart(6, "0");

      callback(null, customerCode);

    }
  );
}


// =====================================================
// REQUEST OTP
// =====================================================

router.post("/request-otp", async (req, res) => {

  const {
    phone,
    purpose = "login"
  } = req.body;


  // ---------------------------------------------------
  // Phone validation
  // ---------------------------------------------------

  if (!phone) {

    return res.status(400).json({
      message: "মোবাইল নম্বর দিন"
    });

  }


  const cleanPhone =
    phone.trim();


  if (!/^01\d{9}$/.test(cleanPhone)) {

    return res.status(400).json({
      message: "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন"
    });

  }


  // ---------------------------------------------------
  // Purpose validation
  // ---------------------------------------------------

  if (
    purpose !== "login" &&
    purpose !== "register"
  ) {

    return res.status(400).json({
      message: "Invalid OTP purpose"
    });

  }


  try {

    // ================================================
    // Check customer
    // ================================================

    db.query(
      `
      SELECT id, name, customer_code, status
      FROM customers
      WHERE phone = ?
      LIMIT 1
      `,
      [cleanPhone],
      async (err, results) => {

        if (err) {

          console.error(
            "CUSTOMER OTP CUSTOMER CHECK ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });

        }


        const customerExists =
          results.length > 0;


        // ============================================
        // Login OTP
        // ============================================

        if (
          purpose === "login" &&
          !customerExists
        ) {

          return res.status(404).json({
            message:
              "এই মোবাইল নম্বর দিয়ে কোনো Customer Account পাওয়া যায়নি"
          });

        }


        // ============================================
        // Register OTP
        // ============================================

        if (
          purpose === "register" &&
          customerExists
        ) {

          return res.status(400).json({
            message:
              "এই মোবাইল নম্বর দিয়ে ইতিমধ্যে Customer Account তৈরি আছে"
          });

        }


        if (
          customerExists &&
          results[0].status !== "active"
        ) {

          return res.status(403).json({
            message:
              "Customer Account বর্তমানে inactive"
          });

        }


        // ============================================
        // Check previous OTP
        // 60 seconds cooldown
        // ============================================

        db.query(
          `
          SELECT id, created_at
          FROM customer_otps
          WHERE phone = ?
            AND purpose = ?
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            cleanPhone,
            purpose
          ],
          async (otpErr, otpResults) => {

            if (otpErr) {

              console.error(
                "OTP CHECK ERROR:",
                otpErr
              );

              return res.status(500).json({
                message: "Database error"
              });

            }


            if (
              otpResults.length > 0
            ) {

              const createdAt =
                new Date(
                  otpResults[0].created_at
                );

              const now =
                new Date();

              const difference =
                (now - createdAt) / 1000;


              if (difference < 60) {

                const remaining =
                  Math.ceil(
                    60 - difference
                  );

                return res.status(429).json({
                  message:
                    `অনুগ্রহ করে ${remaining} সেকেন্ড পরে আবার OTP নিন`
                });

              }

            }


            // ========================================
            // Generate OTP
            // ========================================

            const otp =
              generateOTP();


            // ========================================
            // Hash OTP
            // ========================================

            const otpHash =
              await bcrypt.hash(
                otp,
                10
              );


            // ========================================
            // OTP expires in 5 minutes
            // ========================================

            const expiresAt =
              new Date(
                Date.now() + 5 * 60 * 1000
              );


            // ========================================
            // Remove old OTP
            // ========================================

            db.query(
              `
              DELETE FROM customer_otps
              WHERE phone = ?
                AND purpose = ?
              `,
              [
                cleanPhone,
                purpose
              ],
              (deleteErr) => {

                if (deleteErr) {

                  console.error(
                    "OLD OTP DELETE ERROR:",
                    deleteErr
                  );

                  return res.status(500).json({
                    message: "Database error"
                  });

                }


                // ==================================
                // Save new OTP
                // ==================================

                db.query(
                  `
                  INSERT INTO customer_otps
                  (
                    phone,
                    otp_hash,
                    purpose,
                    expires_at,
                    attempts,
                    verified
                  )
                  VALUES
                  (?, ?, ?, ?, 0, 0)
                  `,
                  [
                    cleanPhone,
                    otpHash,
                    purpose,
                    expiresAt
                  ],
                  (insertErr) => {

                    if (insertErr) {

                      console.error(
                        "OTP INSERT ERROR:",
                        insertErr
                      );

                      return res.status(500).json({
                        message:
                          "OTP তৈরি করা যায়নি"
                      });

                    }


                    // =================================
                    // DEVELOPMENT MODE
                    // =================================

                    console.log(
                      "================================="
                    );

                    console.log(
                      "CUSTOMER OTP"
                    );

                    console.log(
                      "Phone:",
                      cleanPhone
                    );

                    console.log(
                      "Purpose:",
                      purpose
                    );

                    console.log(
                      "OTP:",
                      otp
                    );

                    console.log(
                      "Expires: 5 minutes"
                    );

                    console.log(
                      "================================="
                    );


                    return res.json({

                      success: true,

                      message:
                        "OTP তৈরি হয়েছে",

                      // Development only
                      development_otp:
                        otp

                    });

                  }
                );

              }
            );

          }
        );

      }
    );

  } catch (error) {

    console.error(
      "REQUEST OTP ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "OTP তৈরি করা যায়নি"
    });

  }

});


// =====================================================
// VERIFY OTP
// =====================================================

router.post("/verify-otp", async (req, res) => {

  const {
    phone,
    otp,
    purpose = "login",

    // Registration information
    name,
    email,
    address,
    zone,
    reference_employee_id

  } = req.body;


  // ---------------------------------------------------
  // Basic validation
  // ---------------------------------------------------

  if (!phone || !otp) {

    return res.status(400).json({
      message:
        "মোবাইল নম্বর এবং OTP দিন"
    });

  }


  const cleanPhone =
    phone.trim();


  const cleanOTP =
    String(otp).trim();


  if (!/^01\d{9}$/.test(cleanPhone)) {

    return res.status(400).json({
      message:
        "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন"
    });

  }


  if (!/^\d{6}$/.test(cleanOTP)) {

    return res.status(400).json({
      message:
        "৬ সংখ্যার OTP দিন"
    });

  }


  if (
    purpose !== "login" &&
    purpose !== "register"
  ) {

    return res.status(400).json({
      message:
        "Invalid OTP purpose"
    });

  }


  try {

    // ================================================
    // Find latest OTP
    // ================================================

    db.query(
      `
      SELECT *
      FROM customer_otps
      WHERE phone = ?
        AND purpose = ?
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        cleanPhone,
        purpose
      ],
      async (err, results) => {

        if (err) {

          console.error(
            "VERIFY OTP DATABASE ERROR:",
            err
          );

          return res.status(500).json({
            message:
              "Database error"
          });

        }


        if (results.length === 0) {

          return res.status(400).json({
            message:
              "কোনো valid OTP পাওয়া যায়নি। নতুন OTP নিন।"
          });

        }


        const otpRecord =
          results[0];


        // ==========================================
        // Check expiry
        // ==========================================

        const expiresAt =
          new Date(
            otpRecord.expires_at
          );


        if (
          new Date() > expiresAt
        ) {

          return res.status(400).json({
            message:
              "OTP-এর মেয়াদ শেষ হয়ে গেছে। নতুন OTP নিন।"
          });

        }


        // ==========================================
        // Maximum attempts
        // ==========================================

        if (
          otpRecord.attempts >= 5
        ) {

          return res.status(429).json({
            message:
              "অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP নিন।"
          });

        }


        // ==========================================
        // Compare OTP
        // ==========================================

        const otpMatch =
          await bcrypt.compare(
            cleanOTP,
            otpRecord.otp_hash
          );


        if (!otpMatch) {

          db.query(
            `
            UPDATE customer_otps
            SET attempts = attempts + 1
            WHERE id = ?
            `,
            [otpRecord.id]
          );


          return res.status(401).json({
            message:
              "ভুল OTP"
          });

        }


        // ==========================================
        // Mark OTP verified
        // ==========================================

        db.query(
          `
          UPDATE customer_otps
          SET verified = 1
          WHERE id = ?
          `,
          [otpRecord.id]
        );


        // ==========================================
        // LOGIN
        // ==========================================

        if (purpose === "login") {

          db.query(
            `
            SELECT *
            FROM customers
            WHERE phone = ?
              AND status = 'active'
            LIMIT 1
            `,
            [cleanPhone],
            (customerErr, customers) => {

              if (customerErr) {

                console.error(
                  "CUSTOMER LOGIN ERROR:",
                  customerErr
                );

                return res.status(500).json({
                  message:
                    "Database error"
                });

              }


              if (
                customers.length === 0
              ) {

                return res.status(404).json({
                  message:
                    "Customer Account পাওয়া যায়নি"
                });

              }


              const customer =
                customers[0];


              // =====================================
              // JWT Token
              // =====================================

              const token =
                jwt.sign(
                  {
                    id: customer.id,
                    type: "customer"
                  },
                  process.env.JWT_SECRET,
                  {
                    expiresIn: "7d"
                  }
                );


              return res.json({

                success: true,

                message:
                  "Customer login successful",

                token,

                customer: {

                  id:
                    customer.id,

                  customer_code:
                    customer.customer_code,

                  name:
                    customer.name,

                  email:
                    customer.email,

                  phone:
                    customer.phone,

                  address:
                    customer.address,

                  zone:
                    customer.zone

                }

              });

            }
          );


          return;

        }


        // ==========================================
        // REGISTER
        // ==========================================

        if (purpose === "register") {


          if (!name || !name.trim()) {

            return res.status(400).json({
              message:
                "Customer name is required"
            });

          }


          // ========================================
          // Check duplicate phone
          // ========================================

          db.query(
            `
            SELECT id
            FROM customers
            WHERE phone = ?
            LIMIT 1
            `,
            [cleanPhone],
            (phoneErr, phoneResults) => {

              if (phoneErr) {

                console.error(
                  "REGISTER PHONE CHECK ERROR:",
                  phoneErr
                );

                return res.status(500).json({
                  message:
                    "Database error"
                });

              }


              if (
                phoneResults.length > 0
              ) {

                return res.status(400).json({
                  message:
                    "এই মোবাইল নম্বর দিয়ে ইতিমধ্যে Customer Account আছে"
                });

              }


              // ====================================
              // Check email if provided
              // ====================================

              if (
                email &&
                email.trim()
              ) {

                db.query(
                  `
                  SELECT id
                  FROM customers
                  WHERE email = ?
                  LIMIT 1
                  `,
                  [
                    email.trim().toLowerCase()
                  ],
                  (emailErr, emailResults) => {

                    if (emailErr) {

                      console.error(
                        "REGISTER EMAIL CHECK ERROR:",
                        emailErr
                      );

                      return res.status(500).json({
                        message:
                          "Database error"
                      });

                    }


                    if (
                      emailResults.length > 0
                    ) {

                      return res.status(400).json({
                        message:
                          "এই Email দিয়ে ইতিমধ্যে Customer Account আছে"
                      });

                    }


                    createNewCustomer();

                  }
                );

              } else {

                createNewCustomer();

              }


              // ====================================
              // Create Customer
              // ====================================

              function createNewCustomer() {

                generateCustomerCode(
                  (codeErr, customerCode) => {

                    if (codeErr) {

                      console.error(
                        "CUSTOMER CODE ERROR:",
                        codeErr
                      );

                      return res.status(500).json({
                        message:
                          "Customer ID তৈরি করা যায়নি"
                      });

                    }


                    const sql = `
                      INSERT INTO customers
                      (
                        customer_code,
                        name,
                        email,
                        phone,
                        password,
                        address,
                        zone,
                        reference_employee_id,
                        status
                      )
                      VALUES
                      (?, ?, ?, ?, NULL, ?, ?, ?, 'active')
                    `;


                    db.query(
                      sql,
                      [
                        customerCode,
                        name.trim(),
                        email
                          ? email.trim().toLowerCase()
                          : null,
                        cleanPhone,
                        address
                          ? address.trim()
                          : null,
                        zone || null,
                        reference_employee_id
                          ? reference_employee_id
                          : null
                      ],
                      (insertErr, result) => {

                        if (insertErr) {

                          console.error(
                            "CUSTOMER REGISTRATION ERROR:",
                            insertErr
                          );


                          if (
                            insertErr.code ===
                            "ER_DUP_ENTRY"
                          ) {

                            return res.status(400).json({
                              message:
                                "Customer Account already exists"
                            });

                          }


                          return res.status(500).json({
                            message:
                              "Customer Account তৈরি করা যায়নি"
                          });

                        }


                        // =================================
                        // Generate JWT
                        // =================================

                        const token =
                          jwt.sign(
                            {
                              id:
                                result.insertId,

                              type:
                                "customer"
                            },
                            process.env.JWT_SECRET,
                            {
                              expiresIn:
                                "7d"
                            }
                          );


                        return res.status(201).json({

                          success: true,

                          message:
                            "Customer Account successfully created",

                          token,

                          customer: {

                            id:
                              result.insertId,

                            customer_code:
                              customerCode,

                            name:
                              name.trim(),

                            email:
                              email
                                ? email.trim().toLowerCase()
                                : null,

                            phone:
                              cleanPhone,

                            address:
                              address
                                ? address.trim()
                                : null,

                            zone:
                              zone || null

                          }

                        });

                      }
                    );

                  }
                );

              }

            }
          );

        }

      }
    );

  } catch (error) {

    console.error(
      "VERIFY OTP ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "OTP verification failed"
    });

  }

});


module.exports = router;