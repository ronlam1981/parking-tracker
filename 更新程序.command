#!/bin/bash
cd "$(dirname "$0")"
echo "正在更新泊車記錄App..."
git add -A
git commit -m "更新泊車記錄App"
git push origin main
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 更新成功！1-2分鐘後網站會自動更新。"
else
    echo ""
    echo "❌ 更新失敗，請檢查網絡連線。"
fi
echo ""
read -p "按 Enter 關閉視窗..."
