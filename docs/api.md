# API 说明

基础路径 /api。成功 {data:...}；失败 {error:{code,message},requestId}。分页 {items,total,page,pageSize}。

src/services/api.ts 统一处理同源 Cookie、内存 CSRF、JSON/FormData、25 秒超时及错误。数据库只在服务器访问。

## 用户

| 方法与路径          | 说明                                          |
| ------------------- | --------------------------------------------- |
| POST /auth/register | {email,name,password}，默认 student           |
| POST /auth/login    | {email,password}，返回会话与 CSRF             |
| GET /auth/me        | 当前身份，无效会话 user:null                  |
| POST /auth/logout   | 撤销会话                                      |
| PATCH /auth/profile | {name,bio,avatar?}                            |
| POST /auth/password | {currentPassword,newPassword}，撤销全部旧会话 |

密码 12–128 字符，含字母数字，保存加盐 scrypt 哈希。登录/注册 15 分钟限 30 次，API 默认 600 次/分钟。生产会话 Cookie 使用 Secure，须 HTTPS。

GET /bootstrap 返回首页用的有限 DTO、独立完整的当前 user、csrfToken 和数据库未读总数。已登录写接口要求 Cookie、X-CSRF-Token 和允许的 Origin。所有管理接口额外检查 admin。

## 论坛

| 方法与路径                                               | 说明                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| GET /categories                                          | 分类                                                   |
| GET /posts?q=&category=all&sort=latest&page=1&pageSize=8 | SQL 搜索分页；sort 为 latest/hot/featured，大小上限 50 |
| GET /posts/:id                                           | 详情及评论                                             |
| POST /posts/:id/view                                     | 阅读、登录用户浏览历史                                 |
| POST /posts                                              | 提交审核                                               |
| PATCH /posts/:id                                         | 作者或管理员编辑                                       |
| DELETE /posts/:id                                        | 作者或管理员删除                                       |
| POST /posts/:id/comments                                 | {content,parentId?}，父评论须属于本帖                  |
| DELETE /comments/:id                                     | 作者或管理员                                           |
| PUT /posts/:id/like                                      | {active:boolean}，幂等                                 |
| PUT /posts/:id/favorite                                  | {active:boolean}，幂等                                 |

帖子字段 {title,content,category,tags,type,image?}；type 为讨论/分享/求助/资源推荐。标题 6–100、正文 20–50000 字符。请求不能伪造作者、积分和角色。

## 学习、问答、消息

| 方法与路径                                               | 说明                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| POST /questions、PATCH /questions/:id                    | 提问/本人编辑                                |
| POST /questions/:id/answers                              | 回答                                         |
| POST /answers/:id/comments                               | 回答评论                                     |
| PUT /answers/:id/like、PUT /questions/:id/favorite       | {active}                                     |
| POST /questions/:id/accept                               | {answerId}，仅提问者，不能采纳自己，奖励一次 |
| POST /courses、PATCH /courses/:id                        | 教师/管理员，教师仅编辑自己的课程            |
| POST /courses/:id/enroll                                 | 唯一报名                                     |
| PUT /courses/:id/progress                                | {chapterId,completed}，检查归属              |
| POST /checkins                                           | 上海日期的唯一签到与积分                     |
| PATCH /notifications/:id/read、PATCH /notifications/read | 本人通知已读                                 |
| DELETE /notifications/:id                                | 本人通知删除                                 |
| POST /ai/drafts、DELETE /ai/drafts/:id                   | 本人学习草稿                                 |
| POST /ai/chat                                            | 真实模型对话，未配置时 503                   |

GET /stats 是真实 SQL 汇总。GET /search 在 SQL 端跨五种实体检索和分页；前端调用此接口。bootstrap 仅用于首页与共享状态，不承担全站内容检索。

## 文件

POST /uploads：登录，multipart file，2 MB 内 PNG/JPEG/WebP，返回安全图片 URL。GET /uploads/:name 仅允许生成的图片文件名。

POST /resources：登录，multipart file/title/description/category/tags（JSON 数组文本），最多 10 MB。校验扩展名、内容签名、UTF-8 文本，默认 pending。

GET /resources/:id/download：登录且 approved，私有路径校验、记录下载。PUT /resources/:id/favorite 接受 {active}。尚未接入杀毒扫描。

## 管理

全部 /admin 前缀且必须 admin：

- GET /stats、GET /users。
- PATCH /users/:id：role/status；不能更改当前管理员自身；角色改变或禁用撤销会话。
- PATCH /posts/:id：pinned/featured；删除复用论坛管理员权限。
- POST /resources/:id/review：{approved}，仅 pending 能审核。
- DELETE /courses/:id、/resources/:id、/questions/:id、/notices/:id。
- POST /categories、DELETE /categories/:id（有关联内容不能删）。
- POST /notices、PATCH /notices/:id（pinned）。
- PATCH /point-rules：{code,amount}，code 为 checkin/post/answer/accepted/resource。

课程编辑复用教师接口。写操作生成数据库审计记录。前端身份切换不能代替认证。

## 2026-10-28 新增接口

- GET /courses、/questions、/resources：page/pageSize/q/category/sort；课程还支持 level/recommended，资源支持 format，问题支持 solved=yes/no。GET /:entity/:id 返回 {item,users}。
- GET /search：q/type（全部、帖子、问答、课程、资源、用户）/page/pageSize/sort，返回当前页 items、counts、total 和作者 users。
- POST /admin/posts/:id/review：{approved,reason?}，驳回必须填写原因。PATCH /admin/categories/:id：name/description/enabled。
- 公告 POST/PATCH 另支持 title/content/type/status（draft/published）/pinned。GET /announcements 为公开分页。
- GET /admin/catalog/:kind（users/posts/courses/resources/questions），支持 status/q/sort/page/pageSize。GET /admin/lists/:kind（notices/comments/logs）。GET /admin/activity 汇总最近七天实际活动。
- GET /leaderboard：全量用户积分排名分页和 myRank。GET /topics：全部公开帖及问题标签统计。
- GET /members/:id：公开用户及统计；GET /members/:id/posts、questions、resources、courses、answers 为公开分页。
- GET /me/posts、questions、resources、courses（本人授课）、learning（报名课程和学习进度）、points、history、comments、answers、downloads：独立分页。
- GET /me/favorites/:kind（posts/questions/resources）；GET /me/growth：真实积分、等级、徽章、活动和统计。
- GET /me/export?scopes=profile,learning,points：仅当前用户选定范围的全量导出。可选 profile/posts/questions/resources/learning/favorites/points/downloads。
- GET /notifications：分页，unread=true 筛选，返回未读总数。
- PUT /courses/:id/review：{rating:1..5,content}，报名后每人一条评价；GET /courses/:id/reviews 分页；DELETE /courses/:id/review/:reviewId 作者或管理员删除。
- PATCH /resources/:id：title/description/category/tags，作者修改后重新审核。
- POST /questions 另支持 bounty（0..1000）；DELETE /questions/:id 支持合法删除和未结算悬赏退款。采纳接口结算悬赏。
- GET /ai/status；GET/POST /ai/conversations；GET/DELETE /ai/conversations/:id。
- POST /ai/conversations/:id/messages：{content,requestKey}，返回 application/x-ndjson 事件 start/delta/done/error。POST /ai/chat 接受相同字段及 conversationId。
- POST /ai/conversations/:id/stop：停止当前生成。草稿接口继续保留并限制 kind=draft。

本轮业务规则、配额和外部配置限制见 [功能补齐记录](feature-implementation.md)。
