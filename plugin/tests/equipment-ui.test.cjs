const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

test('equipment menu trades with the selected actor and returns to the original editor', async () => {
    const browser = await chromium.launch();
    try {
        for (const [width,height] of [[360,740],[844,390]]) {
            const page = await browser.newPage({viewport:{width,height}});
            const errors=[];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(pathToFileURL(path.join(__dirname,'../demo/index.html')).href+'?count=80');
            await page.locator('.rt-launch').click();
            await page.locator('[data-action="tool-equipment"]').click();
            await page.locator('#rt-gear-actor').selectOption('2');
            await page.locator('#rt-gear-slot').selectOption('0');
            const bow=page.locator('#rt-gear-list li').filter({hasText:'Arc du voyageur'});
            await bow.locator('[data-action="gear-create"]').click();
            const inventory=()=>page.evaluate(()=>[$gameActors.actor(2).equips()[0]?.id || 0,$gameParty.numItems($dataWeapons[2])]);
            assert.deepEqual(await inventory(),[2,0]);
            assert.equal(await page.locator('#rt-gear-current').innerText(),'Arc du voyageur');
            await bow.locator('[data-action="gear-give"]').click();
            await bow.locator('[data-action="gear-take"]').click();
            assert.deepEqual(await inventory(),[2,0]);
            await page.locator('[data-action="gear-remove"]').click();
            assert.deepEqual(await inventory(),[0,1]);
            await page.locator('#rt-gear-owned').check();
            await page.locator('#rt-gear-query').fill('#2');
            await page.waitForFunction(()=>document.querySelectorAll('#rt-gear-list li').length===1);
            await bow.locator('[data-action="gear-wear"]').click();
            assert.deepEqual(await inventory(),[2,0]);
            await page.locator('[data-action="modal-dismiss"]').click();
            await page.locator('[data-action="tool-editors"]:visible').click();
            await page.locator('#rt-category').selectOption('armors');
            await page.locator('.rt-row [data-action="select"]').first().click();
            await page.locator('[data-action="open-gear"]').click();
            assert.equal(await page.locator('#rt-gear-slot').inputValue(),'1');
            await page.locator('[data-action="modal-dismiss"]').click();
            assert(await page.locator('[data-action="open-gear"]').isVisible());
            assert(await page.evaluate(()=>RPGMToolkit.isOpen()));
            assert.deepEqual(errors,[]);
            await page.close();
        }
    } finally {
        await browser.close();
    }
});
