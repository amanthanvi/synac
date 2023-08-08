const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;
const importTerms = require('./import');

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.once('open', () => {
  console.log('MongoDB database connection established successfully');
});

// Import and use routes
const termsRouter = require("./routes/terms");
const suggestionsRouter = require("./routes/suggestions");

app.use("/suggestions", suggestionsRouter);
app.use("/terms", termsRouter);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// The "catchall" handler: for any request that doesn't match one above, send back the index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on Port: ${PORT}`);
});

// Schedule the importTerms function to run every 24 hours
const importInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
setInterval(importTerms, importInterval);

// Run the import once when the server starts
importTerms();