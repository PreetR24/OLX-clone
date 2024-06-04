const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const async = require('async');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.set("view engine","ejs");

// MySQL Connection
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '12345',
    database: 'dbms_project'
});

app.get('/',(req,res)=>{
    res.sendFile(__dirname + "/main.html");
})

//Signup
app.get('/signup', (req, res) => {
    res.sendFile(__dirname + '/signup.html')
});

app.post('/signup', async (req, res) => {
    const { email, password, userType } = req.body;
    const tableName = userType === 'buyer' ? 'buyers' : 'sellers';
  
    // Check password length
    if (password.length < 8){
        return res.status(400).send('Password must be at least 8 characters long');
    }
  
    pool.getConnection((err,con)=>{
        if(err) console.log(err);
        // Check if the email already exists
        con.query(`select * from ${tableName} where email = ?`, [email], async (err, results) => {
            if (err) res.status(500).send('Database error');
            else if (results.length > 0) {
                const existingUser = results[0];
                if (existingUser.email === email) res.status(400).send('User with the same email already exists'); 
            } else {
                const hashedPassword = await bcrypt.hash(password, 10);
                con.query(`INSERT INTO ${tableName} (email, password) VALUES (?, ?)`, [email, hashedPassword], (err, result) => {
                    if (err) res.status(500).send('Failed to create user');
                    else res.status(201).send('User created successfully');
                })
            }
        })
    });
});
 
//Login
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

app.post('/login', async (req, res) => {
    const { email, password,userType } = req.body;
    const tableName = userType === 'buyer' ? 'buyers' : 'sellers';
    const idColumn = userType === 'buyer' ? 'buyer_id' : 'seller_id';
  
    pool.getConnection((err,con)=>{
        if(err) console.log(err);
  
        con.query(`SELECT * FROM ${tableName} WHERE email = ? `, [email], async (err, results) => {
            if (err) {
                res.status(500).send('Login failed');
            } else if (results.length === 0) {
                res.status(401).send('User not found');
            } else {
                const user = results[0];
                const user_id = user[idColumn];
                const match = await bcrypt.compare(password, user.password);
                if (match) {
                    const token = jwt.sign({ userId: user[idColumn] }, 'your_jwt_secret', { expiresIn: '1h' });
                    if(tableName=="buyers"){
                        res.redirect(`/buyer_dashboard/${user_id}`);
                    }
                    else res.redirect(`/seller_dashboard/${user_id}`);
                } else res.status(401).send('Invalid password');
            }
        });
    });
});

app.post('/logout', (req, res) => {
    res.clearCookie('jwtToken');
    res.redirect('/');
});

//Seller
app.get('/seller_dashboard/:seller_id',(req,res)=>{
    const seller_id = req.params.seller_id;
    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "select * from seller_product where seller_id=?";
        con.query(sql,[seller_id], function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + '/seller_dashboard.ejs', { seller_id: seller_id, seller_product: result });
        });
    });
});

app.post('/seller_dashboard/:seller_id', async (req, res) => {
    const { name, description, price } = req.body;
    const { seller_id } = req.params;
  
    pool.getConnection((err,con)=>{
        if(err) console.log(err);

        let sql = 'INSERT INTO seller_product(name, description, price, seller_id) VALUES (?,?,?,?)';
        con.query(sql,[name, description,price,seller_id],(err,result)=>{
            con.release();
            if(!err) res.send("Successfully Added");
            else console.log(err);
        })  
    });
});

// Seller's my Product Section
app.get('/seller_allproducts/:seller_id',(req,res)=>{
    const seller_id = req.params.seller_id;
    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "select * from seller_product where seller_id=?";
        con.query(sql,[seller_id], function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + "/seller_allproducts",{seller_product:result});
        });
    });
});

app.get('/delete-product',function(req,res){
    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "delete from seller_product where product_id=?";
        var id = req.query.id;

        con.query(sql,[id], function (err, result) {
            if (err) console.log(err);
            const seller_id = req.query.seller_id;
            res.redirect(`/seller_allproducts/${seller_id}`);
        });
    });
});

app.get('/update-product',function(req,res){
    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "select * from seller_product where product_id=?";
        var id = req.query.id;

        con.query(sql,[id], function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + '/update_seller_product',{seller_product:result});
        });
    });
});

app.post('/update-product',function(req,res){
    var {name, description, price } = req.body;

    pool.getConnection(function(err,con){
        if(err) console.log(err);
        
        var sql = "update seller_product set name=?, description=?, price=? where product_id=?";
        var id = req.query.id;
        
        con.query(sql,[name,description,price,id], function (err, result) {
            if (err) console.log(err);
            const seller_id = req.query.seller_id;
            res.redirect(`/seller_allproducts/${seller_id}`);
        });
    });
});

app.get('/seller-ordered-product/:product_id',(req,res)=>{
    var ProductId = req.params.product_id;

    var sql = `select email from buyers where buyer_id in (select buyer_id from orders where product_id=${ProductId})`;
    pool.getConnection(function(err,con){
        if(err) console.log(err);
        
        
        con.query(sql,[ProductId],function(err,result) {
            if(err) console.log(err);
            
            var sql = `select email from buyers where buyer_id in (select buyer_id from orders where product_id=?)`;

            const buyerEmails = result.map(row => row.email);
            res.render(__dirname + `/order-list.ejs`,{ buyeremail: buyerEmails,product_id: ProductId });
        })
    })
})

//Buyer
app.get('/buyer_dashboard/:buyer_id',(req,res)=>{
    const buyerId = req.params.buyer_id;
    pool.getConnection((err,con)=>{
        if(err) console.log(err);

        var sql = "select name,description,price,product_id from seller_product";
        con.query(sql, function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + "/buyer_dashboard.ejs",{seller_product:result, buyer_id: buyerId});
        });
    });
});

app.get('/buyer_dashboard/add_to_cart/:buyer_id/:product_id', (req, res) => {
    const buyer_id = req.params.buyer_id;
    const productId = req.params.product_id;

    pool.getConnection((err, con) => {
        if (err) console.log(err);

        const checkExistingQuery = "SELECT COUNT(*) AS count FROM cart WHERE product_id = ? AND buyer_id = ?";
        con.query(checkExistingQuery, [productId, buyer_id], (err, result) => {
            if (err) console.log(err);

            if (result && result[0].count > 0) {
                console.log("Item already in cart");
                con.release();
                return res.redirect(`/buyer_dashboard/${buyer_id}`);
            } else {
                const insertQuery = "INSERT INTO cart (product_id, buyer_id) VALUES (?, ?)";
                con.query(insertQuery, [productId, buyer_id], (err, insertResult) => {
                    con.release();
                    if (err) console.log(err);
                    // console.log("1 record inserted into cart");
                    return res.redirect(`/buyer_dashboard/${buyer_id}`);
                });
            };
        });
    });
});

// Cart
app.get('/buyer_dashboard/view_my_cart/:buyer_id',(req,res)=>{
    const buyerId = req.params.buyer_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);
        
        const sql = `SELECT sp.* FROM seller_product sp INNER JOIN cart c ON sp.product_id = c.product_id WHERE c.buyer_id = ?`;
        
        con.query(sql,[buyerId], function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + '/my_cart.ejs', { seller_product: result,buyer_id: buyerId });
        });
    });
});

app.get('/remove_product_cart/:buyer_id/:product_id',function(req,res){
    const buyer_id = req.params.buyer_id;
    const product_id = req.params.product_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "delete from cart where product_id=?";

        con.query(sql,[product_id], function (err, result) {
            if (err) console.log(err);
            const seller_id = req.query.seller_id;
            res.redirect(`/buyer_dashboard/view_my_cart/${buyer_id}`);
        });
    });
});

app.get('/buy_now/:buyer_id/:product_id',(req,res)=>{
    const buyer_id = req.params.buyer_id;
    const product_id = req.params.product_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "insert into orders (product_id, buyer_id) values(?,?)";
        con.query(sql,[product_id,buyer_id], function (err, result) {
            if (err) console.log(err);
            res.redirect(`/buyer_dashboard/${buyer_id}`);
        });
    })
})

app.get('/order-cart-products/:buyer_id',(req,res)=>{
    const buyer_id = req.params.buyer_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "SELECT product_id FROM cart WHERE buyer_id = ?";
        con.query(sql,[buyer_id], function (err, result) {
            if (err) console.log(err);

            async.eachSeries(result, (cartItem, callback) => {
                const product_id = cartItem.product_id;

                var insertSql = "INSERT INTO orders (product_id, buyer_id) VALUES (?, ?)";
                con.query(insertSql, [product_id, buyer_id], function(err, result) {
                    if (err) console.log(err); 
                    else callback();
                });
            }, (err) => {
                if (err) return res.status(500).send('Error processing cart items');
                con.release();
                res.redirect(`/buyer_dashboard/${buyer_id}`); 
            });
        })
    })
})

// My Orders
app.get('/buyer_dashboard/my_orders/:buyer_id',(req,res)=>{
    const buyerId = req.params.buyer_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);
        
        const sql = `select * from seller_product where product_id in (select product_id from orders where buyer_id=?)`;
        
        con.query(sql,[buyerId], function (err, result) {
            if (err) console.log(err);
            res.render(__dirname + '/my_orders.ejs', { seller_product: result,buyer_id: buyerId });
        });
    });
});

app.get('/remove_order_product/:buyer_id/:product_id',function(req,res){
    const buyer_id = req.params.buyer_id;
    const product_id = req.params.product_id;

    pool.getConnection(function(err,con){
        if(err) console.log(err);

        var sql = "delete from orders where product_id=?";

        con.query(sql,[product_id], function (err, result) {
            if (err) console.log(err);
            const seller_id = req.query.seller_id;
            res.redirect(`/buyer_dashboard/my_orders/${buyer_id}`);
        });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});