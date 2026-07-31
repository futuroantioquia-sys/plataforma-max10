Set oShell = CreateObject("WScript.Shell")
Dim gitDir : gitDir = "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

Set oExec = oShell.Exec("git -C """ & gitDir & """ add -A")
oExec.StdOut.ReadAll()
oExec.StdErr.ReadAll()

Set oExec2 = oShell.Exec("git -C """ & gitDir & """ commit -m ""feat: carga masiva desde Excel en /productos""")
Dim commitOut : commitOut = oExec2.StdOut.ReadAll()
Dim commitErr : commitErr = oExec2.StdErr.ReadAll()

Set oExec3 = oShell.Exec("git -C """ & gitDir & """ push origin main")
Dim pushOut : pushOut = oExec3.StdOut.ReadAll()
Dim pushErr : pushErr = oExec3.StdErr.ReadAll()

MsgBox "COMMIT:" & Chr(13) & commitOut & commitErr & Chr(13) & Chr(10) & "PUSH:" & Chr(13) & pushOut & pushErr, 64, "Git Push"
