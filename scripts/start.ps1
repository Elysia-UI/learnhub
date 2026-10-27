$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'node_modules')) { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络连接。' } }
Write-Host 'LearnHub 启动完成后会自动打开：http://127.0.0.1:5173/'
npm.cmd run start
