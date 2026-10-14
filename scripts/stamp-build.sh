#!/bin/sh
# 可选工具，发布不需要：线上编译号由 scripts/build-dist.sh 在构建时写入 dist/version.js（提交哈希前 7 位）
# 写入编译号：取暂存区文件清单（git ls-files -s）的哈希前 7 位（与 git 短哈希同格式），写入 version.js 的 PCC_BUILD
# 同一份暂存内容得到同一个编译号；暂存内容有任何变化，编译号就变，离线缓存随之更换
# 只改暂存区和工作区里的编译号这一行；version.js 其他未暂存的修改不会被一并提交
# 用法：在仓库根目录执行 sh scripts/stamp-build.sh；pre-commit 钩子会在每次提交前自动执行
set -e
TOP=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "[编译号] 不在 git 仓库中，跳过" >&2; exit 0; }
cd "$TOP"
FILE=version.js
[ -f "$FILE" ] || { echo "[编译号] 找不到 $FILE，跳过" >&2; exit 0; }
# 1. 计算：version.js 自身排除在外，否则写入编译号会改变它要计算的内容（按制表符分列，路径含空格也正确）
BUILD=$(git ls-files -s | awk -F '\t' -v f="$FILE" '$2 != f' | git hash-object --stdin | cut -c1-7)
SUB="s/^window\.PCC_BUILD = '[^']*';/window.PCC_BUILD = '$BUILD';/"
# 2. 暂存区：在已暂存的版本上只替换这一行；尚未加入版本控制时整份加入
MODE=$(git ls-files -s -- "$FILE" | awk '{print $1}')
if [ -n "$MODE" ]; then
  BLOB=$(git show ":$FILE" | perl -pe "$SUB" | git hash-object -w --stdin)
  git update-index --cacheinfo "$MODE,$BLOB,$FILE"
fi
# 3. 工作区：同步这一行
perl -pi -e "$SUB" "$FILE"
[ -n "$MODE" ] || git add "$FILE"
git show ":$FILE" | grep -q "PCC_BUILD = '$BUILD'" || { echo "[编译号] 写入失败：$FILE 里没有 window.PCC_BUILD = '...'; 这一行" >&2; exit 1; }
echo "[编译号] $BUILD"
