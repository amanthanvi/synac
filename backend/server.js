const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000; // Fallback to 5000 if running locally
const connection = mongoose.connection;
const termsRouter = require("./routes/terms");
const suggestionsRouter = require("./routes/suggestions");

app.use(cors());
app.use(express.json());

// Connection to MongoDB (the URI should be defined in an environment variable or directly here)
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/synac", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

connection.once("open", function () {
  console.log("MongoDB database connection established successfully");
});

// Route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to Synac!");
});

app.use("/suggestions", suggestionsRouter);
app.use("/terms", termsRouter);


app.listen(port, () => {
  console.log(`Server is running on Port: ${port}`);
});
