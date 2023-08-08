const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const suggestionSchema = new Schema(
  {
    term: { type: String, required: true },
    definition: { type: String, required: true },
    status: { type: String, required: true, default: "pending" },
  },
  {
    timestamps: true,
  }
);

const Suggestion = mongoose.model("Suggestion", suggestionSchema);

module.exports = Suggestion;
