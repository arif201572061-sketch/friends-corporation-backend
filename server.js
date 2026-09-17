const orderRoutes = require("./orderRoutes");
const employeeRoutes = require("./employeeRoutes");
const productRoutes = require("./productRoutes");
const categoryRoutes = require("./categoryRoutes");

// Employee Product Routes
const employeeProductRoutes = require("./employeeProductRoutes");

// Employee Shopping Routes
const employeeShoppingRoutes = require("./employeeShoppingRoutes");

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./db");
const path = require("path");

const authRoutes = require("./auth");
const employeeAuthRoutes = require("./employeeAuth");
const customerAuthRoutes = require("./customerAuth");

const cartRoutes = require("./cartRoutes");
const checkoutRoutes = require("./checkoutRoutes");
const shopRoutes = require("./shopRoutes");

const customerOrderRoutes = require("./customerOrderRoutes");
const adminOrderRoutes = require("./adminOrderRoutes");
const employeeOrderRoutes = require("./employeeOrderRoutes");

const commissionRoutes = require("./commissionRoutes");
const profitRoutes = require("./profitRoutes");
const adminProductRoutes = require("./adminProductRoutes");
const salesReportRoutes = require("./salesReportRoutes");
const stockReportRoutes = require("./stockReportRoutes");
const employeePerformanceRoutes = require("./employeePerformanceRoutes");

const app = express();


// ======================================
// BASIC MIDDLEWARE
// ======================================

app.use(cors());

app.use(express.json());


// ======================================
// FRONTEND STATIC FILES
// ======================================

// মূল ফ্রন্টএন্ড ফোল্ডার সার্ভ করার জন্য (এটি /admin-login.html খুঁজে পেতে সাহায্য করবে)
app.use(express.static(path.join(__dirname, "frontend")));

app.use(
  "/frontend",
  express.static(
    path.join(__dirname, "frontend")
  )
);

app.use(
  "/admin",
  express.static(
    path.join(__dirname, "frontend", "admin")
  )
);


// ======================================
// UPLOADS
// ======================================

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
);


// ======================================
// MAIN ADMIN LOGIN PAGE
// ======================================

app.get("/admin/login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin-login.html"
    )
  );

});


app.get("/admin-login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin-login.html"
    )
  );

});


app.get("/main-admin-login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin-login.html"
    )
  );

});


app.get("/admin-login.html", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin-login.html"
    )
  );

});


// ======================================
// SUB-ADMIN LOGIN PAGE
// ======================================

app.get("/sub-admin-login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "sub-admin-login.html"
    )
  );

});


// ======================================
// EMPLOYEE LOGIN PAGE
// ======================================

app.get("/employee-login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin",
      "employee-login.html"
    )
  );

});


// ======================================
// EMPLOYEE DASHBOARD PAGE
// ======================================

app.get("/employee-dashboard", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "admin",
      "employee-dashboard.html"
    )
  );

});


// ======================================
// CUSTOMER LOGIN PAGE
// ======================================

app.get("/customer-login", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "customer-login.html"
    )
  );

});


app.get("/customer-login.html", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "customer-login.html"
    )
  );

});


// ======================================
// API ROUTES
// ======================================


// --------------------------------------
// ADMIN AUTH
// --------------------------------------

app.use(
  "/api/auth",
  authRoutes
);


// --------------------------------------
// EMPLOYEE AUTH
// --------------------------------------

app.use(
  "/api/employee-auth",
  employeeAuthRoutes
);


// --------------------------------------
// CUSTOMER AUTH
// --------------------------------------

app.use(
  "/api/customer-auth",
  customerAuthRoutes
);


// --------------------------------------
// CATEGORIES
// --------------------------------------

app.use(
  "/api/categories",
  categoryRoutes
);


// --------------------------------------
// NORMAL ORDERS
// --------------------------------------

app.use(
  "/api/orders",
  orderRoutes
);


// --------------------------------------
// CUSTOMER CART
// --------------------------------------

app.use(
  "/api/cart",
  cartRoutes
);


// --------------------------------------
// CUSTOMER CHECKOUT
// --------------------------------------

app.use(
  "/api/checkout",
  checkoutRoutes
);


// --------------------------------------
// SHOP
// --------------------------------------

app.use(
  "/api/shop",
  shopRoutes
);


// ======================================
// SHOP TEST
// ======================================

app.get("/shop-test", (req, res) => {

  res.send(
    "SHOP ROUTE IS WORKING!"
  );

});


// ======================================
// CUSTOMER ORDER ROUTES
// ======================================

app.use(
  "/api/customer-orders",
  customerOrderRoutes
);


// ======================================
// ADMIN ORDER ROUTES
// ======================================

app.use(
  "/api/admin-orders",
  adminOrderRoutes
);


// ======================================
// EMPLOYEE DELIVERY ORDER ROUTES
// ======================================

app.use(
  "/api/employee-orders",
  employeeOrderRoutes
);


// ======================================
// EMPLOYEE SHOPPING ROUTES
// ======================================
// Employee কাস্টমারের জন্য বাজার করবে
//
// Products:
// /api/employee-shopping/products
//
// Customer Search:
// /api/employee-shopping/customer
//
// Create Order:
// /api/employee-shopping/orders
//
// My Orders:
// /api/employee-shopping/orders
//
// Sales Summary:
// /api/employee-shopping/sales-summary
// ======================================

app.use(
  "/api/employee-shopping",
  employeeShoppingRoutes
);


// ======================================
// COMMISSION
// ======================================

app.use(
  "/api/commissions",
  commissionRoutes
);


// ======================================
// PROFIT
// ======================================

app.use(
  "/api/profit",
  profitRoutes
);


// ======================================
// ADMIN PRODUCT ROUTES
// ======================================

app.use(
  "/api/admin-products",
  adminProductRoutes
);


// ======================================
// SALES REPORT ROUTES
// ======================================

app.use(
  "/api/sales-reports",
  salesReportRoutes
);


// ======================================
// STOCK REPORT ROUTES
// ======================================

app.use(
  "/api/stock-reports",
  stockReportRoutes
);


// ======================================
// EMPLOYEE PERFORMANCE ROUTES
// ======================================

app.use(
  "/api/employee-performance",
  employeePerformanceRoutes
);


// ======================================
// EMPLOYEE ROUTES
// ======================================

app.use(
  "/api/employees",
  employeeRoutes
);


// ======================================
// NORMAL PRODUCT ROUTES
// ======================================

app.use(
  "/api/products",
  productRoutes
);


// ======================================
// EMPLOYEE PRODUCT / INVENTORY ROUTES
// ======================================

app.use(
  "/api/employee-products",
  employeeProductRoutes
);


// ======================================
// FRONTEND HOME PAGE
// ======================================

console.log(
  "RUNNING FILE:",
  __filename
);


app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "frontend",
      "index.html"
    )
  );

});


// ======================================
// TEST API
// ======================================

app.get("/test", (req, res) => {

  res.json({
    success: true,
    message: "Test API Working"
  });

});


// ======================================
// EMPLOYEE SHOPPING TEST
// ======================================

app.get(
  "/employee-shopping-test",
  (req, res) => {

    res.json({
      success: true,
      message:
        "Employee Shopping Route is working!"
    });

  }
);


// ======================================
// SERVER START
// ======================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});