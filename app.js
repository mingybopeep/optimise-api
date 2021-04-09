
const express = require('express');
const bcrypt = require('bcrypt');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
//note:  i realise the git ignore should contain the env variables, but an empty .gitignore makes it easier to get up and running for demo purposes
require('dotenv').config();
const cors = require('cors');

//connection config 
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'x',
    database: 'optimise',
    multipleStatements: true
});

//connect
db.connect(err => {
    if (err) {
        console.log(`COULDN'T CONNECT:`, err);
    } else {
        console.log('DB CONENCTED');
    }
});

const app = express();
app.use(express.json());
app.use(cors());

//check user token middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['token'];
    if (!token) return res.status(401).send('missing token');

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send('invalid token supplied');
        req.user = user;
        next();
    })
}

//create a new user
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).send('Insufficient credentials supplied');
    } else {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            //hash the password
            let query = `INSERT INTO Users (username, password) VALUES ('${username}', '${hashedPassword}');`
            db.query(query, (err, result) => {
                if (err) {
                    res.status(409).send('There was an issue handling your request, try a different combination');
                } else {
                    res.sendStatus(200);
                }
            })
        } catch {
            res.sendStatus(500);
        }
    }
});

//login user
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).send('Insufficient credentials supplied');
    } else {
        let query = `SELECT * FROM Users WHERE username = '${username}';`;
        db.query(query, async (err, result) => {
            if (err) {
                res.sendStatus(400);
            } else {
                try {
                    //get check the password
                    const success = await bcrypt.compare(password, result[0].password);
                    if (success) {
                        //generate a token
                        let token = jwt.sign({ username: result[0].username }, process.env.JWT_SECRET);
                        res.json({ token });
                    } else {
                        res.sendStatus(400);
                    }
                } catch {
                    res.status(400).send('Wrong username/password combination');
                }
            }
        });

    }
});

//create a list
app.post('/list', authenticateToken, (req, res) => {
    const { listName } = req.body;
    if (!listName) {
        res.status(400).send('List name missing');
    } else {
        let query = `INSERT INTO Lists (list_name, creator) VALUES ('${listName}', '${req.user.username}');`;
        db.query(query, (err, result) => {
            if (err) {
                res.status(400).send('New List failed');
                console.log(err);
            } else {
                res.status(200).send('New list created');
            }
        })
    }
});

//get all lists
app.get('/list', authenticateToken, (req, res) => {
    let query = `SELECT * FROM Lists WHERE creator = '${req.user.username}';`;
    db.query(query, (err, results) => {
        if (err) {
            res.sendStatus(400)
        } else {
            res.json(results)
        }
    })
});

//delete a list 
app.delete('/list', authenticateToken, (req, res) => {
    const { listIds } = req.body
    if (!listIds) {
        res.status(400).send('List name missing');
    } else {
        let query = `DELETE FROM Lists WHERE list_id in (${listIds.join(', ')}) and creator = '${req.user.username}'`;
        db.query(query, (err, result) => {
            if (err) {
                res.status(400).send('Deletion failed');
            } else {
                res.status(200).send('Delete successful');
            }
        });
    }
})

//add a task 
app.post('/todos/:listId', authenticateToken, (req, res) => {
    const { listId } = req.params;
    const { taskname, description, deadline } = req.body;
    if (!listId || !taskname || !description || !deadline) {
        res.status(400).send('Values missing!');
    } else {
        //check list belongs to user
        let query = `SELECT * FROM Lists WHERE list_id = '${listId}' and creator = '${req.user.username}';`;
        db.query(query, (err, result) => {
            if (err || result.length == 0) {
                res.status(400).send('You do not have access to this list');
            } else {
                query = `INSERT INTO Todos (todo_name, todo_description, todo_deadline, parent_list, creator) VALUES ('${taskname}', '${description}', '${deadline}', '${listId}', '${req.user.username}');`;
                db.query(query, (err, result) => {
                    if (err) {
                        res.status(400).send('ERROR');
                    } else {
                        res.status(200).send('Task added');
                    }
                })
            }
        })
    }
});

// update task(s)
app.put('/todos', authenticateToken, (req, res) => {
    let { todos } = req.body;
    let queries = [];
    let failed = false;
    todos = todos.filter(todo=>{
        return todo != null;
    });

    //create the statements
    todos.forEach(todo => {
        let { todoId, listId, taskname, description, deadline } = todo;
        if (!todoId || !listId || !taskname || !description || !deadline) {
            failed = true;
        } else {
            queries.push({
                checkListStatement: `SELECT * from Lists WHERE creator = '${req.user.username}' and list_id = '${listId}'`,
                updateItemStatement: `UPDATE Todos SET todo_name = '${taskname}', todo_description = '${description}', todo_deadline = '${deadline}', parent_list = '${listId}' WHERE creator = '${req.user.username}' AND todo_id = '${todoId}'`
            });
        }
    });

    if (failed) { console.log('error'); return res.sendStatus(400) }

    let checkListStatments = queries.map(e => e.checkListStatement).join(';');
    let updateItemStatements = queries.map(e => e.updateItemStatement).join(';');

    //check user owns target list
    db.query(checkListStatments, (err, results) => {
        if (err || results.filter(result => result.length != 0).length != todos.length) {
            failed = true;
        } else {
            //process the updates 
            db.query(updateItemStatements, (err, results) => {
                if (err) {
                    res.sendStatus(400);
                } else if (results) {
                    res.sendStatus(200);
                }
            });
        }
    });
});


//delete task(s)
app.delete('/todos', authenticateToken, (req, res) => {
    const { todos } = req.body;
    let queries = todos
        .map(todo => {
            return `DELETE FROM Todos WHERE todo_id = '${todo}' and creator = '${req.user.username}'`
        }).join(';');

    db.query(queries, (err, results) => {
        if (err || (Array.isArray(results) && results.filter(r => r.length != 0).length != todos.length)) {
            res.sendStatus(400);
        } else {
            res.sendStatus(200);
        }
    })
})

//get all tasks items 
app.get('/todos', authenticateToken, (req, res) => {
    let query = `SELECT * FROM Todos t JOIN Lists l ON t.parent_list = l.list_id WHERE t.creator = '${req.user.username}';`
    db.query(query, (err, result) => {
        if (err) {
            console.log(err);
            res.sendStatus(400);
        } else {
            res.json(result);
        }
    })
});

//completed task 
app.put('/todo/complete', authenticateToken, (req, res) => {
    let { id } = req.body;
    if (!id) {
        res.sendStatus(400)
    } else {
        let query = `UPDATE Todos SET completed = 1 WHERE todo_id = ${id} AND creator = '${req.user.username}'`;
        db.query(query, (err, result) => {
            if (err) {
                res.sendStatus(400);
            } else {
                console.log('TASK COMPLETED');
                res.sendStatus(200);
            }
        })
    }
})


app.listen(3001, () => {
    console.log('listening');
})