const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect("mongodb://localhost/synac", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const connection = mongoose.connection;

connection.once("open", function () {
  console.log("MongoDB database connection established successfully");
});

const termsRouter = require("./routes/terms");
const suggestionsRouter = require("./routes/suggestions");

app.use("/suggestions", suggestionsRouter);
app.use("/terms", termsRouter);

app.listen(5000, () => {
  console.log("Server is running on Port: 5000");
});
