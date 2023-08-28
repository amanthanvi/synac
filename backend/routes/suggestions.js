const router = require("express").Router();
const Suggestion = require("../models/Suggestion");

// Utility function for sending errors
const sendError = (res, err) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

// Get all suggestions
router.route("/").get((req, res) => {
  Suggestion.find()
    .then((suggestions) => res.json({ data: suggestions }))
    .catch((err) => sendError(res, err));
});

// Add a suggestion
router.route("/add").post((req, res) => {
  const term = req.body.term;
  const definition = req.body.definition;
  const category = req.body.category;
  const newSuggestion = new Suggestion({ term, definition, category });

  newSuggestion
    .save()
    .then(() => res.json({ data: "Suggestion added!" }))
    .catch((err) => sendError(res, err));
});

// Delete a suggestion
router.route("/:id").delete((req, res) => {
  Suggestion.findByIdAndDelete(req.params.id)
    .then(() => res.json({ data: "Suggestion deleted." }))
    .catch((err) => sendError(res, err));
});

module.exports = router;
