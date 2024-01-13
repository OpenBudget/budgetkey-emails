let inlineCss = require('inline-css');
let watch = require('node-watch');
let fs = require('fs');
let path = require('path');
let nunjucks = require('nunjucks');
let puppeteer = require('puppeteer');
let crypto = require('crypto');

let AWS = require('aws-sdk');
let express = require('express');
let sgMail = require('@sendgrid/mail');

let browserInstance= null;

let termImgCache = {};
let headerImgCache = {};
let itemCountImgCache = {};
let imgCache = {};

async function getBrowser() {
    if (!browserInstance) {
        console.log('Launched browser')
        const browser = await puppeteer.launch({
            headless: 'new',
            timeout: 0,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        browser.on('disconnected', getBrowser);
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

function storeToFile(filename, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filename, data, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(filename);
            }
        });
    });
}

function storeImageToS3(filename, data) {
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

function storeImage(context, data) {
    let hash = crypto.createHash('md5').update(data).digest("hex");
    let filename = hash + '.png';
    if (context.debug) {
        return storeToFile('/tmp/' + filename, data);
    } else {
        return storeImageToS3(filename, data);
    }
}


const sendgridApiKey = process.env['SENDGRID_API_KEY'];
let sender = null;
if (sendgridApiKey) {
    sgMail.setApiKey(sendgridApiKey);
}
async function sendEmail(context) {
    console.log(' > sendEmail');
    if (!context.debug) {
        if (context.sections.length > 0) {
            console.log('  > got ' + context.sections.length + 'sections');
            var email = {
                from: 'אדם מ״מפתח התקציב״ <adam@obudget.org>',
                to: context.email,
                subject: 'עדכונים עבורך מ״מפתח התקציב״',
                html: context.rendered
            };
            return sgMail.send(email);
        } else {
            console.log('  > nothing to send...');
            return {result: {message: 'Nothing to send, skipping'}}
        }
    } else {
        return storeToFile('debug.html', context.rendered);
    }
}


async function renderTemplate(context) {
    console.log(' > renderTemplate');
    try {
        context.JSON = JSON
        context.rendered = nunjucks.renderString(context.template, context);
        return context;
    } catch(e) {
        console.log('Error in template :');
        console.log(e.message);
        throw(e);
    }
}


async function fetchItemImages(context, section) {
    console.log('  > fetchItemImages');
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(180000);
    await page.setViewport({width: 450, height: 3000, deviceScaleFactor: 1});
    let url = section.query_url;
    console.log('   > Fetching data for', url)

    await page.goto(url, {
        waitUntil: 'networkidle0'
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.addStyleTag({content: `
    em { background: inherit !important; }
    #web-messenger-container { display: none; }
`});
  
    console.log('   > Getting elements...');

    let items = await page.evaluate(() => 
        [...document.querySelectorAll('search-result > .card')]
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
    let itemCount = await page.evaluate(() => {
        const el = document.querySelector('.type-text-in-search-bar-right span');
        if (el) {
            const text = el.textContent || '0';
            return parseInt(text
                .replace('(','')
                .replace(')','')
                .replace(',','')
            );
        } else {
            return 0;
        }
    });
    console.log('   > Total results count is', itemCount); 
    console.log('   > Getting screenshots...');
    const images = await Promise.all(items
        .map(
            (item) => {
                return page.screenshot({
                    type: 'png', 
                    clip: item.clip
                }).then((image) => {
                    return storeImage(context, image);
                });
            }
        )
    );
    section.items = items.map((item, i) => {
        return Object.assign({img: images[i]}, item);
    });
    section.itemCount = itemCount;
    await page.close();
    console.log('   > Done with', items.length, 'items!');
    return section;
}


async function fetchTemplateImage(context, template_fn, data, key) {
    console.log('  > fetchTemplateImage', template_fn, key);
    let template = await readFile(template_fn);

    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080, deviceScaleFactor: 1});
    await page.setContent(nunjucks.renderString(template, data));
    await page.waitForSelector('.main');
    await new Promise(r => setTimeout(r, 1000));
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
    const url = await storeImage(context, image);
    data[key] = url;
    await page.close();
    console.log('   > fetchTemplateImage done');
}


async function prerenderItems(context) {
    console.log(' > prerenderItems');
    context.edit_img = imgCache['edit_img'];
    if (!context.edit_img) {
        await fetchTemplateImage(context, 'partials/edit.html', context, 'edit_img');
        imgCache.edit_img = context.edit_img;
    }
    context.arrow_left_img = imgCache['arrow_left_img'];
    if (!context.arrow_left_img) {
        await fetchTemplateImage(context, 'partials/arrow-left.html', context, 'arrow_left_img');
        imgCache.arrow_left_img = context.arrow_left_img;
    }
    for (let section of context.sections) {
        const sectionKey = section.header + ' ' + section.subheader;
        section.img = headerImgCache[sectionKey];
        if (!section.img) {
            await fetchTemplateImage(context, 'partials/header.html', section, 'img');
            headerImgCache[sectionKey] = section.img;
        }
        for (let term of section.terms) {
            term.img = termImgCache[term.term];
            if (!term.img) {
                await fetchTemplateImage(context, 'partials/term.html', term, 'img');
                termImgCache[term.term] = term.img;
            }
            if (!term.items) {
                await fetchItemImages(context, term);
            }
            term.itemCountImg = itemCountImgCache[term.itemCount];
            if (!term.itemCountImg) {
                await fetchTemplateImage(context, 'partials/item-count.html', term, 'itemCountImg');
                itemCountImgCache[term.itemCount] = term.itemCountImg;
            }
        }
    }
    context.footer = imgCache['footer'];
    if (!context.footer) {
        await fetchTemplateImage(context, 'partials/footer.html', context, 'footer');
        imgCache.footer = context.footer;
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
    for (let section of context.sections) {
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
    context.sections = sections;
    return context;
}

async function savedSearches(context) {
    try {
        return await
            readFile('templates/saved-searches.html')
                .then((template) => inlineCss(template, { url: 'https://next.obudget.org/'}))
                .then((template) => {
                    context.template = template;
                    return context;
                })
                .then((context) => prerenderItems(context))
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
        savedSearches(req.body)
            .then((send_result) => {
                res.send({result: send_result});
            })
            .catch((e) => {
                console.error('Error in handler', e);
                res.send({result: 'Error in handler: ' + e});
            });
    });

    let server = app.listen(app.get('port'), function() {
        console.log('Listening port ' + app.get('port'));
    });
    server.setTimeout(600000);
})
.catch((e) => {
    console.error(e);
    process.exit(1);
});
