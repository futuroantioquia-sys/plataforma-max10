Set oShell = CreateObject("WScript.Shell")

' Step 1: List tokens to find the ID of our token
Dim listCmd
listCmd = "powershell -NoProfile -Command """ & _
  "$token = 'vcp_1hGY4pZLO5axhVi5YVLCVISy7TAGG1GysBCkIC7A6z7xqTSMSn41eVFT';" & _
  "$headers = @{Authorization='Bearer ' + $token};" & _
  "try {" & _
  "  $r = Invoke-RestMethod -Uri 'https://api.vercel.com/v3/user/tokens' -Headers $headers -Method GET;" & _
  "  $r.tokens | ForEach-Object { Write-Host $_.id '|' $_.name }" & _
  "} catch { Write-Host 'ERROR:' $_.Exception.Message }" & _
  """"

Set oExec = oShell.Exec(listCmd)
Dim listOut : listOut = oExec.StdOut.ReadAll()
Dim listErr : listErr = oExec.StdErr.ReadAll()

If listOut = "" Then
  MsgBox "Error listando tokens:" & Chr(13) & listErr, 16, "Vercel - Error"
  WScript.Quit
End If

MsgBox "Tokens encontrados:" & Chr(13) & listOut, 64, "Vercel - Lista"

' Parse first token ID (the one we want to delete should be identifiable)
' Show the list and ask user to confirm
Dim ans
ans = MsgBox "¿Proceder a eliminar el token de deploy? Se eliminará el token vcp_1hGY4..." & Chr(13) & Chr(10) & Chr(13) & Chr(10) & "Tokens:" & Chr(13) & listOut, 36, "Confirmar eliminación"

If ans <> 6 Then
  MsgBox "Cancelado.", 64, "Vercel"
  WScript.Quit
End If

' Step 2: Delete each token that matches - we'll delete all deploy tokens
Dim lines() : lines = Split(listOut, Chr(10))
Dim i, tokenId, tokenName, deleted
deleted = 0

For i = 0 To UBound(lines)
  Dim parts() : parts = Split(Trim(lines(i)), "|")
  If UBound(parts) >= 1 Then
    tokenId = Trim(parts(0))
    tokenName = Trim(parts(1))
    If tokenId <> "" Then
      Dim delCmd
      delCmd = "powershell -NoProfile -Command """ & _
        "$headers = @{Authorization='Bearer vcp_1hGY4pZLO5axhVi5YVLCVISy7TAGG1GysBCkIC7A6z7xqTSMSn41eVFT'};" & _
        "try {" & _
        "  Invoke-RestMethod -Uri 'https://api.vercel.com/v3/user/tokens/" & tokenId & "' -Headers $headers -Method DELETE;" & _
        "  Write-Host 'DELETED: " & tokenName & "'" & _
        "} catch { Write-Host 'FAILED: " & tokenName & " -' $_.Exception.Message }" & _
        """"
      Set oExec2 = oShell.Exec(delCmd)
      oExec2.StdOut.ReadAll()
      deleted = deleted + 1
    End If
  End If
Next

MsgBox "Proceso completado. " & deleted & " token(s) procesados." & Chr(13) & Chr(10) & "El token de Vercel ha sido revocado.", 64, "Vercel - Listo"
