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
const SQL_FIND_BY_FIRSTCHAR = 'select title, book_id from book2018 where title like ? order by title asc limit ? offset ?'
const SQL_COUNT = 'select count(*) as q_count from book2018 where title like ?'
const SQL_FIND_BY_TITLE = 'select * from book2018 where book_id=?'

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

const mkQuery = (sqlStmt, pool) => {
    const f = async (params) => {
        const conn = await pool.getConnection()
        try {
            const results = await conn.query(sqlStmt, params)
            return results[0]
            }
        catch(e) {
            return Promise.reject(e)
        }
        finally {
            conn.release()
        }
    }
    return f
}

//Making queries
const getBooksList = mkQuery(SQL_FIND_BY_FIRSTCHAR, pool)
const getCount = mkQuery(SQL_COUNT, pool)
const getBook = mkQuery(SQL_FIND_BY_TITLE, pool)

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
    resp.status(200)
    resp.type('text/html')
    resp.render('index',
    {
        search
    })
})

//searching and displaying titles
app.get('/search', async(req, resp) => { 
    try {
        const limit = 10
        const search = req.query['search']
        const offset = parseInt(req.query['offset']) || 0
        
        let count = await getCount([ `${search}%` ])
        const queryCount = count[0].q_count
        const currentPage = offset/limit || 0
        const pages = Math.floor(queryCount/limit)
        const recs = await getBooksList([`${search}%`, limit, offset])

        if (recs.length <= 0) {
            //404!
            resp.status(404)
            resp.type('text/html')
            resp.send(`<h1>There are no results for <i>${search}</i>!</h1>`)
            return
        }

        resp.status(200)
        resp.type('text/html')
        resp.render('displayTitle', {
            titles: recs,
            search,
            page: currentPage,
            onePage: currentPage == 0 && currentPage == pages,
            noNextPage: currentPage == pages,
            noPrevPage: currentPage == 0,
            prevOffset: Math.max(0, offset - limit),
            nextOffset: offset + limit
        })
    }
    catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))
    }
})
app.get('/search/:bookId', async(req, resp) => { 
    try {
        const search = req.params['bookId']
        console.info('search', search)
        const recs = await getBook([`${search}`])
        const authors = recs[0].authors.split('|')
        const genres = recs[0].genres.split('|')
        
        if (recs.length <= 0) {
            //404!
            resp.status(404)
            resp.type('text/html')
            resp.send(`<h1>There are no results for ${search}!</h1>`)
            return
        }

        resp.status(200)
        resp.format(
            {
            'text/html': () => {
                resp.render('bookDetail', {
                    book: recs[0],
                    authors,
                    genres
                })
            },
            'application/json': () => { 
                resp.json({
                    bookId: recs[0].book_id,
                    title: recs[0].title,
                    authors: authors,
                    summary: recs[0].description,
                    pages: recs[0].pages,
                    rating: recs[0].rating,
                    ratingCount: recs[0].rating_count,
                    genre: genres
                })
            },
            'default': () => {
                resp.status(406).type('text/plain')
                resp.send(`Not supported: ${req.get("Accept")}`)
            }
        })
    }
    catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))
    }
})

app.get('/reviews', async(req, resp) => { 
    try {
        const bookTitle = req.query['bookTitle']
        //one of the author
        const author = req.query['author'].split(',').join(' and ')

        const url = withQuery(BASE_URL, {
            'api-key': API_KEY,
            title: bookTitle,
            author
        })
        console.info('url', url)
        const recs = await fetch(url)
        let data = await recs.json()

        if (recs.length <= 0) {
            resp.status(404)
            resp.type('text/html')
            resp.send(`Not found: ${bookTitle}`)
            return
        }
        const reviews = data.results
        .map(d => {
            return {title: d.book_title, author: d.book_author, reviewer: d.byline, date: d.publication_dt, summary: d.summary,
                    reviewUrl: d.url}
        })
        resp.status(200)
        resp.type('text/html')
        resp.render('bookReview',
        {
            reviews
        })
    }
    catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))
    }
})

//run function to start server
startApp(app, pool)