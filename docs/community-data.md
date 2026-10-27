# 社区演示内容多样化

2026-10-27，已直接更新腾讯云 learnhub 数据库，页面继续通过原 API 读取。没有向前端塞入另一份静态列表。

## 本轮内容

- 29 个普通/教师演示用户改为不同昵称、简介和头像，管理员及真实注册账号保留。
- 100 篇旧帖逐条改写，新增 12 篇，主题覆盖代码排错、AI、设计、实习、学习习惯、校园与生活。
- 原 300 条模板评论改成针对正文的回复，另新增 62 条。112 篇演示帖、362 条演示评论均无整段重复。
- 20 门图文课程、80 节不同正文；保留课程和章节 ID、报名及学习进度关联。
- 30 个具体问题、60 条针对性回答；保留作者和采纳关系。
- 50 份实际可下载资料，40 Markdown、10 CSV。每份有不同内容，包括权限矩阵、投递记录、设计走查、阅读提问与摄影选片。
- 20 张不同人物照片、动物/风景头像及生成插画；帖子按版块混用不同配图，并保留无图状态。
- 演示作者按兴趣与时间顺序分布，避免同一版块首页反复出现同一个昵称；同步调整演示发帖积分归属，保持积分与明细一致。

虚拟账号和经历用于演示，不代表真实人物或社区运营数据。页面总量还包含实际验收操作，因此会高于以上规模。

## 保存与保护

内容目录在 server/demo/，更新器是 server/enrich-demo.mjs。它只匹配固定演示 ID 及仍保留旧模板的内容；已改变的旧记录会跳过。不会重置账号密码、角色或会话，也不会清空表。

更新前将涉及字段备份到 .local/backups/community-v2-*.json；原资源文件保留，新版使用独立文件名。使用事务更新业务，新增演示帖产生相应积分明细。比较真实账号、非演示帖子和评论的摘要，执行后验证未被改变。

seed_runs 标记 learnhub-community-variety-v2，重复执行保持后续编辑。npm run db:init / db:seed 也会调用本更新器，让新建验收环境直接采用新版内容。

```powershell
npm run db:enrich -- --dry-run  # 未执行时预览可更新数量
npm run db:enrich              # 应用一次；已完成则跳过
npm run demo:verify            # 实际数据库内容与文件检查
npm run db:verify              # 数量、关系、积分与权限
```

结果见 community-data-verification.json、community-quality.json 和 backend-verification.json。2026-10-27 本轮完整回归：11 项前端测试、13 项真实云数据库接口测试通过，TypeScript 与生产构建通过。额外验证了保留原演示头像时仍可修改个人资料，同时拒绝任意远程头像地址。

## 图片与参考资料

生成图使用 gpt-image-2-style-library 的 illustration-art-style 模板、案例 6，并通过 imagegen 内置工具执行。成品已保存在 public/images/community/，不是只留在全局缓存。

狐狸头像中文提示词：

```text
为 LearnHub 社区生成一个虚拟用户头像。一只戴薄荷绿耳机的橘色小狐狸，奶油色背景，手绘水彩与干净线条，正面半身居中，适合圆形头像裁切，正方形。温暖又有个性，柔和光线，手绘质感。无文字、无边框、无水印。模板 illustration-art-style，案例 6 的细腻线条和环境光。
```

AI 工作台中文提示词：

```text
为 LearnHub 社区的 AI 学习课程和相关帖子生成一张配图。夜晚的个人 AI 开发工作台，蓝紫色屏幕光、笔记本电脑、便签和一盆绿植，窗外有城市灯火，细腻手绘科技插画，横向 16:9，层次清晰，物体细节自然，电脑屏幕只有抽象的节点连接和代码纹理，不出现可读文字。无人物、无可读文字、无标识、无水印。模板 illustration-art-style，案例 6 的细腻线条和环境光。
```

- [狐狸头像](../public/images/community/fox-avatar.png)
- [AI 工作台](../public/images/community/ai-workbench.png)
- 其他头像来自 [Pravatar](https://pravatar.cc/)，照片来自 [Unsplash](https://unsplash.com/)；每张实际下载地址在 public/images/community/sources.json。照片仅作虚拟示例，不代表昵称对应真实拍摄人物。正式公开运营应复核素材使用范围。
- 内容为本项目编写的虚构社区讨论，少量基础技术点对照了 [Vue 侦听器](https://vuejs.org/guide/essentials/watchers.html)、[TypeScript 类型收窄](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)和 [MDN 交叉观察 API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)，相关帖子保留了阅读链接。没有复制整篇文章。

## 本轮浏览器检查

重点检查用户截图对应的人工智能、学习方法版块，并查看课程封面与详情。截图保存在 docs/screenshots/ 下，以 community- 开头。新内容从云接口读取，刷新后保持。
