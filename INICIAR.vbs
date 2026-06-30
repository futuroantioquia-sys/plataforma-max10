Dim fso, bat, sh
Set fso = CreateObject("Scripting.FileSystemObject")

' Borrar next.config.ts si existe (Next.js 14 no soporta .ts)
Dim tsConfig
tsConfig = "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend\next.config.ts"
If fso.FileExists(tsConfig) Then
    fso.DeleteFile tsConfig
End If

Set bat = fso.CreateTextFile("C:\Users\Lenovo\temp_iniciar.bat", True)
bat.WriteLine "@echo off"
bat.WriteLine "title Futuro Antioquia - Servidor"
bat.WriteLine "echo."
bat.WriteLine "echo ====================================="
bat.WriteLine "echo  FUTURO ANTIOQUIA - npm run dev"
bat.WriteLine "echo ====================================="
bat.WriteLine "echo."
bat.WriteLine "cd /d ""C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"""
bat.WriteLine "echo Instalando dependencias nuevas (xlsx)..."
bat.WriteLine "npm install --silent"
bat.WriteLine "echo."
bat.WriteLine "echo Iniciando servidor en http://localhost:3000"
bat.WriteLine "echo Si hay error, NO cierres esta ventana."
bat.WriteLine "echo."
bat.WriteLine "npm run dev"
bat.WriteLine "echo."
bat.WriteLine "echo === SERVIDOR DETENIDO - Revisa el error arriba ==="
bat.WriteLine "pause"
bat.Close

Set sh = CreateObject("WScript.Shell")
sh.Run "cmd.exe /k C:\Users\Lenovo\temp_iniciar.bat", 1, False
