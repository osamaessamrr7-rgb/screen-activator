@echo off
title Screen Activator Portal - تجميع وتفعيل الأكواد
chcp 65001 >nul
cd /d "C:\Users\Administrator.WIN-QH4JMRVJL7B\Desktop\Screen_Activator_Portal"

echo ====================================================================
echo             Smart Screen Activator - تجميع وتفعيل الأكواد            
echo ====================================================================
echo.
echo  [*] رابط صفحة العملاء (الزبون يدخل يحط الكود فقط):
echo      http://217.154.1.13:8000
echo.
echo  [*] رابط لوحة التحكم الخاصة بك (لنسخ وتجميع الأكواد):
echo      http://localhost:8000/admin
echo.
echo ====================================================================
echo جاري تشغيل السيرفر وفتح لوحة الإدارة تلقائياً...
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000/admin"
python server.py

pause
