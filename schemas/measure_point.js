const mongoose = require('mongoose');

const measurementPointSchema = new mongoose.Schema({
  name: String,
  points: [{
    number: Number,
    height: Number,
    prediction: String,
    history: Array
  }]
});

module.exports = mongoose.model('MeasurementPoint', measurementPointSchema, 'measurement_points');