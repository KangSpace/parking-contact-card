/**
 * 离线缓存：首次访问时预缓存应用外壳，之后同源 GET 请求“先返回缓存、后台更新”（stale-while-revalidate）
 * 页面全部内联（含 qrcodejs），缓存这几个文件即可完全离线使用；dial.html 用于生成页里的拨号页预览，assets/preview 为介绍页插图
 * 缓存名带项目版本号与编译号（注册地址 sw.js?v=版本+编译号，见 version.js），任一变化即换新缓存，旧缓存在 activate 时清理
 * 部分托管会把 /x.html 跳转到 /x（如 Cloudflare Pages），缓存前去掉跳转标记，见 unredirect
 */
var CACHE = 'pcc-' + (new URL(self.location.href).searchParams.get('v') || 'dev');
var SHELL = ['./', './index.html', './dial.html', './version.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  // 产品介绍页用到的预览图（约 280 KB），离线打开介绍页也完整
  './assets/preview/maker-desktop.webp', './assets/preview/dial.webp', './assets/preview/sheet-a4.svg',
  './assets/preview/card-blue.svg', './assets/preview/card-mini.svg', './assets/preview/card-hazard.svg',
  './assets/preview/card-tag.svg', './assets/preview/card-strip.svg', './assets/preview/card-blank.svg'];

/**
 * 去掉响应的“经过跳转”标记：浏览器拒绝用经过跳转的响应回应页面导航（net::ERR_FAILED），
 * 托管把 dial.html 跳转到 /dial 时，缓存里的 dial.html 就会打不开；按原内容重建一个不带标记的响应
 * @param {Response} res 网络响应
 * @return {Promise<Response>} 未跳转时原样返回
 */
function unredirect(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

self.addEventListener('install', function (e) {
  // cache: 'reload' 绕过浏览器的 HTTP 缓存，新版本的离线缓存装入的一定是最新文件；任一文件失败则本次安装失败，沿用旧缓存
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (res) {
        if (!res.ok) throw new Error('[离线缓存] 预缓存失败 ' + u + ' ' + res.status);
        return unredirect(res).then(function (clean) { return c.put(u, clean); });
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('pcc-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  var cacheP = caches.open(CACHE);
  // 后台从网络更新；带查询参数的页面（如 dial.html?n=…）按路径缓存，避免每个号码各存一份
  // 页面导航的请求不跟随跳转（redirect: manual），托管把 dial.html 跳到 /dial 时浏览器会换到 /dial，离线缓存里没有这个地址；
  // 改由这里跟随同源跳转，地址栏保持 dial.html?n=…，缓存也只存这一份
  var nav = req.mode === 'navigate';
  var net = cacheP.then(function (c) {
    return fetch(nav ? new Request(req.url, { credentials: req.credentials, redirect: 'follow' }) : req).then(function (res) {
      // 先判断类型：unredirect 重建的响应 type 为 default，不再是 basic；跳到其他站点（type 为 opaque 等）时交给浏览器按原请求处理
      if (nav && res.redirected && new URL(res.url).origin !== self.location.origin) return fetch(req);
      if (!res.ok || res.type !== 'basic') return res;
      return unredirect(res).then(function (clean) {
        return c.put(req.url.split('?')[0], clean.clone()).then(function () { return clean; });
      });
    });
  });
  // 等后台更新写完缓存，避免 Service Worker 空闲时被中途结束
  e.waitUntil(net.catch(function () { /* 离线时更新失败，忽略 */ }));
  // 有缓存先用缓存，没有再等网络；离线且无缓存时网络错误照常抛出
  e.respondWith(cacheP.then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (hit) { return hit || net; }));
});
