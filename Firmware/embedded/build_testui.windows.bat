cmd.exe /c npm install
cmd.exe /c npm audit fix
cmd.exe /c npm audit
cmd.exe /c gulp package2test
cmd.exe /c bin2c -o embedded.h -m index.html.gz

Powershell -Command "& Get-Content .\header.txt,.\embedded.h,.\footer.txt | Set-Content .\out.h"

Powershell -Command "(Get-Content .\out.h -Raw) -Replace 'index_html_gz_size','PAGE_NOFILES_SIZE' | Set-Content .\out.h"
Powershell -Command "(Get-Content .\out.h -Raw) -Replace 'const unsigned char index_html_gz','const char PAGE_NOFILES' | Set-Content .\out.h"
Powershell -Command "(Get-Content .\out.h -Raw) -Replace '] = {','] PROGMEM = {' | Set-Content .\out.h"
Powershell -Command "& Get-Content out.h | Set-Content ../Grbl_Esp32/nofile.h"

del out.h