const express = require("express");
const db = require("./db");
const verifyToken = require("./authMiddleware");

const router = express.Router();

// Employee-এর Commission % সেট করা
router.put("/employee/:employeeId", verifyToken, (req, res) => {
  const employeeId = req.params.employeeId;
  const { commission_percent } = req.body;

  if (
    commission_percent === undefined ||
    commission_percent < 0 ||
    commission_percent > 100
  ) {
    return res.status(400).json({
      message: "Commission must be between 0 and 100 percent"
    });
  }

  const sql = `
    UPDATE employees
    SET commission_percent = ?,
        payment_type = 'commission'
    WHERE id = ?
  `;

  db.query(
    sql,
    [commission_percent, employeeId],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Database error"
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Employee not found"
        });
      }

      res.json({
        message: "Employee commission updated successfully",
        employee_id: employeeId,
        commission_percent: commission_percent
      });
    }
  );
});


// সব Employee-এর Commission দেখা
router.get("/employees", verifyToken, (req, res) => {
  const sql = `
    SELECT
      id,
      name,
      phone,
      zone,
      commission_percent,
      payment_type,
      status
    FROM employees
    ORDER BY id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database error"
      });
    }

    res.json(results);
  });
});

module.exports = router;