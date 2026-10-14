# 部署到 Cloudflare Pages

本项目是纯静态网页，没有服务端代码。Cloudflare Pages 负责托管 `dist/` 目录，`git push` 后自动发布。

- 发布目录：`dist/`，由 `npm run build`（即 `sh scripts/build-dist.sh`）生成，只含线上文件，不含 `scripts/`、`node_modules/`、`.githooks/` 等开发文件。
- 响应头：仓库根目录的 `_headers` 会复制进 `dist/`，由 Cloudflare 读取（见[响应头](#响应头)）。
- 需要 https：离线缓存（Service Worker）和「网址 → 拨号」都要求 https，Cloudflare 默认提供。

## 1. 发布前准备

在本地确认能正常生成发布目录：

```sh
npm run build
python3 -m http.server 8000 -d dist   # 打开 http://localhost:8000/ 检查
```

`npm run build` 会：

- 把编译号（提交哈希前 7 位）写入 `dist/version.js`。Cloudflare 构建时取环境变量 `CF_PAGES_COMMIT_SHA`，本地取 `git rev-parse HEAD`。每次发布编译号都会变化，用户的离线缓存随之更新；
- 核对 `sw.js` 离线缓存清单（`SHELL`）中的文件都已复制到 `dist/`，缺任何一个都直接报错退出，不会发布一个离线缓存装不上的版本。

> 本地用 `npm run build` 生成的是**最近一次提交**的编译号，未提交的改动不会让编译号变化。正式发布请先提交，再由 Cloudflare 构建或用命令行上传。

## 2. 创建 Pages 项目（Git 集成，推荐）

1. 登录 Cloudflare 控制台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权并选择仓库 `parking-contact-card`。
3. 构建设置：

   | 项 | 值 |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `sh scripts/build-dist.sh` |
   | Build output directory | `dist` |
   | Root directory | 留空（仓库根目录） |

4. **Environment variables** 添加 `SKIP_DEPENDENCY_INSTALL` = `1`。发布不需要任何 npm 依赖（`playwright` 只用于本地生成预览图），跳过安装能缩短构建时间。
5. 点击 **Save and Deploy**。完成后可通过 `https://<项目名>.pages.dev/` 访问。

之后每次推送到 `main` 会自动发布到生产环境；推送到其他分支会生成预览地址（`https://<分支名>.<项目名>.pages.dev/`），可在 **Settings → Builds → Branch control** 中关闭预览分支。

### 不连 Git：命令行直接上传

适合不想授权仓库，或在本地确认后手动发布：

```sh
npm run build
npx wrangler@4 pages deploy dist --project-name=parking-contact-card --branch=main
```

首次运行会打开浏览器登录 Cloudflare，并提示创建项目。在 CI 中使用时，通过环境变量 `CLOUDFLARE_API_TOKEN`（权限：Account → Cloudflare Pages → Edit）和 `CLOUDFLARE_ACCOUNT_ID` 提供凭据，不要写入仓库。

## 3. 绑定自定义域名（可选）

1. 项目 → **Custom domains** → **Set up a custom domain**，输入域名，例如 `card.example.com`。
2. 域名已托管在 Cloudflare 时会自动添加 DNS 记录；托管在别处时，按提示添加一条 `CNAME` 指向 `<项目名>.pages.dev`。
3. 证书签发通常几分钟内完成，状态变为 **Active** 后即可访问。

建议用 **Bulk Redirects** 把 `<项目名>.pages.dev` 301 跳转到自定义域名（勾选保留查询参数、子路径匹配、保留路径后缀），避免同一页面有两个地址：离线缓存和本地保存的设置按域名区分，换地址后需要重新设置。

## 4. 发布后配置「网址 → 拨号」

二维码格式选「网址 → 拨号」时，二维码里写入的是拨号页地址。在制作页的「拨号页网址」中填写：

```
https://card.example.com/dial.html
```

（未绑定域名时为 `https://<项目名>.pages.dev/dial.html`。）

> 已经打印出去的卡片，二维码里的网址无法更改。正式打印前确定好长期使用的域名；以后更换域名时，旧域名需要继续可访问，或配置跳转到新域名的 `dial.html`（保留 `?n=` 参数）。

## 响应头

`_headers` 中的设置：

| 路径 | 响应头 | 作用 |
|---|---|---|
| 全部 | `X-Content-Type-Options: nosniff` | 禁止浏览器猜测文件类型 |
| 全部 | `Referrer-Policy: no-referrer` | 不向其他网站发送来源地址（拨号页地址中带号码参数） |
| 全部 | `Permissions-Policy` | 关闭摄像头、麦克风、定位等用不到的权限 |
| `/sw.js`、`/version.js` | `Cache-Control: no-cache` | 每次向服务器确认，新版本发布后浏览器能及时更新离线缓存 |
| `/dial.html`、`/dial` | `X-Robots-Tag: noindex` | 拨号页不被搜索引擎收录 |

没有设置 `X-Frame-Options` / CSP `frame-ancestors`：制作页会在 iframe 中预览拨号页，拨号页可能托管在另一个站点。也没有设置 CSP：页面脚本与样式全部内联，严格的 CSP 需要逐个加哈希，修改页面后容易漏改导致页面失效。

### `.html` 地址会被跳转

Cloudflare Pages 会把 `/dial.html` 跳转到 `/dial`、`/index.html` 跳转到 `/`（Pages 的默认行为）。对本项目的影响：

- 已印出的二维码写的是 `…/dial.html?n=…`，跳转后仍能打开；发布后请用下面的命令确认跳转保留了 `?n=` 参数。
- 离线缓存（`sw.js`）会自行跟随跳转并去掉跳转标记后再缓存，否则访问过网站的手机再扫码会打不开拨号页（`net::ERR_FAILED`）。修改 `sw.js` 时保留 `unredirect` 相关逻辑。

```sh
curl -sI "https://card.example.com/dial.html?n=MTM4ODg4ODg4ODg%3D" | grep -i -E '^(HTTP|location)'
# 期望：3xx 跳转，location 为 /dial?n=MTM4ODg4ODg4ODg%3D（参数保留）
```

修改 `_headers` 后重新发布即可生效，可用以下命令核对：

```sh
curl -sI https://card.example.com/sw.js | grep -i cache-control
```

## 隐私相关的控制台设置

本项目对外承诺「没有统计脚本，页面不向第三方发送请求」。以下 Cloudflare 功能会向页面注入脚本，**保持关闭**：

- **Web Analytics**（项目 → Metrics 中的自动注入）；
- 域名的 **Rocket Loader**、**Zaraz**、**Email Address Obfuscation**（在域名的 Speed / Scrape Shield 设置中）。

Cloudflare 仍会记录常规的访问日志（与 README「隐私」一节所述一致）。

## 发布后检查

- 打开首页和 `#make` 制作页，页脚版本号显示为 `v1.0.0 (7 位编译号)`，不是 `dev`；
- 浏览器开发者工具 → Application → Service Workers 显示已激活，断网后刷新仍能打开；
- 用手机扫描「网址 → 拨号」二维码，能打开拨号页并显示正确号码；**用访问过网站的同一部手机再扫一次**（此时由离线缓存响应）；
- `curl -sI` 核对上表中的响应头。

## 回滚

项目 → **Deployments**，在历史部署上选择 **Rollback to this deployment**，立即生效，无需重新构建。离线缓存按「版本 + 编译号」区分，回滚后用户下次联网访问即换回旧版本缓存。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 构建失败：`缺少离线缓存文件` | `sw.js` 的 `SHELL` 清单与仓库文件不一致，补上文件或修改清单 |
| 发布后用户看到的还是旧版本 | 离线缓存采用「先用缓存、后台更新」，第二次打开才显示新版本；确认 `version.js` 的编译号已变化 |
| 页脚编译号是 `dev` | 构建时取不到提交哈希（构建日志里有「取不到提交哈希」警告）：确认是从 Git 仓库构建；命令行上传时在仓库目录里运行 `npm run build` |
| 自定义域名一直 Pending | DNS 记录未生效或指向错误，核对 `CNAME` 目标为 `<项目名>.pages.dev` |
