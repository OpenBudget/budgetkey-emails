let inlineCss = require('inline-css');
let watch = require('node-watch');
let fs = require('fs');
let path = require('path');
let nunjucks = require('nunjucks');
let puppeteer = require('puppeteer');
let crypto = require('crypto');

let mailgun = require("mailgun-js");
let AWS = require('aws-sdk');
let express = require('express');


let browserWSEndpoint = null;

async function getBrowser() {
    if (!browserWSEndpoint) {
        console.log('Launched browser')
        const browser = await puppeteer.launch({
            headless: true,
            timeout: 100000,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        browserWSEndpoint = await browser.wsEndpoint();
    }
    return puppeteer.connect({browserWSEndpoint});
}

var s3 = new AWS.S3({
    endpoint: 'https://ams3.digitaloceanspaces.com',
    credentials: {
        accessKeyId: process.env['EMAILS_AWS_ACCESS_KEY_ID'],
        secretAccessKey: process.env['EMAILS_SECRET_ACCESS_KEY']
    }
});


function storeImageToS3(data) {
    let hash = crypto.createHash('md5').update(data).digest("hex");
    let filename = hash + '.png';
    let fullpath = 'https://ams3.digitaloceanspaces.com/budgetkey-emails/' + filename;
    var params = {
        Body: data,
        Bucket: "budgetkey-emails",
        Key: filename,
        ACL: 'public-read',
    };
    return new Promise((resolve, reject) => {
        s3.putObject(params, function(err, data) {
            if (err) reject(err);
            else     resolve(fullpath);
        });          
    });
}


var sender = mailgun({
    apiKey: process.env['MAILGUN_API_KEY'], 
    domain: 'obudget.org'
});
async function sendEmail(context) {
    if (context.data.sections.length > 0) {
        var email = {
            from: 'אדם מ״מפתח התקציב״ <adam@obudget.org>',
            to: context.data.email,
            subject: 'עדכונים עבורך מ״מפתח התקציב״',
            html: context.rendered
        };
        return new Promise((resolve) => {
            sender.messages().send(email, function (error, body) {            
                console.log('MAILGUN:', body);
                resolve(body);
            });            
        })    
    } else {
        return {result: {message: 'Nothing to send, skipping'}}
    }
}


async function renderTemplate(context) {
    try {
        context.rendered = nunjucks.renderString(context.template, context.data);
        return context;
    } catch(e) {
        console.log('Error in template ' + outFile + ':');
        console.log(e.message);
        throw(e);
    }
}


async function fetchItemImages(section) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    let url = section.query_url;
    console.log('Fetching data for', url)

    await page.goto(url, {
        waitUntil: 'networkidle0'
    });
    await page.waitFor(2000);
  
    let items = await page.evaluate(() => 
        [...document.querySelectorAll('.single-result')]
            .slice(0, 3)
            .map((item) => {
                return {
                    rect: item.getBoundingClientRect(), 
                    doc_id: item.getAttribute('data-doc-id')
                };
            })
            .map((item) => {
                return {
                    clip: {
                        x: item.rect.x, 
                        y: item.rect.y, 
                        width: item.rect.width, 
                        height: item.rect.height    
                    },
                    doc_id: item.doc_id
                };
            })
    );
    const images = await Promise.all(items
        .map(
            (item) => {
                return page.screenshot({
                    type: 'png', 
                    clip: item.clip
                }).then((image) => {
                    return storeImageToS3(image);
                });
            }
        )
    );
    section.items = items.map((item, i) => {
        return Object.assign({img: images[i]}, item);
    });
    return section;
}


async function fetchTemplateImage(template_fn, data, key) {
    let template = await readFile(template_fn);

    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(nunjucks.renderString(template, data));
    await page.waitFor('.main');
    await page.waitFor(1000);
    let rect = await page.evaluate(() => 
        [document.querySelector('.main').getBoundingClientRect()].map((rect) => {
            return {
                x: rect.x, 
                y: rect.y, 
                width: rect.width, 
                height: rect.height    
            };
        })
    );
    rect = rect[0];
    const image = await page.screenshot({type: 'png', clip: rect});
    const url = await storeImageToS3(image);
    data[key] = url;
}


async function prerenderItems(context) {
    for (let section of context.data.sections) {
        if (!section.img) {
            await fetchTemplateImage('partials/header.html', section, 'img');
        }
        for (let term of section.terms) {
            if (!term.img) {
                await fetchTemplateImage('partials/term.html', term, 'img');
            }
            if (!term.items) {
                await fetchItemImages(term);
            }    
        }
    }
    if (!data.footer) {
        await fetchTemplateImage('partials/footer.html', data, 'footer');
    }
    return context;
}


function readFile(filename) {
    return new Promise((resolve) => {
        fs.readFile(filename, { encoding: 'utf-8'}, (err, data) => {
            if (err) {
                throw err; 
            }
            resolve(data);
        });
    });
}

async function filterSections(context) {
    let sections = [];
    for (let section of context.data.sections) {
        let terms = [];
        for (let term of section.terms) {
            if (term.items) {
                terms.push(term);
            }
        }
        if (terms) {
            section.terms = terms;
            sections.push(section);
        }
    }
    context.data.sections = sections;
    return context;
}

async function savedSearches(data) {
    try {
        return await
            readFile('templates/saved-searches.html')
                .then((template) => inlineCss(template, { url: 'https://next.obudget.org/'}))
                .then((template) => prerenderItems({template, data}))
                .then((context) => renderTemplate(context))
                .then((context) => filterSections(context))
                .then((context) => sendEmail(context));
    } catch (e) {
        return {result: {message: 'Error while sending: ' + e}}
    }
}

/**** MAIN ****/
getBrowser()
.then(() => {
    const app = express();
    app.use(express.json());
    app.set('port', process.env.PORT || 8000);

    app.post('/', function(req, res) {
        savedSearches(req.body)
            .then((send_result) => {
                res.send({result: send_result});
            });
    });

    app.listen(app.get('port'), function() {
        console.log('Listening port ' + app.get('port'));
    });
});
