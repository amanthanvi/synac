const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;
const importTerms = require("./import");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.use(express.static("frontend"));

const termsRouter = require("./routes/terms");
const suggestionsRouter = require("./routes/suggestions");

app.use("/terms", termsRouter);
app.use("/suggestions", suggestionsRouter);

// Error Handling (as from your previous server.js)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

async function startServer() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    app.listen(port, () => {
      console.log(`Server is running on Port: ${port}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}

// Start the server
startServer();

// Schedule the importTerms function to run every 24 hours
const importInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
setInterval(importTerms, importInterval);

// Run the import once when the server starts
importTerms();
