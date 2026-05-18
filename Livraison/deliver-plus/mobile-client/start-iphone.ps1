$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.100.10"
Write-Host "✅ IP forcée : $env:REACT_NATIVE_PACKAGER_HOSTNAME" -ForegroundColor Green
npx expo start --lan
