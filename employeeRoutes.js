const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = require("./db");
const verifyToken = require("./authMiddleware");

const {
  requireMainAdmin,
  requireAdmin
} = require("./adminPermission");

const router = express.Router();


// =====================================================
// Upload Folder তৈরি
// =====================================================

const uploadDir = path.join(
  __dirname,
  "uploads",
  "employees"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
}


// =====================================================
// Multer Storage
// =====================================================

const storage = multer.diskStorage({

  destination: function (req, file, cb) {

    cb(null, uploadDir);

  },

  filename: function (req, file, cb) {

    const extension =
      path.extname(file.originalname)
        .toLowerCase();

    const uniqueName =
      "employee_" +
      Date.now() +
      "_" +
      Math.round(
        Math.random() * 1000000
      ) +
      extension;

    cb(null, uniqueName);

  }

});


// =====================================================
// File Validation
// =====================================================

const fileFilter = function (
  req,
  file,
  cb
) {

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
        "শুধু JPG, JPEG, PNG অথবা WEBP ছবি দেওয়া যাবে"
      )
    );

  }

};


// =====================================================
// Multer Upload
// =====================================================

const upload = multer({

  storage: storage,

  fileFilter: fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024
  }

});


// =====================================================
// Helper: 6 Digit User ID তৈরি
// =====================================================

function generateSixDigitUserId(callback) {

  const userId =
    String(
      Math.floor(
        100000 +
        Math.random() * 900000
      )
    );


  const sql = `
    SELECT id
    FROM employees
    WHERE user_id = ?
    LIMIT 1
  `;


  db.query(
    sql,
    [userId],
    (err, results) => {

      if (err) {
        return callback(err);
      }


      if (results.length > 0) {

        return generateSixDigitUserId(
          callback
        );

      }


      callback(
        null,
        userId
      );

    }
  );

}


// =====================================================
// Helper: Uploaded Files Delete
// =====================================================

function deleteUploadedFiles(files) {

  if (!files) {
    return;
  }


  Object.keys(files).forEach(
    fieldName => {

      const fileList =
        files[fieldName];


      if (!Array.isArray(fileList)) {
        return;
      }


      fileList.forEach(file => {

        try {

          if (
            file &&
            file.path &&
            fs.existsSync(file.path)
          ) {

            fs.unlinkSync(
              file.path
            );

          }

        } catch (error) {

          console.error(
            "FILE DELETE ERROR:",
            error.message
          );

        }

      });

    }
  );

}


// =====================================================
// Helper: Existing File Delete
// =====================================================

function deleteExistingFile(
  relativePath
) {

  if (!relativePath) {
    return;
  }


  const cleanPath =
    relativePath.replace(
      /^[/\\]+/,
      ""
    );


  const fullPath =
    path.join(
      __dirname,
      cleanPath
    );


  try {

    if (fs.existsSync(fullPath)) {

      fs.unlinkSync(
        fullPath
      );

    }

  } catch (error) {

    console.error(
      "OLD FILE DELETE ERROR:",
      error.message
    );

  }

}


// =====================================================
// সব Employee দেখা
//
// Main Admin:
// সব তথ্য
//
// Sub-Admin:
// সাধারণ তথ্য + Profile Photo
// Sensitive information নয়
//
// GET /api/employees
// =====================================================

router.get(
  "/",
  verifyToken,
  requireAdmin,
  (req, res) => {

    let sql;


    // ===============================================
    // Main Admin
    // ===============================================

    if (
      req.admin.role ===
      "main_admin"
    ) {

      sql = `
        SELECT
          id,
          user_id,
          name,
          profile_photo,
          nid_photo,
          signature_photo,
          phone,
          email,
          address,
          zone,
          commission_percent,
          salary,
          payment_type,
          status,
          created_at,
          updated_at
        FROM employees
        ORDER BY id DESC
      `;

    }

    // ===============================================
    // Sub Admin
    // Sensitive data বাদ
    // ===============================================

    else {

      sql = `
        SELECT
          id,
          user_id,
          name,
          profile_photo,
          zone,
          commission_percent,
          salary,
          payment_type,
          status,
          created_at
        FROM employees
        ORDER BY id DESC
      `;

    }


    db.query(
      sql,
      (err, results) => {

        if (err) {

          console.error(
            "EMPLOYEE LIST ERROR:",
            err.message
          );

          return res.status(500).json({
            message:
              "Database error"
          });

        }


        res.json({
          success: true,
          employees: results
        });

      }
    );

  }
);


// =====================================================
// নতুন Employee যোগ করা
//
// Main Admin + Sub-Admin
//
// POST /api/employees
//
// multipart/form-data
// =====================================================

router.post(
  "/",
  verifyToken,
  requireAdmin,
  upload.fields([
    {
      name: "profile_photo",
      maxCount: 1
    },
    {
      name: "nid_photo",
      maxCount: 1
    },
    {
      name: "signature_photo",
      maxCount: 1
    }
  ]),
  async (req, res) => {

    const {
      name,
      phone,
      password,
      email,
      address,
      zone,
      commission_percent,
      salary,
      payment_type
    } = req.body;


    // ===============================================
    // Required Fields
    // ===============================================

    if (
      !name ||
      !phone ||
      !password
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "Name, phone and password are required"
      });

    }


    // ===============================================
    // Required Documents
    // ===============================================

    const profilePhoto =
      req.files &&
      req.files.profile_photo
        ? req.files.profile_photo[0]
        : null;


    const nidPhoto =
      req.files &&
      req.files.nid_photo
        ? req.files.nid_photo[0]
        : null;


    const signaturePhoto =
      req.files &&
      req.files.signature_photo
        ? req.files.signature_photo[0]
        : null;


    if (
      !profilePhoto ||
      !nidPhoto ||
      !signaturePhoto
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "Employee Photo, NID Card Photo এবং Signature অবশ্যই দিতে হবে"
      });

    }


    // ===============================================
    // Phone Validation
    // ===============================================

    const cleanPhone =
      phone.trim();


    if (
      !/^01\d{9}$/.test(
        cleanPhone
      )
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন"
      });

    }


    // ===============================================
    // Password Validation
    // ===============================================

    if (
      password.length < 6
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "Password কমপক্ষে ৬ অক্ষরের হতে হবে"
      });

    }


    try {

      // =============================================
      // Phone Check
      // =============================================

      const checkSql = `
        SELECT id
        FROM employees
        WHERE phone = ?
        LIMIT 1
      `;


      db.query(
        checkSql,
        [cleanPhone],
        async (
          err,
          results
        ) => {

          if (err) {

            deleteUploadedFiles(
              req.files
            );

            console.error(
              "PHONE CHECK ERROR:",
              err.message
            );

            return res.status(500).json({
              message:
                "Database error"
            });

          }


          if (
            results.length > 0
          ) {

            deleteUploadedFiles(
              req.files
            );

            return res.status(400).json({
              message:
                "এই Phone number দিয়ে Employee ইতিমধ্যে আছে"
            });

          }


          // =========================================
          // Generate 6 Digit User ID
          // =========================================

          generateSixDigitUserId(
            async (
              userIdError,
              userId
            ) => {

              if (userIdError) {

                deleteUploadedFiles(
                  req.files
                );

                console.error(
                  "USER ID GENERATION ERROR:",
                  userIdError.message
                );

                return res.status(500).json({
                  message:
                    "User ID তৈরি করা যায়নি"
                });

              }


              try {

                const hashedPassword =
                  await bcrypt.hash(
                    password,
                    10
                  );


                const profilePath =
                  "/uploads/employees/" +
                  profilePhoto.filename;


                const nidPath =
                  "/uploads/employees/" +
                  nidPhoto.filename;


                const signaturePath =
                  "/uploads/employees/" +
                  signaturePhoto.filename;


                // =================================
                // Insert Employee
                // =================================

                const sql = `
                  INSERT INTO employees
                  (
                    user_id,
                    name,
                    profile_photo,
                    nid_photo,
                    signature_photo,
                    phone,
                    password,
                    email,
                    address,
                    zone,
                    commission_percent,
                    salary,
                    payment_type,
                    status
                  )
                  VALUES
                  (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'active'
                  )
                `;


                const values = [

                  userId,

                  name.trim(),

                  profilePath,

                  nidPath,

                  signaturePath,

                  cleanPhone,

                  hashedPassword,

                  email
                    ? email.trim()
                    : null,

                  address
                    ? address.trim()
                    : null,

                  zone || null,

                  commission_percent
                    ? Number(
                        commission_percent
                      )
                    : 0,

                  salary
                    ? Number(salary)
                    : 0,

                  payment_type ===
                  "salary"
                    ? "salary"
                    : "commission"

                ];


                db.query(
                  sql,
                  values,
                  (
                    err,
                    result
                  ) => {

                    if (err) {

                      deleteUploadedFiles(
                        req.files
                      );

                      console.error(
                        "EMPLOYEE CREATE ERROR:",
                        err.message
                      );


                      if (
                        err.code ===
                        "ER_DUP_ENTRY"
                      ) {

                        return res.status(400).json({
                          message:
                            "Phone অথবা User ID already exists"
                        });

                      }


                      return res.status(500).json({
                        message:
                          "Database error"
                      });

                    }


                    return res.status(201).json({

                      success: true,

                      message:
                        "Employee created successfully",

                      employee_id:
                        result.insertId,

                      user_id:
                        userId

                    });

                  }
                );

              } catch (error) {

                deleteUploadedFiles(
                  req.files
                );

                console.error(
                  "EMPLOYEE CREATE ERROR:",
                  error.message
                );

                return res.status(500).json({
                  message:
                    "Employee creation failed"
                });

              }

            }
          );

        }
      );

    } catch (error) {

      deleteUploadedFiles(
        req.files
      );

      console.error(
        "EMPLOYEE CREATE ERROR:",
        error.message
      );

      return res.status(500).json({
        message:
          "Employee creation failed"
      });

    }

  }
);


// =====================================================
// Employee Login
//
// Phone + Password
//
// POST /api/employees/login
// =====================================================

router.post(
  "/login",
  async (req, res) => {

    const {
      phone,
      password
    } = req.body;


    if (
      !phone ||
      !password
    ) {

      return res.status(400).json({
        message:
          "Phone and password are required"
      });

    }


    const cleanPhone =
      phone.trim();


    const sql = `
      SELECT *
      FROM employees
      WHERE phone = ?
        AND status = 'active'
      LIMIT 1
    `;


    db.query(
      sql,
      [cleanPhone],
      async (
        err,
        results
      ) => {

        if (err) {

          console.error(
            "EMPLOYEE LOGIN ERROR:",
            err.message
          );

          return res.status(500).json({
            message:
              "Database error"
          });

        }


        if (
          results.length === 0
        ) {

          return res.status(401).json({
            message:
              "Invalid phone or password"
          });

        }


        const employee =
          results[0];


        try {

          const passwordMatch =
            await bcrypt.compare(
              password,
              employee.password
            );


          if (!passwordMatch) {

            return res.status(401).json({
              message:
                "Invalid phone or password"
            });

          }


          const token =
            jwt.sign(
              {
                id:
                  employee.id,

                role:
                  "employee",

                name:
                  employee.name
              },

              process.env.JWT_SECRET,

              {
                expiresIn:
                  "1d"
              }
            );


          res.json({

            success: true,

            message:
              "Employee login successful",

            token:

              token,

            employee: {

              id:
                employee.id,

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
                employee.commission_percent,

              salary:
                employee.salary,

              payment_type:
                employee.payment_type,

              status:
                employee.status

            }

          });

        } catch (error) {

          console.error(
            "PASSWORD CHECK ERROR:",
            error.message
          );

          return res.status(500).json({
            message:
              "Login failed"
          });

        }

      }
    );

  }
);


// =====================================================
// Employee Update
//
// Main Admin + Sub-Admin
//
// PUT /api/employees/:id
//
// Photo/NID/Signature optional during Edit
// =====================================================

router.put(
  "/:id",
  verifyToken,
  requireAdmin,
  upload.fields([
    {
      name: "profile_photo",
      maxCount: 1
    },
    {
      name: "nid_photo",
      maxCount: 1
    },
    {
      name: "signature_photo",
      maxCount: 1
    }
  ]),
  async (req, res) => {

    const { id } =
      req.params;


    const {
      name,
      phone,
      password,
      email,
      address,
      zone,
      commission_percent,
      salary,
      payment_type,
      status
    } = req.body;


    if (
      !name ||
      !phone
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "Name and phone are required"
      });

    }


    const cleanPhone =
      phone.trim();


    if (
      !/^01\d{9}$/.test(
        cleanPhone
      )
    ) {

      deleteUploadedFiles(
        req.files
      );

      return res.status(400).json({
        message:
          "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন"
      });

    }


    try {

      // =============================================
      // Existing Employee
      // =============================================

      const findSql = `
        SELECT *
        FROM employees
        WHERE id = ?
        LIMIT 1
      `;


      db.query(
        findSql,
        [id],
        async (
          err,
          results
        ) => {

          if (err) {

            deleteUploadedFiles(
              req.files
            );

            console.error(
              "EMPLOYEE FIND ERROR:",
              err.message
            );

            return res.status(500).json({
              message:
                "Database error"
            });

          }


          if (
            results.length === 0
          ) {

            deleteUploadedFiles(
              req.files
            );

            return res.status(404).json({
              message:
                "Employee not found"
            });

          }


          const oldEmployee =
            results[0];


          // =========================================
          // Phone Duplicate Check
          // =========================================

          const phoneCheckSql = `
            SELECT id
            FROM employees
            WHERE phone = ?
              AND id != ?
            LIMIT 1
          `;


          db.query(
            phoneCheckSql,
            [
              cleanPhone,
              id
            ],
            async (
              phoneErr,
              phoneResults
            ) => {

              if (phoneErr) {

                deleteUploadedFiles(
                  req.files
                );

                console.error(
                  "PHONE UPDATE CHECK ERROR:",
                  phoneErr.message
                );

                return res.status(500).json({
                  message:
                    "Database error"
                });

              }


              if (
                phoneResults.length > 0
              ) {

                deleteUploadedFiles(
                  req.files
                );

                return res.status(400).json({
                  message:
                    "এই Phone number অন্য Employee ব্যবহার করছে"
                });

              }


              try {

                let newPassword =
                  oldEmployee.password;


                if (
                  password &&
                  password.trim() !== ""
                ) {

                  if (
                    password.length < 6
                  ) {

                    deleteUploadedFiles(
                      req.files
                    );

                    return res.status(400).json({
                      message:
                        "Password কমপক্ষে ৬ অক্ষরের হতে হবে"
                    });

                  }


                  newPassword =
                    await bcrypt.hash(
                      password,
                      10
                    );

                }


                // ===================================
                // Existing file paths
                // ===================================

                let profilePath =
                  oldEmployee.profile_photo;


                let nidPath =
                  oldEmployee.nid_photo;


                let signaturePath =
                  oldEmployee.signature_photo;


                // ===================================
                // New Profile Photo
                // ===================================

                if (
                  req.files &&
                  req.files.profile_photo
                ) {

                  const newFile =
                    req.files.profile_photo[0];


                  profilePath =
                    "/uploads/employees/" +
                    newFile.filename;


                  deleteExistingFile(
                    oldEmployee.profile_photo
                  );

                }


                // ===================================
                // New NID Photo
                // ===================================

                if (
                  req.files &&
                  req.files.nid_photo
                ) {

                  const newFile =
                    req.files.nid_photo[0];


                  nidPath =
                    "/uploads/employees/" +
                    newFile.filename;


                  deleteExistingFile(
                    oldEmployee.nid_photo
                  );

                }


                // ===================================
                // New Signature
                // ===================================

                if (
                  req.files &&
                  req.files.signature_photo
                ) {

                  const newFile =
                    req.files.signature_photo[0];


                  signaturePath =
                    "/uploads/employees/" +
                    newFile.filename;


                  deleteExistingFile(
                    oldEmployee.signature_photo
                  );

                }


                const sql = `
                  UPDATE employees
                  SET
                    name = ?,
                    profile_photo = ?,
                    nid_photo = ?,
                    signature_photo = ?,
                    phone = ?,
                    password = ?,
                    email = ?,
                    address = ?,
                    zone = ?,
                    commission_percent = ?,
                    salary = ?,
                    payment_type = ?,
                    status = ?
                  WHERE id = ?
                `;


                const values = [

                  name.trim(),

                  profilePath,

                  nidPath,

                  signaturePath,

                  cleanPhone,

                  newPassword,

                  email
                    ? email.trim()
                    : null,

                  address
                    ? address.trim()
                    : null,

                  zone || null,

                  commission_percent
                    ? Number(
                        commission_percent
                      )
                    : 0,

                  salary
                    ? Number(salary)
                    : 0,

                  payment_type ===
                  "salary"
                    ? "salary"
                    : "commission",

                  status ===
                  "inactive"
                    ? "inactive"
                    : "active",

                  id

                ];


                db.query(
                  sql,
                  values,
                  (
                    updateErr,
                    result
                  ) => {

                    if (updateErr) {

                      deleteUploadedFiles(
                        req.files
                      );

                      console.error(
                        "EMPLOYEE UPDATE ERROR:",
                        updateErr.message
                      );

                      return res.status(500).json({
                        message:
                          "Database error"
                      });

                    }


                    if (
                      result.affectedRows === 0
                    ) {

                      return res.status(404).json({
                        message:
                          "Employee not found"
                      });

                    }


                    return res.json({

                      success: true,

                      message:
                        "Employee updated successfully"

                    });

                  }
                );

              } catch (error) {

                deleteUploadedFiles(
                  req.files
                );

                console.error(
                  "EMPLOYEE UPDATE ERROR:",
                  error.message
                );

                return res.status(500).json({
                  message:
                    "Employee update failed"
                });

              }

            }
          );

        }
      );

    } catch (error) {

      deleteUploadedFiles(
        req.files
      );

      console.error(
        "EMPLOYEE UPDATE ERROR:",
        error.message
      );

      return res.status(500).json({
        message:
          "Employee update failed"
      });

    }

  }
);


// =====================================================
// Employee Status Change
//
// Main Admin + Sub-Admin
//
// PUT /api/employees/:id/status
// =====================================================

router.put(
  "/:id/status",
  verifyToken,
  requireAdmin,
  express.json(),
  (req, res) => {

    const { id } =
      req.params;


    const { status } =
      req.body;


    if (
      status !== "active" &&
      status !== "inactive"
    ) {

      return res.status(400).json({
        message:
          "Invalid status"
      });

    }


    const sql = `
      UPDATE employees
      SET status = ?
      WHERE id = ?
    `;


    db.query(
      sql,
      [
        status,
        id
      ],
      (
        err,
        result
      ) => {

        if (err) {

          console.error(
            "EMPLOYEE STATUS ERROR:",
            err.message
          );

          return res.status(500).json({
            message:
              "Database error"
          });

        }


        if (
          result.affectedRows === 0
        ) {

          return res.status(404).json({
            message:
              "Employee not found"
          });

        }


        res.json({

          success: true,

          message:
            "Employee status updated successfully"

        });

      }
    );

  }
);


// =====================================================
// Employee Delete
//
// শুধু Main Admin
//
// DELETE /api/employees/:id
// =====================================================

router.delete(
  "/:id",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const { id } =
      req.params;


    const findSql = `
      SELECT
        profile_photo,
        nid_photo,
        signature_photo
      FROM employees
      WHERE id = ?
      LIMIT 1
    `;


    db.query(
      findSql,
      [id],
      (findErr, results) => {

        if (findErr) {

          console.error(
            "EMPLOYEE FIND DELETE ERROR:",
            findErr.message
          );

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
              "Employee not found"
          });

        }


        const employee =
          results[0];


        const sql = `
          DELETE FROM employees
          WHERE id = ?
        `;


        db.query(
          sql,
          [id],
          (err, result) => {

            if (err) {

              console.error(
                "EMPLOYEE DELETE ERROR:",
                err.message
              );

              return res.status(500).json({
                message:
                  "Database error"
              });

            }


            if (
              result.affectedRows === 0
            ) {

              return res.status(404).json({
                message:
                  "Employee not found"
              });

            }


            // =======================================
            // Employee files Delete
            // =======================================

            deleteExistingFile(
              employee.profile_photo
            );

            deleteExistingFile(
              employee.nid_photo
            );

            deleteExistingFile(
              employee.signature_photo
            );


            res.json({

              success: true,

              message:
                "Employee deleted successfully"

            });

          }
        );

      }
    );

  }
);


// =====================================================
// Multer Error Handler
// =====================================================

router.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {

        return res.status(400).json({
          message:
            "প্রতিটি ছবি সর্বোচ্চ ৫ MB হতে পারবে"
        });

      }


      return res.status(400).json({
        message:
          "File upload error: " +
          error.message
      });

    }


    if (
      error &&
      error.message
    ) {

      return res.status(400).json({
        message:
          error.message
      });

    }


    next(error);

  }
);


module.exports = router;