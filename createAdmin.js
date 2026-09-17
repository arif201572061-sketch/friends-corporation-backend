require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function createMainAdmin() {
  const name = "Main Admin";
  const email = "admin@friendscorporation.com";
  const password = "Admin@12345";

  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = `
    INSERT INTO admins (name, email, password, role, status)
    VALUES (?, ?, ?, 'main_admin', 'active')
  `;

  db.query(sql, [name, email, hashedPassword], (err, result) => {
    if (err) {
      console.error("Admin creation failed:", err.message);
      process.exit(1);
    }

    console.log("Main Admin Created Successfully!");
    console.log("Email:", email);

    process.exit(0);
  });
}

createMainAdmin();