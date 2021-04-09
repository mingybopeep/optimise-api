require('dotenv').config();
const CronJob = require('cron').CronJob;
const mysql = require('mysql');
const moment = require('moment');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'x',
    database: 'optimise',
    multipleStatements: true
});

//runs once per day at midnight
const job = new CronJob('0 0 * * *', () => {
    db.connect(err => {
        if (err) {
            console.log(`COULDN'T CONNECT:`, err);
        } else {
            console.log('DB CONECTED');

            let today = new Date();
            today = moment(today).format('YYYY-MM-DD');

            let query = `SELECT * FROM Todos WHERE completed = 0 AND todo_deadline > '${today}'`
            db.query(query, (err, res) => {
                if (err) {

                } else {
                    res.forEach(item => {
                        console.log(item.todo_name, ' OVERDUE');
                    })
                }
            })
        }
    });
});

job.start();

