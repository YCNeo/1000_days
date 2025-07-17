# 我們的第1000天｜YCNeo & GF

一個浪漫紀念網站：千日告白長文＋卡片＋圖片交錯。

## 網址
正式版（部署後）：https://1000days.neoycn.xyz  
備援（GitHub Pages 預設域名）：https://ycneo.github.io/1000-days/

## 建置與部署
此站使用 GitHub Actions → GitHub Pages 自動部署。  
每日台北午夜檢查是否已達 1000 天（2025-07-18）。  
手動預覽：在 **Actions → Publish 1000-Day Site → Run workflow** 時勾選 *Force deploy*。

> 提醒：GitHub Actions 的排程使用 UTC；我們的 cron `0 16 * * *` = 台北每日 00:00。

## 本地開發
```bash
git clone https://github.com/YCNeo/1000-days.git
cd 1000-days/site
python3 -m http.server 8080
# 打開 http://localhost:8080
```

## 圖片
請將你的真實照片覆蓋到 `site/assets/img/`：  
- `start.jpg` 交往初期合照  
- `everyday.jpg` 日常  
- `love.jpg` 深情  
- `future.jpg` 展望  

（可任意格式 .jpg/.png/.webp；若檔名更動記得改 `index.html`。）

## 新增段落方法
在 `index.html` 的 `<main>` 中複製下列區塊（script.js 會自動左右交錯）：

```html
<section class="block">
  <div class="text">
    <h2>章節標題</h2>
    <p>內文第一段...</p>
    <p>內文第二段...</p>
  </div>
  <div class="image">
    <img src="assets/img/yourphoto.jpg" alt="描述">
  </div>
</section>
```

若要強制左右位置，加 `text-left` / `text-right`。

## 自訂網域設定（快記）
1. Repo Settings → Pages → Source: GitHub Actions
2. Custom domain: `1000days.neoycn.xyz`
3. DNS: CNAME `1000days` → `ycneo.github.io`

祝你們幸福 ❤️
