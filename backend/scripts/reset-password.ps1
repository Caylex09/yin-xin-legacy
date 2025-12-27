# 重置用户密码脚本 (PowerShell)
# 用法: .\scripts\reset-password.ps1 <username> <new-password>

param(
    [Parameter(Mandatory=$true)]
    [string]$Username,
    
    [Parameter(Mandatory=$true)]
    [string]$NewPassword
)

# 进入 backend 目录
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $scriptPath ".."
Set-Location $backendPath

# 使用 tsx 直接运行 TypeScript 文件
npx tsx scripts/reset-password.ts $Username $NewPassword

