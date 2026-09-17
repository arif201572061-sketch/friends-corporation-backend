const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

// =====================================================
// Employee Login
// Phone Number + Password
// POST /api/employees/login
// =====================================================

router.post("/login", async (req, res) => {

const { phone, password } = req.body;

if (!phone || !password) {
return res.status(400).json({
message: "Phone number and password are required"
});
}

const sql = `     SELECT *
    FROM employees
    WHERE phone = ?
      AND status = 'active'
    LIMIT 1
  `;

db.query(sql, [phone], async (err, results) => {

```
if (err) {

  console.error(
    "EMPLOYEE LOGIN DATABASE ERROR:",
    err.message
  );

  return res.status(500).json({
    message: "Database error",
    error: err.message
  });
}

if (results.length === 0) {

  return res.status(401).json({
    message: "Invalid phone number or password"
  });
}

const employee = results[0];

try {

  const passwordMatch = await bcrypt.compare(
    password,
    employee.password
  );

  if (!passwordMatch) {

    return res.status(401).json({
      message: "Invalid phone number or password"
    });
  }

  const token = jwt.sign(
    {
      id: employee.id,
      role: "employee",
      name: employee.name
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d"
    }
  );

  return res.json({

    message: "Employee login successful",

    token: token,

    employee: {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      email: employee.email,
      address: employee.address,
      zone: employee.zone,
      commission_percent: employee.commission_percent,
      salary: employee.salary,
      payment_type: employee.payment_type,
      status: employee.status
    }

  });

} catch (error) {

  console.error(
    "EMPLOYEE PASSWORD ERROR:",
    error.message
  );

  return res.status(500).json({
    message: "Login failed"
  });
}
```

});

});

// =====================================================
// Employee List
// GET /api/employees
// =====================================================

router.get("/", (req, res) => {

const sql = `     SELECT
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
    ORDER BY id DESC
  `;

db.query(sql, (err, results) => {

```
if (err) {

  console.error(
    "EMPLOYEE LIST ERROR:",
    err.message
  );

  return res.status(500).json({
    message: "Database error",
    error: err.message
  });
}

res.json(results);
```

});

});

module.exports = router;
