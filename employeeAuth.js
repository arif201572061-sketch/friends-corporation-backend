const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

// =====================================
// Employee Login
// POST /api/employee-auth/login
// =====================================

router.post("/login", (req, res) => {

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  const sql = `
    SELECT *
    FROM employees
    WHERE email = ?
      AND status = 'active'
    LIMIT 1
  `;

  db.query(sql, [email], async (err, results) => {

    if (err) {

      console.error(
        "EMPLOYEE LOGIN DATABASE ERROR:",
        err
      );

      return res.status(500).json({
        message: "Database error",
        error: err.message
      });
    }

    if (results.length === 0) {

      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const employee = results[0];

    if (!employee.password) {

      return res.status(401).json({
        message: "Employee password is not set"
      });
    }

    try {

      const passwordMatch =
        await bcrypt.compare(
          password,
          employee.password
        );

      if (!passwordMatch) {

        return res.status(401).json({
          message: "Invalid email or password"
        });
      }

      const token = jwt.sign(
        {
          id: employee.id,
          role: "employee"
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "1d"
        }
      );

      res.json({

        message: "Employee login successful",

        token,

        employee: {
          id: employee.id,
          name: employee.name,
          phone: employee.phone,
          email: employee.email,
          address: employee.address,
          zone: employee.zone,
          commission_percent:
            employee.commission_percent,
          salary: employee.salary,
          payment_type:
            employee.payment_type,
          status: employee.status
        }

      });

    } catch (error) {

      console.error(
        "EMPLOYEE PASSWORD ERROR:",
        error
      );

      return res.status(500).json({
        message: "Login error"
      });
    }

  });

});


// =====================================
// Employee Information
// GET /api/employee-auth/me
// =====================================

router.get("/me", (req, res) => {

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {

    return res.status(401).json({
      message: "Employee login required"
    });
  }

  const token =
    authHeader.split(" ")[1];

  if (!token) {

    return res.status(401).json({
      message: "Invalid token"
    });
  }

  try {

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    if (decoded.role !== "employee") {

      return res.status(403).json({
        message: "Employee access required"
      });
    }

    const sql = `
      SELECT
        id,
        name,
        phone,
        email,
        address,
        zone,
        commission_percent,
        salary,
        payment_type,
        status,
        created_at
      FROM employees
      WHERE id = ?
        AND status = 'active'
      LIMIT 1
    `;

    db.query(
      sql,
      [decoded.id],
      (err, results) => {

        if (err) {

          console.error(
            "EMPLOYEE ME DATABASE ERROR:",
            err
          );

          return res.status(500).json({
            message: "Database error"
          });
        }

        if (results.length === 0) {

          return res.status(404).json({
            message: "Employee not found"
          });
        }

        res.json({
          employee: results[0]
        });

      }
    );

  } catch (error) {

    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }

});

module.exports = router;