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


let browserInstance= null;

async function getBrowser() {
    if (!browserInstance) {
        console.log('Launched browser')
        const browser = await puppeteer.launch({
            headless: true,
            timeout: 0,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const browserWSEndpoint = await browser.wsEndpoint();
        return puppeteer.connect({browserWSEndpoint})
            .then((connection) => {
                browserInstance = connection;
                return browserInstance;
            });
    } else {
        return browserInstance;
    }
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
    console.log(' > sendEmail');
    if (context.data.sections.length > 0) {
        console.log('  > got ' + context.data.sections.length + 'sections');
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
        console.log('  > nothing to send...');
        return {result: {message: 'Nothing to send, skipping'}}
    }
}


async function renderTemplate(context) {
    console.log(' > renderTemplate');
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
    console.log('  > fetchItemImages');
    const browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(180000);
    let url = section.query_url;
    console.log('   > Fetching data for', url)

    await page.goto(url, {
        waitUntil: 'networkidle0'
    });
    await page.waitFor(2000);
  
    console.log('   > Getting elements...');

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
    console.log('   > Got', items.length, 'items!');
    console.log('   > Getting screenshots...');
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
    console.log('   > Done with', items.length, 'items!');
    return section;
}


async function fetchTemplateImage(template_fn, data, key) {
    console.log('  > fetchTemplateImage', template_fn, key);
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
    console.log('   > fetchTemplateImage storing to S3');
    const url = await storeImageToS3(image);
    data[key] = url;
    console.log('   > fetchTemplateImage done');
}


async function prerenderItems(context) {
    console.log(' > prerenderItems');
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
    if (!context.data.footer) {
        await fetchTemplateImage('partials/footer.html', context.data, 'footer');
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
    console.log(' > filterSections');
    let sections = [];
    for (let section of context.data.sections) {
        let terms = [];
        for (let term of section.terms) {
            if (term.items && term.items.length > 0) {
                terms.push(term);
            }
        }
        if (terms.length > 0) {
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
                .then((context) => filterSections(context))
                .then((context) => renderTemplate(context))
                .then((context) => sendEmail(context));
    } catch (e) {
        console.error('Error while sending', e);
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
        console.log('* Processing request', req.body);
        req.setTimeout(300000);
        savedSearches(req.body)
            .then((send_result) => {
                res.send({result: send_result});
            })
            .catch((e) => {
                console.error('Error in handler', e);
                res.send({result: 'Error in handler: ' + e});
            });
    });

    app.listen(app.get('port'), function() {
        console.log('Listening port ' + app.get('port'));
    });
})
.catch((e) => {
    console.error(e);
    process.exit(1);
});
