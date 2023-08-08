const router = require("express").Router();
let Term = require("../models/Term");

router.route("/").get((req, res) => {
  Term.find()
    .then((terms) => res.json(terms))
    .catch((err) => res.status(400).json("Error: " + err));
});

router.route("/add").post((req, res) => {
  const term = req.body.term;
  const definition = req.body.definition;
  const category = req.body.category; // new category field

  const newTerm = new Term({ term, definition, category });

  newTerm
    .save()
    .then(() => res.json("Term added!"))
    .catch((err) => res.status(400).json("Error: " + err));
});

router.route("/:id").delete((req, res) => {
  Term.findByIdAndDelete(req.params.id)
    .then(() => res.json("Term deleted."))
    .catch((err) => res.status(400).json("Error: " + err));
});

// New search endpoint
router.route("/search/:query").get((req, res) => {
  const regex = new RegExp(req.params.query, "i"); // i for case insensitive
  Term.find({ term: regex })
    .then((terms) => res.json(terms))
    .catch((err) => res.status(400).json("Error: " + err));
});

// basic alphabetical filter
router.route("/starts-with/:letter").get((req, res) => {
  let regex = new RegExp("^" + req.params.letter, "i");
  Term.find({ term: regex })
    .then((terms) => res.json(terms))
    .catch((err) => res.status(400).json("Error: " + err));
});

router.route("/categories").get((req, res) => {
  Term.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }])
    .then((categories) => res.json(categories))
    .catch((err) => res.status(400).json("Error: " + err));
});

module.exports = router;
