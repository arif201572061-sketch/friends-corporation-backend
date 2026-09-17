const db = require("./db");

const sql = `
ALTER TABLE customers
MODIFY password VARCHAR(255) NULL
`;

db.query(sql, (err) => {
  if (err) {
    console.error("ERROR:", err.message);
  } else {
    console.log("SUCCESS: Customer password is now optional.");
  }

  process.exit();
});