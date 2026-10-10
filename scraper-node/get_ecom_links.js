const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const page = await ctx.newPage();
    
    console.log('Fetching SBL Global products from Shopify XML Sitemap...');
    let sblLinks = [];
    try {
        await page.goto('https://sblglobal.in/sitemap_products_1.xml', { waitUntil: 'domcontentloaded' });
        const xml = await page.content();
        const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        // Shopify product URLs typically include '/products/'
        sblLinks = matches.filter(url => url.includes('/products/'));
    } catch(e) { console.error('SBL Error:', e.message.split('\\n')[0]); }

    console.log('Fetching Dr Reckeweg products from Sitemap...');
    let reckLinks = [];
    try {
        await page.goto('https://www.reckeweg-india.com/sitemap.xml', { waitUntil: 'domcontentloaded' });
        const xml = await page.content();
        const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        reckLinks = matches.filter(url => url.includes('/product-details/'));
    } catch(e) { console.error('Reckeweg Error:', e.message.split('\\n')[0]); }

    console.log('Fetching Wheezal products from Sitemap...');
    let wheezalLinks = [];
    try {
        await page.goto('https://wheezal.com/sitemap.xml', { waitUntil: 'domcontentloaded' });
        const xml = await page.content();
        const sitemaps = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        for (const sm of sitemaps) {
            if (sm.includes('product')) {
                await page.goto(sm, { waitUntil: 'domcontentloaded' });
                const pXml = await page.content();
                const links = [...pXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
                wheezalLinks.push(...links);
            }
        }
    } catch(e) { console.error('Wheezal Error:', e.message.split('\\n')[0]); }

    console.log(`Discovered: ${sblLinks.length} SBL, ${reckLinks.length} Reckeweg, ${wheezalLinks.length} Wheezal`);
    
    fs.writeFileSync(path.join(__dirname, 'ecommerce_queue.json'), JSON.stringify({
        'sbl_single': sblLinks,
        'reckeweg_dilutions': reckLinks,
        'wheezal_dilutions': wheezalLinks
    }, null, 2));
    
    console.log('Saved to ecommerce_queue.json! Ready for swarm injection.');
    await browser.close();
}

main();
