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

/**** S3 Handling ****/
// var s3 = new AWS.S3({
//     endpoint: 'https://ams3.digitaloceanspaces.com',
//     credentials: {
//         accessKeyId: 'LDG2IRCOBQI7HKQZDAZI',
//         secretAccessKey: '0lRfoRzjFS0UFhFWpv3ECx0TPFnw0dZIO0GsZ1ehh8Q'
//     }
// });
// function storeImageToS3(data) {
//     let hash = crypto.createHash('md5').update(data).digest("hex");
//     let filename = hash + '.png';
//     let fullpath = 'https://ams3.digitaloceanspaces.com/budgetkey-emails/' + filename;
//     var params = {
//         Body: data,
//         Bucket: "budgetkey-emails",
//         Key: filename,
//         ACL: 'public-read',
//     };
//     return new Promise((resolve, reject) => {
//         s3.putObject(params, function(err, data) {
//             if (err) reject(err);
//             else     resolve(fullpath);
//         });          
//     });
// }
 

/**** Browser aided rendering ****/

// let browserWSEndpoint = null;

// async function getBrowser() {
//     if (!browserWSEndpoint) {
//         console.log('Launched browser')
//         const browser = await puppeteer.launch({
//             headless: true,
//             timeout: 100000
//         });
//         browserWSEndpoint = await browser.wsEndpoint();
//     }
//     return puppeteer.connect({browserWSEndpoint});
// }

// async function fetchTemplateImage(template_fn, data, key) {
//     let template = fs.readFileSync(template_fn, { encoding: 'utf-8'});

//     const browser = await getBrowser();
//     const page = await browser.newPage();
//     await page.setContent(nunjucks.renderString(template, data));
//     await page.waitFor('.main');
//     await page.waitFor(1000);
//     let rect = await page.evaluate(() => 
//         [document.querySelector('.main').getBoundingClientRect()].map((rect) => {
//             return {
//                 x: rect.x, 
//                 y: rect.y, 
//                 width: rect.width, 
//                 height: rect.height    
//             };
//         })
//     );
//     rect = rect[0];
//     const image = await page.screenshot({type: 'png', clip: rect});
//     const url = await storeImageToS3(image);
//     data[key] = url;
// }

// async function fetchItemImages(section) {
//     const browser = await getBrowser();
//     const page = await browser.newPage();
//     let url = section.query_url;
//     console.log('Fetching data for', url)

//     await page.goto(url, {
//         waitUntil: 'networkidle0'
//     });
//     await page.waitFor(2000);
  
//     let items = await page.evaluate(() => 
//         [...document.querySelectorAll('.single-result')]
//             .slice(0, 3)
//             .map((item) => {
//                 return {
//                     rect: item.getBoundingClientRect(), 
//                     doc_id: item.getAttribute('data-doc-id')
//                 };
//             })
//             .map((item) => {
//                 return {
//                     clip: {
//                         x: item.rect.x, 
//                         y: item.rect.y, 
//                         width: item.rect.width, 
//                         height: item.rect.height    
//                     },
//                     doc_id: item.doc_id
//                 };
//             })
//     );
//     const images = await Promise.all(items
//         .map(
//             (item) => {
//                 return page.screenshot({
//                     type: 'png', 
//                     clip: item.clip
//                 }).then((image) => {
//                     return storeImageToS3(image);
//                 });
//             }
//         )
//     );
//     section.items = items.map((item, i) => {
//         return Object.assign({img: images[i]}, item);
//     });
//     return section;
// }


// function renderTemplate(template, data, outFile) {
//     try {
//         let out = nunjucks.renderString(template, data);
//         fs.writeFileSync(outFile, out, {encoding: 'utf-8'});
//         console.log('>> Written to ' + outFile);
//         var data = {
//             from: 'אדם מ״מפתח התקציב״ <adam@obudget.org>',
//             to: 'adam.kariv@gmail.com',
//             subject: 'עדכונים עבורך מ״מפתח התקציב״',
//             html: out
//         };
//         mailgun.messages().send(data, function (error, body) {
//             console.log('MAILGUN:', body);
//         });
          
//     } catch(e) {
//         console.log('Error in template ' + outFile + ':');
//         console.log(e.message);
//     }
// }

// function processData(filename, template, template_name) {
//     fs.readFile(filename, { encoding: 'utf-8'}, (err, data) => {
//         if (err) {
//             throw err; 
//         }
//         data = JSON.parse(data);

//         prerenderItems(data)
//             .then((data) => {
//                 let outFile = 'out/' + template_name + '.' + path.basename(filename, '.json') + '.html';        
//                 renderTemplate(template, data, outFile);        
//             });
//     });
// }

/**** PIPELINE ****/

// function processAllDatas(template, template_name) {
//     fs.readdir('data', (err, files) => {
//         files.forEach(filename => {
//           processData('data/' + filename, template, template_name);
//         }); 
//     });
// }

// function processHtml(filename) {
//     fs.readFile(filename, { encoding: 'utf-8'}, (err, data) => {
//         if (err) {
//             throw err; 
//         }
//         inlineCss(data, { url: 'https://next.obudget.org/'})
//             .then((html) => {
//                 processAllDatas(html, 
//                                 path.basename(filename, '.html'));
//             });
//     });      
// }

// function processAllTemplates() {
//     fs.readdir('templates', (err, files) => {
//         files.forEach(filename => {
//             filename = 'templates/' + filename;
//             processHtml(filename);
//         }); 
//     })      
// }

// function processData(filename, template, template_name) {
//     fs.readFile(filename, { encoding: 'utf-8'}, (err, data) => {
//         if (err) {
//             throw err; 
//         }
//         data = JSON.parse(data);

//         prerenderItems(data)
//             .then((data) => {
//                 let outFile = 'out/' + template_name + '.' + path.basename(filename, '.json') + '.html';        
//                 renderTemplate(template, data, outFile);        
//             });
//     });
// }

// async function prerenderItems(data) {
//     for (let section of data.sections) {
//         if (!section.img) {
//             await fetchTemplateImage('partials/header.html', section, 'img');
//         }
//         for (let term of section.terms) {
//             if (!term.img) {
//                 await fetchTemplateImage('partials/term.html', term, 'img');
//             }
//             if (!term.items) {
//                 await fetchItemImages(term);
//             }    
//         }
//     }
//     if (!data.footer) {
//         await fetchTemplateImage('partials/footer.html', data, 'footer');
//     }
//     return data;
// }

// function processData(data, template) {
//     prerenderItems(data)
//         .then((data) => {
//             let outFile = 'out/' + template_name + '.' + path.basename(filename, '.json') + '.html';        
//             renderTemplate(template, data, outFile);        
//         });
// }
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
    var email = {
        from: 'אדם מ״מפתח התקציב״ <adam@obudget.org>',
        to: 'adam.kariv@gmail.com',
        subject: 'עדכונים עבורך מ״מפתח התקציב״',
        html: context.rendered
    };
    return new Promise((resolve) => {
        sender.messages().send(email, function (error, body) {            
            console.log('MAILGUN:', body);
            resolve(body);
        });            
    })
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


async function savedSearches(data) {
    let ret = await
        readFile('templates/saved-searches.html')
            .then((template) => inlineCss(template, { url: 'https://next.obudget.org/'}))
            .then((template) => prerenderItems({template, data}))
            .then((context) => renderTemplate(context))
            .then((context) => sendEmail(context));
    return ret;
}

/**** MAIN ****/

let data = {
    "sections": [
        {
            "header": "מכרזים שנסגרים השבוע",
            "subheader": "הזדמנות אחרונה להגיש הצעות ל-5 מכרזים",
            "terms": [
                {
                    "term": "חלמיש",
                    "query_url": "https://next.obudget.org/s/?q=%D7%93%D7%99%D7%95%D7%A8%20%D7%A6%D7%99%D7%91%D7%95%D7%A8%D7%99&range=all&dd=all"
                },
                {
                    "term": "עגבניות שרי",
                    "query_url": "https://next.obudget.org/s/?q=%D7%9E%D7%97%D7%A9%D7%91%D7%99%D7%9D&range=all&dd=tenders,contract-spending"
                }
            ]
        },
        {
            "header": "מכרזים חדשים",
            "subheader": "סכום כולל של 23,234,000 ₪ ב-3 מכרזים חדשים שעשויים לעניין אותך",
            "terms": [
                {
                    "term": "עגבניות שרי",
                    "query_url": "https://next.obudget.org/s/?q=%D7%9E%D7%97%D7%A9%D7%91%D7%99%D7%9D&range=all&dd=tenders,contract-spending"
                },
                {
                    "term": "חלמיש",
                    "query_url": "https://next.obudget.org/s/?q=%D7%93%D7%99%D7%95%D7%A8%20%D7%A6%D7%99%D7%91%D7%95%D7%A8%D7%99&range=all&dd=all"
                }
            ]
        }
    ]
};


getBrowser()
.then(() => {
    const app = express();
    app.use(express.json());
    app.set('port', process.env.PORT || 8000);

    app.post('/', function(req, res) {
        console.log(req.body);      // your JSON
        savedSearches(req.body)
            .then((send_result) => {
                res.send({result: send_result});
            });
    });

    app.listen(app.get('port'), function() {
        console.log('Listening port ' + app.get('port'));
    });
      
    // processAllTemplates();
});
