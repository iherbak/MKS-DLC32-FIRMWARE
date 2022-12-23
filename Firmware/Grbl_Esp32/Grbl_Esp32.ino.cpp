# 1 "C:\\Users\\iherb\\AppData\\Local\\Temp\\tmp1ah1jrik"
#include <Arduino.h>
# 1 "C:/Git/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
# 21 "C:/Git/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
#include "src/Grbl.h"
void setup();
void loop();
#line 23 "C:/Git/MKS-DLC32-FIRMWARE/Firmware/Grbl_Esp32/Grbl_Esp32.ino"
void setup() {
    grbl_init();
}

void loop() {
  _mc_task_init();
  run_once();
}