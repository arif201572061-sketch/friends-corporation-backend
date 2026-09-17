require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function createSubAdmin() {

  const name = "Sub Admin";

  const email = "mdarif01307466@gmail.com";

  const password = "2015720@sa";


  try {

    // Email আগে থেকেই আছে কিনা পরীক্ষা
    const checkSql = `
      SELECT id, role
      FROM admins
      WHERE email = ?
    `;

    db.query(
      checkSql,
      [email],
      async (checkErr, results) => {

        if (checkErr) {
          console.error(
            "Database error:",
            checkErr.message
          );

          process.exit(1);
        }


        if (results.length > 0) {

          console.log(
            "এই Email দিয়ে Admin আগে থেকেই আছে।"
          );

          console.log(
            "Existing Role:",
            results[0].role
          );

          process.exit(1);
        }


        // Password Hash
        const hashedPassword =
          await bcrypt.hash(password, 10);


        const sql = `
          INSERT INTO admins
          (name, email, password, role, status)
          VALUES (?, ?, ?, 'sub_admin', 'active')
        `;


        db.query(
          sql,
          [
            name,
            email,
            hashedPassword
          ],
          (err, result) => {

            if (err) {

              console.error(
                "Sub-Admin creation failed:",
                err.message
              );

              process.exit(1);
            }


            console.log(
              "Sub-Admin Created Successfully!"
            );

            console.log(
              "Email:",
              email
            );

            console.log(
              "Role: sub_admin"
            );

            process.exit(0);
          }
        );

      }
    );

  } catch (error) {

    console.error(
      "Error:",
      error.message
    );

    process.exit(1);
  }
}


createSubAdmin();