# 部署到 GitHub Pages

本项目是纯静态网页，可直接托管在 GitHub Pages，地址为 `https://<用户名>.github.io/parking-contact-card/`。

有两种发布方式：

| 方式 | 发布内容 | 适用 |
|---|---|---|
| A. GitHub Actions（推荐） | 只发布 `dist/`（`npm run build` 生成） | 正式使用；不公开开发文件 |
| B. 从分支发布 | 仓库根目录的全部已提交文件 | 快速试用 |

两种方式都需要 https 才能使用离线缓存和「网址 → 拨号」，GitHub Pages 默认提供（保持 **Enforce HTTPS** 勾选）。

> 免费账号只能对**公开仓库**启用 GitHub Pages。

## 发布前准备

```sh
npm run build   # 本地确认能生成 dist/
```

编译号（`version.js` 的 `PCC_BUILD`）在构建时写入 `dist/version.js`，取提交哈希前 7 位（Actions 中为 `GITHUB_SHA`）。每次发布编译号都会变化，离线缓存随之更新；不需要在本地设置提交钩子。

方式 B（从分支发布）不经过构建，线上的编译号就是源码里的 `dev`，用户的离线缓存只能靠修改 `PCC_VERSION` 更新。正式使用请选方式 A。

## A. 用 GitHub Actions 发布 `dist/`（推荐）

1. 工作流已在仓库中：[`.github/workflows/pages.yml`](../.github/workflows/pages.yml)，内容如下：

   ```yaml
   # 推送到 main 时生成 dist/ 并发布到 GitHub Pages
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   # 同一时间只发布一次；不取消进行中的发布
   concurrency:
     group: pages
     cancel-in-progress: false

   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v6
         - uses: actions/configure-pages@v6
         # 只复制线上文件，并核对离线缓存清单；不需要 npm install
         - run: sh scripts/build-dist.sh
         - uses: actions/upload-pages-artifact@v5
           with:
             path: dist
         - id: deployment
           uses: actions/deploy-pages@v5
   ```

2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 提交并推送该文件。在 **Actions** 标签页查看运行结果，成功后页面顶部显示访问地址。

之后每次推送到 `main` 自动发布；也可在 Actions 中手动运行（`workflow_dispatch`）。

说明：

- `dist/` 中的 `_headers` 是 Cloudflare 的配置，会随站点一起发布（可通过 `/_headers` 访问到，内容只有响应头规则），GitHub Pages 不读取它，不影响使用。
- action 版本核对于 2026-10：`configure-pages@v6` 已改用 Node 24；`checkout` 已有 v7（改为 ESM），这里用 v6 即可。Actions 日志出现弃用提示时，到各 action 的 Releases 页面确认后升级。

## B. 从分支发布（快速试用）

1. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **Deploy from a branch**。
2. Branch 选 `main`，目录选 `/ (root)`，保存。
3. 一两分钟后通过 `https://<用户名>.github.io/parking-contact-card/` 访问。

注意：

- 仓库根目录中所有已提交的文件都会公开访问（`scripts/`、`package.json`、`README.md` 等）。不含敏感信息，但不如方式 A 干净。
- GitHub Pages 默认用 Jekyll 处理分支内容。本项目没有 Jekyll 文件，可正常显示；如遇到文件丢失，在仓库根目录添加空文件 `.nojekyll` 关闭 Jekyll。

## 绑定自定义域名（可选）

1. **Settings → Pages → Custom domain** 填写域名，例如 `card.example.com`，保存。
2. 在域名服务商处添加 `CNAME` 记录，指向 `<用户名>.github.io`。
3. DNS 生效、证书签发后勾选 **Enforce HTTPS**。

用方式 A 时，域名只需在 Settings 中设置，不需要在仓库里放 `CNAME` 文件。

## 发布后配置「网址 → 拨号」

在制作页的「拨号页网址」中填写：

```
https://<用户名>.github.io/parking-contact-card/dial.html
```

（绑定域名后为 `https://card.example.com/dial.html`。）

> 已经打印出去的卡片，二维码里的网址无法更改。正式打印前确定好长期使用的地址；仓库改名、改用户名或更换域名都会让旧卡片的二维码失效。

## 与 Cloudflare Pages 的差异

GitHub Pages 不支持自定义响应头，`_headers` 中的设置不生效：

| 项 | GitHub Pages 的情况 |
|---|---|
| `sw.js`、`version.js` 缓存 | 统一返回 `Cache-Control: max-age=600`：新版本发布后约 10 分钟内，浏览器可能仍读到旧的 `version.js`，离线缓存要等它过期后的下一次访问才更新 |
| `Referrer-Policy` | 浏览器默认 `strict-origin-when-cross-origin`，跨站只发送域名、不含 `?n=` 参数；拨号页也没有指向其他网站的链接 |
| 拨号页不被收录 | `dial.html` 中已有 `<meta name="robots" content="noindex">`，效果相同 |

需要这些响应头时，参见 [部署到 Cloudflare Pages](deploy-cloudflare.md)。

## 发布后检查

- 打开首页和 `#make` 制作页，页脚版本号显示为 `v1.0.0 (7 位编译号)`，不是 `dev`；
- 浏览器开发者工具 → Application → Service Workers 显示已激活，断网后刷新仍能打开；
- 用手机扫描「网址 → 拨号」二维码，能打开 `dial.html` 并显示正确号码。

## 回滚

GitHub Pages 没有一键回滚。用 `git revert` 撤销有问题的提交并推送，即重新发布上一个版本；方式 A 也可在 Actions 中对旧的成功运行点击 **Re-run all jobs**。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 访问 404 | Pages 尚未启用或 Source 选错；方式 A 需选 **GitHub Actions** |
| Actions 报 `Get Pages site failed` | 仓库 Settings → Pages 还没把 Source 设为 GitHub Actions |
| Actions 构建失败：`缺少离线缓存文件` | `sw.js` 的 `SHELL` 清单与仓库文件不一致，补上文件或修改清单 |
| 发布后用户看到的还是旧版本 | 离线缓存「先用缓存、后台更新」，第二次打开才显示新版本；另有最多约 10 分钟的 CDN 缓存 |
| 页脚编译号是 `dev` | 用的是方式 B（从分支发布），或构建日志里有「取不到提交哈希」警告；改用方式 A |
