// import.js
const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const Term = require("./models/Term");
const dotenv = require("dotenv");
dotenv.config();
const uri = process.env.MONGODB_URI;

function importTerms() {
  mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;

  connection.once("open", function () {
    console.log("MongoDB database connection established successfully");

    fs.createReadStream("terms.csv")
      .pipe(csv())
      .on("data", (row) => {
        const term = new Term({
          term: row.Term,
          definition: row.Definition,
          source: row.Source,
        });

        term
          .save()
          .then(() => console.log("Term saved!"))
          .catch((error) => console.error(error));
      })
      .on("end", () => {
        console.log("CSV file successfully processed");
        connection.close(); // Close the connection after processing
      });
  });
}

module.exports = importTerms;
