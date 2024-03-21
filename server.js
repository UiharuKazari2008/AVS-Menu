const express = require('express');
const request = require('request');
const fs = require('fs');
const config = require('./config.json');
const {resolve, join} = require("path");

const app = express();
const port = 6744;

app.set('view engine', 'pug');
app.use('/static', express.static('./public'));
if (config.captures)
    app.use('/captures/images', express.static(resolve(config.captures)));

// Render the main menu
app.get('/', async (req, res) => {
    try {
        const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
        const items = await Promise.all(menuData.items.map(async e => {
            const status = await new Promise(ok => {
                if (e.status) {
                    try {
                        request(e.status, {
                            timeout: 5000
                        }, (error, response, body) => {
                            if (!error && response.statusCode === 200) {
                                let statusMessage = body.toString();
                                let color = '';
                                if (e.replace) {
                                    const replacement = e.replace.filter(f => body.includes(f[0]))
                                    if (replacement.length > 0) {
                                        const _re = replacement.pop();
                                        statusMessage = _re[1];
                                        color = _re[2];
                                    }
                                }
                                ok([statusMessage, color])
                            } else {
                                ok(["FAILURE", 'red'])
                            }
                        });
                    } catch (e) {
                        ok(["ERROR", 'red'])
                    }
                } else {
                    ok(null)
                }
            })
            return {
                ...e,
                status,
            }
        }))
        res.render('index', {items, captures: !!(config.captures)});
    } catch (e) {
        console.error(e);
        res.render(`error`, { message: e.message });;
    }
});
// Handle item click
app.get('/item/:index', async (req, res) => {
    try {
        const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
        const index = req.params.index;
        const selectedItem = menuData.items[index];
        const reqVerify = await new Promise(ok => {
            if (selectedItem.warning && selectedItem.warning.check && selectedItem.warning.match) {
                try {
                    request(selectedItem.warning.check, {timeout: 3000}, (error, response, body) => {
                        if (!error && response.statusCode === 200) {
                            let statusMessage = body.toString();
                            ok(statusMessage.toLowerCase().includes(selectedItem.warning.match.toLowerCase()) === true)
                        } else {
                            ok(false)
                        }
                    });
                } catch (e) {
                    ok(false)
                }
            } else if (selectedItem.warning && selectedItem.warning.always) {
                ok(true)
            } else {
                ok(false)
            }
        })
        const items = (selectedItem.children) ? await Promise.all(selectedItem.children.map(async e => {
            const status = await new Promise(ok => {
                if (e.status) {
                    try {
                        request(e.status,  {timeout: 1200}, (error, response, body) => {
                            if (!error && response.statusCode === 200) {
                                let statusMessage = body.toString();
                                let color = '';
                                if (e.replace) {
                                    const replacement = e.replace.filter(f => body.includes(f[0]))
                                    if (replacement.length > 0) {
                                        const _re = replacement.pop();
                                        statusMessage = _re[1];
                                        color = _re[2];
                                    }
                                }
                                ok([statusMessage, color])
                            } else {
                                ok(["ERROR", 'red'])
                            }
                        });
                    } catch (e) {
                        ok(["ERROR", 'red'])
                    }
                } else {
                    ok(null)
                }
            })
            return {
                ...e,
                status,
            }
        })) : undefined
        res.render('index', { verify: reqVerify, ...selectedItem, items, parentIndex: req.params.index });
    } catch (e) {
        console.error(e);
        res.render(`error`, { message: e.message });;
    }
});
// Handle warning before action
app.get('/verify/:parent/:index', async (req, res) => {
    try {
        const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index] : menuData.items[index];
        res.render(`verify`, {
            ...selectedItem,
            parentIndex: req.params.index,
            url: `${req.params.parent}/${req.params.index}`
        });
    } catch (e) {
        console.error(e);
        res.render(`error`, { message: e.message });;
    }
});
// Send HTTP call
app.get('/item/:parent/:index', async (req, res) => {
    try {
        const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index].url : menuData.items[index].children[req.params.index].url;
        try {
            request(selectedItem, (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    const statusMessage = body.toString();
                    res.redirect(`/?_${Date.now()}`);
                } else {
                    res.render(`error`, { message: (error)? error.message : (body) ? body.toString() : undefined });
                }
            });
        } catch (e) {
            res.render(`error`, { message: e.message });;
        }
    } catch (e) {
        console.error(e);
        res.render(`error`, { message: e.message });
    }
});

app.get('/captures', async (req, res) => {
    try {
        const files = (fs.readdirSync(resolve(config.captures))).map(e => {
            return {
                date: fs.statSync(join(resolve(config.captures), e)).mtimeMs,
                filename: e
            }
        }).filter(e => e.filename.endsWith('png') && (!!(config.all_captures) || ((new Date()).getTime() - 604800000 <= e.date)))
            .reverse()
            .sort((a, b) => a.date - b.date)
            .slice(0,100);
        res.render('screenshots', {
            items: files
        })
    } catch (e) {
        res.render(`error`, { message: e.message });
    }
});

app.get('/closed', (req,res) => { res.render('closed')})
app.get('/open', (req,res) => { res.render('open')})
app.get('/start', (req,res) => { res.render('startup')})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
