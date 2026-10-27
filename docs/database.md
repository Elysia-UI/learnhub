# 数据库与演示数据

2026-10-27 已执行内容多样化更新：原始规模基础上增加 12 篇演示帖与 62 条评论，重写昵称头像、原帖评论、课程章节、问答及资源。下文初始规模为第一版记录；当前内容和保护策略见 [本轮说明](community-data.md)。

## 当前连接

腾讯云 MySQL 8.0.30-txsql，专用 learnhub 库，utf8mb4 / utf8mb4_unicode_ci，专用 learnhub_app 账号。未修改服务器其他应用数据库。

连接在 .local/database.dpapi 中，由当前 Windows 用户加密。密码不进入源码、前端和文档；迁机器需重新配置 DB_*，不能直接跨机器复制 DPAPI。

专用账号仅在 learnhub.* 具有 SELECT、INSERT、UPDATE、DELETE、CREATE、ALTER、INDEX、REFERENCES，无跨库权限和 GRANT OPTION。DDL 权限供迁移使用，正式环境可进一步拆分迁移和日常账号。

## 表

| 模块       | 数据表                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| 用户       | roles、users、sessions                                                         |
| 论坛       | categories、posts、post_comments、post_likes、post_favorites、browsing_history |
| 问答       | questions、answers、answer_comments、answer_likes、question_favorites          |
| 课程       | courses、course_chapters、course_enrollments、learning_progress                |
| 资源       | resources、resource_favorites、resource_downloads                              |
| 成长       | point_rules、checkins、point_records                                           |
| 社区后台   | notifications、announcements、admin_operation_logs                             |
| 草稿与版本 | ai_conversations、schema_migrations、seed_runs                                 |

业务表均为 InnoDB。外键约束保护用户、分类和内容关联；适当使用级联删除。邮箱、点赞收藏组合、报名、章节进度、每日签到、积分事件、章节顺序有唯一约束。状态/分类/时间、作者、未读通知和积分有索引。

posts 有全文索引，当前中文查询采用参数化 LIKE 支持包含搜索，未声称启用中文全文分词。采纳答案、最后章节及进度所属课程的复合规则由事务校验，并非全部使用数据库 CHECK。

## 初始化

```powershell
npm run db:provision # 当前 Windows 复用既有加密云连接，建立专用库账号
npm run db:migrate   # 仅应用尚未执行的版本
npm run db:seed      # 内含迁移，已有标记则保留数据
npm run db:init      # 本机缺连接时先建库，再迁移初始化
npm run db:verify    # 只读检查数据、关系、实际文件和权限
```

001_core.sql 建立结构，002_curated_courses.sql 加入推荐标志及种子时间修正，003_resource_download_cleanup.sql 完善已下载资源的删除关联。schema_migrations 记录版本。初始化没有 DROP DATABASE / TRUNCATE。MySQL DDL 不可完整事务回滚，失败后先检查已执行语句和版本再修复，不能清空已有库。迁移/种子以单实例运行。

seed.mjs 用固定 ID 与 seed_runs 标记，一次业务事务完成后写标记。重复执行不覆盖新业务、不重置密码、不重复奖励。

## 初始规模

| 记录                         |                      数量 |
| ---------------------------- | ------------------------: |
| 虚拟用户（1 管理员、5 教师） |                        30 |
| 帖子 / 评论                  |                 100 / 300 |
| 课程 / 章节                  |                   20 / 80 |
| 实际资源文件                 | 50（40 Markdown、10 CSV） |
| 问题 / 回答                  |                   30 / 60 |
| 帖子点赞 / 收藏              |                 400 / 200 |
| 报名 / 完成进度              |                  60 / 120 |
| 签到                         |                        87 |
| 公告 / 通知                  |                    4 / 30 |

首页统计使用 SQL 汇总。初始下载数为 0，只有真实下载增加记录；初始积分来自明细汇总，后续由事务维护。保留的浏览器验收账号、帖子评论会使当前总数高于初始规模。

资源文件保存在 .storage，数据库保存大小、类型、文件名、私有键和审核状态。备份必须同时覆盖二者。

## 凭据

ADMIN_EMAIL / ADMIN_PASSWORD 仅首次初始化有效，未指定则生成随机强密码。Windows 清单加密保存于 .local/demo-accounts.dpapi；非 Windows 为 .local/demo-accounts.json，创建权限 0600，应放受保护持久卷或密钥系统。

npm run accounts:show 仅本机显示管理员，禁止把输出公开。改密后旧会话失效，初始清单不会自动更新为新密码。

## 传输状态

本次沿用原云连接，尚未启用数据库 TLS；实测范围是连接、业务和持久化。配置支持 DB_SSL=true、DB_SSL_CA 并保持证书验证。正式部署需验证服务商 TLS 或云内网链路，尚未实施网络和 TLS 改造。

## 2026-10-28 业务流程迁移

004 增加帖子驳回原因和审核时间、分类启停、公告草稿、真实课程评价表 course_reviews、用户徽章 user_badges、悬赏状态、AI 消息 ai_messages 及请求回执 request_receipts。005 增加 AI 调用记录 ai_attempts 和消息排序序号。两份迁移已在当前云库执行。

原课程演示评分未关联评价记录，已清零后改由评价汇总；原问题演示悬赏未扣积分，已清零后启用冻结和结算。保留真实帖子、评论、用户、文件和积分。

详细事务规则见 [功能补齐记录](feature-implementation.md)。
