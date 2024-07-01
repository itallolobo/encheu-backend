const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const MeaseurePoint = require("../schemas/measure_point");
router.get("/", (req, res) => {
  MeaseurePoint.findById(req.query["_id"] , function (err, data) {
    if (err) {
      console.log(err);
      res.status(400).send();
    } else {
      try {
      var response = {};
      let point = data.points.find((o) => o.number == req.query["number"]);
      response["_id"] = data._id;
      response["name"] = data.name;
      response["number"] = point.number;
      response["prediction"] = point.prediction;
      res.send(response);
      }
      catch(err) {
        console.log(err);
        res.status(400).send();
      } 




    }
  });
});

module.exports = router;
