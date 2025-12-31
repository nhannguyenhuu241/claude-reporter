@echo off
REM Build script for Windows

echo Building Claude Code Log Desktop App for Windows...

REM Install briefcase if not already installed
where briefcase >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing Briefcase...
    pip install briefcase
)

cd /d "%~dp0"

REM Sync source files from parent directory
echo Syncing source files...
xcopy /E /Y /Q "..\claude_code_log\*.py" "claudecodelog\claude_code_log\"
xcopy /E /Y /Q "..\claude_code_log\templates" "claudecodelog\claude_code_log\templates\"
echo Source files synced

REM Create the app scaffold (first time only)
if not exist "build" (
    echo Creating app scaffold...
    briefcase create
)

REM Build for Windows
echo Building for Windows...
briefcase build

REM Package the app
echo Packaging app...
briefcase package

echo.
echo Build complete!
echo.
echo Windows app location: %cd%\dist\Claude Code Log.msi
echo.
echo To run the app:
echo   briefcase run
