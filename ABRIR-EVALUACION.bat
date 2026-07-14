@echo off
set SRC=C:\Users\Lenovo\AppData\Roaming\Claude\local-agent-mode-sessions\00b95f38-4a4c-425d-b8f1-63b25e9096d8\b0a5efbf-c6c5-40f3-8a80-2a40c6e48811\local_309611f0-438c-4868-a43e-b85c7202967a\uploads\evaluación futuro antioquia 2026.xlsx
set DST=C:\Users\Lenovo\Desktop\evaluacion_temp.xlsx
copy "%SRC%" "%DST%" /y
if exist "%DST%" (
    start "" "%DST%"
) else (
    echo No se encontro el archivo en la ruta de uploads.
    echo Verifica que el archivo fue subido correctamente.
    pause
)
