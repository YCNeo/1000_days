# 我們的第1000天｜Neo & Rong

浪漫紀念網站：千日告白長文 + 卡片 + 交錯圖文 + Lightbox 點圖放大 + **Dark/Light Mode 切換**。

## 網址
正式版（部署後）：https://1000days.neoycn.xyz  
備援：https://ycneo.github.io/1000-days/

## 千日日期
起始：2022-10-23  
第 1000 天：2025-07-18

## 建置與部署
- GitHub Actions → GitHub Pages
- 每日台北午夜檢查是否達千日才自動部署
- 可手動 Force deploy（預覽）
- Dark/Light Mode：右上角 🌙/☀️ 按鈕；記憶於 localStorage

## 本地預覽
```bash
git clone https://github.com/YCNeo/1000-days.git
cd 1000-days/site
python3 -m http.server 8080
# http://localhost:8080
```

## 圖片替換
覆蓋下列檔：
- start.jpg 初期合照
- everyday.jpg 日常
- love.jpg 深情
- future.jpg 展望

可增更多段落；範例見 index.html 內註解 SECTION TEMPLATE。

## 主題色客製
調整 style.css 中 :root (light) 與 [data-theme="dark"] (dark) 變數即可。

祝你們幸福 ❤️
