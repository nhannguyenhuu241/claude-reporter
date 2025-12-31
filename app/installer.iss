[Setup]
AppName=Claude Code Log
AppVersion=0.8.0
AppPublisher=Claude Code Log
DefaultDirName={autopf}\ClaudeCodeLog
DefaultGroupName=Claude Code Log
OutputDir=dist
OutputBaseFilename=ClaudeCodeLog-0.8.0-Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=resources\icon.ico
UninstallDisplayIcon={app}\Claude Code Log.exe
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "build\claudecodelog\windows\app\src\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\Claude Code Log"; Filename: "{app}\Claude Code Log.exe"
Name: "{group}\Uninstall Claude Code Log"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Claude Code Log"; Filename: "{app}\Claude Code Log.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\Claude Code Log.exe"; Description: "Launch Claude Code Log"; Flags: nowait postinstall skipifsilent
