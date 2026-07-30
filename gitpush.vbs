Set oShell = CreateObject("WScript.Shell")
oShell.Run "cmd /c cd /d ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"" && git push origin main > ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\push_result.txt"" 2>&1", 0, True
MsgBox "Push completado. Revisa push_result.txt para el resultado.", 64, "Deploy"
