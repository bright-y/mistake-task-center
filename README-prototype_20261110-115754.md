# 错题任务中心 · 演示版

面向学生、家长和老师的中文错题闭环演示应用。使用原生 HTML、CSS 和 JavaScript，无需安装依赖；演示状态通过 `localStorage` 保存在当前浏览器。

## 启动

项目目录运行：

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

打开 <http://127.0.0.1:4174/app.html>。如果端口已被占用，可换成其他空闲端口。也可以直接打开 `app.html`，但建议使用本地 HTTP 服务。

## 演示角色

- 学生：李明，初一（3）班
- 家长：李明家长
- 老师：王老师

右上角“演示角色”菜单可切换。演示角色切换仅用于产品演示；生产环境应由真实账号和服务端权限控制。

## 项目结构

```text
app.html                       页面入口
app.js                         初始 Mock 数据、页面壳和基础视图
workflows.js                   角色页面、事件、上传、复核、练习和导出流程
repository.js                  localStorage 数据仓储
styles.css                     视觉组件、响应式和打印样式
tests/workflows.test.js        无外部依赖的流程测试
design-system/                 项目原有设计资料
README-prototype.md             原始维护说明，保留未覆盖
CHANGE-MAP.md                   原始文件索引，保留未覆盖
```

## 已实现

- 三种角色各自的导航、首页与权限检查；角色切换在桌面和移动端均可见。
- 家长图片上传、JPG/PNG 和 10MB 校验、图片压缩预览、识别状态、错题确认与冲突提交复核。
- 飞书同步失败提示不阻断练习生成；已确认错题的题量、难度和题型会影响练习集。
- 学生逐题作答、题号跳转、答案自动保存、手写图片入口、未答提醒和提交后逐题解析。
- 老师复核队列、筛选、题目详情、最终答案修改、重新识别入口、学生列表和班级诊断下钻。
- 任务时间线、空状态、加载/失败提示、辅助 Word 兼容导出和浏览器打印/PDF 保存入口。
- 当前角色、题目状态、图片、练习参数、作答和提交结果保存在浏览器本地。

## 后端接入边界

`repository.js` 暴露 `MistakeRepository.read/write`，目前只读写浏览器 `localStorage`。接入真实服务时，可以在这里改为 API Repository，或新增 API service 后让页面流程调用它。`app.js` 中的 `seed` 是演示数据入口。

以下能力尚未接入真实后端：账号登录与服务端权限、OCR/AI 数学识别、飞书同步与重试、真实题库生成和数学答案校验、跨设备分享链接。图片、识别结果和班级统计均为本地 Mock；前端不包含飞书密钥或 Token。导出的 `.doc` 是 Word 可打开的 HTML 文档，打印/PDF 使用浏览器打印对话框。

## 验证

运行：

```bash
node --check app.js
node --check repository.js
node --check workflows.js
node --check tests/workflows.test.js
node --test tests/workflows.test.js
```

当前结果：5 项流程测试通过；浏览器中已验证家长确认第 6 题并生成 3 题练习、学生完成并查看解析、老师打开冲突题复核页以及班级诊断下钻。老师“确认 AI 判断”的最终保存按钮在本次浏览器验证中被自动审批拦截，因此没有写入该教育判断；代码测试覆盖了条件不足结论保持为“不明确”且不会作为错题生成练习。
