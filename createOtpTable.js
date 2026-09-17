const db = require("./db");

const sql = `
CREATE TABLE IF NOT EXISTS customer_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose ENUM('login','register') NOT NULL DEFAULT 'login',
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_otp_phone (phone),
  INDEX idx_customer_otp_expires (expires_at)
)
`;

db.query(sql, (err) => {
  if (err) {
    console.error("ERROR:", err.message);
  } else {
    console.log("SUCCESS: customer_otps table created.");
  }

  process.exit();
});