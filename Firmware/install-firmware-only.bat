@echo off

set EsptoolPath=..\esptool\esptool.exe
set BuildDir=.pio\build\release
set BaseArgs=--chip esp32 --baud 921600
set SetupArgs=--before default_reset --after hard_reset write_flash -z --flash_mode keep --flash_freq keep --flash_size detect

set Firmware=0x10000 %BuildDir%\firmware.bin

echo %EsptoolPath% %BaseArgs% %SetupArgs% %Firmware%
%EsptoolPath% %BaseArgs% %SetupArgs% %Firmware%

pause
