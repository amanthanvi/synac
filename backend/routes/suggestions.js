const router = require("express").Router();
let Suggestion = require("../models/Suggestion");

router.route("/").get((req, res) => {
  Suggestion.find()
    .then((suggestions) => res.json(suggestions))
    .catch((err) => res.status(400).json("Error: " + err));
});

router.route("/add").post((req, res) => {
  const term = req.body.term;
  const definition = req.body.definition;

  const newSuggestion = new Suggestion({ term, definition });

  newSuggestion
    .save()
    .then(() => res.json("Suggestion added!"))
    .catch((err) => res.status(400).json("Error: " + err));
});

module.exports = router;
