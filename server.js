const express = require('express');
const request = require('request');
const fs = require('fs');

const app = express();
const port = 6744;

app.set('view engine', 'pug');
app.use('/static', express.static('./public'));

// Render the main menu
app.get('/', async (req, res) => {
    const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
    const items = await Promise.all(menuData.items.map(async e => {
        const status = await new Promise(ok => {
            if (e.status) {
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
            } else {
                ok(null)
            }
        })
        return {
            ...e,
            status,
        }
    }))
    res.render('index', { items });
});

// Handle item click
app.get('/item/:index', async (req, res) => {
    const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
    const index = req.params.index;
    const selectedItem = menuData.items[index];
    const reqVerify = await new Promise(ok => {
        if (selectedItem.warning && selectedItem.warning.check && selectedItem.warning.match) {
            request(selectedItem.warning.check, {timeout: 3000}, (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    let statusMessage = body.toString();
                    ok(statusMessage.toLowerCase().includes(selectedItem.warning.match.toLowerCase()) === true)
                } else {
                    ok(false)
                }
            });
        } else if (selectedItem.warning && selectedItem.warning.always) {
            ok(true)
        } else {
            ok(false)
        }
    })
    const items = (selectedItem.children) ? await Promise.all(selectedItem.children.map(async e => {
        const status = await new Promise(ok => {
            if (e.status) {
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
                        ok("FAILURE")
                    }
                });
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
});

app.get('/verify/:parent/:index', async (req, res) => {
    const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
    const index = req.params.parent;
    const selectedItem = (index === '-1') ? menuData.items[req.params.index] : menuData.items[index];
    res.render(`verify`, { ...selectedItem, parentIndex: req.params.index, url: `${req.params.parent}/${req.params.index}` });
});

app.get('/item/:parent/:index', async (req, res) => {
    const menuData = JSON.parse(fs.readFileSync('./menu.json').toString());
    const index = req.params.parent;
    const selectedItem = (index === '-1') ? menuData.items[req.params.index].url : menuData.items[index].children[req.params.index].url;
    request(selectedItem, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const statusMessage = body.toString();
            res.redirect(`/?_${Date.now()}`);
        } else {
            res.render(`error`);
        }
    });
});

app.get('/closed', (req,res) => { res.render('closed')})
app.get('/open', (req,res) => { res.render('open')})
app.get('/start', (req,res) => { res.render('startup')})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
