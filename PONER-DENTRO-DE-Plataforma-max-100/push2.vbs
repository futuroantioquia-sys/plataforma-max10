' Sube los cambios a GitHub. Funciona en cualquier computador:
' toma la carpeta donde esta guardado este mismo archivo.
Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")
Dim gitDir : gitDir = oFSO.GetParentFolderName(WScript.ScriptFullName)

Dim msg
msg = InputBox("Describa en pocas palabras el cambio que va a subir:", "Subir a GitHub", "cambios")
If StrComp(msg, "") = 0 Then WScript.Quit
msg = Replace(msg, """", "'")

' Identidad de Git (por si el computador es nuevo y no la tiene)
oShell.Run "cmd /c git -C """ & gitDir & """ config user.name ""Futuro Antioquia""", 0, True
oShell.Run "cmd /c git -C """ & gitDir & """ config user.email ""futuroantioquia-sys@users.noreply.github.com""", 0, True

Set oExec = oShell.Exec("git -C """ & gitDir & """ add -A")
oExec.StdOut.ReadAll()
oExec.StdErr.ReadAll()

Set oExec2 = oShell.Exec("git -C """ & gitDir & """ commit -m """ & msg & """")
Dim commitOut : commitOut = oExec2.StdOut.ReadAll()
Dim commitErr : commitErr = oExec2.StdErr.ReadAll()

Set oExec3 = oShell.Exec("git -C """ & gitDir & """ push origin main")
Dim pushOut : pushOut = oExec3.StdOut.ReadAll()
Dim pushErr : pushErr = oExec3.StdErr.ReadAll()

MsgBox "CARPETA:" & Chr(13) & gitDir & Chr(13) & Chr(10) & Chr(10) & _
       "COMMIT:" & Chr(13) & commitOut & commitErr & Chr(13) & Chr(10) & _
       "PUSH:"   & Chr(13) & pushOut   & pushErr, 64, "Subir a GitHub"
