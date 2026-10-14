/**
 * 项目版本号与编译号：生成页（index.html）、拨号页（dial.html）页脚和“关于”显示，离线缓存（sw.js?v=版本+编译号）按它区分
 *   PCC_VERSION 版本号（语义化版本：主.次.修订），功能发布时手动改
 *   PCC_BUILD   编译号：源码中保持 dev（本地开发版）；发布时由 scripts/build-dist.sh 写入 dist/version.js，
 *               取当前提交哈希的前 7 位，不要手改
 */
window.PCC_VERSION = '1.0.0';
window.PCC_BUILD = '97e994e';
