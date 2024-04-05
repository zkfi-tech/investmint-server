const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const schedule = require('node-schedule');

require('dotenv').config();

// Routes
const indexRouter = require('./routes/index');

// Utils
const {vinterIndexRebalanceDateTracker, vinterIndexAssetPriceTracker} = require('./utils/vinter-index');
const { connectDB } = require('./utils/dbConfig');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

(async () => {
  await connectDB();
  vinterIndexAssetPriceTracker();
  schedule.scheduleJob('* * * *', vinterIndexAssetPriceTracker); // scheduling job for every hour
  vinterIndexRebalanceDateTracker(); // self schedules itself
})();

module.exports = app;
