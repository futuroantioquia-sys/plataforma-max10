Set oShell = CreateObject("WScript.Shell")
Dim gitDir : gitDir = "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

' Status primero
Set oStat = oShell.Exec("git -C """ & gitDir & """ status --short")
Dim statusOut : statusOut = oStat.StdOut.ReadAll()

If Trim(statusOut) = "" Then
  MsgBox "Todo limpio — no hay cambios pendientes." & Chr(13) & "El ultimo commit ya esta en GitHub.", 64, "Deploy FA"
Else
  Set oExec = oShell.Exec("git -C """ & gitDir & """ add -A")
  oExec.StdOut.ReadAll() : oExec.StdErr.ReadAll()

  Set oExec2 = oShell.Exec("git -C """ & gitDir & """ commit -m ""deploy: sync all pending changes""")
  Dim commitOut : commitOut = oExec2.StdOut.ReadAll()
  Dim commitErr : commitErr = oExec2.StdErr.ReadAll()

  Set oExec3 = oShell.Exec("git -C """ & gitDir & """ push origin main")
  Dim pushOut : pushOut = oExec3.StdOut.ReadAll()
  Dim pushErr : pushErr = oExec3.StdErr.ReadAll()

  MsgBox "COMMIT:" & Chr(13) & commitOut & commitErr & Chr(13) & Chr(10) & "PUSH:" & Chr(13) & pushOut & pushErr, 64, "Deploy FA"
End If
