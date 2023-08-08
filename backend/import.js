const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const Term = require("./models/Term");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config();
const uri = process.env.MONGODB_URI;

async function importTerms() {
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;

  connection.once("open", async function () {
    console.log("MongoDB database connection established successfully");

    const terms = [];

    fs.createReadStream(path.join(__dirname, 'terms.csv'))
      .pipe(csv())
      .on("data", (row) => {
        terms.push({
          term: row.Term,
          definition: row.Definition,
          // Removed the source field
        });
      })
      .on("end", async () => {
        try {
          await Term.insertMany(terms);
          console.log("CSV file successfully processed");
        } catch (error) {
          console.error(error);
        } finally {
          connection.close(); // Close the connection after processing
        }
      });
  });
}

module.exports = importTerms;
