const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const {
  requireMainAdmin,
  requireAdmin
} = require("./adminPermission");

const multer = require("multer");
const path = require("path");

const router = express.Router();


// ========================================
// Product Image Upload
// ========================================

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, "uploads/products");
  },

  filename: function (req, file, cb) {

    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1E9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  }

});


const upload = multer({

  storage: storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (allowedTypes.includes(file.mimetype)) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "শুধু JPG, PNG, WEBP অথবা GIF ছবি ব্যবহার করুন।"
        )
      );

    }

  }

});


// ========================================
// সব Product দেখা
// Main Admin + Sub-Admin
// GET /api/admin-products
// ========================================

router.get(
  "/",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT
        p.id,
        p.product_code,
        p.name,
        p.description,
        p.image_url,
        p.buying_price,
        p.selling_price,
        p.stock,
        p.unit,
        p.status,
        p.category_id,
        c.name AS category_name,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories c
        ON p.category_id = c.id
      ORDER BY p.id DESC
    `;

    db.query(
      sql,
      (err, results) => {

        if (err) {

          console.error(
            "PRODUCT LIST ERROR:",
            err.message
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
// ========================================
// নতুন Product যোগ
// শুধু Main Admin
// ========================================

router.post(
  "/",
  verifyToken,
  requireMainAdmin,
  upload.single("image"),
  (req, res) => {

    const {
      product_code,
      name,
      description,
      buying_price,
      selling_price,
      stock,
      unit,
      category_id,
      purchase_date,
      expiry_date
    } = req.body;

    // ========================================
    // Basic Validation
    // ========================================

    if (!product_code || !product_code.trim()) {
      return res.status(400).json({
        message: "Product code is required"
      });
    }

    if (
      !name ||
      buying_price === undefined ||
      selling_price === undefined ||
      stock === undefined
    ) {
      return res.status(400).json({
        message:
          "Name, buying price, selling price and stock are required"
      });
    }

    const stockQuantity = Number(stock);
    const purchasePrice = Number(buying_price);
    const sellingPrice = Number(selling_price);

    if (
      Number.isNaN(stockQuantity) ||
      Number.isNaN(purchasePrice) ||
      Number.isNaN(sellingPrice) ||
      stockQuantity < 0 ||
      purchasePrice < 0 ||
      sellingPrice < 0
    ) {
      return res.status(400).json({
        message:
          "Stock, buying price and selling price must be valid numbers"
      });
    }

    // Stock থাকলে Purchase Date আবশ্যক
    if (stockQuantity > 0 && !purchase_date) {
      return res.status(400).json({
        message:
          "Purchase date is required when initial stock is greater than 0"
      });
    }

    // Expiry Date Purchase Date-এর আগে হতে পারবে না
    if (
      purchase_date &&
      expiry_date &&
      new Date(expiry_date) < new Date(purchase_date)
    ) {
      return res.status(400).json({
        message:
          "Expiry date cannot be earlier than purchase date"
      });
    }

    let image_url = null;

    if (req.file) {
      image_url =
        "/uploads/products/" +
        req.file.filename;
    }

    // ========================================
    // Product Create
    // ========================================

    const productSql = `
      INSERT INTO products
      (
        product_code,
        name,
        description,
        image_url,
        buying_price,
        selling_price,
        stock,
        unit,
        category_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      productSql,
      [
        product_code.trim(),
        name.trim(),
        description || null,
        image_url,
        purchasePrice,
        sellingPrice,
        stockQuantity,
        unit || null,
        category_id || null
      ],
      (err, result) => {

        if (err) {

          console.error(
            "PRODUCT CREATE ERROR:",
            err.message
          );

          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message:
                "This product code already exists"
            });
          }

          return res.status(500).json({
            message:
              "Product creation failed"
          });
        }

        const productId = result.insertId;

        // ========================================
        // Stock না থাকলে Batch তৈরি হবে না
        // ========================================

        if (stockQuantity <= 0) {

          return res.status(201).json({
            message:
              "Product created successfully",

            product_id:
              productId,

            image_url:
              image_url,

            batch_created:
              false,

            stock_history_saved:
              false
          });

        }

        // ========================================
        // প্রথম Stock Batch তৈরি
        // ========================================

        const batchCode =
          `BATCH-${Date.now()}-${productId}`;

        const batchSql = `
          INSERT INTO stock_batches
          (
            product_id,
            batch_code,
            purchase_date,
            expiry_date,
            quantity,
            remaining_quantity,
            buying_price
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          batchSql,
          [
            productId,
            batchCode,
            purchase_date,
            expiry_date || null,
            stockQuantity,
            stockQuantity,
            purchasePrice
          ],
          (batchErr, batchResult) => {

            if (batchErr) {

              console.error(
                "STOCK BATCH CREATE ERROR:",
                batchErr.message
              );

              return res.status(500).json({
                message:
                  "Product created but stock batch could not be saved",
                product_id:
                  productId
              });

            }

            // ========================================
            // পুরোনো Stock History-তেও Save
            // ========================================

            const totalPurchaseValue =
              stockQuantity * purchasePrice;

            const historySql = `
              INSERT INTO stock_history
              (
                product_id,
                quantity,
                purchase_price,
                total_purchase_value,
                added_by_admin_id,
                added_by_employee_id
              )
              VALUES (?, ?, ?, ?, ?, NULL)
            `;

            db.query(
              historySql,
              [
                productId,
                stockQuantity,
                purchasePrice,
                totalPurchaseValue,
                req.admin.id
              ],
              (historyErr, historyResult) => {

                if (historyErr) {

                  console.error(
                    "STOCK HISTORY CREATE ERROR:",
                    historyErr.message
                  );

                  return res.status(500).json({
                    message:
                      "Product and batch created but stock history could not be saved",
                    product_id:
                      productId,
                    batch_code:
                      batchCode
                  });

                }

                return res.status(201).json({

                  message:
                    "Product created successfully",

                  product_id:
                    productId,

                  image_url:
                    image_url,

                  batch_created:
                    true,

                  batch_id:
                    batchResult.insertId,

                  batch_code:
                    batchCode,

                  stock_history_saved:
                    true,

                  stock_history_id:
                    historyResult.insertId

                });

              }
            );

          }
        );

      }
    );

  }
);
// ========================================
// নতুন Stock যোগ করা
// শুধু Main Admin
// Stock Batch System
// ========================================

router.post(
  "/:id/add-stock",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const productId = req.params.id;

    const {
      quantity,
      buying_price,
      purchase_date,
      expiry_date
    } = req.body;

    // ========================================
    // Basic Validation
    // ========================================

    if (
      quantity === undefined ||
      buying_price === undefined ||
      !purchase_date
    ) {
      return res.status(400).json({
        message:
          "Quantity, buying price and purchase date are required"
      });
    }

    const stockQuantity = Number(quantity);
    const purchasePrice = Number(buying_price);

    if (
      Number.isNaN(stockQuantity) ||
      Number.isNaN(purchasePrice) ||
      stockQuantity <= 0 ||
      purchasePrice < 0
    ) {
      return res.status(400).json({
        message:
          "Quantity must be greater than 0 and buying price must be valid"
      });
    }

    // ========================================
    // Expiry Date validation
    // ========================================

    if (
      purchase_date &&
      expiry_date &&
      new Date(expiry_date) < new Date(purchase_date)
    ) {
      return res.status(400).json({
        message:
          "Expiry date cannot be earlier than purchase date"
      });
    }

    // ========================================
    // Product আছে কিনা চেক
    // ========================================

    const productSql = `
      SELECT
        id,
        name,
        stock
      FROM products
      WHERE id = ?
      LIMIT 1
    `;

    db.query(
      productSql,
      [productId],
      (productErr, products) => {

        if (productErr) {

          console.error(
            "ADD STOCK PRODUCT CHECK ERROR:",
            productErr.message
          );

          return res.status(500).json({
            message:
              "Database error"
          });
        }

        if (!products.length) {

          return res.status(404).json({
            message:
              "Product not found"
          });
        }

        const product = products[0];

        // ========================================
        // Batch Code তৈরি
        // ========================================

        const batchCode =
          `BATCH-${Date.now()}-${productId}`;

        // ========================================
        // Stock Batch তৈরি
        // ========================================

        const batchSql = `
          INSERT INTO stock_batches
          (
            product_id,
            batch_code,
            purchase_date,
            expiry_date,
            quantity,
            remaining_quantity,
            buying_price,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `;

        db.query(
          batchSql,
          [
            productId,
            batchCode,
            purchase_date,
            expiry_date || null,
            stockQuantity,
            stockQuantity,
            purchasePrice
          ],
          (batchErr, batchResult) => {

            if (batchErr) {

              console.error(
                "ADD STOCK BATCH ERROR:",
                batchErr.message
              );

              if (
                batchErr.code === "ER_DUP_ENTRY"
              ) {
                return res.status(409).json({
                  message:
                    "Batch code already exists"
                });
              }

              return res.status(500).json({
                message:
                  "Stock batch could not be created"
              });
            }

            // ========================================
            // Products-এর মোট Stock Update
            // ========================================

            const updateStockSql = `
              UPDATE products
              SET stock = stock + ?
              WHERE id = ?
            `;

            db.query(
              updateStockSql,
              [
                stockQuantity,
                productId
              ],
              (stockErr) => {

                if (stockErr) {

                  console.error(
                    "PRODUCT STOCK UPDATE ERROR:",
                    stockErr.message
                  );

                  return res.status(500).json({
                    message:
                      "Batch created but product stock could not be updated",
                    batch_code:
                      batchCode
                  });
                }

                // ========================================
                // পুরোনো Stock History-তেও Save
                // ========================================

                const totalPurchaseValue =
                  stockQuantity * purchasePrice;

                const historySql = `
                  INSERT INTO stock_history
                  (
                    product_id,
                    quantity,
                    purchase_price,
                    total_purchase_value,
                    added_by_admin_id,
                    added_by_employee_id
                  )
                  VALUES (?, ?, ?, ?, ?, NULL)
                `;

                db.query(
                  historySql,
                  [
                    productId,
                    stockQuantity,
                    purchasePrice,
                    totalPurchaseValue,
                    req.admin.id
                  ],
                  (historyErr, historyResult) => {

                    if (historyErr) {

                      console.error(
                        "ADD STOCK HISTORY ERROR:",
                        historyErr.message
                      );

                      return res.status(500).json({
                        message:
                          "Stock added but stock history could not be saved",
                        product_id:
                          productId,
                        batch_code:
                          batchCode
                      });
                    }

                    // ========================================
                    // Updated Stock বের করা
                    // ========================================

                    const getStockSql = `
                      SELECT
                        stock
                      FROM products
                      WHERE id = ?
                      LIMIT 1
                    `;

                    db.query(
                      getStockSql,
                      [productId],
                      (getStockErr, stockResult) => {

                        if (getStockErr) {

                          console.error(
                            "GET UPDATED STOCK ERROR:",
                            getStockErr.message
                          );

                          return res.status(201).json({
                            message:
                              "Stock added successfully",
                            product_id:
                              productId,
                            batch_id:
                              batchResult.insertId,
                            batch_code:
                              batchCode
                          });
                        }

                        return res.status(201).json({

                          message:
                            "Stock added successfully",

                          product_id:
                            productId,

                          product_name:
                            product.name,

                          batch_id:
                            batchResult.insertId,

                          batch_code:
                            batchCode,

                          added_quantity:
                            stockQuantity,

                          buying_price:
                            purchasePrice,

                          purchase_date:
                            purchase_date,

                          expiry_date:
                            expiry_date || null,

                          total_stock:
                            Number(
                              stockResult[0].stock
                            ),

                          stock_history_saved:
                            true,

                          stock_history_id:
                            historyResult.insertId

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

  }
);
// ========================================
// Product Stock Batches দেখা
// Main Admin + Sub-Admin
// GET /api/admin-products/:id/batches
// ========================================

router.get(
  "/:id/batches",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const productId = req.params.id;

    // ========================================
    // Product আছে কিনা চেক
    // ========================================

    const productSql = `
      SELECT
        id,
        product_code,
        name,
        stock,
        unit
      FROM products
      WHERE id = ?
      LIMIT 1
    `;

    db.query(
      productSql,
      [productId],
      (productErr, productResults) => {

        if (productErr) {

          console.error(
            "BATCH PRODUCT CHECK ERROR:",
            productErr.message
          );

          return res.status(500).json({
            message: "Database error"
          });

        }

        if (productResults.length === 0) {

          return res.status(404).json({
            message: "Product not found"
          });

        }

        const product = productResults[0];

        // ========================================
        // Product-এর সব Batch
        // ========================================

        const batchSql = `
          SELECT
            id,
            product_id,
            batch_code,
            purchase_date,
            expiry_date,
            quantity,
            remaining_quantity,
            buying_price,
            status,
            created_at,
            updated_at
          FROM stock_batches
          WHERE product_id = ?
          ORDER BY
            CASE
              WHEN expiry_date IS NULL THEN 1
              ELSE 0
            END,
            expiry_date ASC,
            purchase_date ASC,
            id ASC
        `;

        db.query(
          batchSql,
          [productId],
          (batchErr, batches) => {

            if (batchErr) {

              console.error(
                "PRODUCT BATCH LIST ERROR:",
                batchErr.message
              );

              return res.status(500).json({
                message: "Database error"
              });

            }

            // ========================================
            // Batch Status Auto Check
            // ========================================

            const today =
              new Date()
                .toISOString()
                .split("T")[0];

            const formattedBatches =
              batches.map(batch => {

                let batchStatus =
                  batch.status;

                const remaining =
                  Number(
                    batch.remaining_quantity
                  );

                // Stock শেষ হলে Finished
                if (remaining <= 0) {

                  batchStatus =
                    "finished";

                }

                // Expiry হয়ে গেলে Expired
                else if (
                  batch.expiry_date &&
                  String(batch.expiry_date)
                    .substring(0, 10) < today
                ) {

                  batchStatus =
                    "expired";

                }

                return {

                  id:
                    batch.id,

                  product_id:
                    batch.product_id,

                  batch_code:
                    batch.batch_code,

                  purchase_date:
                    batch.purchase_date,

                  expiry_date:
                    batch.expiry_date,

                  quantity:
                    Number(
                      batch.quantity
                    ),

                  remaining_quantity:
                    remaining,

                  buying_price:
                    Number(
                      batch.buying_price
                    ),

                  status:
                    batchStatus,

                  created_at:
                    batch.created_at,

                  updated_at:
                    batch.updated_at

                };

              });

            // ========================================
            // Response
            // ========================================

            res.json({

              product: {

                id:
                  product.id,

                product_code:
                  product.product_code,

                name:
                  product.name,

                stock:
                  Number(
                    product.stock
                  ),

                unit:
                  product.unit

              },

              total_batches:
                formattedBatches.length,

              batches:
                formattedBatches

            });

          }
        );

      }
    );

  }
);
// ========================================
// Product Stock Consistency Check
// Main Admin + Sub-Admin
// GET /api/admin-products/:id/stock-check
// ========================================

router.get(
  "/:id/stock-check",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const productId = req.params.id;

    // ========================================
    // Product-এর বর্তমান Stock
    // ========================================

    const productSql = `
      SELECT
        id,
        product_code,
        name,
        stock,
        unit
      FROM products
      WHERE id = ?
      LIMIT 1
    `;

    db.query(
      productSql,
      [productId],
      (productErr, productResults) => {

        if (productErr) {

          console.error(
            "STOCK CHECK PRODUCT ERROR:",
            productErr.message
          );

          return res.status(500).json({
            message: "Database error"
          });

        }

        if (productResults.length === 0) {

          return res.status(404).json({
            message: "Product not found"
          });

        }

        const product =
          productResults[0];

        // ========================================
        // সব Batch-এর Remaining Stock যোগ
        // ========================================

        const batchSql = `
          SELECT
            COUNT(*) AS total_batches,
            COALESCE(
              SUM(remaining_quantity),
              0
            ) AS batch_remaining_stock
          FROM stock_batches
          WHERE product_id = ?
        `;

        db.query(
          batchSql,
          [productId],
          (batchErr, batchResults) => {

            if (batchErr) {

              console.error(
                "STOCK CHECK BATCH ERROR:",
                batchErr.message
              );

              return res.status(500).json({
                message: "Database error"
              });

            }

            const productStock =
              Number(product.stock);

            const batchStock =
              Number(
                batchResults[0]
                  .batch_remaining_stock
              );

            const difference =
              productStock - batchStock;

            const isConsistent =
              Math.abs(difference) < 0.0001;

            // ========================================
            // Response
            // ========================================

            return res.json({

              product: {

                id:
                  product.id,

                product_code:
                  product.product_code,

                name:
                  product.name,

                unit:
                  product.unit

              },

              product_stock:
                productStock,

              batch_remaining_stock:
                batchStock,

              difference:
                difference,

              total_batches:
                Number(
                  batchResults[0]
                    .total_batches
                ),

              status:
                isConsistent
                  ? "consistent"
                  : "mismatch",

              message:
                isConsistent
                  ? "Product stock and batch stock are consistent"
                  : "Product stock and batch stock do not match"

            });

          }
        );

      }
    );

  }
);
// ========================================
// Product Update
// শুধু Main Admin
//
// গুরুত্বপূর্ণ:
// এই route দিয়ে Stock পরিবর্তন করা যাবে না।
// Stock পরিবর্তন হবে শুধুমাত্র Add Stock route-এর মাধ্যমে।
// ========================================

router.put(
  "/:id",
  verifyToken,
  requireMainAdmin,
  upload.single("image"),
  (req, res) => {

    const productId = req.params.id;

    const {
      product_code,
      name,
      description,
      buying_price,
      selling_price,
      unit,
      category_id,
      status
    } = req.body;

    // ========================================
    // Basic Validation
    // ========================================

    if (
      !product_code ||
      !product_code.trim() ||
      !name ||
      !name.trim() ||
      buying_price === undefined ||
      selling_price === undefined
    ) {
      return res.status(400).json({
        message:
          "Product code, name, buying price and selling price are required"
      });
    }

    const buyingPrice = Number(buying_price);
    const sellingPrice = Number(selling_price);

    if (
      Number.isNaN(buyingPrice) ||
      Number.isNaN(sellingPrice) ||
      buyingPrice < 0 ||
      sellingPrice < 0
    ) {
      return res.status(400).json({
        message:
          "Buying price and selling price must be valid numbers"
      });
    }

    // ========================================
    // Product Update
    // ========================================

    let sql;
    let values;

    // ========================================
    // নতুন Image থাকলে
    // ========================================

    if (req.file) {

      const image_url =
        "/uploads/products/" +
        req.file.filename;

      sql = `
        UPDATE products
        SET
          product_code = ?,
          name = ?,
          description = ?,
          image_url = ?,
          buying_price = ?,
          selling_price = ?,
          unit = ?,
          category_id = ?,
          status = ?
        WHERE id = ?
      `;

      values = [
        product_code.trim(),
        name.trim(),
        description || null,
        image_url,
        buyingPrice,
        sellingPrice,
        unit || null,
        category_id || null,
        status || "active",
        productId
      ];

    }

    // ========================================
    // Image পরিবর্তন না হলে
    // ========================================

    else {

      sql = `
        UPDATE products
        SET
          product_code = ?,
          name = ?,
          description = ?,
          buying_price = ?,
          selling_price = ?,
          unit = ?,
          category_id = ?,
          status = ?
        WHERE id = ?
      `;

      values = [
        product_code.trim(),
        name.trim(),
        description || null,
        buyingPrice,
        sellingPrice,
        unit || null,
        category_id || null,
        status || "active",
        productId
      ];

    }

    // ========================================
    // Database Update
    // ========================================

    db.query(
      sql,
      values,
      (err, result) => {

        if (err) {

          console.error(
            "PRODUCT UPDATE ERROR:",
            err.message
          );

          // Duplicate Product Code
          if (err.code === "ER_DUP_ENTRY") {

            return res.status(409).json({
              message:
                "This product code already exists"
            });

          }

          return res.status(500).json({
            message:
              "Product update failed"
          });

        }

        if (
          result.affectedRows === 0
        ) {

          return res.status(404).json({
            message:
              "Product not found"
          });

        }

        return res.json({

          message:
            "Product updated successfully",

          product_id:
            Number(productId),

          stock_changed:
            false,

          note:
            "Stock can only be changed through Add Stock"

        });

      }
    );

  }
);
// ========================================
// Product Active / Inactive
// শুধু Main Admin
// ========================================

router.put(
  "/:id/status",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const productId =
      req.params.id;

    const {
      status
    } = req.body;


    if (
      !["active", "inactive"]
        .includes(status)
    ) {

      return res.status(400).json({
        message:
          "Status must be active or inactive"
      });

    }


    const sql = `
      UPDATE products
      SET status = ?
      WHERE id = ?
    `;


    db.query(
      sql,
      [status, productId],
      (err, result) => {

        if (err) {

          console.error(
            "PRODUCT STATUS ERROR:",
            err.message
          );

          return res.status(500).json({
            message:
              "Status update failed"
          });

        }


        if (
          result.affectedRows === 0
        ) {

          return res.status(404).json({
            message:
              "Product not found"
          });

        }


        res.json({
          message:
            "Product status updated successfully"
        });

      }
    );

  }
);


// ========================================
// Product Delete
// শুধু Main Admin
// ========================================

router.delete(
  "/:id",
  verifyToken,
  requireMainAdmin,
  (req, res) => {

    const productId =
      req.params.id;


    const sql = `
      DELETE FROM products
      WHERE id = ?
    `;


    db.query(
      sql,
      [productId],
      (err, result) => {

        if (err) {

          console.error(
            "PRODUCT DELETE ERROR:",
            err.message
          );

          return res.status(500).json({
            message:
              "Product deletion failed"
          });

        }


        if (
          result.affectedRows === 0
        ) {

          return res.status(404).json({
            message:
              "Product not found"
          });

        }


        res.json({
          message:
            "Product deleted successfully"
        });

      }
    );

  }
);


// ========================================
// Error Handler
// ========================================

router.use(
  (err, req, res, next) => {

    console.error(err);

    if (
      err instanceof multer.MulterError
    ) {

      return res.status(400).json({
        message:
          "Image upload error: " +
          err.message
      });

    }


    if (err) {

      return res.status(400).json({
        message:
          err.message ||
          "Something went wrong"
      });

    }


    next();

  }
);

// ========================================
// মোট Product সংখ্যা
// Main Admin + Sub-Admin
// GET /api/admin-products/count
// ========================================

router.get(
  "/count",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT COUNT(*) AS total_products
      FROM products
    `;

    db.query(sql, (err, results) => {

      if (err) {

        console.error(
          "PRODUCT COUNT ERROR:",
          err.message
        );

        return res.status(500).json({
          message: "Database error"
        });

      }

      res.json({
        total_products: results[0].total_products
      });

    });

  }
);
// ========================================
// Product Sales Ranking
// Main Admin + Sub-Admin
// GET /api/admin-products/sales-ranking
// ========================================

router.get(
  "/sales-ranking",
  verifyToken,
  requireAdmin,
  (req, res) => {

    const sql = `
      SELECT
        p.id AS product_id,
        p.product_code,
        p.name AS product_name,
        p.unit,

        COUNT(DISTINCT o.id) AS sold_orders,

       COALESCE(
  SUM(
    CASE
      WHEN o.id IS NOT NULL THEN oi.quantity
      ELSE 0
    END
  ),
  0
        ) AS sold_quantity

      FROM products p

      LEFT JOIN order_items oi
        ON p.id = oi.product_id

      LEFT JOIN orders o
        ON oi.order_id = o.id
        AND o.order_status = 'delivered'

      GROUP BY
        p.id,
        p.product_code,
        p.name,
        p.unit

      ORDER BY
        sold_quantity DESC,
        sold_orders DESC,
        p.name ASC
    `;

    db.query(
      sql,
      (err, results) => {

        if (err) {

          console.error(
            "PRODUCT SALES RANKING ERROR:",
            err.message
          );

          return res.status(500).json({
            message: "Database error"
          });

        }

        const ranking = results.map(
          (product, index) => ({
            rank: index + 1,
            product_id: product.product_id,
            product_code: product.product_code,
            product_name: product.product_name,
            unit: product.unit,
            sold_orders: Number(product.sold_orders),
            sold_quantity: Number(product.sold_quantity)
          })
        );

        res.json(ranking);

      }
    );

  }
);
module.exports = router;