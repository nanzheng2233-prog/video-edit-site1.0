# 安二 · 作品集网站 3.0

整理日期：2026-10-24。纯静态网站，无需安装依赖或运行构建命令。

## 上传 GitHub

1. 新建 GitHub 仓库，或打开已有的网站仓库。
2. 选择 **Add file → Upload files**，上传本文件夹内的文件和 assets 文件夹，保持原有目录结构。
3. 确保仓库根目录直接包含 index.html；不要只上传 ZIP，也不要额外套一层“作品集网站3.0”目录。
4. 提交后，在 **Settings → Pages** 中选择 **Deploy from a branch**，选择 main 分支和 **/(root)**，保存。
5. 等待发布完成，通过 Pages 页面显示的地址访问。

已附带 .nojekyll，适合直接发布静态文件。单个文件最大约 13.7 MiB，均低于 GitHub 网页上传的单文件 25 MiB 限制。

官方说明：[上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)、[配置 GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 版本内容

共 58 项作品：原创 10、商业 17、委托 26、Showcase 3、Showreel 2。

- 商业作品《二相镜》排在第一位，已移除《破禁》和指定的抖音作品。
- 委托作品《一日夏》位于第三页。
- Showcase 在 works 分类中，使用竖版封面；Showreel 排在最后。
- 8 条小红书视频保存在 assets/videos/，支持站内播放；Bilibili 作品使用内嵌播放器，需要联网。
- 清新蓝界面、3D 设备与提问箱、发送纸飞机图标均已包含。

## 提问箱

收件邮箱为 mesonan-2@qq.com，通过 FormSubmit 转发。上线后需要按服务邮件指引激活，再验证实际收信。详情见“提问箱上线说明.txt”。不要将本地 file:// 预览当作邮件投递验证。

## 本地预览和维护

双击 index.html 可以查看网站及本地视频。作品数据在 portfolio-data.js，主要界面样式在 style.css，交互逻辑在 app.js。

上传时不要遗漏 assets/videos/，保留所有图片名称和相对路径。本包已排除旧版本备份、测试脚本和已删除作品的无用封面。

此目录为独立发布副本；继续修改“个人网站最新”目录后，需要重新同步到本目录。本次未自动上传 GitHub 或发布网站。
