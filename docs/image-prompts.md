# 项目图片与提示词

## 校园欢迎横幅

- 技能：gpt-image-2-style-library + imagegen 内置工具。
- 模板：`illustration-art-style`（Illustration & Art Style / 插画与艺术风格）。
- 案例：6（插画艺术创作图），参考其细腻线条、环境光和人物与风景的构图关系。
- 输出：`public/images/hero.png`，2172 × 724。
- 已先阅读本地风格库标题索引与对应模板，再查阅上游案例 6。
- 参考网页：https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md#case-6

可复制中文提示词：

```text
为 LearnHub 学习社区创作一张 3:1 横幅插画，1536x512 横向宽幅构图。晴朗午后的山城大学校园，右侧是一位背着深蓝背包、坐在露台看书的长发女大学生，身旁放着书本。远处有校园建筑、青山和明亮积云。日系手绘背景、细腻笔触、自然阳光、蓝绿色调，温暖而有成长感。左侧约一半保留简洁的深蓝天空和远山，方便网页叠加白色标题。右侧主体约占40%画面。颜色清透，光影高级，丰富的风景细节。不要文字、标识、水印或界面元素。
```

网页标题和标语由真实 HTML 叠加，图片不包含文字。Figma、后端芯片和侧栏机器人为 CSS/图标构图，不是生成图片。
