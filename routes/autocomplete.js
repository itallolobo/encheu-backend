const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const MeaseurePoint = require("../schemas/measure_point");
router.get("/", (req, res) => {
  MeaseurePoint.find({ $text: { $search: req.query["search"] } })
    .limit(10)
    .then((data) => {
      data.forEach((item) => {
        item.points.forEach((point) => {
          delete point.height;
          delete point.prediction;
        });
      });

      //remove height from response
      console.log(data);
      res.send(data);
    });
});

module.exports = router;
 