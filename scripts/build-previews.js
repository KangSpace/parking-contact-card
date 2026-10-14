#!/usr/bin/env node
/**
 * 生成产品介绍与 README 用的预览图，输出到 assets/preview/
 *   card-<样式>.svg  各样式单张卡片（页面自带的“下载 SVG”导出，矢量、体积小）
 *   card-blank.svg   空白牌（蓝牌）
 *   sheet-a4.svg     A4 整张排版（蓝牌中号、共用裁切线）
 *   maker-desktop.webp / maker-mobile.webp  制作页截图
 *   dial.webp        扫码后打开的拨号页截图
 *
 * 用法：npm install && npx playwright install chromium && npm run previews
 *   已安装 Chrome 时可跳过下载浏览器：PCC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run previews
 * 卡片与截图都按页面默认设置生成；修改样式或界面后重新运行即可。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'preview');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const DIAL = 'file://' + path.join(ROOT, 'dial.html');
/** 截图转 WebP 的质量（0–1） */
const WEBP_Q = 0.82;

/** 浏览器里把 PNG 截图转成 WebP，返回字节 */
async function toWebp(page, png) {
  const b64 = await page.evaluate(async ([src, q]) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, ['data:image/png;base64,' + png.toString('base64'), WEBP_Q]);
  return Buffer.from(b64, 'base64');
}

/** 打开制作页并恢复默认设置 */
async function openMaker(page) {
  await page.goto(PAGE + '#make');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#grid .card'));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
}

/** 点“下载图片”，保存到 assets/preview/<name> */
async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-download')]);
  await dl.saveAs(path.join(OUT, name));
}

/**
 * 1. 各样式单张卡片 SVG、空白牌、A4 整张
 * 2. 制作页桌面 / 手机截图
 * 3. 拨号页截图
 */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PCC_CHROME ? { executablePath: process.env.PCC_CHROME } : {});
  const made = [];
  try {
    // 1. 卡片 SVG
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await openMaker(page);
    await page.selectOption('#dlfmt', 'svg');
    await page.selectOption('#dlsize', 'card');
    const designs = await page.evaluate(() => window.CARD_DESIGNS.map(d => d.id));
    for (const id of designs) {
      await page.click('#design-' + id);
      await page.waitForTimeout(80);
      await download(page, 'card-' + id + '.svg'); made.push('card-' + id + '.svg');
    }
    await page.click('#design-blue');
    await page.click('#tab-blank');
    await page.waitForTimeout(80);
    await download(page, 'card-blank.svg'); made.push('card-blank.svg');
    await page.click('#tab-phone');
    await page.selectOption('#dlsize', 'sheet');
    await page.waitForTimeout(80);
    await download(page, 'sheet-a4.svg'); made.push('sheet-a4.svg');
    await ctx.close();

    // 2. 制作页截图：桌面（设置面板 + A4 预览）、手机（打印预览）
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await openMaker(desk);
    fs.writeFileSync(path.join(OUT, 'maker-desktop.webp'), await toWebp(desk, await desk.screenshot()));
    made.push('maker-desktop.webp');
    await desk.close();
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await openMaker(mob);
    await mob.tap('#btn-preview');
    await mob.waitForTimeout(250);
    fs.writeFileSync(path.join(OUT, 'maker-mobile.webp'), await toWebp(mob, await mob.screenshot()));
    made.push('maker-mobile.webp');
    await mob.close();

    // 3. 拨号页（无头浏览器不会真的拨号，页面停留在“请点按钮”状态，与扫码后未自动拨号时一致）
    const dial = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    await dial.goto(DIAL + '?n=' + encodeURIComponent(Buffer.from('13888888888').toString('base64'))).catch(() => {});
    await dial.waitForTimeout(300);
    fs.writeFileSync(path.join(OUT, 'dial.webp'), await toWebp(dial, await dial.screenshot()));
    made.push('dial.webp');
    await dial.close();
  } finally {
    await browser.close();
  }
  made.forEach(f => console.log('  ' + f.padEnd(20) + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB'));
})().catch(e => { console.error(e); process.exit(1); });
