# 开源与素材来源

## 参考与源码边界

前期查看过 [Candy BBS 仓库](https://github.com/candyKC/candy-bbs) 的项目说明，将其作为论坛方向参考。本项目没有复制或修改该仓库的源码、数据库或后端，也没有将其当作已运行验证的依赖。

本项目前端独立使用 Vue 3 + TypeScript 实现；本阶段后端独立采用 Node.js + Express。PHP 可以安装，不以本机缺少 PHP 作为架构限制。本阶段没有引入 ThinkPHP、Composer 或拼接外部论坛控制器。

## 依赖

前端：Vue、Vue Router、Pinia、Vite、TypeScript、Lucide、marked、DOMPurify、ECharts。

后端：Express、mysql2、Zod、Helmet、express-rate-limit、multer、file-type、dotenv、cookie-parser；密码、会话、哈希等使用 Node 标准 crypto。Windows 秘密保护使用系统 DPAPI。

开发测试：Vitest、jsdom、vue-tsc、Prettier。确切版本和依赖树见 package-lock.json，第三方许可证保留在对应 npm 包中；分发时应保留所需声明。没有将第三方框架、图标或图表库称为原创框架成果。

## 图片

本轮新增图片与来源详见 [内容更新说明](community-data.md) 和 public/images/community/sources.json。狐狸头像、AI 工作台采用 illustration-art-style 模板、案例 6，通过 imagegen 内置工具生成并保存到项目。

- hero.png：此前通过 imagegen 生成并保留；模板案例见 image-prompts.md。
- ai.jpg：[Unsplash 图片来源](https://images.unsplash.com/photo-1485827404703-89b55fcc595e)。
- study.jpg：[Unsplash 图片来源](https://images.unsplash.com/photo-1499750310107-5fef28a66643)。
- code.jpg：[Unsplash 图片来源](https://images.unsplash.com/photo-1498050108023-c5249f4df085)。
- mountain.jpg：[Unsplash 图片来源](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b)。
- avatar-1.jpg 至 avatar-5.jpg：[Pravatar](https://i.pravatar.cc)，img 参数 47、12、44、11、33。只是虚拟示例头像，不代表社区真实成员身份。

素材已保存在项目内，不依赖页面运行时从这些站点加载。公开运营前应复核素材许可、肖像适用范围或替换为有权使用的用户头像。

## 本项目编写范围

页面、业务 API、数据库迁移、初始化、测试和 Markdown/CSV 学习提纲由本次项目开发编写。社区初始人物、课程、帖子和积分是演示内容，不能作为真实运营规模宣传。用户上传内容权利由实际上传方保证。
