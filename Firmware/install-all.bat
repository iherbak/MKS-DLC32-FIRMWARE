@echo off

set EsptoolPath=..\esptool\esptool.exe
set BuildDir=.pio\build\release
set BaseArgs=--chip esp32 --baud 921600
set SetupArgs=--before default_reset --after hard_reset write_flash -z --flash_mode keep --flash_freq keep --flash_size detect --erase-all

set Bootloader=0x1000 common\bootloader_dout_40m.bin
set Bootapp=0xe000 common\boot_app0.bin
set Firmware=0x10000 %BuildDir%\firmware.bin
set Partitions=0x8000 %BuildDir%\partitions.bin
set Spiffs=0x310000 %BuildDir%\spiffs.bin

echo %EsptoolPath% %BaseArgs% %SetupArgs% %Bootloader% %Bootapp% %Firmware% %Partitions% %Spiffs%
%EsptoolPath% %BaseArgs% %SetupArgs% %Bootloader% %Bootapp% %Partitions% %Firmware% %Spiffs%

pause
