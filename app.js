const express = require('express');
const app = express();
const cors = require('cors');
const mongoose   = require('mongoose')
var compression = require('compression');

var helmet = require('helmet');
const corsOptions ={
    origin:['https://localhost:3000', 'https://192.168.1.111:3000', 'http://localhost:3000'], 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}
app.use(cors(corsOptions));


app.use(helmet());
app.use(compression()); //Compress all routes
//mongoose.connect("mongodb://127.0.0.1:27017/encheu");
mongoose.connect('mongodb+srv://itallo:lobolobo@cluster0.zyhjden.mongodb.net/encheu?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
const homeRouter = require('./routes/home');
const autocompleteRouter = require('./routes/autocomplete');
const streetRouter = require('./routes/street');
const streetHistoryRouter = require('./routes/history');

const URL_BASE = "/";

app.use(URL_BASE+"home", homeRouter);
app.use(URL_BASE+"autocomplete", autocompleteRouter);
app.use(URL_BASE+"street", streetRouter);
app.use(URL_BASE+"History", streetHistoryRouter);



app.listen(4000, () => {console.log('Server is running')});