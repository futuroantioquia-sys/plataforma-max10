Set oShell = CreateObject("WScript.Shell")
' Open GitHub tokens page in default browser
oShell.Run "https://github.com/settings/tokens"
MsgBox "Se abrió la página de tokens de GitHub." & Chr(13) & Chr(10) & Chr(13) & Chr(10) & "Busca el token que empiece con 'ghp_vCCBk...' y haz clic en 'Delete'.", 64, "GitHub - Revocar PAT"
