var express = require('express');
var router = express.Router();
var axios = require('axios');

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('index page');
});

module.exports = router;
