const puppeteer = require('puppeteer');

let browserWSEndpoint = null;


async function runTest() {
    if (!browserWSEndpoint) {
        const browser = await puppeteer.launch({
            headless: 'new',
            timeout: 100000
        });
        browserWSEndpoint = await browser.wsEndpoint();
    }
    const browser = await puppeteer.connect({browserWSEndpoint});   

    const page = await browser.newPage();
    const url = 'https://next.obudget.org/s?q=%D7%9B%D7%9C%D7%91%D7%AA&dd=budget&kind=all&fiscal-year=all';

    await page.goto(url, {
        waitUntil: 'networkidle2'
    });
    await new Promise(r => setTimeout(r, 500));

    let items = await page.evaluate(() => 
        [...document.querySelectorAll('search-result > .card')]
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
    console.log('items', items.length);
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