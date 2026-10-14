#!/bin/sh
# 生成发布目录 dist/：只放线上需要的文件，不含 scripts/、node_modules/、.githooks/ 等开发文件
# 发布清单与 sw.js 的离线缓存清单（SHELL）一致，另加 _headers（Cloudflare 响应头，GitHub Pages 忽略）、LICENSE 和站点所有权校验文件
# 复制后逐项核对 SHELL 中的文件都在 dist/ 里，缺一个离线缓存就会安装失败，因此缺文件时直接报错退出
# 编译号在这里写入 dist/version.js（提交哈希前 7 位），不依赖本地提交钩子
# 用法：在仓库根目录执行 sh scripts/build-dist.sh（或 npm run build）；Cloudflare Pages / GitHub Actions 的构建命令同此
set -e
cd "$(dirname "$0")/.."
OUT=dist

# 1. 清空并重建发布目录
rm -rf "$OUT"
mkdir -p "$OUT/assets"

# 2. 复制线上文件
cp index.html dial.html version.js sw.js manifest.webmanifest LICENSE "$OUT/"
[ -f _headers ] && cp _headers "$OUT/"
# 站点所有权校验文件：须原样出现在站点根路径，缺失时直接报错，避免发布后校验失败
cp fc26d371d9fc5253c4c81ccfeee70289.txt "$OUT/"
cp -R icons "$OUT/"
cp -R assets/preview "$OUT/assets/"

# 3. 写入编译号：只改 dist/version.js，源码中的 version.js 保持 dev
#    取当前提交哈希的前 7 位；Cloudflare Pages / GitHub Actions 提供的环境变量优先，本地取 git HEAD
#    编译号随每次发布变化，离线缓存（sw.js?v=版本+编译号）随之更换；拿不到提交哈希时保持 dev 并提示
SHA=${CF_PAGES_COMMIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || true)}}
BUILD=$(printf '%s' "$SHA" | cut -c1-7)
if printf '%s' "$BUILD" | grep -qE '^[0-9a-f]{7}$'; then
  sed "s/^window\.PCC_BUILD = '[^']*';/window.PCC_BUILD = '$BUILD';/" version.js > "$OUT/version.js"
  grep -q "PCC_BUILD = '$BUILD'" "$OUT/version.js" || { echo "[发布] 失败：version.js 里没有 window.PCC_BUILD = '...'; 这一行" >&2; exit 1; }
else
  echo "[发布] 警告：取不到提交哈希，编译号保持 dev；版本更新后用户的离线缓存不会自动更换" >&2
  BUILD=dev
fi

# 4. 核对离线缓存清单：取 sw.js 里 SHELL 数组中的 './xxx' 路径（'./' 本身对应 index.html，跳过）
MISSING=0
for f in $(sed -n "/var SHELL/,/];/p" sw.js | grep -o "'\./[^']*'" | tr -d "'" | sed 's#^\./##'); do
  [ -z "$f" ] && continue
  if [ ! -f "$OUT/$f" ]; then echo "[发布] 缺少离线缓存文件：$f" >&2; MISSING=1; fi
done
[ "$MISSING" -eq 0 ] || { echo "[发布] 失败：sw.js 的 SHELL 清单与发布文件不一致" >&2; exit 1; }

echo "[发布] 完成：$OUT/（编译号 ${BUILD}，$(find "$OUT" -type f | wc -l | tr -d ' ') 个文件，$(du -sh "$OUT" | cut -f1)）"
