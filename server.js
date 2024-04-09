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

app.get('/', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const items = await Promise.all((Object.keys(deviceList.devices))
            .sort((a,b) => {
                return deviceList.devices[a].position - deviceList.devices[b].position
            })
            .map(async k => {
                const e = deviceList.devices[k];
                const status = await new Promise(ok => {
                    if (e.status) {
                        try {
                            request(e.status, {
                                timeout: 10000
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
                    key: k,
                    status: status,
                }
            }))
        res.render('device_list', {
            items,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e.message,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
    clearTimeout(refreshMarkers);
    scanStatusMarkers();
});
app.get('/device/:device', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
        if (menuData && menuData.items) {
            const items = menuData.items.map((e,i) => {
                const status = (statusMarkers[deviceID]) ? statusMarkers[deviceID][i] : undefined
                const isOn = (() => {
                    if (status && e.toggle) {
                        const k =  e.toggle
                            .map((f,fi) => {
                                return { key: fi, ...f }
                            })
                            .filter(f => f.match && f.match.filter(j => status[0].toLowerCase().includes(((j.string) ? j.string : j).toLowerCase())).length !== 0)
                        return (k && k.length > 0) ? k[0] : undefined
                    }
                    return undefined;
                })()
                console.log(isOn)
                return {
                    ...e,
                    isOn,
                    status,
                }
            })
            res.render('index', {
                key: deviceID,
                items,
                captures: !!(config.captures),
                inline: (req.headers['user-agent'].includes("OBS"))
            });
        } else {
            res.render(`error`, {
                message: "Invalid Device ID",
                inline: (req.headers['user-agent'].includes("OBS"))
            });
        }
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e.message,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});
app.get('/device/:device/menu/:index', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
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
        const items = (selectedItem.children) ? await Promise.all(selectedItem.children.map(async (e,i) => {
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
            const isOn = (() => {
                if (status && e.toggle) {
                    const k =  e.toggle
                        .map((f,fi) => {
                            return { key: fi, ...f }
                        })
                        .filter(f => f.match && f.match.filter(j => status[0].toLowerCase().includes(((j.string) ? j.string : j).toLowerCase())).length !== 0)
                    return (k && k.length > 0) ? k[0] : undefined
                }
                return undefined;
            })()
            return {
                ...e,
                isOn,
                status,
            }
        })) : undefined
        res.render('index', {
            key: deviceID,
            verify: reqVerify,
            ...selectedItem,
            items,
            parentIndex: req.params.index,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e.message,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});
app.get('/device/:device/send/:parent/:index', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index].url : menuData.items[index].children[req.params.index].url;
        try {
            request(selectedItem, async (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    const statusMessage = body.toString();
                    await scanStatusMarkers(deviceID);
                    res.redirect(`/device/${deviceID}/open/?_${Date.now()}`);
                } else {
                    res.render(`error`, {
                        message: (error)? error.message : (body) ? body.toString() : undefined,
                        inline: (req.headers['user-agent'].includes("OBS"))
                    });
                }
            });
        } catch (e) {
            res.render(`error`, {
                message: e.message,
                inline: (req.headers['user-agent'].includes("OBS"))
            });
        }
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});
app.get('/device/:device/slider_value/:parent/:index/:value', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index].slider : menuData.items[index].children[req.params.index].slider;
        try {
            request(selectedItem + req.params.value, async (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    const statusMessage = body.toString();
                    await scanStatusMarkers(deviceID);
                    res.redirect(`/device/${deviceID}/open/?_${Date.now()}`);
                } else {
                    res.render(`error`, {
                        message: (error)? error.message : (body) ? body.toString() : undefined,
                        inline: (req.headers['user-agent'].includes("OBS"))
                    });
                }
            });
        } catch (e) {
            res.render(`error`, {
                message: e.message,
                inline: (req.headers['user-agent'].includes("OBS"))
            });
        }
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});
app.get('/device/:device/toggle_item/:parent/:index/:value', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index].toggle : menuData.items[index].children[req.params.index].toggle;
        try {
            request(selectedItem[parseInt(req.params.value)], async (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    const statusMessage = body.toString();
                    await scanStatusMarkers(deviceID);
                    res.redirect(`/device/${deviceID}/open/?_${Date.now()}`);
                } else {
                    res.render(`error`, {
                        message: (error)? error.message : (body) ? body.toString() : undefined,
                        inline: (req.headers['user-agent'].includes("OBS"))
                    });
                }
            });
        } catch (e) {
            res.render(`error`, {
                message: e.message,
                inline: (req.headers['user-agent'].includes("OBS"))
            });
        }
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});
app.get('/device/:device/verify/:parent/:index', async (req, res) => {
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        const deviceID = req.params.device;
        const menuData = deviceList.devices[deviceID];
        const index = req.params.parent;
        const selectedItem = (index === '-1') ? menuData.items[req.params.index] : menuData.items[index];
        res.render(`verify`, {
            key: deviceID,
            ...selectedItem,
            parentIndex: req.params.index,
            url: `${req.params.parent}/${req.params.index}`,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    } catch (e) {
        console.error(e);
        res.render(`error`, {
            message: e.message,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});

app.get('/device/:device/captures', async (req, res) => {
    try {
        const files = (fs.readdirSync(resolve(config.captures))).map(e => {
            return {
                date: fs.statSync(join(resolve(config.captures), e)).mtimeMs,
                filename: e
            }
        }).filter(e => e.filename.endsWith('png') && (!!(config.all_captures) || ((new Date()).getTime() - 604800000 <= e.date)))
            .sort((a, b) => a.date - b.date)
            .reverse()
            .slice(0,100);
        res.render('screenshots', {
            items: files,
            inline: (req.headers['user-agent'].includes("OBS"))
        })
    } catch (e) {
        res.render(`error`, {
            message: e.message,
            inline: (req.headers['user-agent'].includes("OBS"))
        });
    }
});

app.get('/device/:device/closed', (req,res) => { res.render('closed', { key: req.params.device })})
app.get('/device/:device/open', (req,res) => { res.render('open', { key: req.params.device })})
app.get('/device/:device/start', (req,res) => {
    scanStatusMarkers(req.params.device);
    res.render('startup', { key: req.params.device })
})

app.get('/closed', (req,res) => { res.render('closed')})
app.get('/open', (req,res) => { res.render('open')})
app.get('/start', (req,res) => { res.render('startup')})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    scanStatusMarkers();
});

let statusMarkers = {};
let refreshMarkers = null;
async function scanStatusMarkers(device) {
    clearTimeout(refreshMarkers);
    try {
        const deviceList = JSON.parse(fs.readFileSync('./menu.json').toString());
        await Promise.all((Object.keys(deviceList.devices))
            .filter(k => !device || (device === k))
            .map(async k => {
                const menuData = deviceList.devices[k];
                let statues = [];
                if (menuData && menuData.items) {
                    await Promise.all(menuData.items.map(async (e,i) => {
                        statues[i] = await new Promise(ok => {
                            if (e.pre_status) {
                                request(e.pre_status.url, {
                                    timeout: 10000
                                }, (error, response, body) => {
                                    if (!error && response.statusCode === 200) {
                                        let statusMessage = body.toString();
                                        if (statusMessage.includes(e.pre_status.match)) {
                                            request(e.status, {
                                                timeout: 10000
                                            }, (error, response, body) => {
                                                if (!error && response.statusCode === 200) {
                                                    let statusMessage = body.toString();
                                                    let color = '';
                                                    if (e.replace) {
                                                        const replacement = e.replace.filter(f => body.toLowerCase().includes(f[0].toLowerCase()))
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
                                            let color = '';
                                            if (e.pre_status.replace) {
                                                const replacement = e.pre_status.replace.filter(f => body.toLowerCase().includes(f[0].toLowerCase()))
                                                if (replacement.length > 0) {
                                                    const _re = replacement.pop();
                                                    statusMessage = _re[1];
                                                    color = _re[2];
                                                }
                                            }
                                            ok([statusMessage, color])
                                        }
                                    } else {
                                        ok(["FAILURE", 'red'])
                                    }
                                });
                            } else if (e.status) {
                                try {
                                    request(e.status, {
                                        timeout: 10000
                                    }, (error, response, body) => {
                                        if (!error && response.statusCode === 200) {
                                            let statusMessage = body.toString();
                                            let color = '';
                                            if (e.replace) {
                                                const replacement = e.replace.filter(f => body.toLowerCase().includes(f[0].toLowerCase()))
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
                    }))
                }
                statusMarkers[k] = statues
                return true
            }))
    } catch (e) {
        console.error(e);
    }
    refreshMarkers = setTimeout(() => {
        scanStatusMarkers();
    }, 60000)
}
