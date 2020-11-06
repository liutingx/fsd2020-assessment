//load express, handlebars, mysql2
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const morgan = require('morgan')

// get the driver with promise support
const mysql = require('mysql2/promise')

// configure PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

//setting API KEYS
const API_KEY = process.env.API_KEY || ''

const BASE_URL = 'https://api.nytimes.com/svc/books/v3/reviews.json'

// SQL 
const SQL_FIND_BY_FIRSTCHAR = 'select title from book2018 where title like ? order by title asc limit ? offset ?'

// create the database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
    timezone: '+08:00'
})

const startApp = async (app, pool) => {

    try {
        // acquire a connection from the connection pool
        const conn = await pool.getConnection();

        console.info('Pinging database...')
        await conn.ping()

        // release the connection
        conn.release()

        // start the server
        app.listen(PORT, () => {
            console.info(`Application started on port ${PORT} at ${new Date()}`)
        })

    } catch(e) {
        console.error('Cannot ping database: ', e)
    }
}

// create an instance of application
const app = express()

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

//morgan logging
app.use(morgan('combined'));


// configure the application
app.get('/', (req, resp) => {
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUWXYZ0123456789'
    const search = alphabets.split('')
    console.info('search', search)
    resp.status(200)
    resp.type('text/html')
    resp.render('index',
    {
        search
    })
})

/*app.get('/search',
    async (req, resp) => {
        try {
            //value of button
            const search = req.query['search']
            const author = req.query['author']

            console.info(`search term is: ${search}`)

            //construct the url
            let url = withQuery(BASE_URL, {
                [api-key]: API_KEY,
                title: search,
                author
            })

            let result = await fetch(url)
            let reviews = await result.json()
            const names = reviews.results
            .map(
                d => {
                    return {title: d.book_title, author: d.book_author, reviewer: d.byline, summary: d.summary}
                }
            )
            console.info('names: ', names, 'count: ', count)
            resp.status(200)
            resp.type('text/html')
            resp.render('result',
                {
                    search,
                    names, //key and value same name
                    count,
                    hasContent: count > 0
                }
            )
        }
        catch(e) {
            resp.status(500)
            resp.json(e)
            console.error('Error: ', e)
        }

    }
)
*/
//run function to start server
startApp(app, pool)