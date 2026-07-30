Set oShell = CreateObject("WScript.Shell")
Set oExec = oShell.Exec("cmd /c cd /d ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"" && git log --oneline -3 && echo --- && git status --short")
Dim result
result = oExec.StdOut.ReadAll()
oExec.StdErr.ReadAll()

Set oFSO = CreateObject("Scripting.FileSystemObject")
Set oFile = oFSO.CreateTextFile("C:\Users\Lenovo\Claude\Projects\Plataforma max 100\git_status.txt", True)
oFile.Write result
oFile.Close

MsgBox result, 64, "Git Status"
