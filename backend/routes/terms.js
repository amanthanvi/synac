const router = require("express").Router();
const Term = require("../models/Term");

// Utility function for sending errors
const sendError = (res, err) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

// Get all terms
router.route("/").get((req, res) => {
  Term.find()
    .then((terms) => res.json({ data: terms }))
    .catch((err) => sendError(res, err));
});

// Add a term
router.route("/add").post((req, res) => {
  const term = req.body.term;
  const definition = req.body.definition;
  const category = req.body.category;
  const newTerm = new Term({ term, definition, category });

  newTerm
    .save()
    .then(() => res.json({ data: "Term added!" }))
    .catch((err) => sendError(res, err));
});

// Delete a term
router.route("/:id").delete((req, res) => {
  Term.findByIdAndDelete(req.params.id)
    .then(() => res.json({ data: "Term deleted." }))
    .catch((err) => sendError(res, err));
});

// Search for a term
router.route("/search").get((req, res) => {
  const searchTerm = new RegExp(req.query.term, "i"); // Making the search case-insensitive
  Term.find({ term: searchTerm })
    .then((terms) => res.json({ data: terms }))
    .catch((err) => sendError(res, err));
});

// Get terms starting with a specific letter
router.route("/alphabet/:letter").get((req, res) => {
  const letter = req.params.letter;
  const regex = new RegExp("^" + letter, "i"); // Using '^' to match the start of the string
  Term.find({ term: regex })
    .then((terms) => res.json({ data: terms }))
    .catch((err) => sendError(res, err));
});

// Get a list of all unique categories and the count of terms in each
router.route("/categories").get((req, res) => {
  Term.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }])
    .then((categories) => res.json({ data: categories }))
    .catch((err) => sendError(res, err));
});

module.exports = router;
