# 1 "C:\\Users\\z003a0vy\\AppData\\Local\\Temp\\tmplyr6fzst"
#include <Arduino.h>
# 1 "C:/Users/z003a0vy/source/repos/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
# 21 "C:/Users/z003a0vy/source/repos/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
#include "src/Grbl.h"
void setup();
void loop();
#line 23 "C:/Users/z003a0vy/source/repos/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
void setup() {
    grbl_init();
}

void loop() {
  _mc_task_init();

  while(1) {

    run_once();

  }
}