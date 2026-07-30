Set oShell = CreateObject("WScript.Shell")
Set oExec = oShell.Exec("git -C ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"" log --oneline -5")
Dim out : out = oExec.StdOut.ReadAll()
oExec.StdErr.ReadAll()

Set oExec2 = oShell.Exec("git -C ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"" status --short")
Dim out2 : out2 = oExec2.StdOut.ReadAll()
oExec2.StdErr.ReadAll()

Set oExec3 = oShell.Exec("git -C ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"" log --oneline origin/main..HEAD")
Dim out3 : out3 = oExec3.StdOut.ReadAll()
oExec3.StdErr.ReadAll()

Dim msg
msg = "=== LAST 5 COMMITS ===" & Chr(13) & Chr(10) & out & Chr(13) & Chr(10)
msg = msg & "=== UNPUSHED (ahead of origin/main) ===" & Chr(13) & Chr(10) & out3 & Chr(13) & Chr(10)
msg = msg & "=== STATUS ===" & Chr(13) & Chr(10) & out2
MsgBox msg, 64, "Git Status"
