# 关西，八日慢行 v1.0

2026 年关西八日旅行的公开只读行程网站。移动端为主要阅读入口，支持按日期跳转、可展开的行程章节、交通路线说明、Google Maps 外部导航以及桌面内嵌手机预览。

本地运行：

```powershell
npm start
```

在浏览器打开 `http://localhost:4173`。

## 实现说明

- 数据保存在 `data/itinerary.json`；公开服务仅提供读取，不提供网页在线编辑。
- 每个展开的行程章节均保留了大尺寸图片展示区，供后期人工替换为已确认版权的素材。
- Google Maps 采用无需 Key 的嵌入降级方式和外部导航链接。若要改用 Directions Embed API，请在部署环境中配置受域名限制、带预算上限的 Google Maps API Key。

## 验证

```powershell
npm test
node --check server.js
node --check app.js
```
