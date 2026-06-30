Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
objShell.Run "cmd /k npm run dev", 1, False
