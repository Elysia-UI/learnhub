# LearnHub · 知学社区

教育培训论坛与学习社区。保留原有 Vue 页面、导航、卡片、动画和响应式布局，现已接入 **Node.js 后端与腾讯云 MySQL 独立数据库**。注册登录、发帖评论、点赞收藏、学习进度、资源审核及管理操作均由服务端处理。

**2026-10-27 内容更新：** 已将重复演示内容直接替换到云数据库，包含 29 个不同昵称/头像、112 篇不同演示帖、362 条不同演示评论，并重写课程、问答和 50 份资源。[查看内容更新与验证说明](docs/community-data.md)。实际注册和发布的数据保留，重复初始化不会覆盖后续编辑。

核心闭环已贯通：**真实登录 → 发帖 → 评论 → 刷新 → 重启后端 → 从数据库重新读取**。AI 已接入阶跃星辰服务端接口，见[实际接入记录](docs/ai-stepfun-verification.md)；课程为图文演示内容。

**2026-10-28 已部署至现有腾讯云服务器：** [打开公网 HTTPS 网站](https://192.0.2.10/)。复用现有账号和云数据库，部署验证见[服务器部署记录](docs/server-deployment-2026-10-28.md)。

## 启动

需要 Node.js 24+、MySQL 8。本机已配置加密的云数据库连接。

```powershell
cd learnhub
npm ci
npm run db:init
npm start
```

也可双击“启动项目.cmd”。同时启动前后端，并自动打开浏览器。

- [打开 LearnHub](http://127.0.0.1:5173/)
- [社区管理后台](http://127.0.0.1:5173/admin)
- [好友聊天](http://127.0.0.1:5173/messages)
- [保留的云端闭环验收帖子](http://127.0.0.1:5173/forum/post-baf93afa-9144-47c7-a58f-f506a7b6b5de)
- [后端与数据库状态](http://127.0.0.1:5173/api/health)

其他机器须先按部署说明配置 DB_*。Windows 加密文件不能跨用户或机器使用。

## 账号与数据

首次初始化生成 30 个虚拟账号，使用随机强密码。本机账号清单由 Windows DPAPI 加密保存。登录已取消预览身份切换，注册默认普通用户，教师和管理员权限由服务端检查。

```powershell
npm run accounts:show             # 仅在本机终端显示管理员账号
npm run accounts:show -- teacher  # 教师演示账号
npm run accounts:show -- u1       # 一个学生演示账号
```

命令会显示密码，请勿公开或提交输出。首次初始化可通过 ADMIN_EMAIL / ADMIN_PASSWORD 指定管理员，后续修改环境不会重置已有密码。

初始化包含 100 帖、300 评论、20 图文课程、80 章节、50 份实际 Markdown/CSV 文件、30 问题、60 回答，以及关联的点赞、收藏、报名、进度、积分、通知和公告。db:init / db:seed 可重复执行，不覆盖真实业务记录。额外验收操作会使总数增加。

## 已接入业务

- 用户：注册、登录、退出、scrypt 密码哈希、服务端会话、资料、头像、修改密码及权限校验。
- 论坛：SQL 搜索分页排序、详情、自己的帖子编辑删除、评论回复、点赞收藏及取消。
- 问答：提问、回答、评论、收藏点赞、唯一采纳与一次性积分。
- 课程：教师/管理员建课编辑、图文章节、报名、完成记录和继续学习。
- 资源：实际文件上传、格式校验、审核、受保护下载、下载记录。
- 个人中心：学习记录、个人内容、收藏、浏览历史、签到、积分与通知。
- 社交：关注、粉丝、互关好友、关注动态；好友文字私聊、历史记录、未读与已读、失败重试，见[聊天说明](docs/friend-chat.md)。
- 后台：用户角色状态、帖子置顶精华、课程、资源审核、问答、分类、公告、积分规则及审计日志。
- AI 工作区：学习草稿云端保存、服务端模型调用、流式对话、历史、停止与重试；未配置服务时明确提示。

业务数据不再使用 localStorage，仅主题偏好和未发布编辑草稿留在浏览器。

## 检查

```powershell
npm run test:unit  # 37 项前端单元测试（含图片与轮播加载）
npm run test:assets # 15 项图片与生产缓存测试，无需数据库
npm run test:api   # 27 项真实 HTTP + 云 MySQL 集成测试
npm run db:verify  # 数据规模、关联、实际文件及权限检查
npm run build     # TypeScript 检查和生产构建
```

已为 3Mbps 访问压缩公共图片并优化轮播加载和生产缓存，见[低带宽优化记录](docs/performance-optimization-2026-10-28.md)。更新原图后可运行 `npm run images:optimize` 重新编码，原图保留。

接口测试建立随机虚拟账号和内容，结束后仅清理本轮明确创建的记录，部分审计日志保留。请在验收环境执行。

## 源码

```text
src/                  Vue + TypeScript 前端
  services/api.ts     Cookie / CSRF / 超时 / 错误处理
  stores/community.ts API 状态和业务操作
server/               Express、权限校验、参数化 SQL
  migrations/         数据库版本迁移
  routes/             用户、论坛、学习、资源、管理接口
  services/           DTO、积分、通知、审计
  tests/              接口集成测试
scripts/              启动、建库、初始化、凭据与验收工具
.storage/             私有上传及演示文件（不提交）
.local/               加密配置、旧版备份（不提交）
docs/                 架构、接口、部署、测试与素材说明
```

源码和迁移可重建演示环境，真实业务备份须同时覆盖数据库和文件目录。数据库密码不进入前端。

## 文档

- [需求范围](docs/requirements.md)
- [系统架构](docs/architecture.md)
- [数据库和初始化](docs/database.md)
- [API 说明](docs/api.md)
- [部署说明](docs/deployment.md)
- [实际测试记录](docs/testing.md)
- [后续工作](docs/progress.md)
- [开源与素材来源](docs/open-source-attribution.md)
- [横幅提示词](docs/image-prompts.md)

后端选用 Node.js + Express 以复用现有工具链。PHP 可以安装，缺少 PHP 并非选型限制。项目未引入 ThinkPHP 或 Candy BBS 源码。
