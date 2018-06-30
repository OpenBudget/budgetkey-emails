const puppeteer = require('puppeteer');

let browserWSEndpoint = null;


async function runTest() {
    if (!browserWSEndpoint) {
        const browser = await puppeteer.launch({
            headless: true,
            timeout: 100000
        });
        browserWSEndpoint = await browser.wsEndpoint();
    }
    const browser = await puppeteer.connect({browserWSEndpoint});   

    const page = await browser.newPage();
    const url = 'https://next.obudget.org/s/?q=חלמיש';

    await page.goto(url, {
        waitUntil: 'networkidle2'
    });
    await page.waitFor(500);

    let items = await page.evaluate(() => 
        [...document.querySelectorAll('.single-result')]
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
        .map((item) => page.screenshot({clip: item.clip, encoding: 'base64'}))
    );
    items = items.map((item, i) => {
        return Object.assign({img: images[i]}, item);
    });
    console.log(items[0]);
    browser.close();
}

runTest();