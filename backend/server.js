const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Use the connection string from an environment variable
const uri = process.env.MONGODB_URI || "mongodb://localhost/synac"; // Fallback to localhost if no environment variable is set
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

const termsRouter = require("./routes/terms");
const suggestionsRouter = require("./routes/suggestions");

app.use("/suggestions", suggestionsRouter);
app.use("/terms", termsRouter);

app.listen(process.env.PORT || 5000, () => { // Use Heroku's assigned port if available
  console.log("Server is running on Port: 5000");
});
