cmd.exe /c bin2c -o NoFile.h -m index.html.gz

Powershell -Command "(Get-Content .\NoFile.h -Raw) -Replace '\/\* Generated by bin2c, do not edit manually \*\/','#pragma once' | Set-Content .\NoFile.h"
Powershell -Command "(Get-Content .\NoFile.h -Raw) -Replace '#define index_html_gz_size','const int PAGE_NOFILES_SIZE =' | Set-Content .\NoFile.h"
Powershell -Command "(Get-Content .\NoFile.h -Raw) -Replace '([0-9].*$)','($1)\\n' | Set-Content .\NoFile.h"
Powershell -Command "(Get-Content .\NoFile.h -Raw) -Replace 'const unsigned char index_html_gz','const char PAGE_NOFILES' | Set-Content .\NoFile.h"
Powershell -Command "(Get-Content .\NoFile.h -Raw) -Replace '] = {','] PROGMEM = {' | Set-Content .\NoFile.h"
Powershell -Command "& Get-Content NoFile.h | Set-Content ../Grbl_Esp32/src/webui/NoFile.h"

del NoFile.h