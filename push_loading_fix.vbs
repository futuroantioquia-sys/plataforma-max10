Set oShell = CreateObject("WScript.Shell")
Dim gitDir : gitDir = "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

' Stage the file
Set oExec = oShell.Exec("git -C """ & gitDir & """ add frontend/src/app/alumnos/[id]/page.tsx")
oExec.StdOut.ReadAll()
oExec.StdErr.ReadAll()

' Commit
Set oExec2 = oShell.Exec("git -C """ & gitDir & """ commit -m ""fix: show BalonCargando while profile loads instead of Deportista no encontrado""")
Dim commitOut : commitOut = oExec2.StdOut.ReadAll()
Dim commitErr : commitErr = oExec2.StdErr.ReadAll()

' Push
Set oExec3 = oShell.Exec("git -C """ & gitDir & """ push origin main")
Dim pushOut : pushOut = oExec3.StdOut.ReadAll()
Dim pushErr : pushErr = oExec3.StdErr.ReadAll()

MsgBox "COMMIT:" & Chr(13) & commitOut & commitErr & Chr(13) & Chr(10) & "PUSH:" & Chr(13) & pushOut & pushErr, 64, "Git Push - Loading Fix"
