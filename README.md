# DecisionLab 决策实验室

DecisionLab 是一个基于浏览器的多因素决策工具。用户可以建立候选方案和评价因素，通过偏好函数、权重和敏感性分析，对工作机会、租房方案、电子产品等复杂选择进行结构化比较。

项目无需账号。决策数据仅保存在当前浏览器的 IndexedDB 中，应用业务逻辑不会将其上传至服务端。

## 核心功能

- 支持数值型客观因素和五档主观因素
- 通过偏好锚点和自动归一化权重计算综合得分
- 提供排名、评分明细和方案优劣分析
- 支持权重情景分析和敏感性分析
- 支持模板、自动保存和跨标签页冲突处理

## 本地运行

需要 Node.js 22.13.0 或更高版本。

```bash
git clone https://github.com/sophie-baby/decision-lab.git
cd decision-lab
npm ci
npm run dev
```

本地访问地址以开发服务器输出为准。

提交修改前建议运行：

```bash
npm run lint
npm run build
```

## 使用流程

1. 添加 2–10 个候选方案。
2. 添加客观因素或主观因素，最多 30 个。
3. 填写每个方案在各因素下的表现。
4. 为客观因素设置趋势和不满意、可接受、理想三个锚点。
5. 设置因素的重要程度并查看结果。

权重不必手工凑满 100%，计算时会自动归一化。项目内置工作 Offer、租房和笔记本模板，也可以从空白决策开始。

## 评分方法

客观因素通过分段线性偏好函数转换为 0–100 分，其中不满意、可接受和理想锚点分别对应 20、60 和 100 分，区间外结果限制在 0–100 分。

主观五档依次对应 0、25、50、75、100 分。每个因素的标准化分数乘以归一化权重后求和，得到方案综合得分；显示到两位小数后相同的分数按并列处理。

## 数据与隐私

决策数据仅保存在当前浏览器的 IndexedDB 中，不会上传至服务端。清除站点数据、更换浏览器或更换设备后，数据无法恢复。

当前版本不支持账号、云同步和数据导入导出。应用需要浏览器支持 IndexedDB；跨标签页通知还需要 BroadcastChannel。

## 技术栈

Next.js 16、React 19、TypeScript、Tailwind CSS 4、Radix UI、Recharts、Zod、Vinext、Vite 8 和 Wrangler。

## 项目结构

```text
app/                         页面和路由
components/                  页面功能与基础 UI
hooks/use-decision-editor.ts 编辑器状态、自动保存和冲突处理
lib/decision-domain.ts       评分、排名、情景和敏感性算法
lib/decision-validation.ts   数据校验
lib/decision-repository.ts   IndexedDB 数据存储
```

领域计算与存储层不依赖页面组件。
