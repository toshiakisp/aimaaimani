
@cd /d %~dp0
cd aima_aimani

zip -r -9 ../aima_aimani.xpi *

if not "%ERRORLEVEL%"  == "0" goto ERR
exit 0
:ERR
pause
exit %ERRORLEVEL%

