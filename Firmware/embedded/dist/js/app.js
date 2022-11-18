//alert dialog
function alertdlg(titledlg, textdlg, closefunc) {
    var modal = setactiveModal('alertdlg.html', closefunc);
    if (modal == null) return;
    var title = modal.element.getElementsByClassName("modal-title")[0];
    var body = modal.element.getElementsByClassName("modal-text")[0];
    title.innerHTML = titledlg;
    body.innerHTML = textdlg;
    showModal();
}
var ESP3D_authentication = false;
var page_id = "";
var convertDHT2Fahrenheit = false;
var ws_source;
var event_source;
var log_off = false;
var async_webcommunication = false;
var websocket_port = 0;
var websocket_ip = "";
var esp_hostname = "ESP3D WebUI";
var EP_HOSTNAME;
var EP_STA_SSID;
var EP_STA_PASSWORD;
var EP_STA_IP_MODE;
var EP_STA_IP_VALUE;
var EP_STA_GW_VALUE;
var EP_STA_MK_VALUE;
var EP_WIFI_MODE;
var EP_AP_SSID;
var EP_AP_PASSWORD;
var EP_AP_IP_VALUE;
var EP_BAUD_RATE = 112;
var EP_AUTH_TYPE = 119;
var EP_TARGET_FW = 461;
var EP_IS_DIRECT_SD = 850;
var EP_PRIMARY_SD = 851;
var EP_SECONDARY_SD = 852;
var EP_DIRECT_SD_CHECK = 853;
var SETTINGS_AP_MODE = 1;
var SETTINGS_STA_MODE = 2;
var interval_ping = -1;
var last_ping = 0;
var enable_ping = true;
var esp_error_message = "";
var esp_error_code = 0;

function beep(duration, frequency) {
  var audioCtx;
  if (typeof window.AudioContext !== "undefined") {
    audioCtx = new window.AudioContext();
  } else if (typeof window.webkitAudioContext() !== "undefined") {
    audioCtx = new window.webkitAudioContext();
  } else if (typeof window.audioContext !== "undefined") {
    audioCtx = new window.audioContext();
  }
  // = new (window.AudioContext() || window.webkitAudioContext() || window.audioContext());
  var oscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  gainNode.gain.value = 1;
  oscillator.frequency.value = frequency;
  oscillator.start();
  setTimeout(function () {
    oscillator.stop();
  }, duration);
}

function Init_events(e) {
  page_id = e.data;
  console.log("connection id = " + page_id);
}

function ActiveID_events(e) {
  if (page_id != e.data) {
    Disable_interface();
    console.log("I am disabled");
    event_source.close();
  }
}

function DHT_events(e) {
  Handle_DHT(e.data);
}
//Check for IE
//Edge
//Chrome
function browser_is(bname) {
  var ua = navigator.userAgent;
  switch (bname) {
    case "IE":
      if (ua.indexOf("Trident/") != -1) return true;
      break;
    case "Edge":
      if (ua.indexOf("Edge") != -1) return true;
      break;
    case "Chrome":
      if (ua.indexOf("Chrome") != -1) return true;
      break;
    case "Firefox":
      if (ua.indexOf("Firefox") != -1) return true;
      break;
    case "MacOSX":
      if (ua.indexOf("Mac OS X") != -1) return true;
      break;
    default:
      return false;
  }
  return false;
}

window.onload = function () {
  //to check if javascript is disabled like in anroid preview
  document.getElementById("loadingmsg").style.display = "none";
  console.log("Connect to board");
  connectdlg();
  //ugly hack for IE
  console.log(navigator.userAgent);
  if (browser_is("IE")) {
    document.getElementById("control-body").className = "panel-body";
    document.getElementById("extruder-body").className =
      "panel-body panel-height";
    document.getElementById("command-body").className = "panel-body";
    document.getElementById("file-body").className =
      "panel-body panel-height panel-max-height panel-scroll";
  }
};

var wsmsg = "";

function startSocket() {
  try {
    if (async_webcommunication) {
      ws_source = new WebSocket("ws://" + document.location.host + "/ws", [
        "arduino",
      ]);
    } else {
      console.log("Socket is " + websocket_ip + ":" + websocket_port);
      ws_source = new WebSocket("ws://" + websocket_ip + ":" + websocket_port, [
        "arduino",
      ]);
    }
  } catch (exception) {
    console.error(exception);
  }
  ws_source.binaryType = "arraybuffer";
  ws_source.onopen = function (e) {
    console.log("Connected");
  };
  ws_source.onclose = function (e) {
    console.log("Disconnected");
    //seems sometimes it disconnect so wait 3s and reconnect
    //if it is not a log off
    if (!log_off) setTimeout(startSocket, 3000);
  };
  ws_source.onerror = function (e) {
    //Monitor_output_Update("[#]Error "+ e.code +" " + e.reason + "\n");
    console.log("ws error", e);
  };
  ws_source.onmessage = function (e) {
    var msg = "";
    //bin
    if (e.data instanceof ArrayBuffer) {
      var bytes = new Uint8Array(e.data);
      for (var i = 0; i < bytes.length; i++) {
        msg += String.fromCharCode(bytes[i]);
        if (bytes[i] == 10 || bytes[i] == 13) {
          wsmsg += msg;
          Monitor_output_Update(wsmsg);
          process_socket_response(wsmsg);
          //msg = wsmsg.replace("\n", "");
          //wsmsg = msg.replace("\r", "");
          if (
            !(
              wsmsg.startsWith("ok T:") ||
              wsmsg.startsWith("X:") ||
              wsmsg.startsWith("FR:") ||
              wsmsg.startsWith("echo:E0 Flow")
            )
          )
            console.log(wsmsg);
          wsmsg = "";
          msg = "";
        }
      }
      wsmsg += msg;
    } else {
      msg += e.data;
      var tval = msg.split(":");
      if (tval.length >= 2) {
        if (tval[0] == "CURRENT_ID") {
          page_id = tval[1];
          console.log("connection id = " + page_id);
        }
        if (enable_ping) {
          if (tval[0] == "PING") {
            page_id = tval[1];
            console.log("ping from id = " + page_id);
            last_ping = Date.now();
            if (interval_ping == -1)
              interval_ping = setInterval(function () {
                check_ping();
              }, 10 * 1000);
          }
        }
        if (tval[0] == "ACTIVE_ID") {
          if (page_id != tval[1]) {
            Disable_interface();
          }
        }
        if (tval[0] == "DHT") {
          Handle_DHT(tval[1]);
        }
        if (tval[0] == "ERROR") {
          esp_error_message = tval[2];
          esp_error_code = tval[1];
          console.log("ERROR: " + tval[2] + " code:" + tval[1]);
          CancelCurrentUpload();
        }
        if (tval[0] == "MSG") {
          var error_message = tval[2];
          var error_code = tval[1];
          console.log("MSG: " + tval[2] + " code:" + tval[1]);
        }
      }
    }
    //console.log(msg);
  };
}

function check_ping() {
  //if ((Date.now() - last_ping) > 20000){
  //Disable_interface(true);
  //console.log("No heart beat for more than 20s");
  //}
}

function disable_items(item, state) {
  var liste = item.getElementsByTagName("*");
  for (i = 0; i < liste.length; i++) liste[i].disabled = state;
}

function ontogglePing(forcevalue) {
  if (typeof forcevalue != "undefined") enable_ping = forcevalue;
  else enable_ping = !enable_ping;
  if (enable_ping) {
    if (interval_ping != -1) clearInterval(interval_ping);
    last_ping = Date.now();
    interval_ping = setInterval(function () {
      check_ping();
    }, 10 * 1000);
    console.log("enable ping");
  } else {
    if (interval_ping != -1) clearInterval(interval_ping);
    console.log("disable ping");
  }
}

function ontoggleLock(forcevalue) {
  if (typeof forcevalue != "undefined")
    document.getElementById("lock_UI").checked = forcevalue;
  if (document.getElementById("lock_UI").checked) {
    document.getElementById("lock_UI_btn_txt").innerHTML =
      translate_text_item("Unlock interface");
    disable_items(document.getElementById("maintab"), true);
    disable_items(document.getElementById("configtab"), true);
    document.getElementById("progress_btn").disabled = false;
    document.getElementById("clear_monitor_btn").disabled = false;
    document.getElementById("monitor_enable_verbose_mode").disabled = false;
    document.getElementById("monitor_enable_autoscroll").disabled = false;
    document.getElementById("settings_update_fw_btn").disabled = true;
    document.getElementById("settings_restart_btn").disabled = true;
    disable_items(document.getElementById("JogUI"), false);
    document.getElementById("JogUI").style.pointerEvents = "none";
  } else {
    document.getElementById("lock_UI_btn_txt").innerHTML =
      translate_text_item("Lock interface");
    disable_items(document.getElementById("maintab"), false);
    disable_items(document.getElementById("configtab"), false);
    document.getElementById("settings_update_fw_btn").disabled = false;
    document.getElementById("settings_restart_btn").disabled = false;
    document.getElementById("JogUI").style.pointerEvents = "auto";
  }
}

function Handle_DHT(data) {
  var tdata = data.split(" ");
  if (tdata.length != 2) {
    console.log("DHT data invalid: " + data);
    return;
  }
  var temp = convertDHT2Fahrenheit ? parseFloat(tdata[0]) * 1.8 + 32 : parseFloat(tdata[0]);
  document.getElementById("DHT_humidity").innerHTML =
    parseFloat(tdata[1]).toFixed(2).toString() + "%";
  var temps = temp.toFixed(2).toString() + "&deg;";
  if (convertDHT2Fahrenheit) temps += "F";
  else temps += "C";
  document.getElementById("DHT_temperature").innerHTML = temps;
}
//window.addEventListener("resize", OnresizeWindow);

//function OnresizeWindow(){
//}
var total_boot_steps = 5;
var current_boot_steps = 0;

function display_boot_progress(step) {
  var val = 1;
  if (typeof step != "undefined") val = step;
  current_boot_steps += val;
  //console.log(current_boot_steps);
  //console.log(Math.round((current_boot_steps*100)/total_boot_steps));
  document.getElementById("load_prg").value = Math.round(
    (current_boot_steps * 100) / total_boot_steps
  );
}

function Disable_interface(lostconnection) {
  var lostcon = false;
  if (typeof lostconnection != "undefined") lostcon = lostconnection;
  //block all communication
  http_communication_locked = true;
  log_off = true;
  if (interval_ping != -1) clearInterval(interval_ping);
  //clear all waiting commands
  clear_cmd_list();
  //no camera
  document.getElementById("camera_frame").src = "";
  //No auto check
  on_autocheck_position(false);
  on_autocheck_temperature(false);
  on_autocheck_status(false);
  if (async_webcommunication) {
    event_source.removeEventListener("ActiveID", ActiveID_events, false);
    event_source.removeEventListener("InitID", Init_events, false);
    event_source.removeEventListener("DHT", DHT_events, false);
  }
  ws_source.close();
  document.title += "(" + decode_entitie(translate_text_item("Disabled")) + ")";
  UIdisableddlg(lostcon);
}

function update_UI_firmware_target() {
  var fwName;
  initpreferences();
  document.getElementById("control_x_position_label").innerHTML = "X";
  document.getElementById("control_y_position_label").innerHTML = "Y";
  document.getElementById("control_z_position_label").innerHTML = "Z";
  document.getElementById("config_smoothie_nav").style.display = "none";
  showAxiscontrols();
  if (target_firmware == "repetier") {
    fwName = "Repetier";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "repetier4davinci") {
    fwName = "Repetier for Davinci";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "smoothieware") {
    fwName = "Smoothieware";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("config_smoothie_nav").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "grbl-embedded") {
    fwName = "GRBL ESP32";
    last_grbl_pos = "";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "none";
    document.getElementById("progress_btn").style.display = "none";
    document.getElementById("abort_btn").style.display = "none";
    document.getElementById("motor_off_control").style.display = "none";
    document.getElementById("tab_title_configuration").innerHTML =
      "<span translate>GRBL configuration</span>";
    document.getElementById("tab_printer_configuration").innerHTML =
      "<span translate>GRBL</span>";
    document.getElementById("files_input_file").accept =
      " .g, .gco, .gcode, .txt, .ncc, .G, .GCO, .GCODE, .TXT, .NC";
    document.getElementById("zero_xyz_btn").style.display = "block";
    document.getElementById("zero_x_btn").style.display = "block";
    document.getElementById("zero_y_btn").style.display = "block";
    if (grblaxis > 2) {
      //document.getElementById('control_z_position_display').style.display = 'block';
      document.getElementById("control_z_position_label").innerHTML = "Zw";
      document.getElementById("zero_xyz_btn_txt").innerHTML += "Z";
      grblzerocmd += " Z0";
    } else {
      hideAxiscontrols();
      document.getElementById(
        "preferences_control_z_velocity_group"
      ).style.display = "none";
    }
    if (grblaxis > 3) {
      document.getElementById("zero_xyz_btn_txt").innerHTML += "A";
      grblzerocmd += " A0";
      build_axis_selection();
      document.getElementById(
        "preferences_control_a_velocity_group"
      ).style.display = "block";
      document.getElementById("positions_labels2").style.display =
        "inline-grid";
      document.getElementById("control_a_position_display").style.display =
        "block";
    }
    if (grblaxis > 4) {
      document.getElementById("control_b_position_display").style.display =
        "block";
      document.getElementById("zero_xyz_btn_txt").innerHTML += "B";
      grblzerocmd += " B0";
      document.getElementById(
        "preferences_control_b_velocity_group"
      ).style.display = "block";
    }
    if (grblaxis > 5) {
      document.getElementById("control_c_position_display").style.display =
        "block";
      document.getElementById("zero_xyz_btn_txt").innerHTML += "C";
      document.getElementById(
        "preferences_control_c_velocity_group"
      ).style.display = "block";
    } else {
      document.getElementById("control_c_position_display").style.display =
        "none";
    }
    document.getElementById("grblPanel").style.display = "flex";
    document.getElementById("FW_github").href =
      "https://github.com/bdring/Grbl_Esp32";
    document.getElementById("settings_filters").style.display = "none";
    document.getElementById("control_x_position_label").innerHTML = "Xw";
    document.getElementById("control_y_position_label").innerHTML = "Yw";
  } else if (target_firmware == "marlin-embedded") {
    fwName = "Marlin ESP32";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("FW_github").href =
      "https://github.com/MarlinFirmware/Marlin";
    document.getElementById("settings_filters").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "marlin") {
    fwName = "Marlin";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "marlinkimbra") {
    fwName = "Marlin Kimbra";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("auto_check_control").style.display = "flex";
    document.getElementById("motor_off_control").style.display = "table-row";
    document.getElementById("progress_btn").style.display = "table-row";
    document.getElementById("abort_btn").style.display = "table-row";
    document.getElementById("zero_xyz_btn").style.display = "none";
    document.getElementById("zero_x_btn").style.display = "none";
    document.getElementById("zero_y_btn").style.display = "none";
    document.getElementById("zero_z_btn").style.display = "none";
    document.getElementById("grblPanel").style.display = "none";
    document.getElementById("control_xm_position_row").style.display = "none";
    document.getElementById("control_ym_position_row").style.display = "none";
    document.getElementById("control_zm_position_row").style.display = "none";
  } else if (target_firmware == "grbl") {
    fwName = "Grbl";
    document.getElementById("configtablink").style.display = "block";
    document.getElementById("tab_title_configuration").innerHTML =
      "<span translate>GRBL configuration</span>";
    document.getElementById("tab_printer_configuration").innerHTML =
      "<span translate>GRBL</span>";
    document.getElementById("files_input_file").accept =
      " .g, .gco, .gcode, .txt, .ncc, .G, .GCO, .GCODE, .TXT, .NC";
    document.getElementById("auto_check_control").style.display = "none";
    document.getElementById("motor_off_control").style.display = "none";
    document.getElementById("progress_btn").style.display = "none";
    document.getElementById("abort_btn").style.display = "none";
    document.getElementById("zero_xyz_btn").style.display = "block";
    document.getElementById("zero_x_btn").style.display = "block";
    document.getElementById("zero_y_btn").style.display = "block";
    document.getElementById("zero_z_btn").style.display = "block";
    document.getElementById("grblPanel").style.display = "flex";
    document.getElementById("control_x_position_label").innerHTML = "Xw";
    document.getElementById("control_y_position_label").innerHTML = "Yw";
    document.getElementById("control_z_position_label").innerHTML = "Zw";
    document.getElementById("control_xm_position_row").style.display =
      "table-row";
    document.getElementById("control_ym_position_row").style.display =
      "table-row";
    document.getElementById("control_zm_position_row").style.display =
      "table-row";
  } else {
    fwName = "Unknown";
    document.getElementById("configtablink").style.display = "none";
  }
  if (target_firmware == "grbl-embedded") {
    EP_HOSTNAME = "System/Hostname";
    EP_STA_SSID = "Sta/SSID";
    EP_STA_PASSWORD = "Sta/Password";
    EP_STA_IP_MODE = "Sta/IPMode";
    EP_STA_IP_VALUE = "Sta/IP";
    EP_STA_GW_VALUE = "Sta/Gateway";
    EP_STA_MK_VALUE = "Sta/Netmask";
    EP_WIFI_MODE = "Radio/Mode";
    EP_AP_SSID = "AP/SSID";
    EP_AP_PASSWORD = "AP/Password";
    EP_AP_IP_VALUE = "AP/IP";
    SETTINGS_AP_MODE = 2;
    SETTINGS_STA_MODE = 1;
  } else if (target_firmware == "marlin-embedded") {
    EP_HOSTNAME = "ESP_HOSTNAME";
    EP_STA_SSID = "STA_SSID";
    EP_STA_PASSWORD = "STA_PWD";
    EP_STA_IP_MODE = "STA_IP_MODE";
    EP_STA_IP_VALUE = "STA_IP";
    EP_STA_GW_VALUE = "STA_GW";
    EP_STA_MK_VALUE = "STA_MK";
    EP_WIFI_MODE = "WIFI_MODE";
    EP_AP_SSID = "AP_SSID";
    EP_AP_PASSWORD = "AP_PWD";
    EP_AP_IP_VALUE = "AP_IP";
    SETTINGS_AP_MODE = 2;
    SETTINGS_STA_MODE = 1;
  } else {
    EP_HOSTNAME = 130;
    EP_STA_SSID = 1;
    EP_STA_PASSWORD = 34;
    EP_STA_IP_MODE = 99;
    EP_STA_IP_VALUE = 100;
    EP_STA_MK_VALUE = 104;
    EP_STA_GW_VALUE = 108;
    EP_WIFI_MODE = 0;
    EP_AP_SSID = 218;
    EP_AP_PASSWORD = 251;
    EP_AP_IP_VALUE = 316;
    SETTINGS_AP_MODE = 1;
    SETTINGS_STA_MODE = 2;
  }
  if (typeof document.getElementById("fwName") != "undefined")
    document.getElementById("fwName").innerHTML = fwName;
  //SD image or not
  if (direct_sd && typeof document.getElementById("showSDused") != "undefined")
    document.getElementById("showSDused").innerHTML =
      "<svg width='1.3em' height='1.2em' viewBox='0 0 1300 1200'><g transform='translate(50,1200) scale(1, -1)'><path  fill='#777777' d='M200 1100h700q124 0 212 -88t88 -212v-500q0 -124 -88 -212t-212 -88h-700q-124 0 -212 88t-88 212v500q0 124 88 212t212 88zM100 900v-700h900v700h-900zM500 700h-200v-100h200v-300h-300v100h200v100h-200v300h300v-100zM900 700v-300l-100 -100h-200v500h200z M700 700v-300h100v300h-100z' /></g></svg>";
  else document.getElementById("showSDused").innerHTML = "";
  return fwName;
}

function Set_page_title(page_title) {
  if (typeof page_title != "undefined") esp_hostname = page_title;
  document.title = esp_hostname;
}

function initUI() {
  console.log("Init UI");
  if (ESP3D_authentication) connectdlg(false);
  AddCmd(display_boot_progress);
  //initial check
  if (
    typeof target_firmware == "undefined" ||
    typeof web_ui_version == "undefined" ||
    typeof direct_sd == "undefined"
  )
    alert("Missing init data!");
  //check FW
  update_UI_firmware_target();
  //set title using hostname
  Set_page_title();
  //update UI version
  if (typeof document.getElementById("UI_VERSION") != "undefined")
    document.getElementById("UI_VERSION").innerHTML = web_ui_version;
  //update FW version
  if (typeof document.getElementById("FW_VERSION") != "undefined")
    document.getElementById("FW_VERSION").innerHTML = fw_version;
  // Get the element with id="defaultOpen" and click on it
  document.getElementById("maintablink").click();
  if (target_firmware == "grbl-embedded" || target_firmware == "grbl") {
    if (typeof document.getElementById("grblcontroltablink") !== "undefined") {
      document.getElementById("grblcontroltablink").click();
    }
  }
  //removeIf(production)
  console.log(JSON.stringify(translated_list));
  //endRemoveIf(production)
  initUI_2();
}

function initUI_2() {
  AddCmd(display_boot_progress);
  //get all settings from ESP3D
  console.log("Get settings");
  //query settings but do not update list in case wizard is showed
  refreshSettings(true);
  initUI_3();
}

function initUI_3() {
  AddCmd(display_boot_progress);
  //init panels
  console.log("Get macros");
  init_controls_panel();
  init_grbl_panel();
  console.log("Get preferences");
  getpreferenceslist();
  initUI_4();
}

function initUI_4() {
  AddCmd(display_boot_progress);
  init_temperature_panel();
  init_extruder_panel();
  init_command_panel();
  init_files_panel(false);
  //check if we need setup
  if (target_firmware == "???") {
    console.log("Launch Setup");
    AddCmd(display_boot_progress);
    closeModal("Connection successful");
    setupdlg();
  } else {
    //wizard is done UI can be updated
    setup_is_done = true;
    do_not_build_settings = false;
    AddCmd(display_boot_progress);
    build_HTML_setting_list(current_setting_filter);
    AddCmd(closeModal);
    AddCmd(show_main_UI);
  }
}

function show_main_UI() {
  document.getElementById("main_ui").style.display = "block";
}

function compareStrings(a, b) {
  // case-insensitive comparison
  a = a.toLowerCase();
  b = b.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareInts(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function HTMLEncode(str) {
  var i = str.length,
    aRet = [];

  while (i--) {
    var iC = str[i].charCodeAt();
    if (iC < 65 || iC > 127 || (iC > 90 && iC < 97)) {
      if (iC == 65533) iC = 176;
      aRet[i] = "&#" + iC + ";";
    } else {
      aRet[i] = str[i];
    }
  }
  return aRet.join("");
}

function decode_entitie(str_text) {
  var tmpelement = document.createElement("div");
  tmpelement.innerHTML = str_text;
  str_text = tmpelement.textContent;
  tmpelement.textContent = "";
  return str_text;
}

var socket_response = "";
var socket_is_settings = false;

function process_socket_response(msg) {
  if (target_firmware == "grbl-embedded" || target_firmware == "grbl") {
    if (msg.startsWith("<")) {
      grbl_process_status(msg);
    } else if (msg.startsWith("[PRB:")) {
      grbl_GetProbeResult(msg);
    } else if (msg.startsWith("[GC:")) {
      console.log(msg);
    } else if (
      msg.startsWith("error:") ||
      msg.startsWith("ALARM:") ||
      msg.startsWith("Hold:") ||
      msg.startsWith("Door:")
    ) {
      grbl_process_msg(msg);
    } else if (msg.startsWith("Grbl 1.1f [")) {
      grbl_reset_detected(msg);
    } else if (socket_is_settings) socket_response += msg;

    if (!socket_is_settings && msg.startsWith("$0=")) {
      socket_is_settings = true;
      socket_response = msg;
    }

    if (msg.startsWith("ok")) {
      if (socket_is_settings) {
        //update settings
        getESPconfigSuccess(socket_response);
        socket_is_settings = false;
      }
    }
  } else {
    if (target_firmware == "marlin-embedded") {
      if (
        socket_is_settings &&
        !(
          msg.startsWith("echo:Unknown command:") ||
          msg.startsWith("echo:enqueueing")
        )
      )
        socket_response += msg + "\n";
      if (
        !socket_is_settings &&
        (msg.startsWith("  G21") ||
          msg.startsWith("  G20") ||
          msg.startsWith("echo:  G21") ||
          msg.startsWith("echo:  G20") ||
          msg.startsWith("echo:; Linear Units:"))
      ) {
        socket_is_settings = true;
        socket_response = msg + "\n";
        //to stop waiting for data
        console.log("Got settings Start");
      }
    }
    if (
      msg.startsWith("ok T:") ||
      msg.startsWith(" T:") ||
      msg.startsWith("T:")
    ) {
      if (!graph_started) start_graph_output();
      process_Temperatures(msg);
    }
    if (msg.startsWith("X:")) {
      process_Position(msg);
    }
    if (msg.startsWith("FR:")) {
      process_feedRate(msg);
    }

    if (msg.startsWith("echo:E") && msg.indexOf("Flow:") != -1) {
      process_flowdRate(msg);
    }

    if (msg.startsWith("[esp3d]")) {
      process_Custom(msg); // handles custom messages sent via M118
    }
    if (msg.startsWith("ok")) {
      if (socket_is_settings) {
        //update settings
        console.log("Got settings End");
        console.log(socket_response);
        getESPconfigSuccess(socket_response);
        socket_is_settings = false;
      }
    }
  }
}

function cameraformataddress() {
    var saddress = document.getElementById('camera_webaddress').value;
    var saddressl = saddress.trim().toLowerCase();
    saddress = saddress.trim();
    if (saddress.length > 0) {
        if (!(saddressl.indexOf("https://") != -1 || saddressl.indexOf("http://") != -1 || saddressl.indexOf("rtp://") != -1 || saddressl.indexOf("rtps://") != -1 || saddressl.indexOf("rtp://") != -1)) {
            saddress = "http://" + saddress;
        }
    }
    document.getElementById('camera_webaddress').value = saddress;
}

function camera_loadframe() {
    var saddress = document.getElementById('camera_webaddress').value;
    saddress = saddress.trim();
    if (saddress.length == 0) {
        document.getElementById('camera_frame').src = "";
        document.getElementById('camera_frame_display').style.display = "none";
        document.getElementById('camera_detach_button').style.display = "none";
    } else {
        cameraformataddress();
        document.getElementById('camera_frame').src = document.getElementById('camera_webaddress').value;
        document.getElementById('camera_frame_display').style.display = "block";
        document.getElementById('camera_detach_button').style.display = "table-row";
    }
}

function camera_OnKeyUp(event) {
    if (event.keyCode == 13) {
        camera_loadframe();
    }
    return true;
}


function camera_saveaddress() {
    cameraformataddress();
    preferenceslist[0].camera_address = HTMLEncode(document.getElementById('camera_webaddress').value);
    SavePreferences(true);
}

function camera_detachcam() {
    var webaddress = document.getElementById('camera_frame').src;
    document.getElementById('camera_frame').src = "";
    document.getElementById('camera_frame_display').style.display = "none";
    document.getElementById('camera_detach_button').style.display = "none";
    window.open(webaddress);
}

function camera_GetAddress() {
    if (typeof(preferenceslist[0].camera_address) !== 'undefined') {
        document.getElementById('camera_webaddress').value = decode_entitie(preferenceslist[0].camera_address);
    } else document.getElementById('camera_webaddress').value = "";
}
var CustomCommand_history = [];
var CustomCommand_history_index = -1;
var Monitor_output = [];

function init_command_panel() {

}

function Monitor_output_autoscrollcmd() {
    document.getElementById('cmd_content').scrollTop = document.getElementById('cmd_content').scrollHeight;
}

function Monitor_check_autoscroll() {
    if (document.getElementById('monitor_enable_autoscroll').checked == true) Monitor_output_autoscrollcmd();
}

function Monitor_check_verbose_mode() {
    Monitor_output_Update();
}

function Monitor_output_Clear() {
    Monitor_output = [];
    Monitor_output_Update();
}

function Monitor_output_Update(message) {
    if (message) {
        if (typeof message === 'string' || message instanceof String) {
            Monitor_output = Monitor_output.concat(message);
        } else {
            try {
                var msg = JSON.stringify(message, null, " ");
                Monitor_output = Monitor_output.concat(msg + "\n");
            } catch (err) {
                Monitor_output = Monitor_output.concat(message.toString() + "\n");
            }
        }
        Monitor_output = Monitor_output.slice(-300);
    }
    var regex = /ok T:/g;

    if (target_firmware == "repetier" || target_firmware == "repetier4davinci") {
        regex = /T:/g;
    }
    var output = "";
    var Monitor_outputLength = Monitor_output.length;
    var isverbosefilter = document.getElementById("monitor_enable_verbose_mode").checked;
    for (var i = 0; i < Monitor_outputLength; i++) {
        //Filter the output  
        if ((Monitor_output[i].trim().toLowerCase().startsWith("ok")) && !isverbosefilter) continue;
        if ((Monitor_output[i].trim().toLowerCase() == "wait") && !isverbosefilter) continue;
        if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
            //no status
            if ((Monitor_output[i].startsWith("<") || Monitor_output[i].startsWith("[echo:")) && !isverbosefilter) continue;
        } else {
            //no temperatures
            if (!isverbosefilter && Monitor_output[i].match(regex)) continue;
        }
        if ((Monitor_output[i].trim() === "\n") || (Monitor_output[i].trim() === "\r") || (Monitor_output[i].trim() === "\r\n") || (Monitor_output[i].trim() === "")) continue;
        m = Monitor_output[i];
        if (Monitor_output[i].startsWith("[#]")) {
            if (!isverbosefilter) continue;
            else m = m.replace("[#]", "");
        }
        //position
        if (!isverbosefilter && Monitor_output[i].startsWith("X:")) continue;
         if (!isverbosefilter && Monitor_output[i].startsWith("FR:")) continue;
        m = m.replace("&", "&amp;");
        m = m.replace("<", "&lt;");
        m = m.replace(">", "&gt;");
        if (m.startsWith("ALARM:") || m.startsWith("Hold:") || m.startsWith("Door:")) {
            m = "<font color='orange'><b>" + m + translate_text_item(m.trim()) + "</b></font>\n";
        }
        if (m.startsWith("error:")) {
            m = "<font color='red'><b>" + m.toUpperCase() + translate_text_item(m.trim()) + "</b></font>\n";
        }
        if ((m.startsWith("echo:") || m.startsWith("Config:")) && !isverbosefilter) continue;
        if (m.startsWith("echo:Unknown command: \"echo\"") || (m.startsWith("echo:enqueueing \"*\""))) continue;
        output += m;
    }
    document.getElementById("cmd_content").innerHTML = output;
    Monitor_check_autoscroll();
}

function SendCustomCommand() {
    var cmd = document.getElementById("custom_cmd_txt").value;
    var url = "/command?commandText=";
    cmd = cmd.trim();
    if (cmd.trim().length == 0) return;
    CustomCommand_history.push(cmd);
    CustomCommand_history.slice(-40);
    CustomCommand_history_index = CustomCommand_history.length;
    document.getElementById("custom_cmd_txt").value = "";
    Monitor_output_Update(cmd + "\n");
    cmd = encodeURI(cmd);
    //because # is not encoded
    cmd = cmd.replace("#", "%23");
    SendGetHttp(url + cmd, SendCustomCommandSuccess, SendCustomCommandFailed);
}

function CustomCommand_OnKeyUp(event) {
    if (event.keyCode == 13) {
        SendCustomCommand();
    }
    if (event.keyCode == 38 || event.keyCode == 40) {
        if (event.keyCode == 38 && CustomCommand_history.length > 0 && CustomCommand_history_index > 0) {
            CustomCommand_history_index--;
        } else if (event.keyCode == 40 && CustomCommand_history_index < CustomCommand_history.length - 1) {
            CustomCommand_history_index++;
        }

        if (CustomCommand_history_index >= 0 && CustomCommand_history_index < CustomCommand_history.length) {
            document.getElementById("custom_cmd_txt").value = CustomCommand_history[CustomCommand_history_index];
        }
        return false;
    }
    return true;
}

function SendCustomCommandSuccess(response) {
    if (response[response.length - 1] != '\n') Monitor_output_Update(response + "\n");
    else {
        Monitor_output_Update(response);
    }
    var tcmdres = response.split("\n");
    for (var il = 0; il < tcmdres.length; il++){
        process_socket_response(tcmdres[il]);
    }
}

function SendCustomCommandFailed(error_code, response) {
    if (error_code == 0) {
        Monitor_output_Update(translate_text_item("Connection error") + "\n");
    } else {
         Monitor_output_Update(translate_text_item("Error : ") + error_code + " :" + decode_entitie(response) + "\n");
    }
    console.log("cmd Error " + error_code + " :" + decode_entitie(response));
}

var config_configList = [];
var config_override_List = [];
var config_lastindex = -1
var config_error_msg = "";
var config_lastindex_is_override = false;
var commandtxt = "M205";
var is_override_config = false;
var config_file_name = "/sd/config";


function refreshconfig(is_override) {
    if (http_communication_locked) {
        document.getElementById('config_status').innerHTML = translate_text_item("Communication locked by another process, retry later.");
        return;
    }
    is_override_config = false;
    if ((typeof is_override != 'undefined') && is_override) is_override_config = is_override;
    config_display_override(is_override_config);
    document.getElementById('config_loader').style.display = "block";
    document.getElementById('config_list_content').style.display = "none";
    document.getElementById('config_status').style.display = "none";
    document.getElementById('config_refresh_btn').style.display = "none";
    if (!is_override) config_configList = [];
    config_override_List = [];
    //removeIf(production)
    var response_text = "";
    if (target_firmware == "smoothieware") response_text = "# Robot module configurations : general handling of movement G-codes and slicing into moves\ndefault_feed_rate                            4000             # Default rate ( mm/minute ) for G1/G2/G3 moves\ndefault_seek_rate                            4000             # Default rate ( mm/minute ) for G0 moves\nmm_per_arc_segment                           0.0              # Fixed length for line segments that divide arcs 0 to disable\nmm_max_arc_error                             0.01             # The maximum error for line segments that divide arcs 0 to disable\n                                                              # note it is invalid for both the above be 0\n                                                              # if both are used, will use largest segment length based on radius\n#mm_per_line_segment                          5                # Lines can be cut into segments ( not usefull with cartesian coordinates robots ).\n\n# Arm solution configuration : Cartesian robot. Translates mm positions into stepper positions\nalpha_steps_per_mm                           80               # Steps per mm for alpha stepper\nbeta_steps_per_mm                            80               # Steps per mm for beta stepper\ngamma_steps_per_mm                           1637.7953        # Steps per mm for gamma stepper\n\n# Planner module configuration : Look-ahead and acceleration configuration\nplanner_queue_size                           32               # DO NOT CHANGE THIS UNLESS YOU KNOW EXACTLY WHAT YOUR ARE DOING\nacceleration                                 3000             # Acceleration in mm/second/second.\n#z_acceleration                              500              # Acceleration for Z only moves in mm/s^2, 0 disables it, disabled by default. DO NOT SET ON A DELTA\njunction_deviation                           0.05             # Similar to the old max_jerk, in millimeters, see : https://github.com/grbl/grbl/blob/master/planner.c#L409\n                                                              # and https://github.com/grbl/grbl/wiki/Configuring-Grbl-v0.8 . Lower values mean being more careful, higher values means being faster and have more jerk\n\n# Stepper module configuration\nmicroseconds_per_step_pulse                  1                # Duration of step pulses to stepper drivers, in microseconds\nbase_stepping_frequency                      100000           # Base frequency for stepping\n\n# Stepper module pins ( ports, and pin numbers, appending ! to the number will invert a pin )\nalpha_step_pin                               2.1              # Pin for alpha stepper step signal\nalpha_dir_pin                                0.11             # Pin for alpha stepper direction\nalpha_en_pin                                 0.10!            # Pin for alpha enable pin\nalpha_current                                1.0              # X stepper motor current\nx_axis_max_speed                             30000            # mm/min\nalpha_max_rate                               30000.0          # mm/min actuator max speed;";
    if (target_firmware == "grbl" || target_firmware=="grbl-embedded") response_text = "$0=10\n$1=25\n$2=0\n$3=0\n$4=0\n$5=0\n$6=0\n$10=1\n$11=0.010\n$12=0.002\n$13=0\n$20=0\n$21=0\n$22=0\n$23=0\n$24=25.000\n$25=500.000\n$26=250\n$27=1.000\n$30=1000\n$31=0\n$32=0\n$100=250.000\n$101=250.000\n$102=250.000\n$110=500.000\n$111=500.000\n$112=500.000\n$120=10.000\n$121=20.000\n$122=10.000\n$130=200.000\n$131=200.000\n$132=200.000";
    else response_text = "EPR:0 1028 7 Language\nEPR:2 75 230400 Baudrate\nEPR:0 1125 1 Display Mode:\nEPR:0 1119 1 Light On:\nEPR:0 1127 1 Keep Light On:\nEPR:0 1126 0 Filament Sensor On:\nEPR:0 1176 0 Top Sensor On:\nEPR:0 1120 1 Sound On:\nEPR:0 1177 1 Wifi On:\nEPR:3 129 0.000 Filament printed [m]\nEPR:2 125 0 Printer active [s]\nEPR:2 79 0 Max. inactive time [ms,0=off]\nEPR:2 83 360000 Stop stepper after inactivity [ms,0=off]\nEPR:2 1121 0 Powersave after [ms,0=off]:\nEPR:3 1160 180.000 Temp Ext PLA:\nEPR:3 1164 230.000 Temp Ext ABS:\nEPR:3 1168 60.000 Temp Bed PLA:\nEPR:3 1172 90.000 Temp Bed ABS:\nEPR:3 1179 2.000 Load Feed Rate:\nEPR:3 1183 4.000 Unload Feed Rate:\nEPR:3 1187 60.000 Unload/Load Distance:\nEPR:3 3 80.0000 X-axis steps per mm\nEPR:3 7 80.0000 Y-axis steps per mm\nEPR:3 11 2560.0000 Z-axis steps per mm\nEPR:3 15 200.000 X-axis max. feedrate [mm/s]\nEPR:3 19 200.000 Y-axis max. feedrate [mm/s]\nEPR:3 23 5.000 Z-axis max. feedrate [mm/s]\nEPR:3 27 40.000 X-axis homing feedrate [mm/s]\nEPR:3 31 40.000 Y-axis homing feedrate [mm/s]\nEPR:3 35 4.000 Z-axis homing feedrate [mm/s]\nEPR:3 39 20.000 Max. jerk [mm/s]\nEPR:3 47 0.342 Max. Z-jerk [mm/s]\nEPR:3 133 0.000 X min pos [mm]\nEPR:3 137 0.000 Y min pos [mm]\nEPR:3 141 0.000 Z min pos [mm]\nEPR:3 145 199.000 X max length [mm]\nEPR:3 149 204.000 Y max length [mm]\nEPR:3 153 200.000 Z max length [mm]\nEPR:3 51 1000.000 X-axis acceleration [mm/s^2]\nEPR:3 55 1000.000 Y-axis acceleration [mm/s^2]\nEPR:3 59 100.000 Z-axis acceleration [mm/s^2]\nEPR:3 63 1000.000 X-axis travel acceleration [mm/s^2]\nEPR:3 67 1000.000 Y-axis travel acceleration [mm/s^2]\nEPR:3 71 150.000 Z-axis travel acceleration [mm/s^2]\nEPR:3 1024 0.000 Coating thickness [mm]\nEPR:3 1128 100.000 Manual-probe X1 [mm]\nEPR:3 1132 180.000 Manual-probe Y1 [mm]\nEPR:3 1136 100.000 Manual-probe X2 [mm]\nEPR:3 1140 10.000 Manual-probe Y2 [mm]\nEPR:3 1144 50.000 Manual-probe X3 [mm]\nEPR:3 1148 95.000 Manual-probe Y3 [mm]\nEPR:3 1152 150.000 Manual-probe X4 [mm]\nEPR:3 1156 95.000 Manual-probe Y4 [mm]\nEPR:3 808 0.280 Z-probe height [mm]\nEPR:3 929 5.000 Max. z-probe - bed dist. [mm]\nEPR:3 812 1.000 Z-probe speed [mm/s]\nEPR:3 840 30.000 Z-probe x-y-speed [mm/s]\nEPR:3 800 0.000 Z-probe offset x [mm]\nEPR:3 804 0.000 Z-probe offset y [mm]\nEPR:3 816 36.000 Z-probe X1 [mm]\nEPR:3 820 -7.000 Z-probe Y1 [mm]\nEPR:3 824 36.000 Z-probe X2 [mm]\nEPR:3 828 203.000 Z-probe Y2 [mm]\nEPR:3 832 171.000 Z-probe X3 [mm]\nEPR:3 836 203.000 Z-probe Y3 [mm]\nEPR:3 1036 0.000 Z-probe bending correction A [mm]\nEPR:3 1040 0.000 Z-probe bending correction B [mm]\nEPR:3 1044 0.000 Z-probe bending correction C [mm]\nEPR:0 880 0 Autolevel active (1/0)\nEPR:0 106 2 Bed Heat Manager [0-3]\nEPR:0 107 255 Bed PID drive max\nEPR:0 124 80 Bed PID drive min\nEPR:3 108 196.000 Bed PID P-gain\nEPR:3 112 33.000 Bed PID I-gain\nEPR:3 116 290.000 Bed PID D-gain\nEPR:0 120 255 Bed PID max value [0-255]\nEPR:0 1020 0 Enable retraction conversion [0/1]\nEPR:3 992 3.000 Retraction length [mm]\nEPR:3 996 13.000 Retraction length extruder switch [mm]\nEPR:3 1000 40.000 Retraction speed [mm/s]\nEPR:3 1004 0.000 Retraction z-lift [mm]\nEPR:3 1008 0.000 Extra extrusion on undo retract [mm]\nEPR:3 1012 0.000 Extra extrusion on undo switch retract [mm]\nEPR:3 1016 20.000 Retraction undo speed\nEPR:3 200 99.000 Extr.1 steps per mm\nEPR:3 204 50.000 Extr.1 max. feedrate [mm/s]\nEPR:3 208 20.000 Extr.1 start feedrate [mm/s]\nEPR:3 212 5000.000 Extr.1 acceleration [mm/s^2]\nEPR:0 216 3 Extr.1 heat manager [0-3]\nEPR:0 217 230 Extr.1 PID drive max\nEPR:0 245 40 Extr.1 PID drive min\nEPR:3 218 3.0000 Extr.1 PID P-gain/dead-time\nEPR:3 222 2.0000 Extr.1 PID I-gain\nEPR:3 226 40.0000 Extr.1 PID D-gain\nEPR:0 230 255 Extr.1 PID max value [0-255]\nEPR:2 231 0 Extr.1 X-offset [steps]\nEPR:2 235 0 Extr.1 Y-offset [steps]\nEPR:2 290 0 Extr.1 Z-offset [steps]\nEPR:1 239 1 Extr.1 temp. stabilize time [s]\nEPR:1 250 150 Extr.1 temp. for retraction when heating [C]\nEPR:1 252 0 Extr.1 distance to retract when heating [mm]\nEPR:0 254 255 Extr.1 extruder cooler speed [0-255]\nEPR:3 246 0.000 Extr.1 advance L [0=off]\nEPR:3 300 99.000 Extr.2 steps per mm\nEPR:3 304 50.000 Extr.2 max. feedrate [mm/s]\nEPR:3 308 20.000 Extr.2 start feedrate [mm/s]\nEPR:3 312 5000.000 Extr.2 acceleration [mm/s^2]\nEPR:0 316 3 Extr.2 heat manager [0-3]\nEPR:0 317 230 Extr.2 PID drive max\nEPR:0 345 40 Extr.2 PID drive min\nEPR:3 318 3.0000 Extr.2 PID P-gain/dead-time\nEPR:3 322 2.0000 Extr.2 PID I-gain\nEPR:3 326 40.0000 Extr.2 PID D-gain\nEPR:0 330 255 Extr.2 PID max value [0-255]\nEPR:2 331 -2852 Extr.2 X-offset [steps]\nEPR:2 335 12 Extr.2 Y-offset [steps]\nEPR:2 390 0 Extr.2 Z-offset [steps]\nEPR:1 339 1 Extr.2 temp. stabilize time [s]\nEPR:1 350 150 Extr.2 temp. for retraction when heating [C]\nEPR:1 352 0 Extr.2 distance to retract when heating [mm]\nEPR:0 354 255 Extr.2 extruder cooler speed [0-255]\nEPR:3 346 0.000 Extr.2 advance L [0=off]\n";
    getESPconfigSuccess(response_text);
    return;
    //endRemoveIf(production)
    if (target_firmware == "smoothieware") {
        if (!is_override_config) config_file_name = "/sd/config";
        commandtxt = "cat " + config_file_name;
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) commandtxt = "$$";
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded")) commandtxt = "M503";
    getprinterconfig(is_override_config);
}

function config_display_override(display_it) {
    if (display_it) {
        document.getElementById('config_override_list_content').style.display = "block";
        document.getElementById('config_main_content').style.display = "none";
        document.getElementById('config_override_file').checked = true;
    } else {
        document.getElementById('config_override_list_content').style.display = "none";
        document.getElementById('config_main_content').style.display = "block";
        document.getElementById('config_main_file').checked = true;
    }
}

function getprinterconfig(is_override) {
    var cmd = commandtxt;
    if ((typeof is_override != 'undefined') && is_override) {
        cmd = "M503";
        config_override_List = [];
        is_override_config = true;
    } else is_override_config = false;
    var url = "/command?plain=" + encodeURIComponent(cmd);
    if ((target_firmware == "grbl-embedded") || (target_firmware == "marlin-embedded")) SendGetHttp(url);
    else SendGetHttp(url, getESPconfigSuccess, getESPconfigfailed);
}

function Apply_config_override() {
    var url = "/command?plain=" + encodeURIComponent("M500");
    SendGetHttp(url, getESPUpdateconfigSuccess);
}

function Delete_config_override() {
    var url = "/command?plain=" + encodeURIComponent("M502");
    SendGetHttp(url, getESPUpdateconfigSuccess);
}

function getESPUpdateconfigSuccess(response) {
    refreshconfig(true);
}

function build_HTML_config_list() {
    var content = "";
    var array_len = config_configList.length;
    if (is_override_config) array_len = config_override_List.length;
    for (var i = 0; i < array_len; i++) {
        var item;
        var prefix = "";
        if (is_override_config) {
            item = config_override_List[i];
            prefix = "_override"
        } else item = config_configList[i];
        content += "<tr>";
        if (item.showcomment) {
            content += "<td colspan='3' class='info'>";
            content += item.comment;
        } else {
            content += "<td style='vertical-align:middle'>";
            content += item.label;
            content += "</td>";
            content += "<td style='vertical-align:middle;'>";
            content += "<table><tr><td>"
            content += "<div id='status_config_" + prefix + i + "' class='form-group has-feedback' style='margin: auto;'>";
            content += "<div class='item-flex-row'>";
            content += "<table><tr><td>";
            content += "<div class='input-group'>";
            content += "<span class='input-group-btn'>";
            content += "<button class='btn btn-default btn-svg' onclick='config_revert_to_default(" + i + "," + is_override_config + ")' >";
            content += get_icon_svg("repeat");
            content += "</button>";
            content += "</span>";
            content += "<input class='hide_it'></input>";
            content += "</div>";
            content += "</td><td>";
            content += "<div class='input-group'>";
            content += "<span class='input-group-addon hide_it' ></span>";
            content += "<input id='config_" + prefix + i + "' type='text' class='form-control' style='width:";
            if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded") || is_override_config) content += "25em";
            else content += "auto";
            content += "'  value='" + item.defaultvalue + "' onkeyup='config_checkchange(" + i + "," + is_override_config + ")' />";
            content += "<span id='icon_config_" + prefix + i + "'class='form-control-feedback ico_feedback' ></span>";
            content += "<span class='input-group-addon hide_it' ></span>";
            content += "</div>";
            content += "</td></tr></table>";
            content += "<div class='input-group'>";
            content += "<input class='hide_it'></input>";
            content += "<span class='input-group-btn'>";
            content += "<button  id='btn_config_" + prefix + i + "' class='btn btn-default' onclick='configGetvalue(" + i + "," + is_override_config + ")' translate english_content='Set' >" + translate_text_item("Set") + "</button>&nbsp;";
            content += "</span>";
            content += "</div>";
            content += "</div>";
            content += "</div>";
            content += "</td></tr></table>";
            content += "</td>";
            content += "<td style='vertical-align:middle'>";
            if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded"))content += item.help;
            else content += HTMLEncode(item.help);
        }
        content += "</td>";
        content += "</tr>\n";
    }
    if (content.length > 0) {
        if (target_firmware == "smoothieware") {
            document.getElementById('config_main_file_name').innerHTML = config_file_name;
            if (!is_override_config) {
                document.getElementById('config_list_data').innerHTML = content;
                getprinterconfig(true);
            } else {
                document.getElementById('config_override_data').innerHTML = content;
                if (is_config_override_file()) {
                    document.getElementById('config_delete_override').style.display = 'none';
                    document.getElementById('config_override_file_name').innerHTML = "Smoothieware";
                } else {
                    document.getElementById('config_override_file_name').innerHTML = "/sd/config-override";
                    document.getElementById('config_delete_override').style.display = 'block';
                }
            }
        } else {
            document.getElementById('config_list_data').innerHTML = content;
        }
    }
    document.getElementById('config_loader').style.display = "none";
    document.getElementById('config_list_content').style.display = "block";
    document.getElementById('config_status').style.display = "none";
    document.getElementById('config_refresh_btn').style.display = "block";
}

function config_check_value(value, index, is_override) {
    var isvalid = true;
    if ((target_firmware == "smoothieware") && !is_override) {
        if ((value.trim()[0] == '-') || (value.length === 0) || (value.toLowerCase().indexOf("#") != -1)) {
            isvalid = false;
            config_error_msg = translate_text_item("cannot have '-', '#' char or be empty");
        }
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        if ((value.trim()[0] == '-') || (value.length === 0) || (value.toLowerCase().indexOf("#") != -1)) {
            isvalid = false;
            config_error_msg = translate_text_item("cannot have '-', '#' char or be empty");
        }
    } else {
        if ((value.trim()[0] == '-') || (value.length === 0) || ((value.indexOf("e") != -1) && (value.toLowerCase().indexOf("true") == -1) && (value.toLowerCase().indexOf("false") == -1))) {
            isvalid = false;
            config_error_msg = translate_text_item("cannot have '-', 'e' char or be empty");
        }
    }
    return isvalid;
}

function process_config_answer(response_text) {
    var result = true;
    var tlines = response_text.split("\n");
    //console.log(tlines.length);
    if (tlines.length <= 3) {
        if ((target_firmware == "smoothieware") && (commandtxt != "cat /sd/config.txt")) {
            if (!is_override_config) {
                config_file_name = "/sd/config.txt";
                commandtxt = "cat " + config_file_name;
                config_configList = [];
            }
            getprinterconfig();
        } else {
            //console.log("No config file" );
            if ((target_firmware == "smoothieware")) document.getElementById('config_status').innerHTML = translate_text_item("File config / config.txt not found!");
            else document.getElementById('config_status').innerHTML = translate_text_item("Cannot get EEPROM content!");
            result = false;
        }
    } else {
        //console.log("Config has " + tlines.length + " entries");
        var vindex = 0;
        for (var i = 0; i < tlines.length; i++) {
            vindex = create_config_entry(tlines[i], vindex);
        }
        if (vindex > 0) build_HTML_config_list();
        else result = false;
    }

    return result;
}

function create_config_entry(sentry, vindex) {
    var iscomment;
    var ssentry = sentry;
    if (!is_config_entry(ssentry)) return vindex;
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra")) {
        if (sentry.startsWith("Config:  ")) ssentry = sentry.replace("Config:", "");
        else ssentry = sentry.replace("Config:", "#");
    }
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded")) {
        if (sentry.startsWith("echo: ")) ssentry = sentry.replace("echo:", "");
        else ssentry = sentry.replace("echo:", "#");
    }
    while (ssentry.indexOf("\t") > -1) {
        ssentry = ssentry.replace("\t", " ");
    }
    while (ssentry.indexOf("  ") > -1) {
        ssentry = ssentry.replace("  ", " ");
    }
    while (ssentry.indexOf("##") > -1) {
        ssentry = ssentry.replace("##", "#");
    }

    iscomment = is_config_commented(ssentry);
    if (iscomment) {
        while (ssentry.indexOf("<") != -1) {
            var m = ssentry.replace("<", "&lt;");
            ssentry = m.replace(">", "&gt;");
        }
        var config_entry = {
            comment: ssentry,
            showcomment: true,
            index: vindex,
            label: "",
            help: "",
            defaultvalue: "",
            cmd: ""
        };
        if (is_override_config) config_override_List.push(config_entry);
        else config_configList.push(config_entry);
    } else {
        var slabel = get_config_label(ssentry);
        var svalue = get_config_value(ssentry);
        var shelp = get_config_help(ssentry);
        var scmd = get_config_command(ssentry)
        var config_entry = {
            comment: ssentry,
            showcomment: false,
            index: vindex,
            label: slabel,
            help: shelp,
            defaultvalue: svalue,
            cmd: scmd,
            is_override: is_override_config
        };
        if (is_override_config) config_override_List.push(config_entry);
        else config_configList.push(config_entry);
    }
    vindex++;
    return vindex;
}
//check it is valid entry
function is_config_entry(sline) {
    var line = sline.trim();
    if (line.length == 0) return false;
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded")) {
        if (sline.startsWith("Config:") || sline.startsWith("echo:") || sline.startsWith("\t") || sline.startsWith("  ")) return true
        else return false;
    }
    if (target_firmware == "smoothieware") {
        return true;
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        if ((line.indexOf("$") == 0) && (line.indexOf("=") != -1)) return true;
        else return false
    }
    //Default repetier
    if (line.indexOf("EPR:") == 0) return true;
    else return false

}

function get_config_label(sline) {
    var tline = sline.trim().split(" ");
    var tsize = tline.length;
    if ((target_firmware == "smoothieware") || (target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded")) {
        return tline[0];
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        var tline2 = sline.trim().split("=");
        return tline2[0];
    }
    if (tsize > 3) {
        var result = "";
        var i = 0;
        for (i = 3; i < tsize; i++) {
            if (tline[i][0] == '[') break;
            result += tline[i] + " ";
        }
        return result;
    }
    return "???";
}

function get_config_value(sline) {
    var tline = sline.trim().split(" ");
    if ((target_firmware == "smoothieware") && !is_override_config) {
        if ((tline.length > 1) && tline[0][0] != '#') return tline[1];
        else return "???";
    }
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded") || is_override_config) {

        var tline1;
        if (sline.indexOf(";") != -1) tline1 = sline.trim().split(";");
        else tline1 = sline.trim().split("(");
        tline = tline1[0].split(" ");
        var line = "";
        for (var i = 1; i < tline.length; i++) {
            if (line.length > 0) line += " ";
            line += tline[i];
        }
        return line;
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        var tline2 = sline.trim().split("=");
        if (tline2.length > 1) return tline2[1];
        else return "???";
    }
    if (tline.length > 3) {
        return tline[2];
    } else return "???";
}

function get_config_help(sline) {
    if (is_override_config) return "";
    if (target_firmware == "smoothieware") {
        var pos = sline.indexOf("#");
        if (pos > -1) return sline.slice(pos + 1, sline.length);
        else return "";
    }
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded")) {
        var tline;
        if (sline.indexOf(";") != -1) {
            tline = sline.trim().split(";");
            if (tline.length > 1) return tline[1];
            else return "";
        } else {
            tline = sline.trim().split("(");
            if (tline.length > 1) {
                var tline2 = tline[1].split(")");
                return tline2[0];
            } else return "";
        }
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        return inline_help(get_config_label(sline))
    }
    var tline = sline.split("[");
    if (tline.length > 1) {
        var tline2 = tline[1].split("]");
        return tline2[0];
    }
    return "";
}

function get_config_command(sline) {
    var command;
    if ((target_firmware == "smoothieware") && !is_override_config) {
        command = "config-set sd " + get_config_label(sline) + " ";
        return command;
    }
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded") || is_override_config) {
        command = get_config_label(sline) + " ";
        return command;
    }
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        command = get_config_label(sline) + "=";
        return command;
    }
    var tline = sline.split(" ");
    if (tline.length > 3) {
        var stype = tline[0].split(":");
        command = "M206 T" + stype[1];
        command += " P" + tline[1];
        if (stype[1] == "3") command += " X";
        else command += " S";
        return command;
    }
    return "; ";
}

function is_config_commented(sline) {
    var line = sline.trim();
    if (line.length == 0) return false;
    if (is_override_config) return line.startsWith(";");
    if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra") || (target_firmware == "marlin-embedded") || (target_firmware == "smoothieware")) {
        return line.startsWith("#");
    }
    return false;
}

function config_revert_to_default(index, is_override) {
    var prefix = "";
    var item = config_configList[index];
    if (is_override) {
        prefix = "_override";
        item = config_override_List[index];
    }
    console.log()
    document.getElementById('config_' + prefix + index).value = item.defaultvalue;
    document.getElementById('btn_config_' + prefix + index).className = "btn btn-default";
    document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback";
    document.getElementById('icon_config_' + prefix + index).innerHTML = "";
}

function is_config_override_file() {
    if (config_override_List.length > 5) {
        for (i = 0; i < 5; i++) {
            if (config_override_List[i].comment.startsWith("; No config override")) return true;
        }
    }
    return false;
}

function configGetvalue(index, is_override) {
    var prefix = "";
    var item = config_configList[index];
    if (is_override) {
        prefix = "_override";
        item = config_override_List[index];
    }
    //remove possible spaces
    value = document.getElementById('config_' + prefix + index).value.trim();
    if (value == item.defaultvalue) return;
    //check validity of value
    var isvalid = config_check_value(value, index, is_override);
    //if not valid show error
    if (!isvalid) {
        document.getElementById('btn_config_' + prefix + index).className = "btn btn-danger";
        document.getElementById('icon_config_' + prefix + index).className = "form-control-feedback has-error ico_feedback";
        document.getElementById('icon_config_' + prefix + index).innerHTML = get_icon_svg("remove");
        document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback has-error";
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value ") + config_error_msg + " !");
    } else {
        //value is ok save it
        var cmd = item.cmd + value;
        config_lastindex = index;
        config_lastindex_is_override = is_override;
        item.defaultvalue = value;
        document.getElementById('btn_config_' + prefix + index).className = "btn btn-success";
        document.getElementById('icon_config_' + prefix + index).className = "form-control-feedback has-success ico_feedback";
        document.getElementById('icon_config_' + prefix + index).innerHTML = get_icon_svg("ok");
        document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback has-success";
        var url = "/command?plain=" + encodeURIComponent(cmd);
        SendGetHttp(url, setESPconfigSuccess, setESPconfigfailed);
    }
}

function config_checkchange(index, is_override) {
    //console.log("check " + "config_"+index);
    var prefix = "";
    var item = config_configList[index];
    if (is_override) {
        prefix = "_override";
        item = config_override_List[index];
    }
    var val = document.getElementById('config_' + prefix + index).value.trim();
    //console.log("value: " + val);
    if (item.defaultvalue == val) {
        document.getElementById('btn_config_' + prefix + index).className = "btn btn-default";
        document.getElementById('icon_config_' + prefix + index).className = "form-control-feedback";
        document.getElementById('icon_config_' + prefix + index).innerHTML = "";
        document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback";
    } else if (config_check_value(val, index, is_override)) {
        document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback has-warning";
        document.getElementById('btn_config_' + prefix + index).className = "btn btn-warning";
        document.getElementById('icon_config_' + prefix + index).className = "form-control-feedback has-warning ico_feedback";
        document.getElementById('icon_config_' + prefix + index).innerHTML = get_icon_svg("warning-sign");
        //console.log("change ok");
    } else {
        //console.log("change bad");
        document.getElementById('btn_config_' + prefix + index).className = "btn btn-danger";
        document.getElementById('icon_config_' + prefix + index).className = "form-control-feedback has-error ico_feedback";
        document.getElementById('icon_config_' + prefix + index).innerHTML = get_icon_svg("remove");
        document.getElementById('status_config_' + prefix + index).className = "form-group has-feedback has-error";
    }

}

function setESPconfigSuccess(response) {
    //console.log(response);
}
var grbl_help = {
    "$0": "Step pulse, microseconds",
    "$1": "Step idle delay, milliseconds",
    "$2": "Step port invert, mask",
    "$3": "Direction port invert, mask",
    "$4": "Step enable invert, boolean",
    "$5": "Limit pins invert, boolean",
    "$6": "Probe pin invert, boolean",
    "$10": "Status report, mask",
    "$11": "Junction deviation, mm",
    "$12": "Arc tolerance, mm",
    "$13": "Report inches, boolean",
    "$20": "Soft limits, boolean",
    "$21": "Hard limits, boolean",
    "$22": "Homing cycle, boolean",
    "$23": "Homing dir invert, mask",
    "$24": "Homing feed, mm/min",
    "$25": "Homing seek, mm/min",
    "$26": "Homing debounce, milliseconds",
    "$27": "Homing pull-off, mm",
    "$30": "Max spindle speed, RPM",
    "$31": "Min spindle speed, RPM",
    "$32": "Laser mode, boolean",
    "$100": "X steps/mm",
    "$101": "Y steps/mm",
    "$102": "Z steps/mm",
    "$103": "A steps/mm",
    "$104": "B steps/mm",
    "$105": "C steps/mm",
    "$110": "X Max rate, mm/min",
    "$111": "Y Max rate, mm/min",
    "$112": "Z Max rate, mm/min",
    "$113": "A Max rate, mm/min",
    "$114": "B Max rate, mm/min",
    "$115": "C Max rate, mm/min",
    "$120": "X Acceleration, mm/sec^2",
    "$121": "Y Acceleration, mm/sec^2",
    "$122": "Z Acceleration, mm/sec^2",
    "$123": "A Acceleration, mm/sec^2",
    "$124": "B Acceleration, mm/sec^2",
    "$125": "C Acceleration, mm/sec^2",
    "$130": "X Max travel, mm",
    "$131": "Y Max travel, mm",
    "$132": "Z Max travel, mm",
    "$133": "A Max travel, mm",
    "$134": "B Max travel, mm",
    "$135": "C Max travel, mm"

};

function inline_help(label) {
    var shelp = "";
    shelp = grbl_help[label];
    if (typeof shelp === 'undefined') shelp = "";
    return translate_text_item(shelp);
}

function setESPconfigfailed(error_code, response) {
    alertdlg(translate_text_item("Set failed"), "Error " + error_code + " :" + response);
    console.log("Error " + error_code + " :" + response);
    var prefix = "";
    if (config_lastindex_is_override) prefix = "_override";
    document.getElementById('btn_config_' + prefix + config_lastindex).className = "btn btn-danger";
    document.getElementById('icon_config_' + prefix + config_lastindex).className = "form-control-feedback has-error ico_feedback";
    document.getElementById('icon_config_' + prefix + config_lastindex).innerHTML = get_icon_svg("remove");
    document.getElementById('status_config_' + prefix + config_lastindex).className = "form-group has-feedback has-error";
}

function getESPconfigSuccess(response) {
    //console.log(response);
    if (!process_config_answer(response)) {
        getESPconfigfailed(406, translate_text_item("Wrong data"));
        document.getElementById('config_loader').style.display = "none";
        document.getElementById('config_list_content').style.display = "block";
        document.getElementById('config_status').style.display = "none";
        document.getElementById('config_refresh_btn').style.display = "block";
        return;
    }
}

function getESPconfigfailed(error_code, response) {
    console.log("Error " + error_code + " :" + response);
    document.getElementById('config_loader').style.display = "none";
    document.getElementById('config_status').style.display = "block";
    document.getElementById('config_status').innerHTML = translate_text_item("Failed:") + error_code + " " + response;
    document.getElementById('config_refresh_btn').style.display = "block";
}

//confirm dialog
function confirmdlg(titledlg, textdlg, closefunc) {
    var modal = setactiveModal('confirmdlg.html', closefunc);
    if (modal == null) return;
    var title = modal.element.getElementsByClassName("modal-title")[0];
    var body = modal.element.getElementsByClassName("modal-text")[0];
    title.innerHTML = titledlg;
    body.innerHTML = textdlg;
    showModal();
}
//Connect dialog
function connectdlg(getFw) {
    var modal = setactiveModal('connectdlg.html');
    var get_FW = true;
    if (modal == null) return;
    showModal();
    //removeIf(production)
    connectsuccess("FW version:0.9.9X # FW target:grbl-embedded # FW HW:Direct SD # primary : /sd/ # secondary : /ext/ # authentication: no# webcommunication:socket:123#hostname:localhost");
    return;
    //endRemoveIf(production)
    if (typeof getFw != 'undefined') get_FW = getFw;
    if (get_FW) retryconnect();
}

function getFWdata(response) {
    var tlist = response.split("#");

    if (tlist.length < 3) {
        return false;
    }
    //FW version
    var sublist = tlist[0].split(":");
    if (sublist.length != 2) {
        return false;
    }
    fw_version = sublist[1].toLowerCase().trim();
    //FW target
    sublist = tlist[1].split(":");
    if (sublist.length != 2) {
        return false;
    }
    target_firmware = sublist[1].toLowerCase().trim();
    //FW HW
    sublist = tlist[2].split(":");
    if (sublist.length != 2) {
        return false;
    }
    var sddirect = sublist[1].toLowerCase().trim();
    if (sddirect == "direct sd") direct_sd = true;
    else direct_sd = false;
    //primary sd
    sublist = tlist[3].split(":");
    if (sublist.length != 2) {
        return false;
    }
    if (!direct_sd && (target_firmware == "smoothieware")) {
        primary_sd = "sd/";
    } else {
        primary_sd = sublist[1].toLowerCase().trim();
    }
    //secondary sd
    sublist = tlist[4].split(":");
    if (sublist.length != 2) {
        return false;
    }
    if (!direct_sd && (target_firmware == "smoothieware")) {
        secondary_sd = "ext/";
    } else {
        secondary_sd = sublist[1].toLowerCase().trim();
    }
    //authentication
    sublist = tlist[5].split(":");
    if (sublist.length != 2) {
        return false;
    }
    if ((sublist[0].trim() == "authentication") && (sublist[1].trim() == "yes")) ESP3D_authentication = true;
    else ESP3D_authentication = false;
    //async communications
    if (tlist.length > 6) {
        sublist = tlist[6].split(":");
        if ((sublist[0].trim() == "webcommunication") && (sublist[1].trim() == "Async")) async_webcommunication = true;
        else {
            async_webcommunication = false;
            websocket_port = sublist[2].trim();
            if (sublist.length > 3) {
                websocket_ip = sublist[3].trim();
            } else {
                console.log("No IP for websocket, use default");
                websocket_ip = document.location.hostname == '' ? 'localhost' : document.location.hostname;
            }
        }
    }
    if (tlist.length > 7) {
        sublist = tlist[7].split(":");
        if (sublist[0].trim() == "hostname") esp_hostname = sublist[1].trim();
    }

    if ((target_firmware == "grbl-embedded") && (tlist.length > 8)) {
        sublist = tlist[8].split(":");
        if (sublist[0].trim() == "axis") {
            grblaxis = parseInt(sublist[1].trim());
        }
    }

    if (async_webcommunication) {
        if (!!window.EventSource) {
            event_source = new EventSource('/events');
            event_source.addEventListener('InitID', Init_events, false);
            event_source.addEventListener('ActiveID', ActiveID_events, false);
            event_source.addEventListener('DHT', DHT_events, false);
        }
    }
    startSocket();

    return true;
}

function connectsuccess(response) {
    if (getFWdata(response)) {
        console.log("Fw identification:" + response);
        if (ESP3D_authentication) {
            closeModal("Connection successful");
            document.getElementById('menu_authentication').style.display = 'inline';
            logindlg(initUI, true);
        } else {
            document.getElementById('menu_authentication').style.display = 'none';
            initUI();
        }
    } else {
        console.log(response);
        connectfailed(406, "Wrong data");
    }
}

function connectfailed(errorcode, response) {
    document.getElementById('connectbtn').style.display = 'block';
    document.getElementById('failed_connect_msg').style.display = 'block';
    document.getElementById('connecting_msg').style.display = 'none';
    console.log("Fw identification error " + errorcode + " : " + response);
}

function retryconnect() {
    document.getElementById('connectbtn').style.display = 'none';
    document.getElementById('failed_connect_msg').style.display = 'none';
    document.getElementById('connecting_msg').style.display = 'block';
    var url = "/command?plain=" + encodeURIComponent("[ESP800]");;
    SendGetHttp(url, connectsuccess, connectfailed)
}

var interval_position = -1;
var control_macrolist = [];


function init_controls_panel() {
    loadmacrolist();
}

function hideAxiscontrols() {
    document.getElementById('JogBar').style.display = 'none';
    document.getElementById('HomeZ').style.display = 'none';
    document.getElementById('CornerZ').style.display = 'block';
    document.getElementById('control_z_position_display').style.display = 'none';
    document.getElementById('control_zm_position_row').style.display = 'none';
    document.getElementById('z_velocity_display').style.display = 'none';
}

function showAxiscontrols() {
    document.getElementById('CornerZ').style.display = 'none';
    document.getElementById('JogBar').style.display = 'block';
    document.getElementById('HomeZ').style.display = 'block';
    document.getElementById('control_z_position_display').style.display = 'block';
    if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) {
        document.getElementById('control_zm_position_row').style.display = 'table-row';
    }
    document.getElementById('z_velocity_display').style.display = 'inline';

}

function loadmacrolist() {
    control_macrolist = [];
    var url = "/macrocfg.json" + "?" + Date.now();
    //removeIf(production)
    var response = "[{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":0},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":1},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":2},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":3},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":4},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":5},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":6},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":7},{\"name\":\"\",\"glyph\":\"\",\"filename\":\"\",\"target\":\"\",\"class\":\"\",\"index\":8}]";
    processMacroGetSuccess(response);
    return;
    //endRemoveIf(production)
    SendGetHttp(url, processMacroGetSuccess, processMacroGetFailed);
}

function Macro_build_list(response_text) {
    var response = [];
    try {
        if (response_text.length != 0) {
            response = JSON.parse(response_text);
        }
    } catch (e) {
        console.error("Parsing error:", e);
    }
    for (var i = 0; i < 9; i++) {
        var entry;
        if ((response.length != 0) && (typeof(response[i].name) !== 'undefined' && typeof(response[i].glyph) !== 'undefined' && typeof(response[i].filename) !== 'undefined' && typeof(response[i].target) !== 'undefined' && typeof(response[i].class) !== 'undefined' && typeof(response[i].index) !== 'undefined')) {
            entry = {
                name: response[i].name,
                glyph: response[i].glyph,
                filename: response[i].filename,
                target: response[i].target,
                class: response[i].class,
                index: response[i].index
            };
        } else {
            entry = {
                name: '',
                glyph: '',
                filename: '',
                target: '',
                class: '',
                index: i
            };
        }
        control_macrolist.push(entry);
    }
    control_build_macro_ui();
}

function processMacroGetSuccess(response) {
    if (response.indexOf("<HTML>") == -1) Macro_build_list(response);
    else Macro_build_list("");
}

function processMacroGetFailed(errorcode, response) {
    console.log("Error " + errorcode + " : " + response);
    Macro_build_list("");
}

function on_autocheck_position(use_value) {
    if (typeof(use_value) !== 'undefined') document.getElementById('autocheck_position').checked = use_value;
    if (document.getElementById('autocheck_position').checked) {
        var interval = parseInt(document.getElementById('posInterval_check').value);
        if (!isNaN(interval) && interval > 0 && interval < 100) {
            if (interval_position != -1) clearInterval(interval_position);
            interval_position = setInterval(function() {
                get_Position()
            }, interval * 1000);
        } else {
            document.getElementById('autocheck_position').checked = false;
            document.getElementById('posInterval_check').value = 0;
            if (interval_position != -1) clearInterval(interval_position);
            interval_position = -1;
        }
    } else {
        if (interval_position != -1) clearInterval(interval_position);
        interval_position = -1;
    }
}

function onPosIntervalChange() {
    var interval = parseInt(document.getElementById('posInterval_check').value);
    if (!isNaN(interval) && interval > 0 && interval < 100) {
        on_autocheck_position();
    } else {
        document.getElementById('autocheck_position').checked = false;
        document.getElementById('posInterval_check').value = 0;
        if (interval != 0) alertdlg(translate_text_item("Out of range"), translate_text_item("Value of auto-check must be between 0s and 99s !!"));
        on_autocheck_position();
    }
}

function get_Position() {
    var command = "M114";
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        command = "?";
        SendPrinterCommand(command, false, null, null, 114, 1);
    } else if (target_firmware == "marlin-embedded") {
        SendPrinterCommand(command, false, null, null, 114, 1);
    } else SendPrinterCommand(command, false, process_Position, null, 114, 1);
}

function Control_get_position_value(label, result_data) {
    var result = "";
    var pos1 = result_data.indexOf(label, 0);
    if (pos1 > -1) {
        pos1 += label.length;
        var pos2 = result_data.indexOf(" ", pos1);
        if (pos2 > -1) {
            result = result_data.substring(pos1, pos2);
        } else result = result_data.substring(pos1);
    }
    return result.trim();
}

function process_Position(response) {
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) {
        process_grbl_position(response);
    } else {
        document.getElementById('control_x_position').innerHTML = Control_get_position_value("X:", response);
        document.getElementById('control_y_position').innerHTML = Control_get_position_value("Y:", response);
        document.getElementById('control_z_position').innerHTML = Control_get_position_value("Z:", response);
    }
}

function control_motorsOff() {
    var command = "M84";
    SendPrinterCommand(command, true);
}

function SendHomecommand(cmd) {
    if (document.getElementById('lock_UI').checked) return;
    if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) {
        switch (cmd) {
            case 'G28':
                cmd = '$H';
                break;
            case 'G28 X0':
                cmd = '$HX';
                break;
            case 'G28 Y0':
                cmd = '$HY';
                break;

            case 'G28 Z0':
                if (grblaxis > 3) {
                    cmd = '$H' + document.getElementById('control_select_axis').value;
                } else cmd = '$HZ';
                break;
            default:
                cmd = '$H';
                break;
        }

    }
    SendPrinterCommand(cmd, true, get_Position);
}

function SendZerocommand(cmd) {
    var command = "G10 L20 P0 " + cmd;
    SendPrinterCommand(command, true, get_Position);
}

function SendJogcommand(cmd, feedrate) {
    if (document.getElementById('lock_UI').checked) return;
    var feedratevalue = "";
    var command = "";
    if (feedrate == "XYfeedrate") {
        feedratevalue = parseInt(document.getElementById('control_xy_velocity').value);
        if (feedratevalue < 1 || isNaN(feedratevalue) || (feedratevalue === null)) {
            alertdlg(translate_text_item("Out of range"), translate_text_item("XY Feedrate value must be at least 1 mm/min!"));
            document.getElementById('control_xy_velocity').value = preferenceslist[0].xy_feedrate;
            return;
        }
    } else {
        feedratevalue = parseInt(document.getElementById('control_z_velocity').value);
        if (feedratevalue < 1 || isNaN(feedratevalue) || (feedratevalue === null)) {
            var letter = "Z";
            if ((target_firmware == "grbl-embedded") && (grblaxis > 3)) letter = "Axis";
            alertdlg(translate_text_item("Out of range"), translate_text_item( letter +" Feedrate value must be at least 1 mm/min!"));
            document.getElementById('control_z_velocity').value = preferenceslist[0].z_feedrate;
            return;
        }
    }
    if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) {
        if(grblaxis > 3){
            var letter = document.getElementById('control_select_axis').value;
            cmd = cmd.replace("Z", letter);
        }
        command = "$J=G91 G21 F" + feedratevalue + " " + cmd;
        console.log(command);
    } else command = "G91\nG1 " + cmd + " F" + feedratevalue + "\nG90";
    SendPrinterCommand(command, true, get_Position);
}

function onXYvelocityChange() {
    var feedratevalue = parseInt(document.getElementById('control_xy_velocity').value);
    if (feedratevalue < 1 || feedratevalue > 9999 || isNaN(feedratevalue) || (feedratevalue === null)) {
        //we could display error but we do not
    }
}

function onZvelocityChange() {
    var feedratevalue = parseInt(document.getElementById('control_z_velocity').value);
    if (feedratevalue < 1 || feedratevalue > 999 || isNaN(feedratevalue) || (feedratevalue === null)) {
        //we could display error but we do not
    }
}


function processMacroSave(answer) {
    if (answer == "ok") {
        //console.log("now rebuild list");
        control_build_macro_ui();
    }
}

function control_build_macro_button(index) {
    var content = "";
    var entry = control_macrolist[index];
    content += "<button class='btn fixedbutton " + control_macrolist[index].class + "' type='text' ";
    if (entry.glyph.length == 0) {
        content += "style='display:none'";
    }
    content += "onclick='macro_command (\"" + entry.target + "\",\"" + entry.filename + "\")'";
    content += "><span style='position:relative; top:3px;'>";
    if (entry.glyph.length == 0) {
        content += get_icon_svg("star");
    } else content += get_icon_svg(entry.glyph);
    content += "</span>";
    if (entry.name.length > 0) {
        content += "&nbsp;";
    }
    content += entry.name;
    content += "</button>";

    return content;
}

function control_build_macro_ui() {
    var content = "<button class='btn btn-primary' onclick='showmacrodlg(processMacroSave)'>";
    content += "<span class='badge'>";
    content += "<svg width='1.3em' height='1.2em' viewBox='0 0 1300 1200'>";
    content += "<g transform='translate(50,1200) scale(1, -1)'>";
    content += "<path  fill='currentColor' d='M407 800l131 353q7 19 17.5 19t17.5 -19l129 -353h421q21 0 24 -8.5t-14 -20.5l-342 -249l130 -401q7 -20 -0.5 -25.5t-24.5 6.5l-343 246l-342 -247q-17 -12 -24.5 -6.5t-0.5 25.5l130 400l-347 251q-17 12 -14 20.5t23 8.5h429z'></path>";
    content += "</g>";
    content += "</svg>";
    content += "<svg width='1.3em' height='1.2em' viewBox='0 0 1300 1200'>";
    content += "<g transform='translate(50,1200) scale(1, -1)'>";
    content += "<path  fill='currentColor' d='M1011 1210q19 0 33 -13l153 -153q13 -14 13 -33t-13 -33l-99 -92l-214 214l95 96q13 14 32 14zM1013 800l-615 -614l-214 214l614 614zM317 96l-333 -112l110 335z'></path>";
    content += "</g>";
    content += "</svg>";
    content += "</span>";
    content += "</button>";
    for (var i = 0; i < 9; i++) {
        content += control_build_macro_button(i);
    }
    document.getElementById('Macro_list').innerHTML = content;
}

function macro_command(target, filename) {
    var cmd = ""
    if (target == "ESP") {
        cmd = "[ESP700]" + filename;
    } else if (target == "SD") {
        files_print_filename(filename);
    } else if (target == "URI") {
        window.open(filename);
    } else return;
    //console.log(cmd);
    SendPrinterCommand(cmd);
}

//Credits dialog
function creditsdlg() {
    var modal = setactiveModal('creditsdlg.html');
    if (modal == null) return;
    showModal();
}
// Functions to handle custom messages sent via serial.
// In gcode file, M118 can be used to send messages on serial.
// This allows the microcontroller to communicate with hosts.
// Example:
//   M118 [esp3d]<your message>
//      will send "esp3d:<your message>" over serial, which can be picked up by host
//      to trigger certain actions.
//   M118 [esp3d]<function call>
//      will call the function, as long as a handler has been predefined to identify
//      the call.

function process_Custom(response) {
    var freq = 440;  // beep frequency on end of print
    var dur = 100;  // beep duration on end of print
    response = response.replace("[esp3d]","");
    if (response.startsWith("eop")) {
        // Example 1
        // Sound to play on end of print
        // Triggered by message on serial terminal
        // [ESP3D]eop
        beep(dur, freq);
    }
    if (response.startsWith("beep(")) {
        // Example 2
        // Call a function within webUI, in this case beep()
        // Triggered by message on serial terminal
        // [ESP3D]beep(100, 261)
        eval(response);
    }
}

function clear_drop_menu(event) {
    var item = get_parent_by_class(event.target, "dropdownselect");
    var ignore_id = "-1";
    if (item !== null && typeof item.id !== 'undefined') {
        ignore_id = item.id;
    }
    var list = document.getElementsByClassName("dropmenu-content");
    for (var index = 0; index < list.length; index++) {
        var item2 = get_parent_by_class(list[index], "dropdownselect");
        if (item2 !== null && typeof item2.id !== 'undefined' && item2.id != ignore_id && list[index].classList.contains('show')) {
            list[index].classList.remove('show');
        }
    }
}

function get_parent_by_class(item, classname) {
    if (item === null || typeof item === 'undefined') return null;
    if (item.classList.contains(classname)) {
        return item;
    }
    return get_parent_by_class(item.parentElement, classname);
}

function hide_drop_menu(event) {
    var item = get_parent_by_class(event.target, "dropmenu-content");
    if (typeof item !== 'undefined' && item.classList.contains('show')) {
        item.classList.remove('show');
    }
}

function showhide_drop_menu(event) {
    var item = get_parent_by_class(event.target, "dropdownselect");
    if (item === null) return;
    var menu = item.getElementsByClassName("dropmenu-content")[0];
    if (typeof menu !== 'undefined') menu.classList.toggle("show");
}
var current_active_extruder = 'T0';
var currentFR=""
var currentFLR=""

function Set_active_extruder() {
    current_active_extruder = "T" + document.getElementById('active_extruder').value;
    console.log(current_active_extruder);
}

function init_extruder_panel() {
}

function process_feedRate(msg){
        var fr = msg.replace("FR:","")
        document.getElementById('feedratecatched').innerHTML = fr;
        if (currentFR==""){
            document.getElementById('feedSelectedValue').value=parseInt(fr);
            currentFR=fr;
        }
}

function process_flowdRate(msg){
        var flr = msg.substring(msg.indexOf("Flow:")+5)
        document.getElementById('flowratecatched').innerHTML = flr;
        if (currentFLR==""){
            document.getElementById('flowSelectedValue').value=parseInt(flr);
            currentFLR=flr
        }
}

function on_extruder_length_Change() {
    var value = parseInt(document.getElementById('filament_length').value);
    if (value < 0.001 || value > 9999 || isNaN(value) || (value === null)) {
        //we could display error but we do not
    }
}

function on_extruder_velocity_Change() {
    var value = parseInt(document.getElementById('extruder_velocity').value);
    if (value < 0.001 || value > 9999 || isNaN(value) || (value === null)) {
        //we could display error but we do not
    }
}

function Extrude_cmd(extruder, direction) {
    var filament_length = parseInt(document.getElementById('filament_length').value);
    var velocity = parseInt(document.getElementById('extruder_velocity').value);
    if (velocity < 1 || velocity > 9999 || isNaN(velocity) || (velocity === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of extruder velocity must be between 1 mm/min and 9999 mm/min !"));
        return;
    }
    if (filament_length < 0.001 || filament_length > 9999 || isNaN(filament_length) || (filament_length === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of filament length must be between 0.001 mm and 9999 mm !"));
        return;
    }
    //Todo send command by command TBD
    var command = extruder + "\n" + "G91\nG1 E" + (filament_length * direction) + " F" + velocity + "\nG90"
    SendPrinterCommand(command, true);
    //console.log(command);
}

function flowInit_cmd() {
    document.getElementById('flowSelectedValue').value = 100;
    flowSet_cmd();
}

function flowSet_cmd() {
    var command = "M221 S";
    var value = parseInt(document.getElementById('flowSelectedValue').value);
    if (value < 50 || value > 300 || isNaN(value)) {
        document.getElementById('flowSelectedValue').value = 100;
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value must be between 50% and 300% !"));
    } else {
        SendPrinterCommand(command + value, true);
    }
}

function feedInit_cmd() {
    document.getElementById('feedSelectedValue').value = 100;
    feedSet_cmd();
}

function feedSet_cmd() {
    var command = "M220 S";
    var value = parseInt(document.getElementById('feedSelectedValue').value);
    if (value < 25 || value > 150 || isNaN(value)) {
        document.getElementById('feedSelectedValue').value = 100;
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value must be between 25% and 150% !"));
    } else {
        SendPrinterCommand(command + value, true);
    }
}

function fanOff_cmd() {
    document.getElementById('fanSelectedValue').value = 0;
    fanSet_cmd();
}

function fanSet_cmd() {
    var command = "M106 S";
    var fvalue = parseInt(document.getElementById('fanSelectedValue').value);
    var value = Math.round((fvalue * 255) / 100);
    if (fvalue < 0 || fvalue > 100 || isNaN(fvalue) || fvalue === null) {
        document.getElementById('fanSelectedValue').value = 0;
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value must be between 0% and 100% !"));
    } else {
        SendPrinterCommand(command + value, true);
    }
}

function extruder_handleKeyUp(event, target) {
    if (event.keyCode == 13) {
        if (target == 'Feed') feedSet_cmd();
        else if (target == 'Flow') flowSet_cmd();
        else if (target == 'Fan') fanSet_cmd();
    }
    return true;
}

var files_currentPath = "/";
var files_filter_sd_list = false;
var files_file_list = [];
var files_file_list_cache = [];
var files_status_list = [];
var files_current_file_index = -1;
var files_error_status = "";
var tfiles_filters;
var tft_sd = "SD:"
var tft_usb = "U:"
var printer_sd = "SDCARD:"
var current_source = "/"
var last_source = "/"

function build_file_filter_list(filters_list) {
    build_accept(filters_list);
    update_files_list();
}

function update_files_list() {
    //console.log("Updating list");
    if (files_file_list.length == 0) return;
    for (var i = 0; i < files_file_list.length; i++) {
        var isdirectory = files_file_list[i].isdir;
        var file_name = files_file_list[i].name;
        files_file_list[i].isprintable = files_showprintbutton(file_name, isdirectory);
    }
    files_build_display_filelist();
}

function build_accept(file_filters_list) {
    var accept_txt = "";
    if (typeof file_filters_list != 'undefined') {
        tfiles_filters = file_filters_list.trim().split(";");
        for (var i = 0; i < tfiles_filters.length; i++) {
            var v = tfiles_filters[i].trim();
            if (v.length > 0) {
                if (accept_txt.length > 0) accept_txt += ", ";
                accept_txt += "." + v;
            }
        }
    }
    if (accept_txt.length == 0) {
        accept_txt = "*, *.*";
        tfiles_filters = "";
    }
    document.getElementById('files_input_file').accept = accept_txt;
    console.log(accept_txt);
}

function init_files_panel(dorefresh) {
    if (target_firmware == "smoothieware") {
        files_currentPath = primary_sd;
        document.getElementById('files_refresh_primary_sd_btn').innerHTML = primary_sd.substring(0, primary_sd.length - 1);
        document.getElementById('files_refresh_secondary_sd_btn').innerHTML = secondary_sd.substring(0, secondary_sd.length - 1);
        if (primary_sd.toLowerCase() != "none") document.getElementById('files_refresh_primary_sd_btn').style.display = "inline";
        if (secondary_sd.toLowerCase() != "none") document.getElementById('files_refresh_secondary_sd_btn').style.display = "inline";
        document.getElementById('files_createdir_btn').style.display = "none";
        document.getElementById('files_refresh_btn').style.display = "none";
    } else {
        if (target_firmware == "???") document.getElementById('files_refresh_btn').style.display = "none";
        else document.getElementById('files_refresh_btn').style.display = "inline";
        document.getElementById('files_refresh_primary_sd_btn').style.display = "none";
        document.getElementById('files_refresh_secondary_sd_btn').style.display = "none";
        if(target_firmware == "grbl") {
            document.getElementById('files_refresh_printer_sd_btn').style.display = 'none';
            document.getElementById('files_refresh_btn').style.display = 'none';
            document.getElementById('print_upload_btn').style.display = 'none';
            document.getElementById('files_createdir_btn').style.display = "none";
        }
    }
    if (!((target_firmware == "marlin") || (target_firmware == "???") ||(target_firmware == "grbl"))) document.getElementById('files_createdir_btn').style.display = "inline";
    else document.getElementById('files_createdir_btn').style.display = "none";
    files_set_button_as_filter(files_filter_sd_list);
    var refreshlist = true;
    if (typeof dorefresh !== 'undefined') refreshlist = dorefresh;
    if (direct_sd && refreshlist) files_refreshFiles(files_currentPath);
}

function files_set_button_as_filter(isfilter) {
    if (!isfilter) {
        document.getElementById('files_filter_glyph').innerHTML = get_icon_svg("filter", "1em", "1em");
    } else {
        document.getElementById('files_filter_glyph').innerHTML = get_icon_svg("list-alt", "1em", "1em");
    }
}

function files_filter_button(item) {
    files_filter_sd_list = !files_filter_sd_list;
    files_set_button_as_filter(files_filter_sd_list);
    files_build_display_filelist();
}

function files_build_file_line(index) {
    var content = "";
    var entry = files_file_list[index];
    var is_clickable = files_is_clickable(index);
    if ((files_filter_sd_list && entry.isprintable) || (!files_filter_sd_list)) {
        content += "<li class='list-group-item list-group-hover' >";
        content += "<div class='row'>";
        content += "<div class='col-md-5 col-sm-5 no_overflow' ";
        if (is_clickable) {
            content += "style='cursor:pointer;' onclick='files_click_file(" + index + ")'";
        }
        content += "><table><tr><td><span  style='color:DeepSkyBlue;'>";
        if (entry.isdir == true) content += get_icon_svg("folder-open");
        else content += get_icon_svg("file");
        content += "</span ></td><td>";
        if (direct_sd && (target_firmware == "marlin") && (typeof entry.sdname !== 'undefined')) {
            content += entry.sdname;
        } else {
            content += entry.name;
        }
        content += "</td></tr></table></div>";
        var sizecol = "col-md-2 col-sm-2";
        var timecol = "col-md-3 col-sm-3";
        var iconcol = "col-md-2 col-sm-2";
        if (!entry.isdir && entry.datetime == "") {
            sizecol = "col-md-4 col-sm-4";
            timecol = "hide_it";
            iconcol = "col-md-3 col-sm-3";
        }
        content += "<div class='" + sizecol + "'";
        if (is_clickable) {
            content += "style='cursor:pointer;' onclick='files_click_file(" + index + ")' ";
        }
        var size= entry.size;
        if (entry.isdir)size="";
        content += ">" +  size + "</div>";
        content += "<div class='" + timecol + "'";
        if (is_clickable) {
            content += "style='cursor:pointer;' onclick='files_click_file(" + index + ")' ";
        }
        content += ">" + entry.datetime + "</div>";
        content += "<div class='" + iconcol + "'>";
        content += "<div class='pull-right'>";
        if (entry.isprintable) {
            content += "<button class='btn btn-xs btn-default'  onclick='files_print(" + index + ")' style='padding-top: 4px;'>";
            if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) content += get_icon_svg("play", "1em", "1em");
            else content += get_icon_svg("print", "1em", "1em");
            content += "</button>";
        }
        content += "&nbsp;";
        if (files_showdeletebutton(index)) {
            content += "<button class='btn btn-xs btn-danger' onclick='files_delete(" + index + ")'  style='padding-top: 4px;'>" + get_icon_svg("trash", "1em", "1em") + "</button>";
        }
        content += "</div>";
        content += "</div>";
        content += "</div>";
        content += "</li>";
    }
    return content;
}

function files_print(index) {
    files_print_filename(files_currentPath + files_file_list[index].name);
}

function files_print_filename(filename) {
    var cmd = "";
    if (target_firmware == "smoothieware") {
        cmd = "play " + filename;
    } else if (target_firmware == "grbl-embedded") {
        SendPrinterCommand("?", false, null, null, 114, 1);
        on_autocheck_status(true);
        cmd = "[ESP220]" + filename;
    } else {
        var newfilename = filename;
        if ((current_source == tft_sd) || (current_source == tft_usb))newfilename = current_source+filename;
        cmd = "M23 " + newfilename + "\nM24";
    }
    if (target_firmware == "grbl-embedded") SendPrinterCommand(cmd);
    else SendPrinterSilentCommand(cmd);
}

function files_Createdir() {
    inputdlg(translate_text_item("Please enter directory name"), translate_text_item("Name:"), process_files_Createdir);
}

function process_files_Createdir(answer) {
    if (answer.length > 0) files_create_dir(answer.trim());
}

function files_create_dir(name) {
    if (direct_sd && !((target_firmware == "smoothieware") && files_currentPath.startsWith(secondary_sd))) {
        var cmdpath = files_currentPath;
        if (target_firmware == "smoothieware") cmdpath = files_currentPath.substring(primary_sd.length);
        var url = "/upload?path=" + encodeURIComponent(cmdpath) + "&action=createdir&filename=" + encodeURIComponent(name);
        document.getElementById('files_nav_loader').style.display = "block";
        SendGetHttp(url, files_directSD_list_success, files_directSD_list_failed);
    } else {
        var command = "";
        if (target_firmware == "smoothieware") {
            command = "mkdir " + files_currentPath + name;
        } else {
            command = "M32 " + files_currentPath + name;
        }
        SendPrinterCommand(command, true, files_proccess_and_update);
    }
}

function files_delete(index) {
    files_current_file_index = index;
    var msg = translate_text_item("Confirm deletion of directory: ");
    if (!files_file_list[index].isdir) msg = translate_text_item("Confirm deletion of file: ");
    confirmdlg(translate_text_item("Please Confirm"), msg + files_file_list[index].name, process_files_Delete);
}

function process_files_Delete(answer) {
    if (answer == "yes" && files_current_file_index != -1) files_delete_file(files_current_file_index);
    files_current_file_index = -1;
}

function files_delete_file(index) {
    files_error_status = "Delete " + files_file_list[index].name;
    if (direct_sd && !((target_firmware == "smoothieware") && files_currentPath.startsWith(secondary_sd))) {
        var cmdpath = files_currentPath;
        if (target_firmware == "smoothieware") cmdpath = files_currentPath.substring(primary_sd.length);
        var url = "/upload?path=" + encodeURIComponent(cmdpath) + "&action=";
        if (files_file_list[index].isdir) {
            url += "deletedir&filename=";
        } else {
            url += "delete&filename=";
        }
        url += encodeURIComponent(files_file_list[index].sdname);
        document.getElementById('files_nav_loader').style.display = "block";
        SendGetHttp(url, files_directSD_list_success, files_directSD_list_failed);
    } else {
        var command = "";
        if (target_firmware == "smoothieware") {
            command = "rm " + files_currentPath + files_file_list[index].name;
        } else {
            command = "M30 ";
            if ((current_source == tft_usb)|| (current_source == tft_sd))command +=current_source;
            command += files_currentPath + files_file_list[index].name;
        }
        SendPrinterCommand(command, true, files_proccess_and_update);
    }
}

function files_proccess_and_update(answer) {
    document.getElementById('files_navigation_buttons').style.display = "block";
    if (answer.startsWith("{") && answer.endsWith("}")) {
        try {
            response = JSON.parse(answer);
            if (typeof response.status != 'undefined') {
                Monitor_output_Update(response.status + "\n");
                files_error_status = response.status;
                //console.log(files_error_status);
            }
        } catch (e) {
            console.error("Parsing error:", e);
            response = "Error";
        }

    } else {
        if (answer[answer.length - 1] != '\n') Monitor_output_Update(answer + "\n");
        else Monitor_output_Update(answer);
        answer = answer.replace("\nok", "");
        answer = answer.replace(/\n/gi, "");
        answer = answer.replace(/\r/gi, "");
        answer = answer.trim();
        console.log(answer)
        if (answer.length > 0) files_error_status = answer;
        else if (files_error_status.length == 0) files_error_status = "Done";
    }
    //console.log("error status:" + files_error_status);
    files_refreshFiles(files_currentPath);
}

function files_is_clickable(index) {
    var entry = files_file_list[index];
    if (entry.isdir) return true;
    if (direct_sd && !(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) return true;
    //not yet implemented but possible with cat command ?
    //if ( (target_firmware == "smoothieware") && entry.isprintable) return true;
    return false;
}

function files_click_file(index) {
    var entry = files_file_list[index];
    if (entry.isdir) {
        var path = files_currentPath + entry.name + "/";
        files_refreshFiles(path, true);
        return;
    }
    if (direct_sd && (!(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd)) || (target_firmware != "smoothieware"))) {
        //console.log("file on direct SD");
        var url = "";
        if (target_firmware == "smoothieware") url = files_currentPath.replace(primary_sd, "/SD/") + entry.sdname;
        else url = "/SD/" + files_currentPath + entry.sdname;
        window.open(url.replace("//", "/"));
        return;
    }
    if (target_firmware == "smoothieware" && entry.isprintable) {
        //console.log("file on smoothie SD");
        //todo use a cat command ?
        return;
    }
}

function files_showprintbutton(filename, isdir) {
    if (isdir == true) return false;
    if (target_firmware == "grbl") {
        var path = files_currentPath + filename.trim();
        if ((path.indexOf(" ") != -1) || (path.indexOf("?") != -1) || (path.indexOf("!") != -1) || (path.indexOf("~") != -1)) {
            return false;
        }
    }
    if (tfiles_filters.length == 0) {
        return true;
    }
    for (var i = 0; i < tfiles_filters.length; i++) {
        var v = "." + tfiles_filters[i].trim();
        if (filename.endsWith(v)) return true;
    }
    return false;
}

function files_showdeletebutton(index) {
    //can always deleted dile or dir ?
    //if /ext/ is serial it should failed as fw does not support it
    //var entry = files_file_list[index];    
    //if (direct_sd && !( target_firmware == "smoothieware"  && files_currentPath.startsWith(secondary_sd))) return true;
    //if (!entry.isdir) return true;
    //if ( target_firmware == "smoothieware"  && files_currentPath.startsWith("/sd/")) return true
    return true;
}

function cleanpath(path){
    var p = path;
    p.trim();
    if (p[0]!='/')p="/"+p;
    if (p!="/"){
        if (p.endsWith("/")){
            p = p .substr(0, p.length - 1);
        }
    }
    return p;
}

function files_refreshFiles(path, usecache) {
    //console.log("refresh requested " + path);
    var cmdpath = path;
    files_currentPath = path;
    if (current_source != last_source){
        files_currentPath = "/";
        path="/";
        last_source = current_source;
    }
    if ((current_source==tft_sd) || (current_source==tft_usb)){
     document.getElementById('print_upload_btn').style.display="none";
    } else {
     document.getElementById('print_upload_btn').style.display="block";
    }
    if (typeof usecache === 'undefined') usecache = false;
    document.getElementById('files_currentPath').innerHTML = files_currentPath;
    files_file_list = [];
    files_status_list = [];
    files_build_display_filelist(false);
    document.getElementById('files_list_loader').style.display = "block";
    document.getElementById('files_nav_loader').style.display = "block";
    //this is pure direct SD
    if (direct_sd && !(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) {
        if (target_firmware == "smoothieware") cmdpath = path.substring(4);
        var url = "/upload?path=" + encodeURI(cmdpath);
        //removeIf(production)
        var response = "{\"files\":[{\"name\":\"test2.gco\",\"shortname\":\"test2.gco\",\"size\":\"992 B\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"simpl3d.gcode\",\"shortname\":\"SIMPL3~1.GCO\",\"size\":\"0 B\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"patt2.g\",\"shortname\":\"patt2.g\",\"size\":\"9.73 MB\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"myfolder\",\"shortname\":\"myfolder\",\"size\":\"-1\",\"datetime\":\"2016-08-01 18:15:00\"},{\"name\":\"wconfig.ok\",\"shortname\":\"wconfig.ok\",\"size\":\"1.10 KB\",\"datetime\":\"2017-01-06 14:35:54\"},{\"name\":\"gpl.txt\",\"shortname\":\"gpl.txt\",\"size\":\"34.98 KB\",\"datetime\":\"2017-04-17 20:22:32\"},{\"name\":\"m1.g\",\"shortname\":\"m1.g\",\"size\":\"17 B\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"m2.g\",\"shortname\":\"m2.g\",\"size\":\"17 B\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"Test4.g\",\"shortname\":\"TEST4.G\",\"size\":\"20.47 KB\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"README.md\",\"shortname\":\"README.md\",\"size\":\"11.83 KB\",\"datetime\":\"2017-04-17 20:25:08\"},{\"name\":\"test file.gcode\",\"shortname\":\"TESTFI~1.GCO\",\"size\":\"11 B\",\"datetime\":\"2000-01-01 01:00:00\"},{\"name\":\"M3.g\",\"shortname\":\"M3.g\",\"size\":\"32 B\",\"datetime\":\"2000-01-01 01:00:00\"}],\"path\":\"/\",\"total\":\"14 GB\",\"used\":\"28 MB\",\"occupation\":\"1\",\"mode\":\"direct\",\"status\":\"Ok\"}";
        files_directSD_list_success(response);
        return;
        //endRemoveIf(production)
        SendGetHttp(url, files_directSD_list_success, files_directSD_list_failed);
    } else {
        //use ls or M20
        if (target_firmware == "smoothieware") {
            //workaround as ls do not like dirname ending with /
            var command = "ls -s " + cleanpath(files_currentPath);
            SendPrinterCommand(command, false, files_serial_ls_list_success, files_serial_ls_list_failed);
            //
        } else {
            var command = "M20";
            if (current_source == "SD:") {
                document.getElementById('fileSource').innerHTML="TFT SD";
                if (path.endsWith("/")){
                    var newpath = path.substring(0, path.length - 1);
                    path= newpath;
                }
                command="M20 SD:"+ path;
                
                usecache = false;
            } else if (current_source == "U:") {
                document.getElementById('fileSource').innerHTML="TFT USB";
                if (path.endsWith("/")){
                    var newpath = path.substring(0, path.length - 1);
                    path= newpath;
                }
                command="M20 U:"+ path;
                usecache = false;
            } else {
                //Standard M20
                current_source = "/";
                document.getElementById('fileSource').innerHTML=translate_text_item("SD Files");
            }
            //to avoid to query when we already have the list
            if (usecache) {
                files_serial_M20_list_display();
            } else {
                SendPrinterCommand(command, false, files_serial_M20_list_success, files_serial_M20_list_failed);
            }
        }
    }
}

function files_format_size(size) {
    var lsize = parseInt(size);
    var value = 0.0;
    var tsize = "";
    if (lsize < 1024) {
        tsize = lsize + " B";
    } else if (lsize < (1024 * 1024)) {
        value = (lsize / 1024.0);
        tsize = value.toFixed(2) + " KB";
    } else if (lsize < (1024 * 1024 * 1024)) {
        value = ((lsize / 1024.0) / 1024.0);
        tsize = value.toFixed(2) + " MB";
    } else {
        value = (((lsize / 1024.0) / 1024.0) / 1024.0);
        tsize = value.toFixed(2) + " GB";
    }
    return tsize;
}

function files_serial_M20_list_display() {
    var path = "";
    if (files_currentPath.length > 1) path = files_currentPath.substring(1);
    var folderlist = "";
    for (var i = 0; i < files_file_list_cache.length; i++) {
        //console.log("processing " + files_file_list_cache[i].name)
        var file_name = files_file_list_cache[i].name;
        if (file_name.startsWith(path) || (current_source == tft_usb)|| (current_source == tft_sd)) {
            //console.log("need display " + file_name)
            if (!((current_source == tft_usb)|| (current_source == tft_sd)))file_name = file_name.substring(path.length);
            //console.log ("file name is :" + file_name)
            if (file_name.length > 0) {
                var endpos = file_name.indexOf("/");
                if (endpos > -1) file_name = file_name.substring(0, endpos + 1);
                var isdirectory = files_file_list_cache[i].isdir;
                var isprint = files_file_list_cache[i].isprintable;
                //to workaround the directory is not listed on its own like in marlin
                if (file_name.endsWith("/")) {
                    isdirectory = true;
                    isprint = false;
                    file_name = file_name.substring(0, file_name.length - 1);
                }
                var file_entry = {
                    name: file_name,
                    size: files_file_list_cache[i].size,
                    isdir: isdirectory,
                    datetime: files_file_list_cache[i].datetime,
                    isprintable: isprint
                };
                var tag = "*" + file_name + "*";
                if ((isdirectory && folderlist.indexOf(tag) == -1) || !isdirectory) {
                    //console.log("add to list " + file_name)
                    files_file_list.push(file_entry);
                    if (isdirectory) {
                        folderlist += tag;
                    }
                }
            }
        }
    }
    files_build_display_filelist();
}

function files_serial_M20_list_success(response_text) {
    var path = "";
    var tlist = response_text.split("\n");
    if (files_currentPath.length > 1) path = files_currentPath.substring(1);
    var folderlist = "";
    files_file_list_cache = [];
    for (var i = 0; i < tlist.length; i++) {
        var line = tlist[i].trim();
        var isdirectory = false;
        var file_name = "";
        var fsize = "";
        var d = "";
        line = line.replace("\r", "");
        if (!((line.length == 0) || (line.indexOf("egin file list") > 0) || (line.indexOf("nd file list") > 0) || (line.startsWith("ok ") > 0)|| (line.indexOf(":") > 0) || (line == "ok")  || (line == "wait"))) {
            //for marlin
            if (line.startsWith("/")) {
                line = line.substring(1);
            }
            //if directory it is ending with /
            if (line.endsWith("/")) {
                isdirectory = true;
                file_name = line;
                //console.log(file_name + " is a dir");
            } else {
                //console.log(line + " is a file");
                if ((target_firmware == "repetier") || (target_firmware == "repetier4davinci") || (target_firmware == "marlin")) {
                    var pos = line.lastIndexOf(" ");
                    if (pos != -1) {
                        file_name = line.substr(0, pos);
                        fsize = files_format_size(parseInt(line.substr(pos + 1)));
                    } else {
                        file_name = line;
                        fsize = "";
                    }
                } else file_name = line;
            }
            //console.log("pushing " + file_name );
            var isprint = files_showprintbutton(file_name, isdirectory);
            //var tag = "*" + file_name + "*";
            var file_entry = {
                name: file_name,
                size: fsize,
                isdir: isdirectory,
                datetime: d,
                isprintable: isprint
            };
            files_file_list_cache.push(file_entry);
        }
    }
    files_serial_M20_list_display();
}

function files_is_filename(file_name) {
    var answer = true;
    var s_name = String(file_name);
    var rg1 = /^[^\\/:\*\?"<>\|]+$/; // forbidden characters \ / : * ? " < > |
    var rg2 = /^\./; // cannot start with dot (.)
    var rg3 = /^(nul|prn|con|lpt[0-9]|com[0-9])(\.|$)/i; // forbidden file names
    //a 
    answer = rg1.test(file_name) && !rg2.test(file_name) && !rg3.test(file_name)
    if ((s_name.length == 0) || (s_name.indexOf(":") != -1) || (s_name.indexOf("..") != -1)) answer = false;

    return answer;
}

function files_serial_ls_list_success(response_text) {
    var tlist = response_text.split("\n");
    for (var i = 0; i < tlist.length; i++) {
        var line = tlist[i].trim();
        var isdirectory = false;
        var file_name = "";
        var fsize = "";
        var d = ""
        var command = "ls -s " +  cleanpath(files_currentPath);
        if (line == command) continue;
        if (line.length != 0) {
            if (line.endsWith("/")) {
                isdirectory = true;
                file_name = line.substring(0, line.length - 1);
            } else {
                var pos = line.lastIndexOf(" ");
                file_name = line.substr(0, pos);
                fsize = files_format_size(parseInt(line.substr(pos + 1)));
            }
            var isprint = files_showprintbutton(file_name, isdirectory);
            if (files_is_filename(file_name)) {
                var file_entry = {
                    name: file_name,
                    size: fsize,
                    isdir: isdirectory,
                    datetime: d,
                    isprintable: isprint
                };
                files_file_list.push(file_entry);
            }
        }
    }
    files_build_display_filelist();
}

function files_directSD_list_success(response_text) {
    var error = false;
    var response;
    document.getElementById('files_navigation_buttons').style.display = "block";
    try {
        response = JSON.parse(response_text);
    } catch (e) {
        console.error("Parsing error:", e);
        error = true;
    }
    if (error || typeof response.status == 'undefined') {
        files_directSD_list_failed(406, translate_text_item("Wrong data", true));
        return;
    }
    files_file_list = [];
    files_status_list = [];
    if (typeof response.files != 'undefined') {
        for (var i = 0; i < response.files.length; i++) {
            var file_name = "";
            var isdirectory = false;
            var fsize = "";
            if (response.files[i].size == "-1") isdirectory = true;
            else fsize = response.files[i].size;
            if (target_firmware == "marlin") {
                file_name = response.files[i].shortname;
            } else {
                file_name = response.files[i].name;
            }
            var isprint = files_showprintbutton(file_name, isdirectory);
            var file_entry = {
                name: file_name,
                sdname: response.files[i].name,
                size: fsize,
                isdir: isdirectory,
                datetime: response.files[i].datetime,
                isprintable: isprint
            };
            files_file_list.push(file_entry);
        }
    }
    var vtotal = "-1";
    var vused = "-1";
    var voccupation = "-1";
    if (typeof response.total != 'undefined') vtotal = response.total;
    if (typeof response.used != 'undefined') vused = response.used;
    if (typeof response.occupation != 'undefined') voccupation = response.occupation;
    files_status_list.push({
        status: translate_text_item(response.status),
        path: response.path,
        used: vused,
        total: vtotal,
        occupation: voccupation
    });
    files_build_display_filelist();
}

function files_serial_M20_list_failed(error_code, response) {
    document.getElementById('files_navigation_buttons').style.display = "block";
    if (esp_error_code !=0){
         alertdlg (translate_text_item("Error") + " (" + esp_error_code + ")", esp_error_message);
         esp_error_code = 0;
    } else {
        alertdlg (translate_text_item("Error"), translate_text_item("No connection"));
    }
    files_build_display_filelist(false);
}

function files_serial_ls_list_failed(error_code, response) {
    files_serial_M20_list_failed(error_code, response);
}

function files_directSD_list_failed(error_code, response) {
    files_serial_M20_list_failed(error_code, response);
}

function need_up_level() {
    if (target_firmware == "smoothieware" && (files_currentPath == primary_sd || files_currentPath == secondary_sd)) return false;
    if (files_currentPath == "/") return false;
    return true;
}

function files_go_levelup() {
    var tlist = files_currentPath.split("/");
    var path = "/";
    var nb = 1;
    while (nb < (tlist.length - 2)) {
        path += tlist[nb] + "/";
        nb++;
    }
    files_refreshFiles(path, true);
}

function files_build_display_filelist(displaylist) {
    var content = "";
    document.getElementById('files_uploading_msg').style.display = "none";
    if (typeof displaylist == 'undefined') displaylist = true;
    document.getElementById('files_list_loader').style.display = "none";
    document.getElementById('files_nav_loader').style.display = "none";
    if (!displaylist) {
        document.getElementById('files_status_sd_status').style.display = "none";
        document.getElementById('files_space_sd_status').style.display = "none";
        document.getElementById('files_fileList').innerHTML = "";
        document.getElementById('files_fileList').style.display = "none";
        return;
    }
    if (need_up_level()) {
        content += "<li class='list-group-item list-group-hover' style='cursor:pointer' onclick='files_go_levelup()''>";
        content += "<span >" + get_icon_svg("level-up") + "</span>&nbsp;&nbsp;<span translate>Up...</span>";
        content += "</li>";
    }
    files_file_list.sort(function(a, b) {
        return compareStrings(a.name, b.name);
    });
    for (var index = 0; index < files_file_list.length; index++) {
        if (files_file_list[index].isdir == false) content += files_build_file_line(index);
    }
    for (index = 0; index < files_file_list.length; index++) {
        if (files_file_list[index].isdir) content += files_build_file_line(index);
    }
    document.getElementById('files_fileList').style.display = "block";
    document.getElementById('files_fileList').innerHTML = content;
    if ((files_status_list.length == 0) && (files_error_status != "")) {
        files_status_list.push({
            status: files_error_status,
            path: files_currentPath,
            used: "-1",
            total: "-1",
            occupation: "-1"
        });
    }
    if (files_status_list.length > 0) {
        if (files_status_list[0].total != "-1") {
            document.getElementById('files_sd_status_total').innerHTML = files_status_list[0].total;
            document.getElementById('files_sd_status_used').innerHTML = files_status_list[0].used;
            document.getElementById('files_sd_status_occupation').value = files_status_list[0].occupation;
            document.getElementById('files_sd_status_percent').innerHTML = files_status_list[0].occupation;
            document.getElementById('files_space_sd_status').style.display = "table-row";
        } else {
            document.getElementById('files_space_sd_status').style.display = "none";
        }
        if ((files_error_status != "") && ((files_status_list[0].status.toLowerCase() == "ok") || (files_status_list[0].status.length == 0))) {
            files_status_list[0].status = files_error_status;
        }
        files_error_status = "";
        if (files_status_list[0].status.toLowerCase() != "ok") {
            document.getElementById('files_sd_status_msg').innerHTML = translate_text_item(files_status_list[0].status, true);
            document.getElementById('files_status_sd_status').style.display = "table-row";
        } else {
            document.getElementById('files_status_sd_status').style.display = "none";
        }
    } else document.getElementById('files_space_sd_status').style.display = "none";
}

function files_progress() {
    var command = "progress";
    if (target_firmware != "smoothieware") command = "M27";
    SendPrinterCommand(command);
}

function files_abort() {
    var command = "abort";
    if (target_firmware != "smoothieware") {
        if ((target_firmware == "marlin") || (target_firmware == "marlinkimbra")) {
            command = "M108\nM108\nM108\nM524\nM27";
        } if (target_firmware == "marlin-embedded") {
            command = "M108\nM108\nM108\nM524\nM27";
        } else command = "M112";
    }
    SendPrinterCommand(command);
}

function files_select_upload() {
    document.getElementById('files_input_file').click();
}

function files_check_if_upload() {
    var canupload = true;
    var files = document.getElementById("files_input_file").files;
    if (target_firmware == "marlin" && !direct_sd) {
        for (var i = 0; i < files.length; i++) {
            var filename = files[i].name;
            //check base name can only by 8
            var sizename = filename.indexOf(".");
            if (sizename == -1) sizename = filename.length;
            if (sizename > 8) canupload = false;
            //check extension cano be more than 4 ".xxx"
            if ((filename.length - sizename) > 4) canupload = false;
            //check only one dot
            if (filename.indexOf(".") != filename.lastIndexOf(".")) canupload = false;
        }
        if (canupload == false) {
            alertdlg(translate_text_item("Error"), translate_text_item("Please use 8.3 filename only."));
            return;
        }
    }
    if (direct_sd && !(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) {
        SendPrinterCommand("[ESP200]", false, process_check_sd_presence);
    } else {
        //try ls
        if (target_firmware == "smoothieware") {
            var cmd = "ls " + cleanpath(files_currentPath);
            SendPrinterCommand(cmd, false, process_check_sd_presence);
        } else { //no reliable way to know SD is present or not so let's upload
            files_start_upload();
        }
    }
}

function process_check_sd_presence(answer) {
    //console.log(answer);
    //for direct SD there is a SD check
    if (direct_sd && !(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) {
        if (answer.indexOf("o SD card") > -1) {
            alertdlg(translate_text_item("Upload failed"), translate_text_item("No SD card detected"));
            files_error_status = "No SD card"
            files_build_display_filelist(false);
            document.getElementById('files_sd_status_msg').innerHTML = translate_text_item(files_error_status, true);
            document.getElementById('files_status_sd_status').style.display = "table-row";
        } else files_start_upload();
    } else { //for smoothiware ls say no directory
        if (target_firmware == "smoothieware") {
            if (answer.indexOf("ould not open directory") > -1) {
                alertdlg(translate_text_item("Upload failed"), translate_text_item("No SD card detected"));
                files_error_status = "No SD card"
                files_build_display_filelist(false);
                document.getElementById('files_sd_status_msg').innerHTML = translate_text_item(files_error_status, true);
                document.getElementById('files_status_sd_status').style.display = "table-row";
            } else files_start_upload();
        } else files_start_upload();
    }
    //no check for marlin / repetier as no reliable test IFAIK
}

function files_start_upload() {
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        console.log("communication locked");
        return;
    }
    var url = "/upload";
    var path = files_currentPath;
    if (direct_sd && (target_firmware == "smoothieware") && (files_currentPath.startsWith(primary_sd))) {
        path = files_currentPath.substring(primary_sd.length);
    }
    if (!direct_sd || (target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) {
        url = "/upload_serial";
        if (target_firmware == "smoothieware") {
            if (files_currentPath.startsWith(secondary_sd)) path = files_currentPath.substring(secondary_sd.length);
            else path = files_currentPath.substring(primary_sd.length);
        }
    }
    //console.log("upload from " + path );
    var files = document.getElementById("files_input_file").files;

    if (files.value == "" || typeof files[0].name === 'undefined') {
        console.log("nothing to upload");
        return;
    }
    var formData = new FormData();

    formData.append('path', path);
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var arg = path + file.name + "S";
        //append file size first to check updload is complete
        formData.append(arg, file.size);
        formData.append('myfile[]', file, path + file.name);
        //console.log( path +file.name);
    }
    files_error_status = "Upload " + file.name;
    document.getElementById('files_currentUpload_msg').innerHTML = file.name;
    document.getElementById('files_uploading_msg').style.display = "block";
    document.getElementById('files_navigation_buttons').style.display = "none";
    if (direct_sd && !(target_firmware == "smoothieware" && files_currentPath.startsWith(secondary_sd))) {
        SendFileHttp(url, formData, FilesUploadProgressDisplay, files_directSD_list_success, files_directSD_list_failed);
        //console.log("send file");
    } else {
        SendFileHttp(url, formData, FilesUploadProgressDisplay, files_proccess_and_update, files_serial_M20_list_failed);
    }
    document.getElementById("files_input_file").value = "";
}


function FilesUploadProgressDisplay(oEvent) {
    if (oEvent.lengthComputable) {
        var percentComplete = (oEvent.loaded / oEvent.total) * 100;
        document.getElementById('files_prg').value = percentComplete;
        document.getElementById('files_percent_upload').innerHTML = percentComplete.toFixed(0);
    } else {
        // Impossible because size is unknown
    }
}

var interval_status = -1;
var probe_progress_status = 0;
var surface_progress_status = 0;
var grbl_error_msg = "";
var gotWCO = false;
var WCOx = 0;
var WCOy = 0;
var WCOz = 0;
var WCOa = 0;
var WCOb = 0;
var WCOc = 0;
var grblaxis = 3;
var grblzerocmd = 'X0 Y0 Z0';
var axis_Z_feedrate = 0;
var axis_A_feedrate = 0;
var axis_B_feedrate = 0;
var axis_C_feedrate = 0;
var last_axis_letter = "Z";

function build_axis_selection(){
    var html = "<select class='form-control wauto' id='control_select_axis' onchange='control_changeaxis()' >";
    for (var i = 3; i <= grblaxis; i++) {
        var letter;
        if (i == 3) letter = "Z";
        else if (i == 4) letter = "A";
        else if (i == 5) letter = "B";
        else if (i == 6) letter = "C";
        html += "<option value='" + letter + "'";
        if (i == 3) html += " selected ";
        html += ">";
        html += letter;
        html += "</option>\n";
    }
    html += "</select>\n";
   if(grblaxis > 3) {
       document.getElementById('axis_selection').innerHTML = html;
       document.getElementById('axis_label').innerHTML = translate_text_item("Axis") + ":";
       document.getElementById('axis_selection').style.display = "table-row"
   }
}

function control_changeaxis(){
    var letter = document.getElementById('control_select_axis').value;
    document.getElementById('axisup').innerHTML = '+'+letter;
    document.getElementById('axisdown').innerHTML = '-'+letter;
    document.getElementById('homeZlabel').innerHTML = ' '+letter+' ';
    switch(last_axis_letter) {
        case "Z":
            axis_Z_feedrate = document.getElementById('control_z_velocity').value;
        break;
        case "A":
            axis_A_feedrate = document.getElementById('control_z_velocity').value;
        break;
        case "B":
            axis_B_feedrate = document.getElementById('control_z_velocity').value;
        break;
        case "C":
            axis_C_feedrate = document.getElementById('control_z_velocity').value;
        break;
    }
    
    last_axis_letter = letter;
     switch(last_axis_letter) {
        case "Z":
            document.getElementById('control_z_velocity').value = axis_Z_feedrate;
        break;
        case "A":
            document.getElementById('control_z_velocity').value = axis_A_feedrate;
        break;
        case "B":
            document.getElementById('control_z_velocity').value = axis_B_feedrate;
        break;
        case "C":
            document.getElementById('control_z_velocity').value = axis_C_feedrate;
        break;
    }
}

function init_grbl_panel() {
    grbl_set_probe_detected(false);
    if (target_firmware == "grbl-embedded") {
        on_autocheck_status(true);
    }
}

function grbl_clear_status() {
    grbl_set_probe_detected(false);
    grbl_error_msg = "";
    document.getElementById('grbl_status_text').innerHTML = grbl_error_msg;
    document.getElementById('grbl_status').innerHTML = "";
}

function grbl_set_probe_detected(state) {
    if (state) {
        document.getElementById('touch_status_icon').innerHTML = get_icon_svg("ok-circle", "1.3em", "1.2em", "green");
    } else {
        document.getElementById('touch_status_icon').innerHTML = get_icon_svg("record", "1.3em", "1.2em", "grey");
    }
}

function onprobemaxtravelChange() {
    var travel = parseFloat(document.getElementById('probemaxtravel').value);
    if (travel > 9999 || travel <= 0 || isNaN(travel) || (travel === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of maximum probe travel must be between 1 mm and 9999 mm !"));
        return false;
    }
    return true;
}

function onprobefeedrateChange() {
    var feedratevalue = parseInt(document.getElementById('probefeedrate').value);
    if (feedratevalue <= 0 || feedratevalue > 9999 || isNaN(feedratevalue) || (feedratevalue === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of probe feedrate must be between 1 mm/min and 9999 mm/min !"));
        return false
    }
    return true
}

function onprobetouchplatethicknessChange() {
    var thickness = parseFloat(document.getElementById('probetouchplatethickness').value);
    if (thickness <= 0 || thickness > 999 || isNaN(thickness) || (thickness === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of probe touch plate thickness must be between 0 mm and 9999 mm !"));
        return false;
    }
    return true;
}

function onsurfacewidthChange() {
    var travel = parseFloat(document.getElementById('surfacewidth').value);
    if (travel > 9999 || travel <= 0 || isNaN(travel) || (travel === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of surface width must be between 1 mm and 9999 mm !"));
        return false;
    }
    return true;
}

function onsurfacelengthChange() {
    var travel = parseFloat(document.getElementById('surfacelength').value);
    if (travel > 9999 || travel <= 0 || isNaN(travel) || (travel === null)) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("Value of surface length must be between 1 mm and 9999 mm !"));
        return false;
    }
    return true;
}

function on_autocheck_status(use_value) {
    if (probe_progress_status != 0) {
        document.getElementById('autocheck_status').checked = true;
        return;
    }
    if (typeof(use_value) !== 'undefined') document.getElementById('autocheck_status').checked = use_value;
    if (document.getElementById('autocheck_status').checked) {
        var interval = parseInt(document.getElementById('statusInterval_check').value);
        if (!isNaN(interval) && interval > 0 && interval < 100) {
            if (interval_status != -1) clearInterval(interval_status);
            interval_status = setInterval(function() {
                get_status()
            }, interval * 1000);
        } else {
            document.getElementById('autocheck_status').checked = false;
            document.getElementById('statusInterval_check').value = 0;
            if (interval_status != -1) clearInterval(interval_status);
            interval_status = -1;
        }
    } else {
        if (interval_status != -1) clearInterval(interval_status);
        interval_status = -1;
    }

    if (document.getElementById('autocheck_status').checked == false) {
        grbl_clear_status();
    }
}

function onstatusIntervalChange() {
    var interval = parseInt(document.getElementById('statusInterval_check').value);
    if (!isNaN(interval) && interval > 0 && interval < 100) {
        on_autocheck_status();
    } else {
        document.getElementById('autocheck_status').checked = false;
        document.getElementById('statusInterval_check').value = 0;
        if (interval != 0) alertdlg(translate_text_item("Out of range"), translate_text_item("Value of auto-check must be between 0s and 99s !!"));
        on_autocheck_status();
    }
}

//TODO handle authentication issues
//errorfn cannot be NULL
function get_status() {
    var command = "?";
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) command = "?";
    //ID 114 is same as M114 as '?' cannot be an ID
    if (target_firmware == "grbl")SendPrinterSilentCommand(command, null, null, 114, 1);
    else SendPrinterCommand(command, false, null, null, 114, 1);
}

function process_grbl_position(response) {
    var tab1 = response.split("WCO:");
    if (tab1.length > 1) {
        var tab2 = tab1[1].split("|");
        var tab1 = tab2[0].split(">");
        var tab3 = tab1[0].split(",");
        WCOx = parseFloat(tab3[0]);
        if (tab3.length > 1) {
            WCOy = parseFloat(tab3[1]);
        } else {
            WCOy = 0;
        }
        if ((tab3.length > 2) && (grblaxis > 2)) {
            WCOz = parseFloat(tab3[2]);
        } else {
            WCOz = 0;
        }
         if ((tab3.length > 3) && (grblaxis > 3)) {
            WCOa = parseFloat(tab3[3]);
        } else {
            WCOa = 0;
        }
         if ((tab3.length > 4) && (grblaxis > 4)){
            WCOb = parseFloat(tab3[4]);
        } else {
            WCOb = 0;
        }
         if ((tab3.length > 5) && (grblaxis > 5)) {
            WCOc = parseFloat(tab3[5]);
        } else {
            WCOc = 0;
        }
        gotWCO = true;
    }
    tab1 = response.split("WPos:");
    if (tab1.length > 1) {
        var tab2 = tab1[1].split("|");
        var tab3 = tab2[0].split(",");
        document.getElementById('control_x_position').innerHTML = tab3[0];
        if (gotWCO) document.getElementById('control_xm_position').innerHTML = (WCOx + parseFloat(tab3[0])).toFixed(3);
        if (tab3.length > 1) {
            document.getElementById('control_y_position').innerHTML = tab3[1];
            if (gotWCO) document.getElementById('control_ym_position').innerHTML = (WCOy + parseFloat(tab3[1])).toFixed(3);
        }
        if ((tab3.length > 2) && (grblaxis > 2)) {
            document.getElementById('control_z_position').innerHTML = tab3[2];
            if (gotWCO) document.getElementById('control_zm_position').innerHTML = (WCOz + parseFloat(tab3[2])).toFixed(3);
        }
        if ((tab3.length > 3) && (grblaxis > 3)) {
            document.getElementById('control_a_position').innerHTML = tab3[3];
            if (gotWCO) document.getElementById('control_am_position').innerHTML = (WCOa + parseFloat(tab3[3])).toFixed(3);
        }
        if ((tab3.length > 4) && (grblaxis > 4)) {
            document.getElementById('control_b_position').innerHTML = tab3[4];
            if (gotWCO) document.getElementById('control_bm_position').innerHTML = (WCOb + parseFloat(tab3[4])).toFixed(3);
        }
        if ((tab3.length > 5) && (grblaxis > 5)) {
            document.getElementById('control_c_position').innerHTML = tab3[5];
            if (gotWCO) document.getElementById('control_cm_position').innerHTML = (WCOc + parseFloat(tab3[5])).toFixed(3);
        }

    } else {
        tab1 = response.split("MPos:");
        if (tab1.length > 1) {
            var tab2 = tab1[1].split("|");
            var tab3 = tab2[0].split(",");
            document.getElementById('control_xm_position').innerHTML = tab3[0];
            if (gotWCO) document.getElementById('control_x_position').innerHTML = (parseFloat(tab3[0]) - WCOx).toFixed(3);
            if (tab3.length > 1) {
                document.getElementById('control_ym_position').innerHTML = tab3[1];
                if (gotWCO) document.getElementById('control_y_position').innerHTML = (parseFloat(tab3[1]) - WCOy).toFixed(3);
            }
            if ((tab3.length > 2) && (grblaxis > 2)) {
                document.getElementById('control_zm_position').innerHTML = tab3[2];
                if (gotWCO) document.getElementById('control_z_position').innerHTML = (parseFloat(tab3[2]) - WCOz).toFixed(3);
            }
            if ((tab3.length > 3) && (grblaxis > 3)) {
                document.getElementById('control_am_position').innerHTML = tab3[3];
                if (gotWCO) document.getElementById('control_a_position').innerHTML = (parseFloat(tab3[3]) - WCOa).toFixed(3);
            }
            if ((tab3.length > 4) && (grblaxis > 4)) {
                document.getElementById('control_bm_position').innerHTML = tab3[4];
                if (gotWCO) document.getElementById('control_b_position').innerHTML = (parseFloat(tab3[4]) - WCOb).toFixed(3);
            }
            if ((tab3.length > 5) && (grblaxis > 5)) {
                document.getElementById('control_cm_position').innerHTML = tab3[5];
                if (gotWCO) document.getElementById('control_c_position').innerHTML = (parseFloat(tab3[5]) - WCOc).toFixed(3);
            }
        }
    }
}

function process_grbl_status(response) {

    var tab1 = response.split("|");
    if (tab1.length > 1) {
        var tab2 = tab1[0].replace("<", "");
        document.getElementById("grbl_status").innerHTML = tab2;
        if (tab2.toLowerCase().startsWith("run")) {
            grbl_error_msg = "";
            document.getElementById('sd_resume_btn').style.display = "none";
            document.getElementById('sd_pause_btn').style.display = "table-row";
            document.getElementById('sd_reset_btn').style.display = "table-row";

        } else if (tab2.toLowerCase().startsWith("hold")) {
            grbl_error_msg = tab2;
            document.getElementById('sd_pause_btn').style.display = "none";
            document.getElementById('sd_resume_btn').style.display = "table-row";
            document.getElementById('sd_reset_btn').style.display = "table-row";

        } else if (tab2.toLowerCase().startsWith("alarm")) {
            if (probe_progress_status != 0) {
                probe_failed_notification();
            }
            if (surface_progress_status != 0) {                
                surface_failed_notification();
            }
            //grbl_error_msg = "";
            //check we are printing or not 
            if (response.indexOf("|SD:") != -1) {
                //guess print is stopped because of alarm so no need to pause
                document.getElementById('sd_pause_btn').style.display = "none";
                document.getElementById('sd_resume_btn').style.display = "table-row";
                document.getElementById('sd_reset_btn').style.display = "none";
            }
        } else { //TBC for others status
            document.getElementById('sd_pause_btn').style.display = "none";
            document.getElementById('sd_resume_btn').style.display = "none";
            document.getElementById('sd_reset_btn').style.display = "none";
        }
        if (tab2.toLowerCase().startsWith("idle")) {

            if(surface_progress_status == 100) {
                finalize_surfacing();
            }
            grbl_error_msg = "";
        }
        document.getElementById('grbl_status_text').innerHTML = translate_text_item(grbl_error_msg);
        if (tab2.toLowerCase().startsWith("alarm")) document.getElementById('clear_status_btn').style.display = "table-row";
        else document.getElementById('clear_status_btn').style.display = "none";
    }
}

function finalize_probing() {
    probe_progress_status = 0;
    document.getElementById("probingbtn").style.display = "table-row";
    document.getElementById("probingtext").style.display = "none";
    document.getElementById('sd_pause_btn').style.display = "none";
    document.getElementById('sd_resume_btn').style.display = "none";
    document.getElementById('sd_reset_btn').style.display = "none";    
}

function finalize_surfacing() {
    surface_progress_status = 0;
    grbl_error_msg = "";
    document.getElementById("surfacebtn").style.display = "table-row";
    document.getElementById("surfacingtext").style.display = "none";
    document.getElementById('sd_pause_btn').style.display = "none";
    document.getElementById('sd_resume_btn').style.display = "none";
    document.getElementById('sd_reset_btn').style.display = "none";
}

function process_grbl_SD(response) {
    var tab1 = response.split("|SD:");
    if (tab1.length > 1) {
        var tab2 = tab1[1].split("|");
        var tab3 = tab2[0].split(",");
        //TODO
        var progress = tab3[0];
        var sdname = "???";
        if (tab3.length > 1) {
            sdname = tab3[1].replace(">", "");
        } else {
            progress = progress.replace(">", "");
        }
        document.getElementById('grbl_SD_status').innerHTML = sdname + "&nbsp;<progress id='print_prg' value=" + progress + " max='100'></progress>" + progress + "%";
        if(progress == 100 & surface_progress_status != 0) {
            surface_progress_status = progress;
        }
    } else { //no SD printing
        //TODO     
        document.getElementById('grbl_SD_status').innerHTML = "";
    }
}

function process_grbl_probe_status(response) {
    var tab1 = response.split("|Pn:");
    if (tab1.length > 1) {
        var tab2 = tab1[1].split("|");
        if (tab2[0].indexOf("P") != -1) { //probe touch
            grbl_set_probe_detected(true);
        } else { //Probe did not touched
            grbl_set_probe_detected(false);
        }
    } else { //no info 
        grbl_set_probe_detected(false);
    }
}

function SendRealtimeCmd(cmd) {
    SendPrinterCommand(cmd, false, null, null, cmd.charCodeAt(0), 1);
}

function grbl_process_status(response) {
    process_grbl_position(response);
    process_grbl_status(response);
    process_grbl_SD(response);
    process_grbl_probe_status(response);
}

function grbl_reset_detected(msg) {
    console.log("Reset detected");
}

function grbl_process_msg(response) {
    if (grbl_error_msg.length == 0) grbl_error_msg = translate_text_item(response.trim());
}

function grbl_reset() {
    if (probe_progress_status != 0) probe_failed_notification();
    if (surface_progress_status != 0) surface_failed_notification();
    SendRealtimeCmd(String.fromCharCode(0x18));
}

function grbl_GetProbeResult(response) {
    console.log("yes");
    var tab1 = response.split(":");
    if (tab1.length > 2) {
        var status = tab1[2].replace("]", "");
        if (parseInt(status.trim()) == 1) {
            if (probe_progress_status != 0) {
                var cmd = "G53 G0 Z";
                var tab2 = tab1[1].split(",");
                var v = 0.0;
                v = parseFloat(tab2[2]);
                console.log("z:" + v.toString());
                cmd += v;
                SendPrinterCommand(cmd, true, null, null, 53, 1);
                cmd = "G10 L20 P0 Z" + document.getElementById('probetouchplatethickness').value;;
                SendPrinterCommand(cmd, true, null, null, 10, 1);
                cmd = "G90";
                SendPrinterCommand(cmd, true, null, null, 90, 1);
                finalize_probing();
            }
        } else {
            probe_failed_notification();
        }
    }
}

function probe_failed_notification() {
    finalize_probing();
    alertdlg(translate_text_item("Error"), translate_text_item("Probe failed !"));
    beep(70, 261);
}

function surface_failed_notification() {
    finalize_surfacing();
    alertdlg(translate_text_item("Error"), translate_text_item("Surfacing failed !"));
    beep(70, 261);
}

function StartProbeProcess() {
    var cmd = "G38.2 G91 Z-";

    if (!onprobemaxtravelChange() ||
        !onprobefeedrateChange() ||
        !onprobetouchplatethicknessChange()) {
        return;
    }
    cmd += parseFloat(document.getElementById('probemaxtravel').value) + " F" + parseInt(document.getElementById('probefeedrate').value);
    console.log(cmd);
    probe_progress_status = 1;
    on_autocheck_status(true);
    SendPrinterCommand(cmd, true, null, null, 38.2, 1);
    document.getElementById("probingbtn").style.display = "none";
    document.getElementById("probingtext").style.display = "table-row";
    grbl_error_msg = "";
    document.getElementById('grbl_status_text').innerHTML = grbl_error_msg;
}

function StartSurfaceProcess() {
    var path = "/";
    var dirname = "SurfaceWizard";    

    var bitdiam = document.getElementById('surfacebitdiam').value;;
    var stepover = document.getElementById('surfacestepover').value;;
    var feedrate = document.getElementById('surfacefeedrate').value;;
    var surfacewidth = document.getElementById('surfacewidth').value;
    var surfacelength = document.getElementById('surfacelength').value;
    var Zdepth = document.getElementById('surfacezdepth').value;
    var spindle = document.getElementById('surfacespindle').value;

    ncProg = CreateSurfaceProgram(bitdiam, stepover, feedrate, surfacewidth, surfacelength, Zdepth, spindle);

    filename = "Surface" + "_X" + surfacewidth + "_Y" + surfacelength + "_Z-" + Zdepth + ".nc";

    var blob = new Blob([ncProg], {type: "txt"});

    file = new File([blob], filename);
    
    grbl_wiz_step1_dir(path, dirname, file);
}

function grbl_wiz_step1_dir(path, dirname, file) {
    var url = "/upload?path=" + encodeURIComponent(path) + "&action=createdir&filename=" + encodeURIComponent(dirname);
    //console.log("path " + path + " dirname " + dirname + " filename " + file.name)
    SendGetHttp(url, function() { grbl_wiz_step2_upload(file, path + dirname + "/") }, function() { grbl_wiz_error_dir(path, dirname) });
}

function grbl_wiz_step2_upload(file, path) {
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        console.log("communication locked");
        return;
    }

    var url = "/upload";
    //console.log("path + file.name ", path + file.name);
    var formData = new FormData();
    var arg = path + file.name + "S";
    //append file size first to check updload is complete
    formData.append(arg, file.size);
    formData.append('path', path);
    formData.append('myfile[]', file, path + file.name);
    formData.append('path', path);
    SendFileHttp(url, formData, FilesUploadProgressDisplay, function() { grbl_wiz_step3_launch(path + filename) }, function() { grbl_wiz_error_upload(file, path)});
}

function grbl_wiz_step3_launch(filename) {
    surface_progress_status = 1;
    SendPrinterCommand("?", false, null, null, 114, 1);
    on_autocheck_status(true);
    document.getElementById("surfacebtn").style.display = "none";
    document.getElementById("surfacingtext").style.display = "table-row";
    cmd = "[ESP220]" + filename;
    SendPrinterCommand(cmd);
}

function grbl_wiz_error_dir(path, dirname) {
    alert("ERROR : Wizard couldn't create dir " + dirname + " in path " + path);
    alertdlg(translate_text_item("ERROR"), translate_text_item("Wizard couldn't create dir ") + dirname + translate_text_item(" in path ") + path);
    finalize_surfacing();
}

function grbl_wiz_error_upload(file, path) {
    alertdlg(translate_text_item("ERROR"), translate_text_item("Wizard couldn't create file ") + file.name + translate_text_item(" in path ") + path);
    finalize_surfacing();
}

function CreateSurfaceProgram(bitdiam, stepover, feedrate, surfacewidth, surfacelength, Zdepth, spindle) {
    var crlf = "\r\n";

    effectiveCuttingWidth = Math.round(1000 * (bitdiam * (1 - stepover/100))) / 1000;
    nPasses = Math.floor(surfacelength / effectiveCuttingWidth);
    lastPassWidth = surfacelength % effectiveCuttingWidth;
    
    ncProg = "G21" + crlf; // Unit = mm
    ncProg += "G90" + crlf; // Absolute Positioning
    ncProg += "G53 G0 Z-5" + crlf; // Move spindle to safe height
    ncProg += "G54" + crlf; // Work Coordinates
    ncProg += "M3 S" + spindle + crlf; // Set spindle speed
    ncProg += "G4 P1.8" + crlf; // Spindle delay
    ncProg += "G1 F" + feedrate + crlf; // Set feedrate
    ncProg += "G0 X0 Y0" + crlf; // Move to XY origin at Z-safe height
    ncProg += "G1 Z-" + Zdepth + crlf; // Move to Z origin (while starting to cut)

    var Xend = 0;
    for (var i = 0; i <= nPasses; i++) {
        Xend == 0 ? Xend = surfacewidth : Xend = 0; // alternate X (passes are in X direction)
        cmd = "G1 X" + Xend + " Y" + i * effectiveCuttingWidth + " Z-" + Zdepth;
        ncProg += cmd + crlf;
        if (i < nPasses) {
            cmd = "G1 Y" + (i+1) * effectiveCuttingWidth; // increment Y at each pass
            ncProg += cmd + crlf;
        }
    }

    if(lastPassWidth > 0) {
        Xend == 0 ? Xend = surfacewidth : Xend = 0;    // alternate X
        cmd = "G1 Y" + surfacelength;
        ncProg += cmd + crlf;
        cmd = "G1 X" + Xend + " Y" + surfacelength + " Z-" + Zdepth;
        ncProg += cmd + crlf;
    }

    ncProg += "G53 G0 Z-5" + crlf; // Move spindle to safe height
    ncProg += "M5 S0" + crlf; // Spindle off

    return ncProg;
}

var http_communication_locked = false;
var http_cmd_list = [];
var processing_cmd = false;
var xmlhttpupload;

var max_cmd = 20;

function clear_cmd_list() {
    http_cmd_list = [];
    processing_cmd = false;
}

function http_resultfn(response_text) {
    if ((http_cmd_list.length > 0) && (typeof http_cmd_list[0].resultfn != 'undefined')) {
        var fn = http_cmd_list[0].resultfn;
        fn(response_text);
    } //else console.log ("No resultfn");
    http_cmd_list.shift();
    processing_cmd = false;
    process_cmd();
}

function http_errorfn(errorcode, response_text) {
    if ((http_cmd_list.length > 0) && (typeof http_cmd_list[0].errorfn != 'undefined')) {
        var fn = http_cmd_list[0].errorfn;
        if (errorcode == 401) {
            logindlg();
            console.log("Authentication issue pls log");
        }
        fn(errorcode, response_text);
    } //else console.log ("No errorfn");
    http_cmd_list.shift();
    processing_cmd = false;
    process_cmd();
}

function process_cmd() {
    if ((http_cmd_list.length > 0) && (!processing_cmd)) {
        //console.log("Processing 1/" + http_cmd_list.length);
        //console.log("Processing " + http_cmd_list[0].cmd);
        if (http_cmd_list[0].type == "GET") {
            processing_cmd = true;
            ProcessGetHttp(http_cmd_list[0].cmd, http_resultfn, http_errorfn);
        } else if (http_cmd_list[0].type == "POST") {
            processing_cmd = true;
            if (!(http_cmd_list[0].isupload)) {
                ProcessPostHttp(http_cmd_list[0].cmd, http_cmd_list[0].data, http_resultfn, http_errorfn);
            } else {
                //console.log("Uploading");
                ProcessFileHttp(http_cmd_list[0].cmd, http_cmd_list[0].data, http_cmd_list[0].progressfn, http_resultfn, http_errorfn);
            }
        } else if (http_cmd_list[0].type == "CMD") {
            processing_cmd = true;
            var fn = http_cmd_list[0].cmd;
            fn();
            http_cmd_list.shift();
            processing_cmd = false;
            process_cmd();
        }

    } //else if (http_cmd_list.length > 0)console.log("processing"); 
}

function AddCmd(cmd_fn, id) {
    if (http_cmd_list.length > max_cmd) {
        //console.log("adding rejected");	
        return;
    }
    var cmd_id = 0;
    if (typeof id != 'undefined') cmd_id = id;
    //onsole.log("adding command");
    var cmd = {
        cmd: cmd_fn,
        type: "CMD",
        id: cmd_id
    };
    http_cmd_list.push(cmd);
    //console.log("Now " + http_cmd_list.length);
    process_cmd();
}

function SendGetHttp(url, result_fn, error_fn, id, max_id) {
    if ((http_cmd_list.length > max_cmd) && (max_cmd != -1)) {
        console.log("adding rejected");
        error_fn();
        return;
    }
    var cmd_id = 0;
    var cmd_max_id = 1;
    //console.log("ID = " + id);
    //console.log("Max ID = " + max_id);
    //console.log("+++ " + url);
    if (typeof id != 'undefined') {
        cmd_id = id;
        if (typeof max_id != 'undefined') cmd_max_id = max_id;
        //else console.log("No Max ID defined");
        for (p = 0; p < http_cmd_list.length; p++) {
            //console.log("compare " + (max_id - cmd_max_id));	
            if (http_cmd_list[p].id == cmd_id) {
                cmd_max_id--;
                //console.log("found " + http_cmd_list[p].id + " and " + cmd_id);	
            }
            if (cmd_max_id <= 0) {
                //console.log("Limit reched for " + id);	
                return;
            }
        }
    } //else console.log("No ID defined");	
    //console.log("adding " + url);
    var cmd = {
        cmd: url,
        type: "GET",
        isupload: false,
        resultfn: result_fn,
        errorfn: error_fn,
        id: cmd_id
    };
    http_cmd_list.push(cmd);
    //console.log("Now " + http_cmd_list.length);
    process_cmd();
}

function ProcessGetHttp(url, resultfn, errorfn) {
    if (http_communication_locked) {
        errorfn(503, translate_text_item("Communication locked!"));
        console.log("locked");
        return;
    }
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4) {
            if (xmlhttp.status == 200) {
                //console.log("*** " + url + " done");
                if (typeof resultfn != 'undefined' && resultfn != null) resultfn(xmlhttp.responseText);
            } else {
                if (xmlhttp.status == 401) GetIdentificationStatus();
                if (typeof errorfn != 'undefined' && errorfn != null) errorfn(xmlhttp.status, xmlhttp.responseText);
            }
        }
    }
    if (url.indexOf("?") != -1) url += "&PAGEID=" + page_id;
    //console.log("GET:" + url);
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

function SendPostHttp(url, postdata, result_fn, error_fn, id, max_id) {
    if ((http_cmd_list.length > max_cmd) && (max_cmd != -1)) {
        //console.log("adding rejected");	
        error_fn();
        return;
    }
    var cmd_id = 0;
    var cmd_max_id = 1;
    if (typeof id != 'undefined') {
        cmd_id = id;
        if (typeof max_id != 'undefined') cmd_max_id = max_id;
        for (p = 0; p < http_cmd_list.length; p++) {
            if (http_cmd_list[p].id == cmd_id) cmd_max_id--;
            if (cmd_max_id <= 0) return;
        }
    }

    //console.log("adding " + url);
    var cmd = {
        cmd: url,
        type: "POST",
        isupload: false,
        data: postdata,
        resultfn: result_fn,
        errorfn: error_fn,
        initfn: init_fn,
        id: cmd_id
    };
    http_cmd_list.push(cmd);
    process_cmd();
}

function ProcessPostHttp(url, postdata, resultfn, errorfn) {
    if (http_communication_locked) {
        errorfn(503, translate_text_item("Communication locked!"));
        return;
    }
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4) {
            if (xmlhttp.status == 200) {
                if (typeof resultfn != 'undefined' && resultfn != null) resultfn(xmlhttp.responseText);
            } else {
                if (xmlhttp.status == 401) GetIdentificationStatus();
                if (typeof errorfn != 'undefined' && errorfn != null) errorfn(xmlhttp.status, xmlhttp.responseText);
            }
        }
    }
    //console.log(url);
    xmlhttp.open("POST", url, true);
    xmlhttp.send(postdata);
}

function SendFileHttp(url, postdata, progress_fn, result_fn, error_fn) {
    if ((http_cmd_list.length > max_cmd) && (max_cmd != -1)) {
        //console.log("adding rejected");	
        error_fn();
        return;
    }
    if (http_cmd_list.length != 0) process = false;
    var cmd = {
        cmd: url,
        type: "POST",
        isupload: true,
        data: postdata,
        progressfn: progress_fn,
        resultfn: result_fn,
        errorfn: error_fn,
        id: 0
    };
    http_cmd_list.push(cmd);
    process_cmd();
}

function CancelCurrentUpload() {
    xmlhttpupload.abort();
    //http_communication_locked = false;
    console.log("Cancel Upload");
}

function ProcessFileHttp(url, postdata, progressfn, resultfn, errorfn) {
    if (http_communication_locked) {
        errorfn(503, translate_text_item("Communication locked!"));
        return;
    }
    http_communication_locked = true;
    xmlhttpupload = new XMLHttpRequest();
    xmlhttpupload.onreadystatechange = function() {
        if (xmlhttpupload.readyState == 4) {
            http_communication_locked = false;
            if (xmlhttpupload.status == 200) {
                if (typeof resultfn != 'undefined' && resultfn != null) resultfn(xmlhttpupload.responseText);
            } else {
                if (xmlhttpupload.status == 401) GetIdentificationStatus();
                if (typeof errorfn != 'undefined' && errorfn != null) errorfn(xmlhttpupload.status, xmlhttpupload.responseText);
            }
        }
    }
    //console.log(url);
    xmlhttpupload.open("POST", url, true);
    if (typeof progressfn != 'undefined' && progressfn != null) xmlhttpupload.upload.addEventListener("progress", progressfn, false);
    xmlhttpupload.send(postdata);
}

//bootstrap icons
var list_icon = {
    "hourglass": "M1000 1200v-150q0 -21 -14.5 -35.5t-35.5 -14.5h-50v-100q0 -91 -49.5 -165.5t-130.5 -109.5q81 -35 130.5 -109.5t49.5 -165.5v-150h50q21 0 35.5 -14.5t14.5 -35.5v-150h-800v150q0 21 14.5 35.5t35.5 14.5h50v150q0 91 49.5 165.5t130.5 109.5q-81 35 -130.5 109.5 t-49.5 165.5v100h-50q-21 0 -35.5 14.5t-14.5 35.5v150h800zM400 1000v-100q0 -60 32.5 -109.5t87.5 -73.5q28 -12 44 -37t16 -55t-16 -55t-44 -37q-55 -24 -87.5 -73.5t-32.5 -109.5v-150h400v150q0 60 -32.5 109.5t-87.5 73.5q-28 12 -44 37t-16 55t16 55t44 37 q55 24 87.5 73.5t32.5 109.5v100h-400z",
    "cloud": "M503 1089q110 0 200.5 -59.5t134.5 -156.5q44 14 90 14q120 0 205 -86.5t85 -206.5q0 -121 -85 -207.5t-205 -86.5h-750q-79 0 -135.5 57t-56.5 137q0 69 42.5 122.5t108.5 67.5q-2 12 -2 37q0 153 108 260.5t260 107.5z",
    "envelope": "M25 1100h1150q10 0 12.5 -5t-5.5 -13l-564 -567q-8 -8 -18 -8t-18 8l-564 567q-8 8 -5.5 13t12.5 5zM18 882l264 -264q8 -8 8 -18t-8 -18l-264 -264q-8 -8 -13 -5.5t-5 12.5v550q0 10 5 12.5t13 -5.5zM918 618l264 264q8 8 13 5.5t5 -12.5v-550q0 -10 -5 -12.5t-13 5.5 l-264 264q-8 8 -8 18t8 18zM818 482l364 -364q8 -8 5.5 -13t-12.5 -5h-1150q-10 0 -12.5 5t5.5 13l364 364q8 8 18 8t18 -8l164 -164q8 -8 18 -8t18 8l164 164q8 8 18 8t18 -8z",
    "pencil": "M1011 1210q19 0 33 -13l153 -153q13 -14 13 -33t-13 -33l-99 -92l-214 214l95 96q13 14 32 14zM1013 800l-615 -614l-214 214l614 614zM317 96l-333 -112l110 335z",
    "music": "M368 1017l645 163q39 15 63 0t24 -49v-831q0 -55 -41.5 -95.5t-111.5 -63.5q-79 -25 -147 -4.5t-86 75t25.5 111.5t122.5 82q72 24 138 8v521l-600 -155v-606q0 -42 -44 -90t-109 -69q-79 -26 -147 -5.5t-86 75.5t25.5 111.5t122.5 82.5q72 24 138 7v639q0 38 14.5 59 t53.5 34z",
    "search": "M500 1191q100 0 191 -39t156.5 -104.5t104.5 -156.5t39 -191l-1 -2l1 -5q0 -141 -78 -262l275 -274q23 -26 22.5 -44.5t-22.5 -42.5l-59 -58q-26 -20 -46.5 -20t-39.5 20l-275 274q-119 -77 -261 -77l-5 1l-2 -1q-100 0 -191 39t-156.5 104.5t-104.5 156.5t-39 191 t39 191t104.5 156.5t156.5 104.5t191 39zM500 1022q-88 0 -162 -43t-117 -117t-43 -162t43 -162t117 -117t162 -43t162 43t117 117t43 162t-43 162t-117 117t-162 43z",
    "heart": "M649 949q48 68 109.5 104t121.5 38.5t118.5 -20t102.5 -64t71 -100.5t27 -123q0 -57 -33.5 -117.5t-94 -124.5t-126.5 -127.5t-150 -152.5t-146 -174q-62 85 -145.5 174t-150 152.5t-126.5 127.5t-93.5 124.5t-33.5 117.5q0 64 28 123t73 100.5t104 64t119 20 t120.5 -38.5t104.5 -104z",
    "star": "M407 800l131 353q7 19 17.5 19t17.5 -19l129 -353h421q21 0 24 -8.5t-14 -20.5l-342 -249l130 -401q7 -20 -0.5 -25.5t-24.5 6.5l-343 246l-342 -247q-17 -12 -24.5 -6.5t-0.5 25.5l130 400l-347 251q-17 12 -14 20.5t23 8.5h429z",
    "star-empty": "M407 800l131 353q7 19 17.5 19t17.5 -19l129 -353h421q21 0 24 -8.5t-14 -20.5l-342 -249l130 -401q7 -20 -0.5 -25.5t-24.5 6.5l-343 246l-342 -247q-17 -12 -24.5 -6.5t-0.5 25.5l130 400l-347 251q-17 12 -14 20.5t23 8.5h429zM477 700h-240l197 -142l-74 -226 l193 139l195 -140l-74 229l192 140h-234l-78 211z",
    "user": "M600 1200q124 0 212 -88t88 -212v-250q0 -46 -31 -98t-69 -52v-75q0 -10 6 -21.5t15 -17.5l358 -230q9 -5 15 -16.5t6 -21.5v-93q0 -10 -7.5 -17.5t-17.5 -7.5h-1150q-10 0 -17.5 7.5t-7.5 17.5v93q0 10 6 21.5t15 16.5l358 230q9 6 15 17.5t6 21.5v75q-38 0 -69 52 t-31 98v250q0 124 88 212t212 88z",
    "th-large": "M50 1100h400q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-400q-21 0 -35.5 14.5t-14.5 35.5v400q0 21 14.5 35.5t35.5 14.5zM650 1100h400q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-400q-21 0 -35.5 14.5t-14.5 35.5v400 q0 21 14.5 35.5t35.5 14.5zM50 500h400q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-400q-21 0 -35.5 14.5t-14.5 35.5v400q0 21 14.5 35.5t35.5 14.5zM650 500h400q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-400 q-21 0 -35.5 14.5t-14.5 35.5v400q0 21 14.5 35.5t35.5 14.5z",
    "th": "M50 1100h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 1100h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200 q0 21 14.5 35.5t35.5 14.5zM850 1100h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM50 700h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200 q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 700h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM850 700h200q21 0 35.5 -14.5t14.5 -35.5v-200 q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM50 300h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 300h200 q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM850 300h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5 t35.5 14.5z",
    "th-list": "M50 1100h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 1100h700q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-700q-21 0 -35.5 14.5t-14.5 35.5v200 q0 21 14.5 35.5t35.5 14.5zM50 700h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 700h700q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-700 q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM50 300h200q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5zM450 300h700q21 0 35.5 -14.5t14.5 -35.5v-200 q0 -21 -14.5 -35.5t-35.5 -14.5h-700q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5z",
    "ok": "M465 477l571 571q8 8 18 8t17 -8l177 -177q8 -7 8 -17t-8 -18l-783 -784q-7 -8 -17.5 -8t-17.5 8l-384 384q-8 8 -8 18t8 17l177 177q7 8 17 8t18 -8l171 -171q7 -7 18 -7t18 7z",
    "remove": "M904 1083l178 -179q8 -8 8 -18.5t-8 -17.5l-267 -268l267 -268q8 -7 8 -17.5t-8 -18.5l-178 -178q-8 -8 -18.5 -8t-17.5 8l-268 267l-268 -267q-7 -8 -17.5 -8t-18.5 8l-178 178q-8 8 -8 18.5t8 17.5l267 268l-267 268q-8 7 -8 17.5t8 18.5l178 178q8 8 18.5 8t17.5 -8 l268 -267l268 268q7 7 17.5 7t18.5 -7z",
    "zoom-in": "M507 1177q98 0 187.5 -38.5t154.5 -103.5t103.5 -154.5t38.5 -187.5q0 -141 -78 -262l300 -299q8 -8 8 -18.5t-8 -18.5l-109 -108q-7 -8 -17.5 -8t-18.5 8l-300 299q-119 -77 -261 -77q-98 0 -188 38.5t-154.5 103t-103 154.5t-38.5 188t38.5 187.5t103 154.5 t154.5 103.5t188 38.5zM506.5 1023q-89.5 0 -165.5 -44t-120 -120.5t-44 -166t44 -165.5t120 -120t165.5 -44t166 44t120.5 120t44 165.5t-44 166t-120.5 120.5t-166 44zM425 900h150q10 0 17.5 -7.5t7.5 -17.5v-75h75q10 0 17.5 -7.5t7.5 -17.5v-150q0 -10 -7.5 -17.5 t-17.5 -7.5h-75v-75q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v75h-75q-10 0 -17.5 7.5t-7.5 17.5v150q0 10 7.5 17.5t17.5 7.5h75v75q0 10 7.5 17.5t17.5 7.5z",
    "zoom-out": "M507 1177q98 0 187.5 -38.5t154.5 -103.5t103.5 -154.5t38.5 -187.5q0 -141 -78 -262l300 -299q8 -8 8 -18.5t-8 -18.5l-109 -108q-7 -8 -17.5 -8t-18.5 8l-300 299q-119 -77 -261 -77q-98 0 -188 38.5t-154.5 103t-103 154.5t-38.5 188t38.5 187.5t103 154.5 t154.5 103.5t188 38.5zM506.5 1023q-89.5 0 -165.5 -44t-120 -120.5t-44 -166t44 -165.5t120 -120t165.5 -44t166 44t120.5 120t44 165.5t-44 166t-120.5 120.5t-166 44zM325 800h350q10 0 17.5 -7.5t7.5 -17.5v-150q0 -10 -7.5 -17.5t-17.5 -7.5h-350q-10 0 -17.5 7.5 t-7.5 17.5v150q0 10 7.5 17.5t17.5 7.5z",
    "off": "M550 1200h100q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v400q0 21 14.5 35.5t35.5 14.5zM800 975v166q167 -62 272 -209.5t105 -331.5q0 -117 -45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5 t-184.5 123t-123 184.5t-45.5 224q0 184 105 331.5t272 209.5v-166q-103 -55 -165 -155t-62 -220q0 -116 57 -214.5t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5q0 120 -62 220t-165 155z",
    "signal": "M1025 1200h150q10 0 17.5 -7.5t7.5 -17.5v-1150q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v1150q0 10 7.5 17.5t17.5 7.5zM725 800h150q10 0 17.5 -7.5t7.5 -17.5v-750q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v750 q0 10 7.5 17.5t17.5 7.5zM425 500h150q10 0 17.5 -7.5t7.5 -17.5v-450q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v450q0 10 7.5 17.5t17.5 7.5zM125 300h150q10 0 17.5 -7.5t7.5 -17.5v-250q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5 v250q0 10 7.5 17.5t17.5 7.5z",
    "cog": "M600 1174q33 0 74 -5l38 -152l5 -1q49 -14 94 -39l5 -2l134 80q61 -48 104 -105l-80 -134l3 -5q25 -44 39 -93l1 -6l152 -38q5 -43 5 -73q0 -34 -5 -74l-152 -38l-1 -6q-15 -49 -39 -93l-3 -5l80 -134q-48 -61 -104 -105l-134 81l-5 -3q-44 -25 -94 -39l-5 -2l-38 -151 q-43 -5 -74 -5q-33 0 -74 5l-38 151l-5 2q-49 14 -94 39l-5 3l-134 -81q-60 48 -104 105l80 134l-3 5q-25 45 -38 93l-2 6l-151 38q-6 42 -6 74q0 33 6 73l151 38l2 6q13 48 38 93l3 5l-80 134q47 61 105 105l133 -80l5 2q45 25 94 39l5 1l38 152q43 5 74 5zM600 815 q-89 0 -152 -63t-63 -151.5t63 -151.5t152 -63t152 63t63 151.5t-63 151.5t-152 63z",
    "trash": "M500 1300h300q41 0 70.5 -29.5t29.5 -70.5v-100h275q10 0 17.5 -7.5t7.5 -17.5v-75h-1100v75q0 10 7.5 17.5t17.5 7.5h275v100q0 41 29.5 70.5t70.5 29.5zM500 1200v-100h300v100h-300zM1100 900v-800q0 -41 -29.5 -70.5t-70.5 -29.5h-700q-41 0 -70.5 29.5t-29.5 70.5 v800h900zM300 800v-700h100v700h-100zM500 800v-700h100v700h-100zM700 800v-700h100v700h-100zM900 800v-700h100v700h-100z",
    "home": "M18 618l620 608q8 7 18.5 7t17.5 -7l608 -608q8 -8 5.5 -13t-12.5 -5h-175v-575q0 -10 -7.5 -17.5t-17.5 -7.5h-250q-10 0 -17.5 7.5t-7.5 17.5v375h-300v-375q0 -10 -7.5 -17.5t-17.5 -7.5h-250q-10 0 -17.5 7.5t-7.5 17.5v575h-175q-10 0 -12.5 5t5.5 13z",
    "file": "M600 1200v-400q0 -41 29.5 -70.5t70.5 -29.5h300v-650q0 -21 -14.5 -35.5t-35.5 -14.5h-800q-21 0 -35.5 14.5t-14.5 35.5v1100q0 21 14.5 35.5t35.5 14.5h450zM1000 800h-250q-21 0 -35.5 14.5t-14.5 35.5v250z",
    "time": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM525 900h50q10 0 17.5 -7.5t7.5 -17.5v-275h175q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-250q-10 0 -17.5 7.5t-7.5 17.5v350q0 10 7.5 17.5t17.5 7.5z",
    "download-alt": "M550 1200h200q21 0 35.5 -14.5t14.5 -35.5v-450h191q20 0 25.5 -11.5t-7.5 -27.5l-327 -400q-13 -16 -32 -16t-32 16l-327 400q-13 16 -7.5 27.5t25.5 11.5h191v450q0 21 14.5 35.5t35.5 14.5zM1125 400h50q10 0 17.5 -7.5t7.5 -17.5v-350q0 -10 -7.5 -17.5t-17.5 -7.5 h-1050q-10 0 -17.5 7.5t-7.5 17.5v350q0 10 7.5 17.5t17.5 7.5h50q10 0 17.5 -7.5t7.5 -17.5v-175h900v175q0 10 7.5 17.5t17.5 7.5z",
    "download": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM525 900h150q10 0 17.5 -7.5t7.5 -17.5v-275h137q21 0 26 -11.5t-8 -27.5l-223 -275q-13 -16 -32 -16t-32 16l-223 275q-13 16 -8 27.5t26 11.5h137v275q0 10 7.5 17.5t17.5 7.5z ",
    "upload": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM632 914l223 -275q13 -16 8 -27.5t-26 -11.5h-137v-275q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v275h-137q-21 0 -26 11.5t8 27.5l223 275q13 16 32 16 t32 -16z",
    "inbox": "M225 1200h750q10 0 19.5 -7t12.5 -17l186 -652q7 -24 7 -49v-425q0 -12 -4 -27t-9 -17q-12 -6 -37 -6h-1100q-12 0 -27 4t-17 8q-6 13 -6 38l1 425q0 25 7 49l185 652q3 10 12.5 17t19.5 7zM878 1000h-556q-10 0 -19 -7t-11 -18l-87 -450q-2 -11 4 -18t16 -7h150 q10 0 19.5 -7t11.5 -17l38 -152q2 -10 11.5 -17t19.5 -7h250q10 0 19.5 7t11.5 17l38 152q2 10 11.5 17t19.5 7h150q10 0 16 7t4 18l-87 450q-2 11 -11 18t-19 7z",
    "play-circle": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM540 820l253 -190q17 -12 17 -30t-17 -30l-253 -190q-16 -12 -28 -6.5t-12 26.5v400q0 21 12 26.5t28 -6.5z",
    "repeat": "M947 1060l135 135q7 7 12.5 5t5.5 -13v-362q0 -10 -7.5 -17.5t-17.5 -7.5h-362q-11 0 -13 5.5t5 12.5l133 133q-109 76 -238 76q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5h150q0 -117 -45.5 -224 t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5q192 0 347 -117z",
    "refresh": "M947 1060l135 135q7 7 12.5 5t5.5 -13v-361q0 -11 -7.5 -18.5t-18.5 -7.5h-361q-11 0 -13 5.5t5 12.5l134 134q-110 75 -239 75q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5h-150q0 117 45.5 224t123 184.5t184.5 123t224 45.5q192 0 347 -117zM1027 600h150 q0 -117 -45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5q-192 0 -348 118l-134 -134q-7 -8 -12.5 -5.5t-5.5 12.5v360q0 11 7.5 18.5t18.5 7.5h360q10 0 12.5 -5.5t-5.5 -12.5l-133 -133q110 -76 240 -76q116 0 214.5 57t155.5 155.5t57 214.5z",
    "list-alt": "M125 1200h1050q10 0 17.5 -7.5t7.5 -17.5v-1150q0 -10 -7.5 -17.5t-17.5 -7.5h-1050q-10 0 -17.5 7.5t-7.5 17.5v1150q0 10 7.5 17.5t17.5 7.5zM1075 1000h-850q-10 0 -17.5 -7.5t-7.5 -17.5v-850q0 -10 7.5 -17.5t17.5 -7.5h850q10 0 17.5 7.5t7.5 17.5v850 q0 10 -7.5 17.5t-17.5 7.5zM325 900h50q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-50q-10 0 -17.5 7.5t-7.5 17.5v50q0 10 7.5 17.5t17.5 7.5zM525 900h450q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-450q-10 0 -17.5 7.5t-7.5 17.5v50 q0 10 7.5 17.5t17.5 7.5zM325 700h50q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-50q-10 0 -17.5 7.5t-7.5 17.5v50q0 10 7.5 17.5t17.5 7.5zM525 700h450q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-450q-10 0 -17.5 7.5t-7.5 17.5v50 q0 10 7.5 17.5t17.5 7.5zM325 500h50q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-50q-10 0 -17.5 7.5t-7.5 17.5v50q0 10 7.5 17.5t17.5 7.5zM525 500h450q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-450q-10 0 -17.5 7.5t-7.5 17.5v50 q0 10 7.5 17.5t17.5 7.5zM325 300h50q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-50q-10 0 -17.5 7.5t-7.5 17.5v50q0 10 7.5 17.5t17.5 7.5zM525 300h450q10 0 17.5 -7.5t7.5 -17.5v-50q0 -10 -7.5 -17.5t-17.5 -7.5h-450q-10 0 -17.5 7.5t-7.5 17.5v50 q0 10 7.5 17.5t17.5 7.5z",
    "lock": "M900 800v200q0 83 -58.5 141.5t-141.5 58.5h-300q-82 0 -141 -59t-59 -141v-200h-100q-41 0 -70.5 -29.5t-29.5 -70.5v-600q0 -41 29.5 -70.5t70.5 -29.5h900q41 0 70.5 29.5t29.5 70.5v600q0 41 -29.5 70.5t-70.5 29.5h-100zM400 800v150q0 21 15 35.5t35 14.5h200 q20 0 35 -14.5t15 -35.5v-150h-300z",
    "flag": "M125 1100h50q10 0 17.5 -7.5t7.5 -17.5v-1075h-100v1075q0 10 7.5 17.5t17.5 7.5zM1075 1052q4 0 9 -2q16 -6 16 -23v-421q0 -6 -3 -12q-33 -59 -66.5 -99t-65.5 -58t-56.5 -24.5t-52.5 -6.5q-26 0 -57.5 6.5t-52.5 13.5t-60 21q-41 15 -63 22.5t-57.5 15t-65.5 7.5 q-85 0 -160 -57q-7 -5 -15 -5q-6 0 -11 3q-14 7 -14 22v438q22 55 82 98.5t119 46.5q23 2 43 0.5t43 -7t32.5 -8.5t38 -13t32.5 -11q41 -14 63.5 -21t57 -14t63.5 -7q103 0 183 87q7 8 18 8z",
    "volume-off": "M321 814l258 172q9 6 15 2.5t6 -13.5v-750q0 -10 -6 -13.5t-15 2.5l-258 172q-21 14 -46 14h-250q-10 0 -17.5 7.5t-7.5 17.5v350q0 10 7.5 17.5t17.5 7.5h250q25 0 46 14zM900 668l120 120q7 7 17 7t17 -7l34 -34q7 -7 7 -17t-7 -17l-120 -120l120 -120q7 -7 7 -17 t-7 -17l-34 -34q-7 -7 -17 -7t-17 7l-120 119l-120 -119q-7 -7 -17 -7t-17 7l-34 34q-7 7 -7 17t7 17l119 120l-119 120q-7 7 -7 17t7 17l34 34q7 8 17 8t17 -8z",
    "volume-down": "M321 814l258 172q9 6 15 2.5t6 -13.5v-750q0 -10 -6 -13.5t-15 2.5l-258 172q-21 14 -46 14h-250q-10 0 -17.5 7.5t-7.5 17.5v350q0 10 7.5 17.5t17.5 7.5h250q25 0 46 14zM766 900h4q10 -1 16 -10q96 -129 96 -290q0 -154 -90 -281q-6 -9 -17 -10l-3 -1q-9 0 -16 6 l-29 23q-7 7 -8.5 16.5t4.5 17.5q72 103 72 229q0 132 -78 238q-6 8 -4.5 18t9.5 17l29 22q7 5 15 5z",
    "volume-up": "M967 1004h3q11 -1 17 -10q135 -179 135 -396q0 -105 -34 -206.5t-98 -185.5q-7 -9 -17 -10h-3q-9 0 -16 6l-42 34q-8 6 -9 16t5 18q111 150 111 328q0 90 -29.5 176t-84.5 157q-6 9 -5 19t10 16l42 33q7 5 15 5zM321 814l258 172q9 6 15 2.5t6 -13.5v-750q0 -10 -6 -13.5 t-15 2.5l-258 172q-21 14 -46 14h-250q-10 0 -17.5 7.5t-7.5 17.5v350q0 10 7.5 17.5t17.5 7.5h250q25 0 46 14zM766 900h4q10 -1 16 -10q96 -129 96 -290q0 -154 -90 -281q-6 -9 -17 -10l-3 -1q-9 0 -16 6l-29 23q-7 7 -8.5 16.5t4.5 17.5q72 103 72 229q0 132 -78 238 q-6 8 -4.5 18.5t9.5 16.5l29 22q7 5 15 5z",
    "tag": "M500 1200l682 -682q8 -8 8 -18t-8 -18l-464 -464q-8 -8 -18 -8t-18 8l-682 682l1 475q0 10 7.5 17.5t17.5 7.5h474zM319.5 1024.5q-29.5 29.5 -71 29.5t-71 -29.5t-29.5 -71.5t29.5 -71.5t71 -29.5t71 29.5t29.5 71.5t-29.5 71.5z",
    "print": "M822 1200h-444q-11 0 -19 -7.5t-9 -17.5l-78 -301q-7 -24 7 -45l57 -108q6 -9 17.5 -15t21.5 -6h450q10 0 21.5 6t17.5 15l62 108q14 21 7 45l-83 301q-1 10 -9 17.5t-19 7.5zM1175 800h-150q-10 0 -21 -6.5t-15 -15.5l-78 -156q-4 -9 -15 -15.5t-21 -6.5h-550 q-10 0 -21 6.5t-15 15.5l-78 156q-4 9 -15 15.5t-21 6.5h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-650q0 -10 7.5 -17.5t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v150q0 10 7.5 17.5t17.5 7.5h750q10 0 17.5 -7.5t7.5 -17.5v-150q0 -10 7.5 -17.5t17.5 -7.5h150q10 0 17.5 7.5 t7.5 17.5v650q0 10 -7.5 17.5t-17.5 7.5zM850 200h-500q-10 0 -19.5 -7t-11.5 -17l-38 -152q-2 -10 3.5 -17t15.5 -7h600q10 0 15.5 7t3.5 17l-38 152q-2 10 -11.5 17t-19.5 7z",
    "camera": "M500 1100h200q56 0 102.5 -20.5t72.5 -50t44 -59t25 -50.5l6 -20h150q41 0 70.5 -29.5t29.5 -70.5v-600q0 -41 -29.5 -70.5t-70.5 -29.5h-1000q-41 0 -70.5 29.5t-29.5 70.5v600q0 41 29.5 70.5t70.5 29.5h150q2 8 6.5 21.5t24 48t45 61t72 48t102.5 21.5zM900 800v-100 h100v100h-100zM600 730q-95 0 -162.5 -67.5t-67.5 -162.5t67.5 -162.5t162.5 -67.5t162.5 67.5t67.5 162.5t-67.5 162.5t-162.5 67.5zM600 603q43 0 73 -30t30 -73t-30 -73t-73 -30t-73 30t-30 73t30 73t73 30z",
    "align-justify": "M50 1100h1100q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-1100q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5zM50 800h1100q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-1100q-21 0 -35.5 14.5t-14.5 35.5v100 q0 21 14.5 35.5t35.5 14.5zM50 500h1100q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-1100q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5zM50 200h1100q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-1100 q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5z",
    "facetime-video": "M75 1000h750q31 0 53 -22t22 -53v-650q0 -31 -22 -53t-53 -22h-750q-31 0 -53 22t-22 53v650q0 31 22 53t53 22zM1200 300l-300 300l300 300v-600z",
    "picture": "M44 1100h1112q18 0 31 -13t13 -31v-1012q0 -18 -13 -31t-31 -13h-1112q-18 0 -31 13t-13 31v1012q0 18 13 31t31 13zM100 1000v-737l247 182l298 -131l-74 156l293 318l236 -288v500h-1000zM342 884q56 0 95 -39t39 -94.5t-39 -95t-95 -39.5t-95 39.5t-39 95t39 94.5 t95 39z",
    "map-maker": "M648 1169q117 0 216 -60t156.5 -161t57.5 -218q0 -115 -70 -258q-69 -109 -158 -225.5t-143 -179.5l-54 -62q-9 8 -25.5 24.5t-63.5 67.5t-91 103t-98.5 128t-95.5 148q-60 132 -60 249q0 88 34 169.5t91.5 142t137 96.5t166.5 36zM652.5 974q-91.5 0 -156.5 -65 t-65 -157t65 -156.5t156.5 -64.5t156.5 64.5t65 156.5t-65 157t-156.5 65z",
    "adjust": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 173v854q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57z",
    "tint": "M554 1295q21 -72 57.5 -143.5t76 -130t83 -118t82.5 -117t70 -116t49.5 -126t18.5 -136.5q0 -71 -25.5 -135t-68.5 -111t-99 -82t-118.5 -54t-125.5 -23q-84 5 -161.5 34t-139.5 78.5t-99 125t-37 164.5q0 69 18 136.5t49.5 126.5t69.5 116.5t81.5 117.5t83.5 119 t76.5 131t58.5 143zM344 710q-23 -33 -43.5 -70.5t-40.5 -102.5t-17 -123q1 -37 14.5 -69.5t30 -52t41 -37t38.5 -24.5t33 -15q21 -7 32 -1t13 22l6 34q2 10 -2.5 22t-13.5 19q-5 4 -14 12t-29.5 40.5t-32.5 73.5q-26 89 6 271q2 11 -6 11q-8 1 -15 -10z",
    "edit": "M1000 1013l108 115q2 1 5 2t13 2t20.5 -1t25 -9.5t28.5 -21.5q22 -22 27 -43t0 -32l-6 -10l-108 -115zM350 1100h400q50 0 105 -13l-187 -187h-368q-41 0 -70.5 -29.5t-29.5 -70.5v-500q0 -41 29.5 -70.5t70.5 -29.5h500q41 0 70.5 29.5t29.5 70.5v182l200 200v-332 q0 -165 -93.5 -257.5t-256.5 -92.5h-400q-165 0 -257.5 92.5t-92.5 257.5v400q0 165 92.5 257.5t257.5 92.5zM1009 803l-362 -362l-161 -50l55 170l355 355z",
    "share": "M350 1100h361q-164 -146 -216 -200h-195q-41 0 -70.5 -29.5t-29.5 -70.5v-500q0 -41 29.5 -70.5t70.5 -29.5h500q41 0 70.5 29.5t29.5 70.5l200 153v-103q0 -165 -92.5 -257.5t-257.5 -92.5h-400q-165 0 -257.5 92.5t-92.5 257.5v400q0 165 92.5 257.5t257.5 92.5z M824 1073l339 -301q8 -7 8 -17.5t-8 -17.5l-340 -306q-7 -6 -12.5 -4t-6.5 11v203q-26 1 -54.5 0t-78.5 -7.5t-92 -17.5t-86 -35t-70 -57q10 59 33 108t51.5 81.5t65 58.5t68.5 40.5t67 24.5t56 13.5t40 4.5v210q1 10 6.5 12.5t13.5 -4.5z",
    "check": "M350 1100h350q60 0 127 -23l-178 -177h-349q-41 0 -70.5 -29.5t-29.5 -70.5v-500q0 -41 29.5 -70.5t70.5 -29.5h500q41 0 70.5 29.5t29.5 70.5v69l200 200v-219q0 -165 -92.5 -257.5t-257.5 -92.5h-400q-165 0 -257.5 92.5t-92.5 257.5v400q0 165 92.5 257.5t257.5 92.5z M643 639l395 395q7 7 17.5 7t17.5 -7l101 -101q7 -7 7 -17.5t-7 -17.5l-531 -532q-7 -7 -17.5 -7t-17.5 7l-248 248q-7 7 -7 17.5t7 17.5l101 101q7 7 17.5 7t17.5 -7l111 -111q8 -7 18 -7t18 7z",
    "move": "M318 918l264 264q8 8 18 8t18 -8l260 -264q7 -8 4.5 -13t-12.5 -5h-170v-200h200v173q0 10 5 12t13 -5l264 -260q8 -7 8 -17.5t-8 -17.5l-264 -265q-8 -7 -13 -5t-5 12v173h-200v-200h170q10 0 12.5 -5t-4.5 -13l-260 -264q-8 -8 -18 -8t-18 8l-264 264q-8 8 -5.5 13 t12.5 5h175v200h-200v-173q0 -10 -5 -12t-13 5l-264 265q-8 7 -8 17.5t8 17.5l264 260q8 7 13 5t5 -12v-173h200v200h-175q-10 0 -12.5 5t5.5 13z",
    "step-backward": "M250 1100h100q21 0 35.5 -14.5t14.5 -35.5v-438l464 453q15 14 25.5 10t10.5 -25v-1000q0 -21 -10.5 -25t-25.5 10l-464 453v-438q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v1000q0 21 14.5 35.5t35.5 14.5z",
    "fast-backward": "M50 1100h100q21 0 35.5 -14.5t14.5 -35.5v-438l464 453q15 14 25.5 10t10.5 -25v-438l464 453q15 14 25.5 10t10.5 -25v-1000q0 -21 -10.5 -25t-25.5 10l-464 453v-438q0 -21 -10.5 -25t-25.5 10l-464 453v-438q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5 t-14.5 35.5v1000q0 21 14.5 35.5t35.5 14.5z",
    "backward": "M1200 1050v-1000q0 -21 -10.5 -25t-25.5 10l-464 453v-438q0 -21 -10.5 -25t-25.5 10l-492 480q-15 14 -15 35t15 35l492 480q15 14 25.5 10t10.5 -25v-438l464 453q15 14 25.5 10t10.5 -25z",
    "play": "M243 1074l814 -498q18 -11 18 -26t-18 -26l-814 -498q-18 -11 -30.5 -4t-12.5 28v1000q0 21 12.5 28t30.5 -4z",
    "pause": "M250 1000h200q21 0 35.5 -14.5t14.5 -35.5v-800q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v800q0 21 14.5 35.5t35.5 14.5zM650 1000h200q21 0 35.5 -14.5t14.5 -35.5v-800q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v800 q0 21 14.5 35.5t35.5 14.5z",
    "stop": "M1100 950v-800q0 -21 -14.5 -35.5t-35.5 -14.5h-800q-21 0 -35.5 14.5t-14.5 35.5v800q0 21 14.5 35.5t35.5 14.5h800q21 0 35.5 -14.5t14.5 -35.5z",
    "forward": "M500 612v438q0 21 10.5 25t25.5 -10l492 -480q15 -14 15 -35t-15 -35l-492 -480q-15 -14 -25.5 -10t-10.5 25v438l-464 -453q-15 -14 -25.5 -10t-10.5 25v1000q0 21 10.5 25t25.5 -10z",
    "fast-forward": "M1048 1102l100 1q20 0 35 -14.5t15 -35.5l5 -1000q0 -21 -14.5 -35.5t-35.5 -14.5l-100 -1q-21 0 -35.5 14.5t-14.5 35.5l-2 437l-463 -454q-14 -15 -24.5 -10.5t-10.5 25.5l-2 437l-462 -455q-15 -14 -25.5 -9.5t-10.5 24.5l-5 1000q0 21 10.5 25.5t25.5 -10.5l466 -450 l-2 438q0 20 10.5 24.5t25.5 -9.5l466 -451l-2 438q0 21 14.5 35.5t35.5 14.5z",
    "step-forward": "M850 1100h100q21 0 35.5 -14.5t14.5 -35.5v-1000q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v438l-464 -453q-15 -14 -25.5 -10t-10.5 25v1000q0 21 10.5 25t25.5 -10l464 -453v438q0 21 14.5 35.5t35.5 14.5z",
    "eject": "M686 1081l501 -540q15 -15 10.5 -26t-26.5 -11h-1042q-22 0 -26.5 11t10.5 26l501 540q15 15 36 15t36 -15zM150 400h1000q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-1000q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5z",
    "key": "M250 1200h600q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -14.5 -35.5t-35.5 -14.5h-150v-500l-255 -178q-19 -9 -32 -1t-13 29v650h-150q-21 0 -35.5 14.5t-14.5 35.5v400q0 21 14.5 35.5t35.5 14.5zM400 1100v-100h300v100h-300z",
    "exit": "M250 1200h750q39 0 69.5 -40.5t30.5 -84.5v-933l-700 -117v950l600 125h-700v-1000h-100v1025q0 23 15.5 49t34.5 26zM500 525v-100l100 20v100z",
    "plus-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM650 900h-100q-21 0 -35.5 -14.5t-14.5 -35.5v-150h-150 q-21 0 -35.5 -14.5t-14.5 -35.5v-100q0 -21 14.5 -35.5t35.5 -14.5h150v-150q0 -21 14.5 -35.5t35.5 -14.5h100q21 0 35.5 14.5t14.5 35.5v150h150q21 0 35.5 14.5t14.5 35.5v100q0 21 -14.5 35.5t-35.5 14.5h-150v150q0 21 -14.5 35.5t-35.5 14.5z",
    "minus-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM850 700h-500q-21 0 -35.5 -14.5t-14.5 -35.5v-100q0 -21 14.5 -35.5 t35.5 -14.5h500q21 0 35.5 14.5t14.5 35.5v100q0 21 -14.5 35.5t-35.5 14.5z",
    "remove-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM741.5 913q-12.5 0 -21.5 -9l-120 -120l-120 120q-9 9 -21.5 9 t-21.5 -9l-141 -141q-9 -9 -9 -21.5t9 -21.5l120 -120l-120 -120q-9 -9 -9 -21.5t9 -21.5l141 -141q9 -9 21.5 -9t21.5 9l120 120l120 -120q9 -9 21.5 -9t21.5 9l141 141q9 9 9 21.5t-9 21.5l-120 120l120 120q9 9 9 21.5t-9 21.5l-141 141q-9 9 -21.5 9z",
    "ok-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM546 623l-84 85q-7 7 -17.5 7t-18.5 -7l-139 -139q-7 -8 -7 -18t7 -18 l242 -241q7 -8 17.5 -8t17.5 8l375 375q7 7 7 17.5t-7 18.5l-139 139q-7 7 -17.5 7t-17.5 -7z",
    "question-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM588 941q-29 0 -59 -5.5t-63 -20.5t-58 -38.5t-41.5 -63t-16.5 -89.5 q0 -25 20 -25h131q30 -5 35 11q6 20 20.5 28t45.5 8q20 0 31.5 -10.5t11.5 -28.5q0 -23 -7 -34t-26 -18q-1 0 -13.5 -4t-19.5 -7.5t-20 -10.5t-22 -17t-18.5 -24t-15.5 -35t-8 -46q-1 -8 5.5 -16.5t20.5 -8.5h173q7 0 22 8t35 28t37.5 48t29.5 74t12 100q0 47 -17 83 t-42.5 57t-59.5 34.5t-64 18t-59 4.5zM675 400h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-150q0 -10 7.5 -17.5t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v150q0 10 -7.5 17.5t-17.5 7.5z",
    "info-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM675 1000h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-150q0 -10 7.5 -17.5 t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v150q0 10 -7.5 17.5t-17.5 7.5zM675 700h-250q-10 0 -17.5 -7.5t-7.5 -17.5v-50q0 -10 7.5 -17.5t17.5 -7.5h75v-200h-75q-10 0 -17.5 -7.5t-7.5 -17.5v-50q0 -10 7.5 -17.5t17.5 -7.5h350q10 0 17.5 7.5t7.5 17.5v50q0 10 -7.5 17.5 t-17.5 7.5h-75v275q0 10 -7.5 17.5t-17.5 7.5z",
    "screenshot": "M525 1200h150q10 0 17.5 -7.5t7.5 -17.5v-194q103 -27 178.5 -102.5t102.5 -178.5h194q10 0 17.5 -7.5t7.5 -17.5v-150q0 -10 -7.5 -17.5t-17.5 -7.5h-194q-27 -103 -102.5 -178.5t-178.5 -102.5v-194q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v194 q-103 27 -178.5 102.5t-102.5 178.5h-194q-10 0 -17.5 7.5t-7.5 17.5v150q0 10 7.5 17.5t17.5 7.5h194q27 103 102.5 178.5t178.5 102.5v194q0 10 7.5 17.5t17.5 7.5zM700 893v-168q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v168q-68 -23 -119 -74 t-74 -119h168q10 0 17.5 -7.5t7.5 -17.5v-150q0 -10 -7.5 -17.5t-17.5 -7.5h-168q23 -68 74 -119t119 -74v168q0 10 7.5 17.5t17.5 7.5h150q10 0 17.5 -7.5t7.5 -17.5v-168q68 23 119 74t74 119h-168q-10 0 -17.5 7.5t-7.5 17.5v150q0 10 7.5 17.5t17.5 7.5h168 q-23 68 -74 119t-119 74z",
    "remove-circle": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM759 823l64 -64q7 -7 7 -17.5t-7 -17.5l-124 -124l124 -124q7 -7 7 -17.5t-7 -17.5l-64 -64q-7 -7 -17.5 -7t-17.5 7l-124 124l-124 -124q-7 -7 -17.5 -7t-17.5 7l-64 64 q-7 7 -7 17.5t7 17.5l124 124l-124 124q-7 7 -7 17.5t7 17.5l64 64q7 7 17.5 7t17.5 -7l124 -124l124 124q7 7 17.5 7t17.5 -7z",
    "ok-circle": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5t57 -214.5 t155.5 -155.5t214.5 -57t214.5 57t155.5 155.5t57 214.5t-57 214.5t-155.5 155.5t-214.5 57zM782 788l106 -106q7 -7 7 -17.5t-7 -17.5l-320 -321q-8 -7 -18 -7t-18 7l-202 203q-8 7 -8 17.5t8 17.5l106 106q7 8 17.5 8t17.5 -8l79 -79l197 197q7 7 17.5 7t17.5 -7z",
    "ban-circle": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM600 1027q-116 0 -214.5 -57t-155.5 -155.5t-57 -214.5q0 -120 65 -225 l587 587q-105 65 -225 65zM965 819l-584 -584q104 -62 219 -62q116 0 214.5 57t155.5 155.5t57 214.5q0 115 -62 219z",
    "arrow-left": "M39 582l522 427q16 13 27.5 8t11.5 -26v-291h550q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-550v-291q0 -21 -11.5 -26t-27.5 8l-522 427q-16 13 -16 32t16 32z",
    "arrow-right": "M639 1009l522 -427q16 -13 16 -32t-16 -32l-522 -427q-16 -13 -27.5 -8t-11.5 26v291h-550q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5h550v291q0 21 11.5 26t27.5 -8z",
    "arrow-up": "M682 1161l427 -522q13 -16 8 -27.5t-26 -11.5h-291v-550q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v550h-291q-21 0 -26 11.5t8 27.5l427 522q13 16 32 16t32 -16z",
    "arrow-down": "M550 1200h200q21 0 35.5 -14.5t14.5 -35.5v-550h291q21 0 26 -11.5t-8 -27.5l-427 -522q-13 -16 -32 -16t-32 16l-427 522q-13 16 -8 27.5t26 11.5h291v550q0 21 14.5 35.5t35.5 14.5z",
    "share-alt": "M639 1109l522 -427q16 -13 16 -32t-16 -32l-522 -427q-16 -13 -27.5 -8t-11.5 26v291q-94 -2 -182 -20t-170.5 -52t-147 -92.5t-100.5 -135.5q5 105 27 193.5t67.5 167t113 135t167 91.5t225.5 42v262q0 21 11.5 26t27.5 -8z",
    "resize-full": "M850 1200h300q21 0 35.5 -14.5t14.5 -35.5v-300q0 -21 -10.5 -25t-24.5 10l-94 94l-249 -249q-8 -7 -18 -7t-18 7l-106 106q-7 8 -7 18t7 18l249 249l-94 94q-14 14 -10 24.5t25 10.5zM350 0h-300q-21 0 -35.5 14.5t-14.5 35.5v300q0 21 10.5 25t24.5 -10l94 -94l249 249 q8 7 18 7t18 -7l106 -106q7 -8 7 -18t-7 -18l-249 -249l94 -94q14 -14 10 -24.5t-25 -10.5z",
    "resize-small": "M1014 1120l106 -106q7 -8 7 -18t-7 -18l-249 -249l94 -94q14 -14 10 -24.5t-25 -10.5h-300q-21 0 -35.5 14.5t-14.5 35.5v300q0 21 10.5 25t24.5 -10l94 -94l249 249q8 7 18 7t18 -7zM250 600h300q21 0 35.5 -14.5t14.5 -35.5v-300q0 -21 -10.5 -25t-24.5 10l-94 94 l-249 -249q-8 -7 -18 -7t-18 7l-106 106q-7 8 -7 18t7 18l249 249l-94 94q-14 14 -10 24.5t25 10.5z",
    "exclamation-sign": "M600 1177q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM704 900h-208q-20 0 -32 -14.5t-8 -34.5l58 -302q4 -20 21.5 -34.5 t37.5 -14.5h54q20 0 37.5 14.5t21.5 34.5l58 302q4 20 -8 34.5t-32 14.5zM675 400h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-150q0 -10 7.5 -17.5t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v150q0 10 -7.5 17.5t-17.5 7.5z",
    "fire": "M653 1231q-39 -67 -54.5 -131t-10.5 -114.5t24.5 -96.5t47.5 -80t63.5 -62.5t68.5 -46.5t65 -30q-4 7 -17.5 35t-18.5 39.5t-17 39.5t-17 43t-13 42t-9.5 44.5t-2 42t4 43t13.5 39t23 38.5q96 -42 165 -107.5t105 -138t52 -156t13 -159t-19 -149.5q-13 -55 -44 -106.5 t-68 -87t-78.5 -64.5t-72.5 -45t-53 -22q-72 -22 -127 -11q-31 6 -13 19q6 3 17 7q13 5 32.5 21t41 44t38.5 63.5t21.5 81.5t-6.5 94.5t-50 107t-104 115.5q10 -104 -0.5 -189t-37 -140.5t-65 -93t-84 -52t-93.5 -11t-95 24.5q-80 36 -131.5 114t-53.5 171q-2 23 0 49.5 t4.5 52.5t13.5 56t27.5 60t46 64.5t69.5 68.5q-8 -53 -5 -102.5t17.5 -90t34 -68.5t44.5 -39t49 -2q31 13 38.5 36t-4.5 55t-29 64.5t-36 75t-26 75.5q-15 85 2 161.5t53.5 128.5t85.5 92.5t93.5 61t81.5 25.5z",
    "eye-open": "M600 1094q82 0 160.5 -22.5t140 -59t116.5 -82.5t94.5 -95t68 -95t42.5 -82.5t14 -57.5t-14 -57.5t-43 -82.5t-68.5 -95t-94.5 -95t-116.5 -82.5t-140 -59t-159.5 -22.5t-159.5 22.5t-140 59t-116.5 82.5t-94.5 95t-68.5 95t-43 82.5t-14 57.5t14 57.5t42.5 82.5t68 95 t94.5 95t116.5 82.5t140 59t160.5 22.5zM888 829q-15 15 -18 12t5 -22q25 -57 25 -119q0 -124 -88 -212t-212 -88t-212 88t-88 212q0 59 23 114q8 19 4.5 22t-17.5 -12q-70 -69 -160 -184q-13 -16 -15 -40.5t9 -42.5q22 -36 47 -71t70 -82t92.5 -81t113 -58.5t133.5 -24.5 t133.5 24t113 58.5t92.5 81.5t70 81.5t47 70.5q11 18 9 42.5t-14 41.5q-90 117 -163 189zM448 727l-35 -36q-15 -15 -19.5 -38.5t4.5 -41.5q37 -68 93 -116q16 -13 38.5 -11t36.5 17l35 34q14 15 12.5 33.5t-16.5 33.5q-44 44 -89 117q-11 18 -28 20t-32 -12z",
    "eye-close": "M592 0h-148l31 120q-91 20 -175.5 68.5t-143.5 106.5t-103.5 119t-66.5 110t-22 76q0 21 14 57.5t42.5 82.5t68 95t94.5 95t116.5 82.5t140 59t160.5 22.5q61 0 126 -15l32 121h148zM944 770l47 181q108 -85 176.5 -192t68.5 -159q0 -26 -19.5 -71t-59.5 -102t-93 -112 t-129 -104.5t-158 -75.5l46 173q77 49 136 117t97 131q11 18 9 42.5t-14 41.5q-54 70 -107 130zM310 824q-70 -69 -160 -184q-13 -16 -15 -40.5t9 -42.5q18 -30 39 -60t57 -70.5t74 -73t90 -61t105 -41.5l41 154q-107 18 -178.5 101.5t-71.5 193.5q0 59 23 114q8 19 4.5 22 t-17.5 -12zM448 727l-35 -36q-15 -15 -19.5 -38.5t4.5 -41.5q37 -68 93 -116q16 -13 38.5 -11t36.5 17l12 11l22 86l-3 4q-44 44 -89 117q-11 18 -28 20t-32 -12z",
    "warning-sign": "M-90 100l642 1066q20 31 48 28.5t48 -35.5l642 -1056q21 -32 7.5 -67.5t-50.5 -35.5h-1294q-37 0 -50.5 34t7.5 66zM155 200h345v75q0 10 7.5 17.5t17.5 7.5h150q10 0 17.5 -7.5t7.5 -17.5v-75h345l-445 723zM496 700h208q20 0 32 -14.5t8 -34.5l-58 -252 q-4 -20 -21.5 -34.5t-37.5 -14.5h-54q-20 0 -37.5 14.5t-21.5 34.5l-58 252q-4 20 8 34.5t32 14.5z",
    "shopping-cart": "M56 1200h94q17 0 31 -11t18 -27l38 -162h896q24 0 39 -18.5t10 -42.5l-100 -475q-5 -21 -27 -42.5t-55 -21.5h-633l48 -200h535q21 0 35.5 -14.5t14.5 -35.5t-14.5 -35.5t-35.5 -14.5h-50v-50q0 -21 -14.5 -35.5t-35.5 -14.5t-35.5 14.5t-14.5 35.5v50h-300v-50 q0 -21 -14.5 -35.5t-35.5 -14.5t-35.5 14.5t-14.5 35.5v50h-31q-18 0 -32.5 10t-20.5 19l-5 10l-201 961h-54q-20 0 -35 14.5t-15 35.5t15 35.5t35 14.5z",
    "folder-close": "M1200 1000v-100h-1200v100h200q0 41 29.5 70.5t70.5 29.5h300q41 0 70.5 -29.5t29.5 -70.5h500zM0 800h1200v-800h-1200v800z",
    "folder-open": "M200 800l-200 -400v600h200q0 41 29.5 70.5t70.5 29.5h300q42 0 71 -29.5t29 -70.5h500v-200h-1000zM1500 700l-300 -700h-1200l300 700h1200z",
    "resize-vertical": "M635 1184l230 -249q14 -14 10 -24.5t-25 -10.5h-150v-601h150q21 0 25 -10.5t-10 -24.5l-230 -249q-14 -15 -35 -15t-35 15l-230 249q-14 14 -10 24.5t25 10.5h150v601h-150q-21 0 -25 10.5t10 24.5l230 249q14 15 35 15t35 -15z",
    "resize-horizontal": "M936 864l249 -229q14 -15 14 -35.5t-14 -35.5l-249 -229q-15 -15 -25.5 -10.5t-10.5 24.5v151h-600v-151q0 -20 -10.5 -24.5t-25.5 10.5l-249 229q-14 15 -14 35.5t14 35.5l249 229q15 15 25.5 10.5t10.5 -25.5v-149h600v149q0 21 10.5 25.5t25.5 -10.5z",
    "hdd": "M1169 400l-172 732q-5 23 -23 45.5t-38 22.5h-672q-20 0 -38 -20t-23 -41l-172 -739h1138zM1100 300h-1000q-41 0 -70.5 -29.5t-29.5 -70.5v-100q0 -41 29.5 -70.5t70.5 -29.5h1000q41 0 70.5 29.5t29.5 70.5v100q0 41 -29.5 70.5t-70.5 29.5zM800 100v100h100v-100h-100 zM1000 100v100h100v-100h-100z",
    "bell": "M553 1200h94q20 0 29 -10.5t3 -29.5l-18 -37q83 -19 144 -82.5t76 -140.5l63 -327l118 -173h17q19 0 33 -14.5t14 -35t-13 -40.5t-31 -27q-8 -4 -23 -9.5t-65 -19.5t-103 -25t-132.5 -20t-158.5 -9q-57 0 -115 5t-104 12t-88.5 15.5t-73.5 17.5t-54.5 16t-35.5 12l-11 4 q-18 8 -31 28t-13 40.5t14 35t33 14.5h17l118 173l63 327q15 77 76 140t144 83l-18 32q-6 19 3.5 32t28.5 13zM498 110q50 -6 102 -6q53 0 102 6q-12 -49 -39.5 -79.5t-62.5 -30.5t-63 30.5t-39 79.5z",
    "certificate": "M800 946l224 78l-78 -224l234 -45l-180 -155l180 -155l-234 -45l78 -224l-224 78l-45 -234l-155 180l-155 -180l-45 234l-224 -78l78 224l-234 45l180 155l-180 155l234 45l-78 224l224 -78l45 234l155 -180l155 180z",
    "thumbs-up": "M650 1200h50q40 0 70 -40.5t30 -84.5v-150l-28 -125h328q40 0 70 -40.5t30 -84.5v-100q0 -45 -29 -74l-238 -344q-16 -24 -38 -40.5t-45 -16.5h-250q-7 0 -42 25t-66 50l-31 25h-61q-45 0 -72.5 18t-27.5 57v400q0 36 20 63l145 196l96 198q13 28 37.5 48t51.5 20z M650 1100l-100 -212l-150 -213v-375h100l136 -100h214l250 375v125h-450l50 225v175h-50zM50 800h100q21 0 35.5 -14.5t14.5 -35.5v-500q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v500q0 21 14.5 35.5t35.5 14.5z",
    "thumbs-down": "M600 1100h250q23 0 45 -16.5t38 -40.5l238 -344q29 -29 29 -74v-100q0 -44 -30 -84.5t-70 -40.5h-328q28 -118 28 -125v-150q0 -44 -30 -84.5t-70 -40.5h-50q-27 0 -51.5 20t-37.5 48l-96 198l-145 196q-20 27 -20 63v400q0 39 27.5 57t72.5 18h61q124 100 139 100z M50 1000h100q21 0 35.5 -14.5t14.5 -35.5v-500q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v500q0 21 14.5 35.5t35.5 14.5zM636 1000l-136 -100h-100v-375l150 -213l100 -212h50v175l-50 225h450v125l-250 375h-214z",
    "hand-right": "M356 873l363 230q31 16 53 -6l110 -112q13 -13 13.5 -32t-11.5 -34l-84 -121h302q84 0 138 -38t54 -110t-55 -111t-139 -39h-106l-131 -339q-6 -21 -19.5 -41t-28.5 -20h-342q-7 0 -90 81t-83 94v525q0 17 14 35.5t28 28.5zM400 792v-503l100 -89h293l131 339 q6 21 19.5 41t28.5 20h203q21 0 30.5 25t0.5 50t-31 25h-456h-7h-6h-5.5t-6 0.5t-5 1.5t-5 2t-4 2.5t-4 4t-2.5 4.5q-12 25 5 47l146 183l-86 83zM50 800h100q21 0 35.5 -14.5t14.5 -35.5v-500q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v500 q0 21 14.5 35.5t35.5 14.5z",
    "hand-left": "M475 1103l366 -230q2 -1 6 -3.5t14 -10.5t18 -16.5t14.5 -20t6.5 -22.5v-525q0 -13 -86 -94t-93 -81h-342q-15 0 -28.5 20t-19.5 41l-131 339h-106q-85 0 -139.5 39t-54.5 111t54 110t138 38h302l-85 121q-11 15 -10.5 34t13.5 32l110 112q22 22 53 6zM370 945l146 -183 q17 -22 5 -47q-2 -2 -3.5 -4.5t-4 -4t-4 -2.5t-5 -2t-5 -1.5t-6 -0.5h-6h-6.5h-6h-475v-100h221q15 0 29 -20t20 -41l130 -339h294l106 89v503l-342 236zM1050 800h100q21 0 35.5 -14.5t14.5 -35.5v-500q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5 v500q0 21 14.5 35.5t35.5 14.5z",
    "hand-up": "M550 1294q72 0 111 -55t39 -139v-106l339 -131q21 -6 41 -19.5t20 -28.5v-342q0 -7 -81 -90t-94 -83h-525q-17 0 -35.5 14t-28.5 28l-9 14l-230 363q-16 31 6 53l112 110q13 13 32 13.5t34 -11.5l121 -84v302q0 84 38 138t110 54zM600 972v203q0 21 -25 30.5t-50 0.5 t-25 -31v-456v-7v-6v-5.5t-0.5 -6t-1.5 -5t-2 -5t-2.5 -4t-4 -4t-4.5 -2.5q-25 -12 -47 5l-183 146l-83 -86l236 -339h503l89 100v293l-339 131q-21 6 -41 19.5t-20 28.5zM450 200h500q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-500 q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5z",
    "hand-down": "M350 1100h500q21 0 35.5 14.5t14.5 35.5v100q0 21 -14.5 35.5t-35.5 14.5h-500q-21 0 -35.5 -14.5t-14.5 -35.5v-100q0 -21 14.5 -35.5t35.5 -14.5zM600 306v-106q0 -84 -39 -139t-111 -55t-110 54t-38 138v302l-121 -84q-15 -12 -34 -11.5t-32 13.5l-112 110 q-22 22 -6 53l230 363q1 2 3.5 6t10.5 13.5t16.5 17t20 13.5t22.5 6h525q13 0 94 -83t81 -90v-342q0 -15 -20 -28.5t-41 -19.5zM308 900l-236 -339l83 -86l183 146q22 17 47 5q2 -1 4.5 -2.5t4 -4t2.5 -4t2 -5t1.5 -5t0.5 -6v-5.5v-6v-7v-456q0 -22 25 -31t50 0.5t25 30.5 v203q0 15 20 28.5t41 19.5l339 131v293l-89 100h-503z",
    "circle-arrow-right": "M600 1178q118 0 225 -45.5t184.5 -123t123 -184.5t45.5 -225t-45.5 -225t-123 -184.5t-184.5 -123t-225 -45.5t-225 45.5t-184.5 123t-123 184.5t-45.5 225t45.5 225t123 184.5t184.5 123t225 45.5zM914 632l-275 223q-16 13 -27.5 8t-11.5 -26v-137h-275 q-10 0 -17.5 -7.5t-7.5 -17.5v-150q0 -10 7.5 -17.5t17.5 -7.5h275v-137q0 -21 11.5 -26t27.5 8l275 223q16 13 16 32t-16 32z",
    "circle-arrow-left": "M600 1178q118 0 225 -45.5t184.5 -123t123 -184.5t45.5 -225t-45.5 -225t-123 -184.5t-184.5 -123t-225 -45.5t-225 45.5t-184.5 123t-123 184.5t-45.5 225t45.5 225t123 184.5t184.5 123t225 45.5zM561 855l-275 -223q-16 -13 -16 -32t16 -32l275 -223q16 -13 27.5 -8 t11.5 26v137h275q10 0 17.5 7.5t7.5 17.5v150q0 10 -7.5 17.5t-17.5 7.5h-275v137q0 21 -11.5 26t-27.5 -8z",
    "circle-arrow-up": "M600 1178q118 0 225 -45.5t184.5 -123t123 -184.5t45.5 -225t-45.5 -225t-123 -184.5t-184.5 -123t-225 -45.5t-225 45.5t-184.5 123t-123 184.5t-45.5 225t45.5 225t123 184.5t184.5 123t225 45.5zM855 639l-223 275q-13 16 -32 16t-32 -16l-223 -275q-13 -16 -8 -27.5 t26 -11.5h137v-275q0 -10 7.5 -17.5t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v275h137q21 0 26 11.5t-8 27.5z",
    "circle-arrow-down": "M600 1178q118 0 225 -45.5t184.5 -123t123 -184.5t45.5 -225t-45.5 -225t-123 -184.5t-184.5 -123t-225 -45.5t-225 45.5t-184.5 123t-123 184.5t-45.5 225t45.5 225t123 184.5t184.5 123t225 45.5zM675 900h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-275h-137q-21 0 -26 -11.5 t8 -27.5l223 -275q13 -16 32 -16t32 16l223 275q13 16 8 27.5t-26 11.5h-137v275q0 10 -7.5 17.5t-17.5 7.5z",
    "globe": "M600 1176q116 0 222.5 -46t184 -123.5t123.5 -184t46 -222.5t-46 -222.5t-123.5 -184t-184 -123.5t-222.5 -46t-222.5 46t-184 123.5t-123.5 184t-46 222.5t46 222.5t123.5 184t184 123.5t222.5 46zM627 1101q-15 -12 -36.5 -20.5t-35.5 -12t-43 -8t-39 -6.5 q-15 -3 -45.5 0t-45.5 -2q-20 -7 -51.5 -26.5t-34.5 -34.5q-3 -11 6.5 -22.5t8.5 -18.5q-3 -34 -27.5 -91t-29.5 -79q-9 -34 5 -93t8 -87q0 -9 17 -44.5t16 -59.5q12 0 23 -5t23.5 -15t19.5 -14q16 -8 33 -15t40.5 -15t34.5 -12q21 -9 52.5 -32t60 -38t57.5 -11 q7 -15 -3 -34t-22.5 -40t-9.5 -38q13 -21 23 -34.5t27.5 -27.5t36.5 -18q0 -7 -3.5 -16t-3.5 -14t5 -17q104 -2 221 112q30 29 46.5 47t34.5 49t21 63q-13 8 -37 8.5t-36 7.5q-15 7 -49.5 15t-51.5 19q-18 0 -41 -0.5t-43 -1.5t-42 -6.5t-38 -16.5q-51 -35 -66 -12 q-4 1 -3.5 25.5t0.5 25.5q-6 13 -26.5 17.5t-24.5 6.5q1 15 -0.5 30.5t-7 28t-18.5 11.5t-31 -21q-23 -25 -42 4q-19 28 -8 58q6 16 22 22q6 -1 26 -1.5t33.5 -4t19.5 -13.5q7 -12 18 -24t21.5 -20.5t20 -15t15.5 -10.5l5 -3q2 12 7.5 30.5t8 34.5t-0.5 32q-3 18 3.5 29 t18 22.5t15.5 24.5q6 14 10.5 35t8 31t15.5 22.5t34 22.5q-6 18 10 36q8 0 24 -1.5t24.5 -1.5t20 4.5t20.5 15.5q-10 23 -31 42.5t-37.5 29.5t-49 27t-43.5 23q0 1 2 8t3 11.5t1.5 10.5t-1 9.5t-4.5 4.5q31 -13 58.5 -14.5t38.5 2.5l12 5q5 28 -9.5 46t-36.5 24t-50 15 t-41 20q-18 -4 -37 0zM613 994q0 -17 8 -42t17 -45t9 -23q-8 1 -39.5 5.5t-52.5 10t-37 16.5q3 11 16 29.5t16 25.5q10 -10 19 -10t14 6t13.5 14.5t16.5 12.5z",
    "wrench": "M756 1157q164 92 306 -9l-259 -138l145 -232l251 126q6 -89 -34 -156.5t-117 -110.5q-60 -34 -127 -39.5t-126 16.5l-596 -596q-15 -16 -36.5 -16t-36.5 16l-111 110q-15 15 -15 36.5t15 37.5l600 599q-34 101 5.5 201.5t135.5 154.5z",
    "tasks": "M100 1196h1000q41 0 70.5 -29.5t29.5 -70.5v-100q0 -41 -29.5 -70.5t-70.5 -29.5h-1000q-41 0 -70.5 29.5t-29.5 70.5v100q0 41 29.5 70.5t70.5 29.5zM1100 1096h-200v-100h200v100zM100 796h1000q41 0 70.5 -29.5t29.5 -70.5v-100q0 -41 -29.5 -70.5t-70.5 -29.5h-1000 q-41 0 -70.5 29.5t-29.5 70.5v100q0 41 29.5 70.5t70.5 29.5zM1100 696h-500v-100h500v100zM100 396h1000q41 0 70.5 -29.5t29.5 -70.5v-100q0 -41 -29.5 -70.5t-70.5 -29.5h-1000q-41 0 -70.5 29.5t-29.5 70.5v100q0 41 29.5 70.5t70.5 29.5zM1100 296h-300v-100h300v100z ",
    "filter": "M150 1200h900q21 0 35.5 -14.5t14.5 -35.5t-14.5 -35.5t-35.5 -14.5h-900q-21 0 -35.5 14.5t-14.5 35.5t14.5 35.5t35.5 14.5zM700 500v-300l-200 -200v500l-350 500h900z",
    "fullscreen": "M50 1200h300q21 0 25 -10.5t-10 -24.5l-94 -94l199 -199q7 -8 7 -18t-7 -18l-106 -106q-8 -7 -18 -7t-18 7l-199 199l-94 -94q-14 -14 -24.5 -10t-10.5 25v300q0 21 14.5 35.5t35.5 14.5zM850 1200h300q21 0 35.5 -14.5t14.5 -35.5v-300q0 -21 -10.5 -25t-24.5 10l-94 94 l-199 -199q-8 -7 -18 -7t-18 7l-106 106q-7 8 -7 18t7 18l199 199l-94 94q-14 14 -10 24.5t25 10.5zM364 470l106 -106q7 -8 7 -18t-7 -18l-199 -199l94 -94q14 -14 10 -24.5t-25 -10.5h-300q-21 0 -35.5 14.5t-14.5 35.5v300q0 21 10.5 25t24.5 -10l94 -94l199 199 q8 7 18 7t18 -7zM1071 271l94 94q14 14 24.5 10t10.5 -25v-300q0 -21 -14.5 -35.5t-35.5 -14.5h-300q-21 0 -25 10.5t10 24.5l94 94l-199 199q-7 8 -7 18t7 18l106 106q8 7 18 7t18 -7z",
    "dashboard": "M596 1192q121 0 231.5 -47.5t190 -127t127 -190t47.5 -231.5t-47.5 -231.5t-127 -190.5t-190 -127t-231.5 -47t-231.5 47t-190.5 127t-127 190.5t-47 231.5t47 231.5t127 190t190.5 127t231.5 47.5zM596 1010q-112 0 -207.5 -55.5t-151 -151t-55.5 -207.5t55.5 -207.5 t151 -151t207.5 -55.5t207.5 55.5t151 151t55.5 207.5t-55.5 207.5t-151 151t-207.5 55.5zM454.5 905q22.5 0 38.5 -16t16 -38.5t-16 -39t-38.5 -16.5t-38.5 16.5t-16 39t16 38.5t38.5 16zM754.5 905q22.5 0 38.5 -16t16 -38.5t-16 -39t-38 -16.5q-14 0 -29 10l-55 -145 q17 -23 17 -51q0 -36 -25.5 -61.5t-61.5 -25.5t-61.5 25.5t-25.5 61.5q0 32 20.5 56.5t51.5 29.5l122 126l1 1q-9 14 -9 28q0 23 16 39t38.5 16zM345.5 709q22.5 0 38.5 -16t16 -38.5t-16 -38.5t-38.5 -16t-38.5 16t-16 38.5t16 38.5t38.5 16zM854.5 709q22.5 0 38.5 -16 t16 -38.5t-16 -38.5t-38.5 -16t-38.5 16t-16 38.5t16 38.5t38.5 16z",
    "paperclip": "M546 173l469 470q91 91 99 192q7 98 -52 175.5t-154 94.5q-22 4 -47 4q-34 0 -66.5 -10t-56.5 -23t-55.5 -38t-48 -41.5t-48.5 -47.5q-376 -375 -391 -390q-30 -27 -45 -41.5t-37.5 -41t-32 -46.5t-16 -47.5t-1.5 -56.5q9 -62 53.5 -95t99.5 -33q74 0 125 51l548 548 q36 36 20 75q-7 16 -21.5 26t-32.5 10q-26 0 -50 -23q-13 -12 -39 -38l-341 -338q-15 -15 -35.5 -15.5t-34.5 13.5t-14 34.5t14 34.5q327 333 361 367q35 35 67.5 51.5t78.5 16.5q14 0 29 -1q44 -8 74.5 -35.5t43.5 -68.5q14 -47 2 -96.5t-47 -84.5q-12 -11 -32 -32 t-79.5 -81t-114.5 -115t-124.5 -123.5t-123 -119.5t-96.5 -89t-57 -45q-56 -27 -120 -27q-70 0 -129 32t-93 89q-48 78 -35 173t81 163l511 511q71 72 111 96q91 55 198 55q80 0 152 -33q78 -36 129.5 -103t66.5 -154q17 -93 -11 -183.5t-94 -156.5l-482 -476 q-15 -15 -36 -16t-37 14t-17.5 34t14.5 35z",
    "heart-empty": "M649 949q48 68 109.5 104t121.5 38.5t118.5 -20t102.5 -64t71 -100.5t27 -123q0 -57 -33.5 -117.5t-94 -124.5t-126.5 -127.5t-150 -152.5t-146 -174q-62 85 -145.5 174t-150 152.5t-126.5 127.5t-93.5 124.5t-33.5 117.5q0 64 28 123t73 100.5t104 64t119 20 t120.5 -38.5t104.5 -104zM896 972q-33 0 -64.5 -19t-56.5 -46t-47.5 -53.5t-43.5 -45.5t-37.5 -19t-36 19t-40 45.5t-43 53.5t-54 46t-65.5 19q-67 0 -122.5 -55.5t-55.5 -132.5q0 -23 13.5 -51t46 -65t57.5 -63t76 -75l22 -22q15 -14 44 -44t50.5 -51t46 -44t41 -35t23 -12 t23.5 12t42.5 36t46 44t52.5 52t44 43q4 4 12 13q43 41 63.5 62t52 55t46 55t26 46t11.5 44q0 79 -53 133.5t-120 54.5z",
    "pushpin": "M902 1185l283 -282q15 -15 15 -36t-14.5 -35.5t-35.5 -14.5t-35 15l-36 35l-279 -267v-300l-212 210l-308 -307l-280 -203l203 280l307 308l-210 212h300l267 279l-35 36q-15 14 -15 35t14.5 35.5t35.5 14.5t35 -15z",
    "sort": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM935 1184l230 -249q14 -14 10 -24.5t-25 -10.5h-150v-900h-200v900h-150q-21 0 -25 10.5t10 24.5l230 249q14 15 35 15t35 -15z",
    "sort-by-alphabet": "M1000 700h-100v100h-100v-100h-100v500h300v-500zM400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM801 1100v-200h100v200h-100zM1000 350l-200 -250h200v-100h-300v150l200 250h-200v100h300v-150z ",
    "sort-by-alphabet-alt": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM1000 1050l-200 -250h200v-100h-300v150l200 250h-200v100h300v-150zM1000 0h-100v100h-100v-100h-100v500h300v-500zM801 400v-200h100v200h-100z ",
    "sort-by-order": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM1000 700h-100v400h-100v100h200v-500zM1100 0h-100v100h-200v400h300v-500zM901 400v-200h100v200h-100z",
    "sort-by-order-alt": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM1100 700h-100v100h-200v400h300v-500zM901 1100v-200h100v200h-100zM1000 0h-100v400h-100v100h200v-500z",
    "sort-by-attributes": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM900 1000h-200v200h200v-200zM1000 700h-300v200h300v-200zM1100 400h-400v200h400v-200zM1200 100h-500v200h500v-200z",
    "sort-by-attributes-alt": "M400 300h150q21 0 25 -11t-10 -25l-230 -250q-14 -15 -35 -15t-35 15l-230 250q-14 14 -10 25t25 11h150v900h200v-900zM1200 1000h-500v200h500v-200zM1100 700h-400v200h400v-200zM1000 400h-300v200h300v-200zM900 100h-200v200h200v-200z",
    "login": "M550 1100h400q165 0 257.5 -92.5t92.5 -257.5v-400q0 -165 -92.5 -257.5t-257.5 -92.5h-400q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5h450q41 0 70.5 29.5t29.5 70.5v500q0 41 -29.5 70.5t-70.5 29.5h-450q-21 0 -35.5 14.5t-14.5 35.5v100 q0 21 14.5 35.5t35.5 14.5zM338 867l324 -284q16 -14 16 -33t-16 -33l-324 -284q-16 -14 -27 -9t-11 26v150h-250q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5h250v150q0 21 11 26t27 -9z",
    "flash": "M793 1182l9 -9q8 -10 5 -27q-3 -11 -79 -225.5t-78 -221.5l300 1q24 0 32.5 -17.5t-5.5 -35.5q-1 0 -133.5 -155t-267 -312.5t-138.5 -162.5q-12 -15 -26 -15h-9l-9 8q-9 11 -4 32q2 9 42 123.5t79 224.5l39 110h-302q-23 0 -31 19q-10 21 6 41q75 86 209.5 237.5 t228 257t98.5 111.5q9 16 25 16h9z",
    "log-out": "M350 1100h400q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-450q-41 0 -70.5 -29.5t-29.5 -70.5v-500q0 -41 29.5 -70.5t70.5 -29.5h450q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-400q-165 0 -257.5 92.5t-92.5 257.5v400 q0 165 92.5 257.5t257.5 92.5zM938 867l324 -284q16 -14 16 -33t-16 -33l-324 -284q-16 -14 -27 -9t-11 26v150h-250q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5h250v150q0 21 11 26t27 -9z",
    "new window": "M750 1200h400q21 0 35.5 -14.5t14.5 -35.5v-400q0 -21 -10.5 -25t-24.5 10l-109 109l-312 -312q-15 -15 -35.5 -15t-35.5 15l-141 141q-15 15 -15 35.5t15 35.5l312 312l-109 109q-14 14 -10 24.5t25 10.5zM456 900h-156q-41 0 -70.5 -29.5t-29.5 -70.5v-500 q0 -41 29.5 -70.5t70.5 -29.5h500q41 0 70.5 29.5t29.5 70.5v148l200 200v-298q0 -165 -93.5 -257.5t-256.5 -92.5h-400q-165 0 -257.5 92.5t-92.5 257.5v400q0 165 92.5 257.5t257.5 92.5h300z",
    "record": "M600 1186q119 0 227.5 -46.5t187 -125t125 -187t46.5 -227.5t-46.5 -227.5t-125 -187t-187 -125t-227.5 -46.5t-227.5 46.5t-187 125t-125 187t-46.5 227.5t46.5 227.5t125 187t187 125t227.5 46.5zM600 1022q-115 0 -212 -56.5t-153.5 -153.5t-56.5 -212t56.5 -212 t153.5 -153.5t212 -56.5t212 56.5t153.5 153.5t56.5 212t-56.5 212t-153.5 153.5t-212 56.5zM600 794q80 0 137 -57t57 -137t-57 -137t-137 -57t-137 57t-57 137t57 137t137 57z",
    "save": "M450 1200h200q21 0 35.5 -14.5t14.5 -35.5v-350h245q20 0 25 -11t-9 -26l-383 -426q-14 -15 -33.5 -15t-32.5 15l-379 426q-13 15 -8.5 26t25.5 11h250v350q0 21 14.5 35.5t35.5 14.5zM50 300h1000q21 0 35.5 -14.5t14.5 -35.5v-250h-1100v250q0 21 14.5 35.5t35.5 14.5z M900 200v-50h100v50h-100z",
    "open": "M583 1182l378 -435q14 -15 9 -31t-26 -16h-244v-250q0 -20 -17 -35t-39 -15h-200q-20 0 -32 14.5t-12 35.5v250h-250q-20 0 -25.5 16.5t8.5 31.5l383 431q14 16 33.5 17t33.5 -14zM50 300h1000q21 0 35.5 -14.5t14.5 -35.5v-250h-1100v250q0 21 14.5 35.5t35.5 14.5z M900 200v-50h100v50h-100z",
    "floppy-disk": "M1100 1000v-850q0 -21 -14.5 -35.5t-35.5 -14.5h-150v400h-700v-400h-150q-21 0 -35.5 14.5t-14.5 35.5v1000q0 20 14.5 35t35.5 15h250v-300h500v300h100zM700 1000h-100v200h100v-200z",
    "floppy-saved": "M1100 1000l-2 -149l-299 -299l-95 95q-9 9 -21.5 9t-21.5 -9l-149 -147h-312v-400h-150q-21 0 -35.5 14.5t-14.5 35.5v1000q0 20 14.5 35t35.5 15h250v-300h500v300h100zM700 1000h-100v200h100v-200zM1132 638l106 -106q7 -7 7 -17.5t-7 -17.5l-420 -421q-8 -7 -18 -7 t-18 7l-202 203q-8 7 -8 17.5t8 17.5l106 106q7 8 17.5 8t17.5 -8l79 -79l297 297q7 7 17.5 7t17.5 -7z",
    "floppy-remove": "M1100 1000v-269l-103 -103l-134 134q-15 15 -33.5 16.5t-34.5 -12.5l-266 -266h-329v-400h-150q-21 0 -35.5 14.5t-14.5 35.5v1000q0 20 14.5 35t35.5 15h250v-300h500v300h100zM700 1000h-100v200h100v-200zM1202 572l70 -70q15 -15 15 -35.5t-15 -35.5l-131 -131 l131 -131q15 -15 15 -35.5t-15 -35.5l-70 -70q-15 -15 -35.5 -15t-35.5 15l-131 131l-131 -131q-15 -15 -35.5 -15t-35.5 15l-70 70q-15 15 -15 35.5t15 35.5l131 131l-131 131q-15 15 -15 35.5t15 35.5l70 70q15 15 35.5 15t35.5 -15l131 -131l131 131q15 15 35.5 15 t35.5 -15z",
    "floppy-save": "M1100 1000v-300h-350q-21 0 -35.5 -14.5t-14.5 -35.5v-150h-500v-400h-150q-21 0 -35.5 14.5t-14.5 35.5v1000q0 20 14.5 35t35.5 15h250v-300h500v300h100zM700 1000h-100v200h100v-200zM850 600h100q21 0 35.5 -14.5t14.5 -35.5v-250h150q21 0 25 -10.5t-10 -24.5 l-230 -230q-14 -14 -35 -14t-35 14l-230 230q-14 14 -10 24.5t25 10.5h150v250q0 21 14.5 35.5t35.5 14.5z",
    "floppy-open": "M1100 1000v-400l-165 165q-14 15 -35 15t-35 -15l-263 -265h-402v-400h-150q-21 0 -35.5 14.5t-14.5 35.5v1000q0 20 14.5 35t35.5 15h250v-300h500v300h100zM700 1000h-100v200h100v-200zM935 565l230 -229q14 -15 10 -25.5t-25 -10.5h-150v-250q0 -20 -14.5 -35 t-35.5 -15h-100q-21 0 -35.5 15t-14.5 35v250h-150q-21 0 -25 10.5t10 25.5l230 229q14 15 35 15t35 -15z",
    "credit-card": "M50 1100h1100q21 0 35.5 -14.5t14.5 -35.5v-150h-1200v150q0 21 14.5 35.5t35.5 14.5zM1200 800v-550q0 -21 -14.5 -35.5t-35.5 -14.5h-1100q-21 0 -35.5 14.5t-14.5 35.5v550h1200zM100 500v-200h400v200h-400z",
    "transfer": "M935 1165l248 -230q14 -14 14 -35t-14 -35l-248 -230q-14 -14 -24.5 -10t-10.5 25v150h-400v200h400v150q0 21 10.5 25t24.5 -10zM200 800h-50q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5h50v-200zM400 800h-100v200h100v-200zM18 435l247 230 q14 14 24.5 10t10.5 -25v-150h400v-200h-400v-150q0 -21 -10.5 -25t-24.5 10l-247 230q-15 14 -15 35t15 35zM900 300h-100v200h100v-200zM1000 500h51q20 0 34.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-34.5 -14.5h-51v200z",
    "sd-video": "M200 1100h700q124 0 212 -88t88 -212v-500q0 -124 -88 -212t-212 -88h-700q-124 0 -212 88t-88 212v500q0 124 88 212t212 88zM100 900v-700h900v700h-900zM500 700h-200v-100h200v-300h-300v100h200v100h-200v300h300v-100zM900 700v-300l-100 -100h-200v500h200z M700 700v-300h100v300h-100z",
    "cloud-download": "M503 1089q110 0 200.5 -59.5t134.5 -156.5q44 14 90 14q120 0 205 -86.5t85 -207t-85 -207t-205 -86.5h-128v250q0 21 -14.5 35.5t-35.5 14.5h-300q-21 0 -35.5 -14.5t-14.5 -35.5v-250h-222q-80 0 -136 57.5t-56 136.5q0 69 43 122.5t108 67.5q-2 19 -2 37q0 100 49 185 t134 134t185 49zM525 500h150q10 0 17.5 -7.5t7.5 -17.5v-275h137q21 0 26 -11.5t-8 -27.5l-223 -244q-13 -16 -32 -16t-32 16l-223 244q-13 16 -8 27.5t26 11.5h137v275q0 10 7.5 17.5t17.5 7.5z",
    "cloud-upload": "M502 1089q110 0 201 -59.5t135 -156.5q43 15 89 15q121 0 206 -86.5t86 -206.5q0 -99 -60 -181t-150 -110l-378 360q-13 16 -31.5 16t-31.5 -16l-381 -365h-9q-79 0 -135.5 57.5t-56.5 136.5q0 69 43 122.5t108 67.5q-2 19 -2 38q0 100 49 184.5t133.5 134t184.5 49.5z M632 467l223 -228q13 -16 8 -27.5t-26 -11.5h-137v-275q0 -10 -7.5 -17.5t-17.5 -7.5h-150q-10 0 -17.5 7.5t-7.5 17.5v275h-137q-21 0 -26 11.5t8 27.5q199 204 223 228q19 19 31.5 19t32.5 -19z",
    "cd": "M1010 1010q111 -111 150.5 -260.5t0 -299t-150.5 -260.5q-83 -83 -191.5 -126.5t-218.5 -43.5t-218.5 43.5t-191.5 126.5q-111 111 -150.5 260.5t0 299t150.5 260.5q83 83 191.5 126.5t218.5 43.5t218.5 -43.5t191.5 -126.5zM476 1065q-4 0 -8 -1q-121 -34 -209.5 -122.5 t-122.5 -209.5q-4 -12 2.5 -23t18.5 -14l36 -9q3 -1 7 -1q23 0 29 22q27 96 98 166q70 71 166 98q11 3 17.5 13.5t3.5 22.5l-9 35q-3 13 -14 19q-7 4 -15 4zM512 920q-4 0 -9 -2q-80 -24 -138.5 -82.5t-82.5 -138.5q-4 -13 2 -24t19 -14l34 -9q4 -1 8 -1q22 0 28 21 q18 58 58.5 98.5t97.5 58.5q12 3 18 13.5t3 21.5l-9 35q-3 12 -14 19q-7 4 -15 4zM719.5 719.5q-49.5 49.5 -119.5 49.5t-119.5 -49.5t-49.5 -119.5t49.5 -119.5t119.5 -49.5t119.5 49.5t49.5 119.5t-49.5 119.5zM855 551q-22 0 -28 -21q-18 -58 -58.5 -98.5t-98.5 -57.5 q-11 -4 -17 -14.5t-3 -21.5l9 -35q3 -12 14 -19q7 -4 15 -4q4 0 9 2q80 24 138.5 82.5t82.5 138.5q4 13 -2.5 24t-18.5 14l-34 9q-4 1 -8 1zM1000 515q-23 0 -29 -22q-27 -96 -98 -166q-70 -71 -166 -98q-11 -3 -17.5 -13.5t-3.5 -22.5l9 -35q3 -13 14 -19q7 -4 15 -4 q4 0 8 1q121 34 209.5 122.5t122.5 209.5q4 12 -2.5 23t-18.5 14l-36 9q-3 1 -7 1z",
    "save-file": "M700 800h300v-380h-180v200h-340v-200h-380v755q0 10 7.5 17.5t17.5 7.5h575v-400zM1000 900h-200v200zM700 300h162l-212 -212l-212 212h162v200h100v-200zM520 0h-395q-10 0 -17.5 7.5t-7.5 17.5v395zM1000 220v-195q0 -10 -7.5 -17.5t-17.5 -7.5h-195z",
    "open-file": "M700 800h300v-520l-350 350l-550 -550v1095q0 10 7.5 17.5t17.5 7.5h575v-400zM1000 900h-200v200zM862 200h-162v-200h-100v200h-162l212 212zM480 0h-355q-10 0 -17.5 7.5t-7.5 17.5v55h380v-80zM1000 80v-55q0 -10 -7.5 -17.5t-17.5 -7.5h-155v80h180z",
    "level-up": "M1162 800h-162v-200h100l100 -100h-300v300h-162l212 212zM200 800h200q27 0 40 -2t29.5 -10.5t23.5 -30t7 -57.5h300v-100h-600l-200 -350v450h100q0 36 7 57.5t23.5 30t29.5 10.5t40 2zM800 400h240l-240 -400h-800l300 500h500v-100z",
    "copy": "M650 1100h100q21 0 35.5 -14.5t14.5 -35.5v-50h50q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-300q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5h50v50q0 21 14.5 35.5t35.5 14.5zM1000 850v150q41 0 70.5 -29.5t29.5 -70.5v-800 q0 -41 -29.5 -70.5t-70.5 -29.5h-600q-1 0 -20 4l246 246l-326 326v324q0 41 29.5 70.5t70.5 29.5v-150q0 -62 44 -106t106 -44h300q62 0 106 44t44 106zM412 250l-212 -212v162h-200v100h200v162z",
    "paste": "M450 1100h100q21 0 35.5 -14.5t14.5 -35.5v-50h50q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-300q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5h50v50q0 21 14.5 35.5t35.5 14.5zM800 850v150q41 0 70.5 -29.5t29.5 -70.5v-500 h-200v-300h200q0 -36 -7 -57.5t-23.5 -30t-29.5 -10.5t-40 -2h-600q-41 0 -70.5 29.5t-29.5 70.5v800q0 41 29.5 70.5t70.5 29.5v-150q0 -62 44 -106t106 -44h300q62 0 106 44t44 106zM1212 250l-212 -212v162h-200v100h200v162z",
    "alert": "M658 1197l637 -1104q23 -38 7 -65.5t-60 -27.5h-1276q-44 0 -60 27.5t7 65.5l637 1104q22 39 54 39t54 -39zM704 800h-208q-20 0 -32 -14.5t-8 -34.5l58 -302q4 -20 21.5 -34.5t37.5 -14.5h54q20 0 37.5 14.5t21.5 34.5l58 302q4 20 -8 34.5t-32 14.5zM500 300v-100h200 v100h-200z",
    "duplicate": "M900 800h300v-575q0 -10 -7.5 -17.5t-17.5 -7.5h-375v591l-300 300v84q0 10 7.5 17.5t17.5 7.5h375v-400zM1200 900h-200v200zM400 600h300v-575q0 -10 -7.5 -17.5t-17.5 -7.5h-650q-10 0 -17.5 7.5t-7.5 17.5v950q0 10 7.5 17.5t17.5 7.5h375v-400zM700 700h-200v200z ",
    "scissors": "M641 900l423 247q19 8 42 2.5t37 -21.5l32 -38q14 -15 12.5 -36t-17.5 -34l-139 -120h-390zM50 1100h106q67 0 103 -17t66 -71l102 -212h823q21 0 35.5 -14.5t14.5 -35.5v-50q0 -21 -14 -40t-33 -26l-737 -132q-23 -4 -40 6t-26 25q-42 67 -100 67h-300q-62 0 -106 44 t-44 106v200q0 62 44 106t106 44zM173 928h-80q-19 0 -28 -14t-9 -35v-56q0 -51 42 -51h134q16 0 21.5 8t5.5 24q0 11 -16 45t-27 51q-18 28 -43 28zM550 727q-32 0 -54.5 -22.5t-22.5 -54.5t22.5 -54.5t54.5 -22.5t54.5 22.5t22.5 54.5t-22.5 54.5t-54.5 22.5zM130 389 l152 130q18 19 34 24t31 -3.5t24.5 -17.5t25.5 -28q28 -35 50.5 -51t48.5 -13l63 5l48 -179q13 -61 -3.5 -97.5t-67.5 -79.5l-80 -69q-47 -40 -109 -35.5t-103 51.5l-130 151q-40 47 -35.5 109.5t51.5 102.5zM380 377l-102 -88q-31 -27 2 -65l37 -43q13 -15 27.5 -19.5 t31.5 6.5l61 53q19 16 14 49q-2 20 -12 56t-17 45q-11 12 -19 14t-23 -8z",
    "scale": "M212 1198h780q86 0 147 -61t61 -147v-416q0 -51 -18 -142.5t-36 -157.5l-18 -66q-29 -87 -93.5 -146.5t-146.5 -59.5h-572q-82 0 -147 59t-93 147q-8 28 -20 73t-32 143.5t-20 149.5v416q0 86 61 147t147 61zM600 1045q-70 0 -132.5 -11.5t-105.5 -30.5t-78.5 -41.5 t-57 -45t-36 -41t-20.5 -30.5l-6 -12l156 -243h560l156 243q-2 5 -6 12.5t-20 29.5t-36.5 42t-57 44.5t-79 42t-105 29.5t-132.5 12zM762 703h-157l195 261z",
    "ice-lolly": "M475 1300h150q103 0 189 -86t86 -189v-500q0 -41 -42 -83t-83 -42h-450q-41 0 -83 42t-42 83v500q0 103 86 189t189 86zM700 300v-225q0 -21 -27 -48t-48 -27h-150q-21 0 -48 27t-27 48v225h300z",
    "triangle-right": "M865 565l-494 -494q-23 -23 -41 -23q-14 0 -22 13.5t-8 38.5v1000q0 25 8 38.5t22 13.5q18 0 41 -23l494 -494q14 -14 14 -35t-14 -35z",
    "triangle-left": "M335 635l494 494q29 29 50 20.5t21 -49.5v-1000q0 -41 -21 -49.5t-50 20.5l-494 494q-14 14 -14 35t14 35z",
    "triangle-bottom": "M100 900h1000q41 0 49.5 -21t-20.5 -50l-494 -494q-14 -14 -35 -14t-35 14l-494 494q-29 29 -20.5 50t49.5 21z",
    "triangle-top": "M635 865l494 -494q29 -29 20.5 -50t-49.5 -21h-1000q-41 0 -49.5 21t20.5 50l494 494q14 14 35 14t35 -14z",
    "plus": "M450 1100h200q21 0 35.5 -14.5t14.5 -35.5v-350h350q21 0 35.5 -14.5t14.5 -35.5v-200q0 -21 -14.5 -35.5t-35.5 -14.5h-350v-350q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v350h-350q-21 0 -35.5 14.5t-14.5 35.5v200q0 21 14.5 35.5t35.5 14.5 h350v350q0 21 14.5 35.5t35.5 14.5z",
};

function get_icon_svg(name, w, h, color) {
    var content = "";
    if (typeof w == 'undefined') w = "1.3em";
    if (typeof h == 'undefined') h = "1.2em";
    if (typeof color == 'undefined') color = "currentColor";
    var has_error = false;
    try {
        content = list_icon[name];
    } catch (e) {
        console.error("Parsing error:", e);
        has_error = true;
    }
    if (has_error) return "";
    var icon = "<svg width='" + w + "' height='" + h + "' viewBox='0 0 1300 1200'><g transform='translate(30,1200) scale(1, -1)'><path  fill='" + color + "' d='";
    icon += content;
    icon += "'></path></g></svg>";
    return icon;
}
//input dialog
function inputdlg(titledlg, textdlg, closefunc, preset) {
    var modal = setactiveModal('inputdlg.html', closefunc);
    if (modal == null) return;
    var title = modal.element.getElementsByClassName("modal-title")[0];
    var body = modal.element.getElementsByClassName("modal-text")[0];
    title.innerHTML = titledlg;
    body.innerHTML = textdlg;
    if (typeof preset !== 'undefined') document.getElementById('inputldg_text').value = preset;
    else document.getElementById('inputldg_text').value = "";
    showModal();
}


function closeInputModal(response) {
    var answer = "";
    if (response == "ok") {
        var input = document.getElementById('inputldg_text').value;
        answer = input.trim();
    }
    closeModal(answer);
}
function store_localdata(key, value) {

    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(key, value);
        } catch (exception) {
            return false;
        }
        return true;
    }
    return false;
}

function get_localdata(key) {
    if (typeof localStorage !== 'undefined') {
        var r = "";
        try {
            r = localStorage.getItem(key);
        } catch (exception) {
            r = "";
        }
        return r;
    }
    return "";
}

function delete_localdata(key) {
    if (typeof localStorage !== 'undefined') {
        try {
            window.localStorage.removeItem(key);
        } catch (exception) {}
    }
}
//login dialog
function logindlg(closefunc, check_first) {
    var modal = setactiveModal('logindlg.html', closefunc);
    var need_query_auth = false;
    if (modal == null) return;
    document.getElementById('login_title').innerHTML = translate_text_item("Identification requested");
    document.getElementById('login_loader').style.display = "none";
    document.getElementById('login_content').style.display = "block";
    if (typeof check_first !== 'undefined') need_query_auth = check_first;
    if (need_query_auth) {
        var url = "/login";
        SendGetHttp(url, checkloginsuccess);
    } else {
        showModal();
    }
}

function checkloginsuccess(response_text) {
    var response = JSON.parse(response_text);
    if (typeof(response.authentication_lvl) !== 'undefined') {
        if (response.authentication_lvl != "guest") {
            if (typeof(response.authentication_lvl) !== 'undefined') document.getElementById('current_auth_level').innerHTML = "(" + translate_text_item(response.authentication_lvl) + ")";
            if (typeof(response.user) !== 'undefined') document.getElementById('current_ID').innerHTML = response.user;
            closeModal('cancel');
        } else showModal();
    } else {
        showModal();
    }
}

function login_id_OnKeyUp(event) {
    //console.log(event.keyCode);
    if ((event.keyCode == 13)) document.getElementById('login_password_text').focus();
}

function login_password_OnKeyUp(event) {
    //console.log(event.keyCode);
    if ((event.keyCode == 13)) document.getElementById('login_submit_btn').click();
}


function loginfailed(errorcode, response_text) {
    var response = JSON.parse(response_text);
    if (typeof(response.status) !== 'undefined') document.getElementById('login_title').innerHTML = translate_text_item(response.status);
    else document.getElementById('login_title').innerHTML = translate_text_item("Identification invalid!");
    console.log("Error " + errorcode + " : " + response_text);
    document.getElementById('login_content').style.display = "block";
    document.getElementById('login_loader').style.display = "none";
    document.getElementById('current_ID').innerHTML = translate_text_item("guest");
    document.getElementById('logout_menu').style.display = "none";
    document.getElementById('logout_menu_divider').style.display = "none";
    document.getElementById("password_menu").style.display = "none";
}

function loginsuccess(response_text) {
    var response = JSON.parse(response_text);
    if (typeof(response.authentication_lvl) !== 'undefined') document.getElementById('current_auth_level').innerHTML = "(" + translate_text_item(response.authentication_lvl) + ")";
    document.getElementById('login_loader').style.display = "none";
    document.getElementById('logout_menu').style.display = "block";
    document.getElementById('logout_menu_divider').style.display = "block";
    document.getElementById("password_menu").style.display = "block";
    closeModal("Connection successful");
}

function SubmitLogin() {
    var user = document.getElementById('login_user_text').value.trim();
    var password = document.getElementById('login_password_text').value.trim();
    var url = "/login?USER=" + encodeURIComponent(user) + "&PASSWORD=" + encodeURIComponent(password) + "&SUBMIT=yes";
    document.getElementById('current_ID').innerHTML = user;
    document.getElementById('current_auth_level').innerHTML = "";
    document.getElementById('login_content').style.display = "none";
    document.getElementById('login_loader').style.display = "block";
    SendGetHttp(url, loginsuccess, loginfailed);
}

function GetIdentificationStatus() {
    var url = "/login";
    SendGetHttp(url, GetIdentificationStatusSuccess);
}

function GetIdentificationStatusSuccess(response_text) {
    var response = JSON.parse(response_text);
    if (typeof(response.authentication_lvl) !== 'undefined') {
        if (response.authentication_lvl == "guest") {
            document.getElementById('current_ID').innerHTML = translate_text_item("guest");
            document.getElementById('current_auth_level').innerHTML = "";
        }
    }
}

function DisconnectionSuccess(response_text) {
    document.getElementById('current_ID').innerHTML = translate_text_item("guest");
    document.getElementById('current_auth_level').innerHTML = "";
    document.getElementById('logout_menu').style.display = "none";
    document.getElementById('logout_menu_divider').style.display = "none";
    document.getElementById("password_menu").style.display = "none";
}

function DisconnectionFailed(errorcode, response) {
    document.getElementById('current_ID').innerHTML = translate_text_item("guest");
    document.getElementById('current_auth_level').innerHTML = "";
    document.getElementById('logout_menu').style.display = "none";
    document.getElementById('logout_menu_divider').style.display = "none";
    document.getElementById("password_menu").style.display = "none";
    console.log("Error " + errorcode + " : " + response);
}

function DisconnectLogin(answer) {
    if (answer == "yes") {
        var url = "/login?DISCONNECT=yes";
        SendGetHttp(url, DisconnectionSuccess, DisconnectionFailed);
    }
}
//Macro dialog
var macrodlg_macrolist = [];

function showmacrodlg(closefn) {
    var modal = setactiveModal('macrodlg.html', closefn);
    if (modal == null) return;
    build_dlg_macrolist_ui();
    document.getElementById('macrodlg_upload_msg').style.display = 'none';
    showModal();
}

function build_color_selection(index) {
    var content = "";
    var entry = macrodlg_macrolist[index];
    var menu_pos = "down";
    if (index > 3) menu_pos = "up";
    content += "<div class='dropdownselect'  id='macro_color_line" + index + "'>";
    content += "<button class='btn " + entry.class + "' onclick='showhide_drop_menu(event)'>&nbsp;";
    content += "<svg width='0.8em' height='0.8em' viewBox='0 0 1300 1200' style='pointer-events:none'>";
    content += "<g transform='translate(50,1200) scale(1, -1)'>";
    content += "<path  fill='currentColor' d='M100 900h1000q41 0 49.5 -21t-20.5 -50l-494 -494q-14 -14 -35 -14t-35 14l-494 494q-29 29 -20.5 50t49.5 21z'></path>";
    content += "</g>";
    content += "</svg>";
    content += "</button>";
    content += "<div class='dropmenu-content dropmenu-content-" + menu_pos + "' style='min-width:auto; padding-left: 4px;padding-right: 4px;'>";
    content += "<button class='btn btn-default' onclick='macro_select_color(event, \"default\" ," + index + ")'>&nbsp;</button>";
    content += "<button class='btn btn-primary' onclick='macro_select_color(event, \"primary\" ," + index + ")'>&nbsp;</button>";
    content += "<button class='btn btn-info' onclick='macro_select_color(event, \"info\" ," + index + ")'>&nbsp;</button>";
    content += "<button class='btn btn-warning' onclick='macro_select_color(event, \"warning\" ," + index + ")'>&nbsp;</button>";
    content += "<button class='btn btn-danger'  onclick='macro_select_color(event, \"danger\" ," + index + ")'>&nbsp;</button>";
    content += "</div>";
    content += "</div>";
    return content;
}

function build_target_selection(index) {
    var content = "";
    var entry = macrodlg_macrolist[index];
    var menu_pos = "down";
    if (index > 3) menu_pos = "up";
    content += "<div class='dropdownselect'  id='macro_target_line" + index + "'>";
    content += "<button class='btn btn-default' style='min-width:5em;' onclick='showhide_drop_menu(event)'><span>" + entry.target + "</span>";
    content += "<svg width='0.8em' height='0.8em' viewBox='0 0 1300 1200' style='pointer-events:none'>";
    content += "<g transform='translate(50,1200) scale(1, -1)'>";
    content += "<path  fill='currentColor' d='M100 900h1000q41 0 49.5 -21t-20.5 -50l-494 -494q-14 -14 -35 -14t-35 14l-494 494q-29 29 -20.5 50t49.5 21z'></path>";
    content += "</g>";
    content += "</svg>";
    content += "</button>";
    content += "<div class='dropmenu-content dropmenu-content-" + menu_pos + "' style='min-width:auto'>";
    content += "<a href=# onclick='macro_select_target(event, \"ESP\" ," + index + ")'>ESP</a>";
    content += "<a href=# onclick='macro_select_target(event, \"SD\" ," + index + ")'>SD</a>";
    content += "<a href=# onclick='macro_select_target(event, \"URI\" ," + index + ")'>URI</a>"
    content += "</div>";
    content += "</div>";
    return content;
}

function build_glyph_selection(index) {
    var content = "";
    var entry = macrodlg_macrolist[index];
    var menu_pos = "down";
    if (index > 3) menu_pos = "up";
    content += "<div class='dropdownselect'  id='macro_glyph_line" + index + "'>";
    content += "<button class='btn " + entry.class + "' onclick='showhide_drop_menu(event)'><span>" + get_icon_svg(entry.glyph) + "</span>&nbsp;";
    content += "<svg width='0.8em' height='0.8em' viewBox='0 0 1300 1200' style='pointer-events:none'>";
    content += "<g transform='translate(50,1200) scale(1, -1)'>";
    content += "<path  fill='currentColor' d='M100 900h1000q41 0 49.5 -21t-20.5 -50l-494 -494q-14 -14 -35 -14t-35 14l-494 494q-29 29 -20.5 50t49.5 21z'></path>";
    content += "</g>";
    content += "</svg>";
    content += "</button>";
    content += "<div class='dropmenu-content  dropmenu-content-" + menu_pos + "' style='min-width:30em'>";
    for (var key in list_icon) {
        if (key != "plus") {
            content += "<button class='btn btn-default btn-xs' onclick='macro_select_glyph(event, \"" + key + "\" ," + index + ")'><span>" + get_icon_svg(key) + "</span>";
            content += "</button>";
        }
    }
    content += "</div>";
    content += "</div>";
    return content;
}

function build_filename_selection(index) {
    var content = "";
    var entry = macrodlg_macrolist[index];
    content += "<span id='macro_filename_input_line_" + index + "' class='form-group "
    if (entry.filename.length == 0) content += "has-error has-feedback"
    content += "'>";
    content += "<input type='text' id='macro_filename_line_" + index + "' style='width:9em' class='form-control' onkeyup='macro_filename_OnKeyUp(this," + index + ")'  onchange='on_macro_filename(this," + index + ")' value='" + entry.filename + "'  aria-describedby='inputStatus_line" + index + "'>";
    content += "<span id='icon_macro_status_line_" + index + "' style='color:#a94442; position:absolute;bottom:4px;left:7.5em;";
    if (entry.filename.length > 0) content += "display:none";
    content += "'>" + get_icon_svg("remove") + "</span>";
    content += "</input></span>";
    return content;
}

function build_dlg_macrolist_line(index) {
    var content = "";
    var entry = macrodlg_macrolist[index];
    content += "<td style='vertical-align:middle'>";
    content += "<button onclick='macro_reset_button(" + index + ")'  class='btn btn-xs ";
    if (entry.class == '') {
        content += "btn-default'  style='padding-top: 3px;padding-left: 4px;padding-right: 2px;padding-bottom: 0px;' >" + get_icon_svg("plus") + " </button></td><td colspan='5'>";
    } else {
        content += "btn-danger' style='padding-top: 3px;padding-left: 2px;padding-right: 3px;padding-bottom: 0px;' >" + get_icon_svg("trash") + "</button></td>";
        content += "<td style='vertical-align:middle'><input type='text' id='macro_name_line_" + index + "' style='width:4em' class='form-control' onchange='on_macro_name(this," + index + ")' value='";
        if (entry.name != "&nbsp;") {
            content += entry.name;
        }
        content += "'/></td>";
        content += "<td style='vertical-align:middle'>" + build_glyph_selection(index) + "</td>";
        content += "<td style='vertical-align:middle'>" + build_color_selection(index) + "</td>";
        content += "<td style='vertical-align:middle'>" + build_target_selection(index) + "</td>";
        content += "<td style='vertical-align:middle'>" + build_filename_selection(index) + "</td>";
    }
    content += "</td>";
    document.getElementById('macro_line_' + index).innerHTML = content;
}

function macro_filename_OnKeyUp(event, index) {
    var item = document.getElementById("macro_filename_line_" + index);
    var group = document.getElementById("macro_filename_input_line_" + index);
    var value = item.value.trim();
    if (value.length > 0) {
        if (group.classList.contains('has-feedback')) group.classList.remove('has-feedback');
        if (group.classList.contains('has-error')) group.classList.remove('has-error');
        document.getElementById("icon_macro_status_line_" + index).style.display = 'none';
    } else {
        document.getElementById("icon_macro_status_line_" + index).style.display = 'block';
        if (!group.classList.contains('has-error')) group.classList.add('has-error');
        if (!group.classList.contains('has-feedback')) group.classList.add('has-feedback');
    }
    return true;
}

function on_macro_filename(item, index) {
    var entry = macrodlg_macrolist[index];
    var filename = item.value.trim();
    entry.filename = item.value;
    if (filename.length == 0) {
        alertdlg(translate_text_item("Out of range"), translate_text_item("File name cannot be empty!"));
    }
    build_dlg_macrolist_line(index);
}

function on_macro_name(item, index) {
    var entry = macrodlg_macrolist[index];
    var macroname = item.value.trim();
    if (macroname.length > 0) {
        entry.name = item.value;
    } else {
        entry.name = "&nbsp;";
    }
}

function build_dlg_macrolist_ui() {
    var content = "";
    macrodlg_macrolist = [];
    for (var i = 0; i < 9; i++) {
        var entry = {
            name: control_macrolist[i].name,
            glyph: control_macrolist[i].glyph,
            filename: control_macrolist[i].filename,
            target: control_macrolist[i].target,
            class: control_macrolist[i].class,
            index: control_macrolist[i].index
        };
        macrodlg_macrolist.push(entry);
        content += "<tr style='vertical-align:middle' id='macro_line_" + i + "'>";
        content += "</tr>";
    }

    document.getElementById('dlg_macro_list').innerHTML = content;
    for (var i = 0; i < 9; i++) build_dlg_macrolist_line(i);
}

function macro_reset_button(index) {
    var entry = macrodlg_macrolist[index];
    if (entry.class == "") {
        entry.name = "M" + (1 + entry.index);
        entry.glyph = "star";
        entry.filename = "/macro" + (1 + entry.index) + ".g";
        entry.target = "ESP";
        entry.class = "btn-default";
    } else {
        entry.name = "";
        entry.glyph = "";
        entry.filename = "";
        entry.target = "";
        entry.class = "";
    }
    build_dlg_macrolist_line(index);
}

function macro_select_color(event, color, index) {
    var entry = macrodlg_macrolist[index];
    hide_drop_menu(event);
    entry.class = "btn btn-" + color;
    build_dlg_macrolist_line(index);
}

function macro_select_target(event, target, index) {
    var entry = macrodlg_macrolist[index];
    hide_drop_menu(event);
    entry.target = target;
    build_dlg_macrolist_line(index)
}

function macro_select_glyph(event, glyph, index) {
    var entry = macrodlg_macrolist[index];
    hide_drop_menu(event);
    entry.glyph = glyph;
    build_dlg_macrolist_line(index)
}

function closeMacroDialog() {
    var modified = false;
    for (var i = 0; i < 9; i++) {
        if ((macrodlg_macrolist[i].filename !== control_macrolist[i].filename) || (macrodlg_macrolist[i].name !== control_macrolist[i].name) || (macrodlg_macrolist[i].glyph !== control_macrolist[i].glyph) || (macrodlg_macrolist[i].class !== control_macrolist[i].class) || (macrodlg_macrolist[i].target !== control_macrolist[i].target)) {
            modified = true;
        }
    }
    if (modified) {
        confirmdlg(translate_text_item("Data modified"), translate_text_item("Do you want to save?"), process_macroCloseDialog)
    } else closeModal('cancel');
}

function process_macroCloseDialog(answer) {
    if (answer == 'no') {
        //console.log("Answer is no so exit");
        closeModal('cancel');
    } else {
        // console.log("Answer is yes so let's save");
        SaveNewMacroList();
    }
}

function SaveNewMacroList() {
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        return;
    }
    for (var i = 0; i < 9; i++) {
        if (macrodlg_macrolist[i].filename.length == 0 && macrodlg_macrolist[i].class != "") {
            alertdlg(translate_text_item("Out of range"), translate_text_item("File name cannot be empty!"));
            return;
        }
    }

    var blob = new Blob([JSON.stringify(macrodlg_macrolist, null, " ")], {
        type: 'application/json'
    });
    var file;
    if (browser_is("IE") || browser_is("Edge")) {
        file = blob;
        file.name = '/macrocfg.json';
        file.lastModifiedDate = new Date();
    } else file = new File([blob], '/macrocfg.json');
    var formData = new FormData();
    var url = "/files";
    formData.append('path', '/');
    formData.append('myfile[]', file, '/macrocfg.json');
    SendFileHttp(url, formData, macrodlgUploadProgressDisplay, macroUploadsuccess, macroUploadfailed)
}

function macrodlgUploadProgressDisplay(oEvent) {
    if (oEvent.lengthComputable) {
        var percentComplete = (oEvent.loaded / oEvent.total) * 100;
        document.getElementById('macrodlg_prg').value = percentComplete;
        document.getElementById('macrodlg_upload_percent').innerHTML = percentComplete.toFixed(0);
        document.getElementById('macrodlg_upload_msg').style.display = 'block';
    } else {
        // Impossible because size is unknown
    }
}

function macroUploadsuccess(response) {
    control_macrolist = [];
    for (var i = 0; i < 9; i++) {
        var entry;
        if ((macrodlg_macrolist.length != 0)) {
            entry = {
                name: macrodlg_macrolist[i].name,
                glyph: macrodlg_macrolist[i].glyph,
                filename: macrodlg_macrolist[i].filename,
                target: macrodlg_macrolist[i].target,
                class: macrodlg_macrolist[i].class,
                index: macrodlg_macrolist[i].index
            };
        } else {
            entry = {
                name: '',
                glyph: '',
                filename: '',
                target: '',
                class: '',
                index: i
            };
        }
        control_macrolist.push(entry);
    }
    document.getElementById('macrodlg_upload_msg').style.display = 'none';
    closeModal('ok');
}

function macroUploadfailed(errorcode, response) {
    alertdlg(translate_text_item("Error"), translate_text_item("Save macro list failed!"));
    document.getElementById('macrodlg_upload_msg').style.display = 'none';
}

// Create the modal
var listmodal = [];


function setactiveModal(html_template, closefunc) {
    if (typeof document.getElementById(html_template) === 'undefined') {
        console.log("Error: no " + html_template);
        return null;
    }
    var modal = new Object;
    modal.element = document.getElementById(html_template);
    modal.id = listmodal.length;
    modal.name = html_template;
    if (typeof closefunc !== 'undefined') modal.closefn = closefunc;
    else modal.closefn = myfnclose;
    listmodal.push(modal)
    //console.log("Creation of modal  " +  modal.name + " with ID " +modal.id);
    return listmodal[listmodal.length - 1];;
}

function getactiveModal() {
    if (listmodal.length > 0) {
        return listmodal[listmodal.length - 1];
    } else return null;
}

// open the modal 
function showModal() {
    var currentmodal = getactiveModal();
    currentmodal.element.style.display = "block";
    //console.log("Show modal " +  currentmodal.name + " with ID " + currentmodal.id  );
}

// When the user clicks on <span> (x), close the modal
function closeModal(response) {
    var currentmodal = getactiveModal();
    if (currentmodal != null) {
        currentmodal.element.style.display = "none";
        var closefn = currentmodal.closefn;
        //console.log("Deletetion of modal " +  currentmodal.name + " with ID "  + currentmodal.id);
        listmodal.pop();
        delete currentmodal;
        currentmodal = getactiveModal();
        //if (currentmodal != null)console.log("New active modal is  " +  currentmodal.name + " with ID "  + currentmodal.id);
        //else console.log("No active modal");
        closefn(response);
    }
}
//default close function
function myfnclose(value) {
    //console.log("modale closed: " + value);
}
//changepassword dialog
function changepassworddlg() {
    var modal = setactiveModal('passworddlg.html');
    if (modal == null) return;
    document.getElementById('password_loader').style.display = "none";
    document.getElementById('change_password_content').style.display = "block";
    document.getElementById('change_password_btn').style.display = "none";
    document.getElementById('password_content').innerHTML = "";
    document.getElementById('password_password_text').innerHTML = "";
    document.getElementById('password_password_text1').innerHTML = "";
    document.getElementById('password_password_text2').innerHTML = "";
    showModal();
}


function checkpassword() {
    var pwd = document.getElementById('password_password_text').value.trim();
    var pwd1 = document.getElementById('password_password_text1').value.trim();
    var pwd2 = document.getElementById('password_password_text2').value.trim();
    document.getElementById('password_content').innerHTML = "";
    document.getElementById('change_password_btn').style.display = "none";
    if (pwd1 != pwd2) document.getElementById('password_content').innerHTML = translate_text_item("Passwords do not matches!");
    else if (pwd1.length < 1 || pwd1.length > 16 || pwd1.indexOf(" ") > -1) document.getElementById('password_content').innerHTML = translate_text_item("Password must be >1 and <16 without space!");
    else document.getElementById('change_password_btn').style.display = "block";
}


function ChangePasswordfailed(errorcode, response_text) {
    var response = JSON.parse(response_text);
    if (typeof(response.status) !== 'undefined') document.getElementById('password_content').innerHTML = translate_text_item(response.status);
    console.log("Error " + errorcode + " : " + response_text);
    document.getElementById('password_loader').style.display = "none";
    document.getElementById('change_password_content').style.display = "block";
}

function ChangePasswordsuccess(response_text) {
    document.getElementById('password_loader').style.display = "none";
    closeModal("Connection successful");
}

function SubmitChangePassword() {
    var user = document.getElementById('current_ID').innerHTML.trim();
    var password = document.getElementById('password_password_text').value.trim();
    var newpassword = document.getElementById('password_password_text1').value.trim();
    var url = "/login?USER=" + encodeURIComponent(user) + "&PASSWORD=" + encodeURIComponent(password) + "&NEWPASSWORD=" + encodeURIComponent(newpassword) + "&SUBMIT=yes";
    document.getElementById('password_loader').style.display = "block";
    document.getElementById('change_password_content').style.display = "none";
    SendGetHttp(url, ChangePasswordsuccess, ChangePasswordfailed);
}
//Preferences dialog
var preferenceslist = [];
var language_save = language;
var default_preferenceslist = [];
var defaultpreferenceslist = "[{\
                                            \"language\":\"en\",\
                                            \"enable_lock_UI\":\"false\",\
                                            \"enable_ping\":\"true\",\
                                            \"enable_DHT\":\"false\",\
                                            \"enable_camera\":\"false\",\
                                            \"auto_load_camera\":\"false\",\
                                            \"camera_address\":\"\",\
                                            \"number_extruders\":\"1\",\
                                            \"is_mixed_extruder\":\"false\",\
                                            \"enable_redundant\":\"false\",\
                                            \"enable_probe\":\"false\",\
                                            \"enable_bed\":\"false\",\
                                            \"enable_chamber\":\"false\",\
                                            \"enable_fan\":\"false\",\
                                            \"enable_control_panel\":\"true\",\
                                            \"enable_grbl_panel\":\"false\",\
                                            \"interval_positions\":\"3\",\
                                            \"interval_temperatures\":\"3\",\
                                            \"interval_status\":\"3\",\
                                            \"xy_feedrate\":\"1000\",\
                                            \"z_feedrate\":\"100\",\
                                            \"a_feedrate\":\"100\",\
                                            \"b_feedrate\":\"100\",\
                                            \"c_feedrate\":\"100\",\
                                            \"e_feedrate\":\"400\",\
                                            \"e_distance\":\"5\",\
                                            \"f_filters\":\"gco;gcode\",\
                                            \"enable_temperatures_panel\":\"true\",\
                                            \"enable_extruder_panel\":\"true\",\
                                            \"enable_files_panel\":\"true\",\
                                            \"has_TFT_SD\":\"false\",\
                                            \"has_TFT_USB\":\"false\",\
                                            \"enable_commands_panel\":\"true\",\
                                            \"enable_autoscroll\":\"true\",\
                                            \"enable_verbose_mode\":\"true\",\
                                            \"enable_grbl_probe_panel\":\"false\",\
                                            \"enable_grbl_surface_panel\":\"false\",\
                                            \"probemaxtravel\":\"40\",\
                                            \"probefeedrate\":\"100\",\
                                            \"probetouchplatethickness\":\"0.5\",\
                                            \"surfacewidth\":\"100\",\
                                            \"surfacelength\":\"400\",\
                                            \"surfacezdepth\":\"0\",\
                                            \"surfacebitdiam\":\"12.7\",\
                                            \"surfacestepover\":\"40\",\
                                            \"surfacefeedrate\":\"1000\",\
                                            \"surfacespindle\":\"10000\"\
                                            }]";
var preferences_file_name = '/preferences.json';

function initpreferences() {
    if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) {
        defaultpreferenceslist = "[{\
                                            \"language\":\"en\",\
                                            \"enable_lock_UI\":\"false\",\
                                            \"enable_ping\":\"true\",\
                                            \"enable_DHT\":\"false\",\
                                            \"enable_camera\":\"false\",\
                                            \"auto_load_camera\":\"false\",\
                                            \"camera_address\":\"\",\
                                            \"number_extruders\":\"1\",\
                                            \"is_mixed_extruder\":\"false\",\
                                            \"enable_redundant\":\"false\",\
                                            \"enable_probe\":\"false\",\
                                            \"enable_bed\":\"false\",\
                                            \"enable_chamber\":\"false\",\
                                            \"enable_fan\":\"false\",\
                                            \"enable_control_panel\":\"true\",\
                                            \"enable_grbl_panel\":\"true\",\
                                            \"interval_positions\":\"3\",\
                                            \"interval_temperatures\":\"3\",\
                                            \"interval_status\":\"3\",\
                                            \"xy_feedrate\":\"1000\",\
                                            \"z_feedrate\":\"100\",\
                                            \"a_feedrate\":\"100\",\
                                            \"b_feedrate\":\"100\",\
                                            \"c_feedrate\":\"100\",\
                                            \"e_feedrate\":\"400\",\
                                            \"e_distance\":\"5\",\
                                            \"enable_temperatures_panel\":\"false\",\
                                            \"enable_extruder_panel\":\"false\",\
                                            \"enable_files_panel\":\"true\",\
                                            \"has_TFT_SD\":\"false\",\
                                            \"has_TFT_USB\":\"false\",\
                                            \"f_filters\":\"g;G;gco;GCO;gcode;GCODE;nc;NC;ngc;NCG;tap;TAP;txt;TXT\",\
                                            \"enable_commands_panel\":\"true\",\
                                            \"enable_autoscroll\":\"true\",\
                                            \"enable_verbose_mode\":\"true\",\
                                            \"enable_grbl_probe_panel\":\"false\",\
                                            \"enable_grbl_surface_panel\":\"false\",\
                                            \"probemaxtravel\":\"40\",\
                                            \"probefeedrate\":\"100\",\
                                            \"probetouchplatethickness\":\"0.5\",\
                                            \"surfacewidth\":\"100\",\
                                            \"surfacelength\":\"400\",\
                                            \"surfacezdepth\":\"0\",\
                                            \"surfacebitdiam\":\"12.7\",\
                                            \"surfacestepover\":\"40\",\
                                            \"surfacefeedrate\":\"1000\",\
                                            \"surfacespindle\":\"10000\"\
                                            }]";

        document.getElementById('DHT_pref_panel').style.display = 'none';
        document.getElementById('temp_pref_panel').style.display = 'none';
        document.getElementById('ext_pref_panel').style.display = 'none';
        document.getElementById('grbl_pref_panel').style.display = 'block';
        document.getElementById('has_tft_sd').style.display = 'table-row';
        document.getElementById('has_tft_usb').style.display = 'table-row';
    } else {
        defaultpreferenceslist = "[{\
                                            \"language\":\"en\",\
                                            \"enable_lock_UI\":\"false\",\
                                            \"enable_ping\":\"true\",\
                                            \"enable_DHT\":\"false\",\
                                            \"enable_camera\":\"false\",\
                                            \"auto_load_camera\":\"false\",\
                                            \"camera_address\":\"\",\
                                            \"number_extruders\":\"1\",\
                                            \"is_mixed_extruder\":\"false\",\
                                            \"enable_redundant\":\"false\",\
                                            \"enable_probe\":\"false\",\
                                            \"enable_bed\":\"false\",\
                                            \"enable_chamber\":\"false\",\
                                            \"enable_fan\":\"false\",\
                                            \"enable_control_panel\":\"true\",\
                                            \"enable_grbl_panel\":\"true\",\
                                            \"interval_positions\":\"3\",\
                                            \"interval_temperatures\":\"3\",\
                                            \"interval_status\":\"3\",\
                                            \"xy_feedrate\":\"1000\",\
                                            \"z_feedrate\":\"100\",\
                                            \"a_feedrate\":\"100\",\
                                            \"b_feedrate\":\"100\",\
                                            \"c_feedrate\":\"100\",\
                                            \"e_feedrate\":\"400\",\
                                            \"e_distance\":\"5\",\
                                            \"enable_temperatures_panel\":\"true\",\
                                            \"enable_extruder_panel\":\"true\",\
                                            \"enable_files_panel\":\"true\",\
                                            \"has_TFT_SD\":\"false\",\
                                            \"has_TFT_USB\":\"false\",\
                                            \"f_filters\":\"g;G;gco;GCO;gcode;GCODE\",\
                                            \"enable_commands_panel\":\"true\",\
                                            \"enable_autoscroll\":\"true\",\
                                            \"enable_verbose_mode\":\"true\",\
                                            \"enable_grbl_probe_panel\":\"false\",\
                                            \"enable_grbl_surface_panel\":\"false\",\
                                            \"probemaxtravel\":\"40\",\
                                            \"probefeedrate\":\"100\",\
                                            \"probetouchplatethickness\":\"0.5\",\
                                            \"surfacewidth\":\"100\",\
                                            \"surfacelength\":\"400\",\
                                            \"surfacezdepth\":\"0\",\
                                            \"surfacebitdiam\":\"12.7\",\
                                            \"surfacestepover\":\"40\",\
                                            \"surfacefeedrate\":\"1000\",\
                                            \"surfacespindle\":\"10000\"\
                                            }]";

        if (target_firmware == "marlin-embedded") document.getElementById('DHT_pref_panel').style.display = 'none';
        else document.getElementById('DHT_pref_panel').style.display = 'block';

        document.getElementById('temp_pref_panel').style.display = 'block';
        document.getElementById('ext_pref_panel').style.display = 'block';
        document.getElementById('grbl_pref_panel').style.display = 'none';
        document.getElementById('has_tft_sd').style.display = 'table-row';
        document.getElementById('has_tft_usb').style.display = 'table-row';
    }
        
    if (supportsRedundantTemperatures()) document.getElementById('redundant_controls_option').style.display = 'block';
    else document.getElementById('redundant_controls_option').style.display = 'none';
    if (supportsProbeTemperatures()) document.getElementById('probe_controls_option').style.display = 'block';
    else document.getElementById('probe_controls_option').style.display = 'none';
    if (supportsChamberTemperatures()) document.getElementById('chamber_controls_option').style.display = 'block';
    else document.getElementById('chamber_controls_option').style.display = 'none';

    default_preferenceslist = JSON.parse(defaultpreferenceslist);
}

function getpreferenceslist() {
    var url = preferences_file_name + "?" + Date.now();
    preferenceslist = [];
    //removeIf(production)
    var response = defaultpreferenceslist;
    processPreferencesGetSuccess(response);
    return;
    //endRemoveIf(production)
    SendGetHttp(url, processPreferencesGetSuccess, processPreferencesGetFailed);
}

function build_extruder_list(forcevalue) {
    var nb = 2
    var content = "";
    var current_value = document.getElementById('preferences_control_nb_extruders').value;
    if (document.getElementById('enable_mixed_E_controls').checked) {
        nb = 9;
    }
    if (typeof forcevalue != 'undefined') nb = forcevalue;
    for (var i = 1; i <= nb; i++) {
        content += "<option value='" + i + "'>" + i + "</option>";
    }
    document.getElementById('preferences_control_nb_extruders').innerHTML = content;
    if (parseInt(current_value) > nb) current_value = 1;
    document.getElementById('preferences_control_nb_extruders').value = current_value;
}

function prefs_toggledisplay(id_source, forcevalue) {
    if (typeof forcevalue != 'undefined') {
        document.getElementById(id_source).checked = forcevalue;
    }
    switch (id_source) {
        case 'show_files_panel':
            if (document.getElementById(id_source).checked) document.getElementById("files_preferences").style.display = "block";
            else document.getElementById("files_preferences").style.display = "none";
            break;
        case 'show_grbl_panel':
            if (document.getElementById(id_source).checked) document.getElementById("grbl_preferences").style.display = "block";
            else document.getElementById("grbl_preferences").style.display = "none";
            break;
        case 'show_camera_panel':
            if (document.getElementById(id_source).checked) document.getElementById("camera_preferences").style.display = "block";
            else document.getElementById("camera_preferences").style.display = "none";
            break;
        case 'show_control_panel':
            if (document.getElementById(id_source).checked) document.getElementById("control_preferences").style.display = "block";
            else document.getElementById("control_preferences").style.display = "none";
            break;
        case 'show_extruder_panel':
            if (document.getElementById(id_source).checked) document.getElementById("extruder_preferences").style.display = "block";
            else document.getElementById("extruder_preferences").style.display = "none";
            break;
        case 'show_temperatures_panel':
            if (document.getElementById(id_source).checked) document.getElementById("temperatures_preferences").style.display = "block";
            else document.getElementById("temperatures_preferences").style.display = "none";
            break;
        case 'show_commands_panel':
            if (document.getElementById(id_source).checked) document.getElementById("cmd_preferences").style.display = "block";
            else document.getElementById("cmd_preferences").style.display = "none";
            break;
        case 'show_grbl_probe_tab':
            if (document.getElementById(id_source).checked) document.getElementById("grbl_probe_preferences").style.display = "block";
            else document.getElementById("grbl_probe_preferences").style.display = "none";
            break;
    }
}

function processPreferencesGetSuccess(response) {
    if (response.indexOf("<HTML>") == -1) Preferences_build_list(response);
    else Preferences_build_list(defaultpreferenceslist);
}

function processPreferencesGetFailed(errorcode, response) {
    console.log("Error " + errorcode + " : " + response);
    Preferences_build_list(defaultpreferenceslist);
}

function Preferences_build_list(response_text) {
    preferenceslist = [];
    try {
        if (response_text.length != 0) {
            //console.log(response_text);  
            preferenceslist = JSON.parse(response_text);
        } else {
            preferenceslist = JSON.parse(defaultpreferenceslist);
        }
    } catch (e) {
        console.error("Parsing error:", e);
        preferenceslist = JSON.parse(defaultpreferenceslist);
    }
    applypreferenceslist();
}

function applypreferenceslist() {
    //Assign each control state
    translate_text(preferenceslist[0].language);
    build_HTML_setting_list(current_setting_filter);
    if (typeof document.getElementById('camtab') != "undefined") {
        var camoutput = false;
        if (typeof(preferenceslist[0].enable_camera) !== 'undefined') {
            if (preferenceslist[0].enable_camera === 'true') {
                document.getElementById('camtablink').style.display = "block";
                camera_GetAddress();
                if (typeof(preferenceslist[0].auto_load_camera) !== 'undefined') {
                    if (preferenceslist[0].auto_load_camera === 'true') {
                        var saddress = document.getElementById('camera_webaddress').value
                        camera_loadframe();
                        camoutput = true;
                    }
                }
            } else {
                document.getElementById("maintablink").click();
                document.getElementById('camtablink').style.display = "none";
            }
        } else {
            document.getElementById("maintablink").click();
            document.getElementById('camtablink').style.display = "none";
        }
        if (!camoutput) {
            document.getElementById('camera_frame').src = "";
            document.getElementById('camera_frame_display').style.display = "none";
            document.getElementById('camera_detach_button').style.display = "none";
        }
    }
    if (preferenceslist[0].enable_grbl_probe_panel === 'true') {
        document.getElementById('grblprobetablink').style.display = 'block';
    } else {
        document.getElementById("grblcontroltablink").click();
        document.getElementById('grblprobetablink').style.display = 'none';
    }
    if (preferenceslist[0].enable_grbl_surface_panel === 'true') {
        document.getElementById('grblsurfacetablink').style.display = 'block';
    } else {
        document.getElementById('grblsurfacetablink').style.display = 'none';
    }

    if (preferenceslist[0].enable_DHT === 'true') {
        document.getElementById('DHT_humidity').style.display = 'block';
        document.getElementById('DHT_temperature').style.display = 'block';
    } else {
        document.getElementById('DHT_humidity').style.display = 'none';
        document.getElementById('DHT_temperature').style.display = 'none';
    }
    //active_extruder
    if (preferenceslist[0].is_mixed_extruder === 'true') {
        document.getElementById('second_extruder_UI').style.display = 'none';
        document.getElementById('first_extruder_UI').style.display = 'none';
        document.getElementById('temperature_secondExtruder').style.display = 'none';
        document.getElementById('mixed_extruder_UI').style.display = 'block';
        temperature_second_extruder(false);
        var content = "";
        for (i = 0; i < preferenceslist[0].number_extruders; i++) {
            content += "<option value='" + i + "'>" + i + "</option>";
        }
        document.getElementById('active_extruder').innerHTML = content;
    } else {
        document.getElementById('first_extruder_UI').style.display = 'block';
        document.getElementById('mixed_extruder_UI').style.display = 'none';
        if (preferenceslist[0].number_extruders == '2') {
            document.getElementById('second_extruder_UI').style.display = 'block';
            document.getElementById('temperature_secondExtruder').style.display = 'table-row';
            temperature_second_extruder(true);
        } else {
            document.getElementById('second_extruder_UI').style.display = 'none';
            document.getElementById('temperature_secondExtruder').style.display = 'none';
            temperature_second_extruder(false);
        }
    }
    if (preferenceslist[0].enable_lock_UI === 'true') {
        document.getElementById('lock_ui_btn').style.display = 'block';
        ontoggleLock(true);
    } else {
        document.getElementById('lock_ui_btn').style.display = 'none';
        ontoggleLock(false);
    }
    if (preferenceslist[0].enable_ping === 'true') {
        ontogglePing(true);
    } else {
        ontogglePing(false);
    }

    if (supportsRedundantTemperatures()) {
        if (preferenceslist[0].enable_redundant === 'true') {
            document.getElementById('temperature_redundant').style.display = 'table-row';
            temperature_extruder_redundant(true);
        } else {
            document.getElementById('temperature_redundant').style.display = 'none';
            temperature_extruder_redundant(false);
        }
    }
    if (supportsProbeTemperatures()) {
        if (preferenceslist[0].enable_probe === 'true') {
            document.getElementById('temperature_probe').style.display = 'table-row';
            temperature_probe(true);
        } else {
            document.getElementById('temperature_probe').style.display = 'none';
            temperature_probe(false);
        }
    }
    if (preferenceslist[0].enable_bed === 'true') {
        document.getElementById('temperature_bed').style.display = 'table-row';
    } else {
        document.getElementById('temperature_bed').style.display = 'none';
    }
    if (supportsChamberTemperatures()) {
        if (preferenceslist[0].enable_chamber === 'true') {
            document.getElementById('temperature_chamber').style.display = 'table-row';
            temperature_chamber(true);
        } else {
            document.getElementById('temperature_chamber').style.display = 'none';
            temperature_chamber(false);
        }
    }

    if (preferenceslist[0].enable_bed === 'true' ||
            (preferenceslist[0].enable_chamber === 'true' && supportsChamberTemperatures()) ||
            (preferenceslist[0].enable_probe === 'true' && supportsProbeTemperatures())) {
        document.getElementById('bedtemperaturesgraphic').style.display = 'block';
    } else {
        document.getElementById('bedtemperaturesgraphic').style.display = 'none';
    }

    if (preferenceslist[0].enable_fan === 'true') document.getElementById('fan_UI').style.display = 'block';
    else document.getElementById('fan_UI').style.display = 'none';


    if ((target_firmware == "grbl-embedded") || (target_firmware == "grbl")) {
        if (preferenceslist[0].enable_grbl_panel === 'true') document.getElementById('grblPanel').style.display = 'flex';
        else {
            document.getElementById('grblPanel').style.display = 'none';
            on_autocheck_status(false);
        }
    } else {
        document.getElementById('grblPanel').style.display = 'none';
        on_autocheck_status(false);
    }

    if (preferenceslist[0].enable_control_panel === 'true') document.getElementById('controlPanel').style.display = 'flex';
    else {
        document.getElementById('controlPanel').style.display = 'none';
        on_autocheck_position(false);
    }
    if (preferenceslist[0].enable_verbose_mode === 'true') {
        document.getElementById('monitor_enable_verbose_mode').checked = true;
        Monitor_check_verbose_mode();
    } else document.getElementById('monitor_enable_verbose_mode').checked = false;
    if (preferenceslist[0].enable_temperatures_panel === 'true') {
        document.getElementById('temperaturesPanel').style.display = 'block';
    } else {
        document.getElementById('temperaturesPanel').style.display = 'none';
        on_autocheck_temperature(false);
    }

    if (preferenceslist[0].enable_extruder_panel === 'true') document.getElementById('extruderPanel').style.display = 'flex';
    else document.getElementById('extruderPanel').style.display = 'none';

    if (preferenceslist[0].enable_files_panel === 'true') document.getElementById('filesPanel').style.display = 'flex';
    else document.getElementById('filesPanel').style.display = 'none';
    
    if (preferenceslist[0].has_TFT_SD === 'true'){
         document.getElementById('files_refresh_tft_sd_btn').style.display = 'flex';
     }
    else {
        document.getElementById('files_refresh_tft_sd_btn').style.display = 'none';
    }
    
    if (preferenceslist[0].has_TFT_USB === 'true') {
        document.getElementById('files_refresh_tft_usb_btn').style.display = 'flex';
    }
    else {
        document.getElementById('files_refresh_tft_usb_btn').style.display = 'none';
    }
    
    if ((preferenceslist[0].has_TFT_SD === 'true') || (preferenceslist[0].has_TFT_USB === 'true')){
        document.getElementById('files_refresh_printer_sd_btn').style.display = 'flex';
        document.getElementById('files_refresh_btn').style.display = 'none';
    } else {
        document.getElementById('files_refresh_printer_sd_btn').style.display = 'none';
        document.getElementById('files_refresh_btn').style.display = 'flex';
    }
    
    if(target_firmware == "grbl") {
            document.getElementById('files_refresh_printer_sd_btn').style.display = 'none';
            document.getElementById('files_refresh_btn').style.display = 'none';
            document.getElementById('print_upload_btn').style.display = 'none';
            document.getElementById('files_createdir_btn').style.display = "none";
        }

    if (preferenceslist[0].enable_commands_panel === 'true') {
        document.getElementById('commandsPanel').style.display = 'flex';
        if (preferenceslist[0].enable_autoscroll === 'true') {
            document.getElementById('monitor_enable_autoscroll').checked = true;
            Monitor_check_autoscroll();
        } else document.getElementById('monitor_enable_autoscroll').checked = false;
    } else document.getElementById('commandsPanel').style.display = 'none';

    document.getElementById('posInterval_check').value = parseInt(preferenceslist[0].interval_positions);
    document.getElementById('statusInterval_check').value = parseInt(preferenceslist[0].interval_status);
    document.getElementById('control_xy_velocity').value = parseInt(preferenceslist[0].xy_feedrate);
    document.getElementById('control_z_velocity').value = parseInt(preferenceslist[0].z_feedrate);
    if (target_firmware == "grbl-embedded"){
        if (grblaxis > 2 )axis_Z_feedrate = parseInt(preferenceslist[0].z_feedrate);
        if (grblaxis > 3 )axis_A_feedrate = parseInt(preferenceslist[0].a_feedrate);
        if (grblaxis > 4 )axis_B_feedrate = parseInt(preferenceslist[0].b_feedrate);
        if (grblaxis > 5 )axis_C_feedrate = parseInt(preferenceslist[0].c_feedrate);
        
        if (grblaxis > 3 ){
            var letter = document.getElementById('control_select_axis').value;
            switch(letter) {
                case "Z":
                    document.getElementById('control_z_velocity').value = axis_Z_feedrate;
                break;
                case "A":
                    document.getElementById('control_z_velocity').value = axis_A_feedrate;
                break;
                case "B":
                    document.getElementById('control_z_velocity').value = axis_B_feedrate;
                break;
                case "C":
                    document.getElementById('control_z_velocity').value = axis_C_feedrate;
                break;
            }
        }
    } 
    document.getElementById('probemaxtravel').value = parseFloat(preferenceslist[0].probemaxtravel);
    document.getElementById('probefeedrate').value = parseInt(preferenceslist[0].probefeedrate);
    document.getElementById('probetouchplatethickness').value = parseFloat(preferenceslist[0].probetouchplatethickness);
    document.getElementById('surfacewidth').value = parseFloat(preferenceslist[0].surfacewidth);
    document.getElementById('surfacelength').value = parseFloat(preferenceslist[0].surfacelength);
    document.getElementById('surfacezdepth').value = parseFloat(preferenceslist[0].surfacezdepth);
    document.getElementById('surfacestepover').value = parseInt(preferenceslist[0].surfacestepover);
    document.getElementById('surfacespindle').value = parseInt(preferenceslist[0].surfacespindle);
    document.getElementById('surfacefeedrate').value = parseInt(preferenceslist[0].surfacefeedrate);
    document.getElementById('surfacebitdiam').value = parseFloat(preferenceslist[0].surfacebitdiam);
    document.getElementById('tempInterval_check').value = parseInt(preferenceslist[0].interval_temperatures);
    document.getElementById('filament_length').value = parseInt(preferenceslist[0].e_distance);
    document.getElementById('extruder_velocity').value = parseInt(preferenceslist[0].e_feedrate);
    build_file_filter_list(preferenceslist[0].f_filters);
}

function showpreferencesdlg() {
    var modal = setactiveModal('preferencesdlg.html');
    if (modal == null) return;
    language_save = language;
    build_dlg_preferences_list();
    document.getElementById('preferencesdlg_upload_msg').style.display = 'none';
    showModal();
}

function build_dlg_preferences_list() {
    //use preferenceslist to set dlg status
    var content = "<table><tr><td>";
    content += get_icon_svg("flag") + "&nbsp;</td><td>";
    content += build_language_list("language_preferences");
    content += "</td></tr></table>";
    document.getElementById("preferences_langage_list").innerHTML = content;
    //camera
    if (typeof(preferenceslist[0].enable_camera) !== 'undefined') {
        document.getElementById('show_camera_panel').checked = (preferenceslist[0].enable_camera === 'true');
    } else document.getElementById('show_camera_panel').checked = false;
    //autoload camera
    if (typeof(preferenceslist[0].auto_load_camera) !== 'undefined') {
        document.getElementById('autoload_camera_panel').checked = (preferenceslist[0].auto_load_camera === 'true');
    } else document.getElementById('autoload_camera_panel').checked = false;
    //camera address
    if (typeof(preferenceslist[0].camera_address) !== 'undefined') {
        document.getElementById('preferences_camera_webaddress').value = decode_entitie(preferenceslist[0].camera_address);
    } else document.getElementById('preferences_camera_webaddress').value = "";
    //DHT
    if (typeof(preferenceslist[0].enable_DHT) !== 'undefined') {
        document.getElementById('enable_DHT').checked = (preferenceslist[0].enable_DHT === 'true');
    } else document.getElementById('enable_DHT').checked = false;
    //lock UI
    if (typeof(preferenceslist[0].enable_lock_UI) !== 'undefined') {
        document.getElementById('enable_lock_UI').checked = (preferenceslist[0].enable_lock_UI === 'true');
    } else document.getElementById('enable_lock_UI').checked = false;
    //Monitor connection
    if (typeof(preferenceslist[0].enable_ping) !== 'undefined') {
        document.getElementById('enable_ping').checked = (preferenceslist[0].enable_ping === 'true');
    } else document.getElementById('enable_ping').checked = false;
    //is mixed extruder
    if (typeof(preferenceslist[0].is_mixed_extruder) !== 'undefined') {
        document.getElementById('enable_mixed_E_controls').checked = (preferenceslist[0].is_mixed_extruder === 'true');
    } else document.getElementById('enable_mixed_E_controls').checked = false;
    //build list of possible value accordingly
    build_extruder_list();

    //number of extruders
    if (typeof(preferenceslist[0].number_extruders) !== 'undefined') {
        var val = preferenceslist[0].number_extruders;
        if ((val > 2) && !document.getElementById('enable_mixed_E_controls').checked) val = 1;
        document.getElementById('preferences_control_nb_extruders').value = val;
    } else document.getElementById('preferences_control_nb_extruders').value = '1';

    //heater t0 redundant
    if (typeof(preferenceslist[0].enable_redundant) !== 'undefined') {
        document.getElementById('enable_redundant_controls').checked = (preferenceslist[0].enable_redundant === 'true');
    } else document.getElementById('enable_redundant_controls').checked = false;
    //probe
    if (typeof(preferenceslist[0].enable_probe) !== 'undefined') {
        document.getElementById('enable_probe_controls').checked = (preferenceslist[0].enable_probe === 'true');
    } else document.getElementById('enable_probe_controls').checked = false;
    //bed
    if (typeof(preferenceslist[0].enable_bed) !== 'undefined') {
        document.getElementById('enable_bed_controls').checked = (preferenceslist[0].enable_bed === 'true');
    } else document.getElementById('enable_bed_controls').checked = false;
    //chamber
    if (typeof(preferenceslist[0].enable_chamber) !== 'undefined') {
        document.getElementById('enable_chamber_controls').checked = (preferenceslist[0].enable_chamber === 'true');
    } else document.getElementById('enable_chamber_controls').checked = false;
    //fan
    if (typeof(preferenceslist[0].enable_fan) !== 'undefined') {
        document.getElementById('enable_fan_controls').checked = (preferenceslist[0].enable_fan === 'true');
    } else document.getElementById('enable_fan_controls').checked = false;
    //grbl panel
    if (typeof(preferenceslist[0].enable_grbl_panel) !== 'undefined') {
        document.getElementById('show_grbl_panel').checked = (preferenceslist[0].enable_grbl_panel === 'true');
    } else document.getElementById('show_grbl_panel').checked = false;
    //grbl probe panel
    if (typeof(preferenceslist[0].enable_grbl_probe_panel) !== 'undefined') {
        document.getElementById('show_grbl_probe_tab').checked = (preferenceslist[0].enable_grbl_probe_panel === 'true');
    } else document.getElementById('show_grbl_probe_tab').checked = false;
    //grbl surface panel
    if (typeof(preferenceslist[0].enable_grbl_surface_panel) !== 'undefined') {
        document.getElementById('show_grbl_surface_tab').checked = (preferenceslist[0].enable_grbl_surface_panel === 'true');
    } else document.getElementById('show_grbl_surface_tab').checked = false;
    //control panel
    if (typeof(preferenceslist[0].enable_control_panel) !== 'undefined') {
        document.getElementById('show_control_panel').checked = (preferenceslist[0].enable_control_panel === 'true');
    } else document.getElementById('show_control_panel').checked = false;
    //temperatures panel
    if (typeof(preferenceslist[0].enable_temperatures_panel) !== 'undefined') {
        document.getElementById('show_temperatures_panel').checked = (preferenceslist[0].enable_temperatures_panel === 'true');
    } else document.getElementById('show_temperatures_panel').checked = false;
    //extruders
    if (typeof(preferenceslist[0].enable_extruder_panel) !== 'undefined') {
        document.getElementById('show_extruder_panel').checked = (preferenceslist[0].enable_extruder_panel === 'true');
    } else document.getElementById('show_extruder_panel').checked = false;
    //files panel
    if (typeof(preferenceslist[0].enable_files_panel) !== 'undefined') {
        document.getElementById('show_files_panel').checked = (preferenceslist[0].enable_files_panel === 'true');
    } else document.getElementById('show_files_panel').checked = false;
    //TFT SD
    if (typeof(preferenceslist[0].has_TFT_SD) !== 'undefined') {
        document.getElementById('has_tft_sd').checked = (preferenceslist[0].has_TFT_SD === 'true');
    } else document.getElementById('has_tft_sd').checked = false;
    //TFT USB
    if (typeof(preferenceslist[0].has_TFT_USB) !== 'undefined') {
        document.getElementById('has_tft_usb').checked = (preferenceslist[0].has_TFT_USB === 'true');
    } else document.getElementById('has_tft_usb').checked = false;
    //commands
    if (typeof(preferenceslist[0].enable_commands_panel) !== 'undefined') {
        document.getElementById('show_commands_panel').checked = (preferenceslist[0].enable_commands_panel === 'true');
    } else document.getElementById('show_commands_panel').checked = false;
    //interval positions
    if (typeof(preferenceslist[0].interval_positions) !== 'undefined') {
        document.getElementById('preferences_pos_Interval_check').value = parseInt(preferenceslist[0].interval_positions);
    } else document.getElementById('preferences_pos_Interval_check').value = parseInt(default_preferenceslist[0].interval_positions);
    //interval status
    if (typeof(preferenceslist[0].interval_status) !== 'undefined') {
        document.getElementById('preferences_status_Interval_check').value = parseInt(preferenceslist[0].interval_status);
    } else document.getElementById('preferences_status_Interval_check').value = parseInt(default_preferenceslist[0].interval_status);
    //xy feedrate
    if (typeof(preferenceslist[0].xy_feedrate) !== 'undefined') {
        document.getElementById('preferences_control_xy_velocity').value = parseInt(preferenceslist[0].xy_feedrate);
    } else document.getElementById('preferences_control_xy_velocity').value = parseInt(default_preferenceslist[0].xy_feedrate);
    if ((target_firmware != "grbl-embedded") || (grblaxis > 2)) {
        //z feedrate
        if (typeof(preferenceslist[0].z_feedrate) !== 'undefined') {
            document.getElementById('preferences_control_z_velocity').value = parseInt(preferenceslist[0].z_feedrate);
        } else document.getElementById('preferences_control_z_velocity').value = parseInt(default_preferenceslist[0].z_feedrate);
    }
    if (target_firmware == "grbl-embedded") {
        if (grblaxis > 3) {
            //a feedrate
            if (typeof(preferenceslist[0].a_feedrate) !== 'undefined') {
                document.getElementById('preferences_control_a_velocity').value = parseInt(preferenceslist[0].a_feedrate);
            } else document.getElementById('preferences_control_a_velocity').value = parseInt(default_preferenceslist[0].a_feedrate);
        }
        if (grblaxis > 4) {
            //b feedrate
            if (typeof(preferenceslist[0].b_feedrate) !== 'undefined') {
                document.getElementById('preferences_control_b_velocity').value = parseInt(preferenceslist[0].b_feedrate);
            } else document.getElementById('preferences_control_b_velocity').value = parseInt(default_preferenceslist[0].b_feedrate);
        }
        if (grblaxis > 5) {
            //c feedrate
            if (typeof(preferenceslist[0].c_feedrate) !== 'undefined') {
                document.getElementById('preferences_control_c_velocity').value = parseInt(preferenceslist[0].c_feedrate);
            } else document.getElementById('preferences_control_c_velocity').value = parseInt(default_preferenceslist[0].c_feedrate);
        }
    }
    //probemaxtravel
    if ((typeof(preferenceslist[0].probemaxtravel) !== 'undefined') && (preferenceslist[0].probemaxtravel.length != 0)) {
        document.getElementById('preferences_probemaxtravel').value = parseFloat(preferenceslist[0].probemaxtravel);
    } else {
        document.getElementById('preferences_probemaxtravel').value = parseFloat(default_preferenceslist[0].probemaxtravel);
    }
    //probefeedrate
    if ((typeof(preferenceslist[0].probefeedrate) !== 'undefined') && (preferenceslist[0].probefeedrate.length != 0)) {
        document.getElementById('preferences_probefeedrate').value = parseInt(preferenceslist[0].probefeedrate);
    } else document.getElementById('preferences_probefeedrate').value = parseInt(default_preferenceslist[0].probefeedrate);
    //probetouchplatethickness
    if ((typeof(preferenceslist[0].probetouchplatethickness) !== 'undefined') && (preferenceslist[0].probetouchplatethickness.length != 0)) {
        document.getElementById('preferences_probetouchplatethickness').value = parseFloat(preferenceslist[0].probetouchplatethickness);
    } else document.getElementById('preferences_probetouchplatethickness').value = parseFloat(default_preferenceslist[0].probetouchplatethickness);
    //surfacewidth
    if ((typeof(preferenceslist[0].surfacewidth) !== 'undefined') && (preferenceslist[0].surfacewidth.length != 0)) {
        document.getElementById('preferences_surfacewidth').value = parseFloat(preferenceslist[0].surfacewidth);
    } else {
        document.getElementById('preferences_surfacewidth').value = parseFloat(default_preferenceslist[0].surfacewidth);
    }
    //surfacelength
    if ((typeof(preferenceslist[0].surfacelength) !== 'undefined') && (preferenceslist[0].surfacelength.length != 0)) {
        document.getElementById('preferences_surfacelength').value = parseFloat(preferenceslist[0].surfacelength);
    } else {
        document.getElementById('preferences_surfacelength').value = parseFloat(default_preferenceslist[0].surfacelength);
    }
    //surfacezdepth
    if ((typeof(preferenceslist[0].surfacezdepth) !== 'undefined') && (preferenceslist[0].surfacezdepth.length != 0)) {
        document.getElementById('preferences_surfacezdepth').value = parseFloat(preferenceslist[0].surfacezdepth);
    } else {
        document.getElementById('preferences_surfacezdepth').value = parseFloat(default_preferenceslist[0].surfacezdepth);
    }
    //surfacebitdiam
    if ((typeof(preferenceslist[0].surfacebitdiam) !== 'undefined') && (preferenceslist[0].surfacebitdiam.length != 0)) {
        document.getElementById('preferences_surfacebitdiam').value = parseFloat(preferenceslist[0].surfacebitdiam);
    } else document.getElementById('preferences_surfacebitdiam').value = parseFloat(default_preferenceslist[0].surfacebitdiam);
    //surfacespindle
    if ((typeof(preferenceslist[0].surfacespindle) !== 'undefined') && (preferenceslist[0].surfacespindle.length != 0)) {
        document.getElementById('preferences_surfacespindle').value = parseInt(preferenceslist[0].surfacespindle);
    } else {
        document.getElementById('preferences_surfacespindle').value = parseInt(default_preferenceslist[0].surfacespindle);
    }
    //surfacestepover
    if ((typeof(preferenceslist[0].surfacestepover) !== 'undefined') && (preferenceslist[0].surfacestepover.length != 0)) {
        document.getElementById('preferences_surfacestepover').value = parseInt(preferenceslist[0].surfacestepover);
    } else {
        document.getElementById('preferences_surfacestepover').value = parseInt(default_preferenceslist[0].surfacestepover);
    }
    //surfacefeedrate
    if ((typeof(preferenceslist[0].surfacefeedrate) !== 'undefined') && (preferenceslist[0].surfacefeedrate.length != 0)) {
        document.getElementById('preferences_surfacefeedrate').value = parseInt(preferenceslist[0].surfacefeedrate);
    } else {
        document.getElementById('preferences_surfacefeedrate').value = parseInt(default_preferenceslist[0].surfacefeedrate);
    }
    //interval temperatures
    if (typeof(preferenceslist[0].interval_temperatures) !== 'undefined') {
        document.getElementById('preferences_tempInterval_check').value = parseInt(preferenceslist[0].interval_temperatures);
    } else document.getElementById('preferences_tempInterval_check').value = parseInt(default_preferenceslist[0].interval_temperatures);
    //e feedrate
    if (typeof(preferenceslist[0].e_feedrate) !== 'undefined') {
        document.getElementById('preferences_e_velocity').value = parseInt(preferenceslist[0].e_feedrate);
    } else document.getElementById('preferences_e_velocity').value = parseInt(default_preferenceslist[0].e_feedrate);
    //e distance
    if (typeof(preferenceslist[0].e_distance) !== 'undefined') {
        document.getElementById('preferences_filament_length').value = parseInt(preferenceslist[0].e_distance);
    } else document.getElementById('preferences_filament_length').value = parseInt(default_preferenceslist[0].e_distance);
    //autoscroll
    if (typeof(preferenceslist[0].enable_autoscroll) !== 'undefined') {
        document.getElementById('preferences_autoscroll').checked = (preferenceslist[0].enable_autoscroll === 'true');
    } else document.getElementById('preferences_autoscroll').checked = false;
    //Verbose Mode
    if (typeof(preferenceslist[0].enable_verbose_mode) !== 'undefined') {
        document.getElementById('preferences_verbose_mode').checked = (preferenceslist[0].enable_verbose_mode === 'true');
    } else document.getElementById('preferences_verbose_mode').checked = false;
    //file filters
    if (typeof(preferenceslist[0].f_filters) != 'undefined') {
        console.log("Use prefs filters");
        document.getElementById('preferences_filters').value = preferenceslist[0].f_filters;
    } else {
        console.log("Use default filters");
        document.getElementById('preferences_filters').value = String(default_preferenceslist[0].f_filters);
    }

    prefs_toggledisplay('show_camera_panel');
    prefs_toggledisplay('show_grbl_panel');
    prefs_toggledisplay('show_control_panel');
    prefs_toggledisplay('show_extruder_panel');
    prefs_toggledisplay('show_temperatures_panel');
    prefs_toggledisplay('show_commands_panel');
    prefs_toggledisplay('show_files_panel');
    prefs_toggledisplay('show_grbl_probe_tab');
}

function closePreferencesDialog() {
    var modified = false;
    if (preferenceslist[0].length != 0) {
        //check dialog compare to global state
        if ((typeof(preferenceslist[0].language) === 'undefined') ||
            (typeof(preferenceslist[0].enable_camera) === 'undefined') ||
            (typeof(preferenceslist[0].auto_load_camera) === 'undefined') ||
            (typeof(preferenceslist[0].camera_address) === 'undefined') ||
            (typeof(preferenceslist[0].enable_DHT) === 'undefined') ||
            (typeof(preferenceslist[0].number_extruders) === 'undefined') ||
            (typeof(preferenceslist[0].is_mixed_extruder) === 'undefined') ||
            (typeof(preferenceslist[0].enable_lock_UI) === 'undefined') ||
            (typeof(preferenceslist[0].enable_ping) === 'undefined') ||
            (typeof(preferenceslist[0].enable_redundant) === 'undefined') ||
            (typeof(preferenceslist[0].enable_probe) === 'undefined') ||
            (typeof(preferenceslist[0].enable_bed) === 'undefined') ||
            (typeof(preferenceslist[0].enable_chamber) === 'undefined') ||
            (typeof(preferenceslist[0].enable_fan) === 'undefined') ||
            (typeof(preferenceslist[0].xy_feedrate) === 'undefined') ||
            (typeof(preferenceslist[0].z_feedrate) === 'undefined') ||
            (typeof(preferenceslist[0].e_feedrate) === 'undefined') ||
            (typeof(preferenceslist[0].e_distance) === 'undefined') ||
            (typeof(preferenceslist[0].enable_control_panel) === 'undefined') ||
            (typeof(preferenceslist[0].enable_grbl_panel) === 'undefined') ||
            (typeof(preferenceslist[0].enable_grbl_probe_panel) === 'undefined') ||
            (typeof(preferenceslist[0].enable_grbl_surface_panel) === 'undefined') ||
            (typeof(preferenceslist[0].enable_temperatures_panel) === 'undefined') ||
            (typeof(preferenceslist[0].probemaxtravel) === 'undefined') ||
            (typeof(preferenceslist[0].probefeedrate) === 'undefined') ||
            (typeof(preferenceslist[0].probetouchplatethickness) === 'undefined') ||
            (typeof(preferenceslist[0].surfacewidth) === 'undefined') ||
            (typeof(preferenceslist[0].surfacelength) === 'undefined') ||
            (typeof(preferenceslist[0].surfacezdepth) === 'undefined') ||
            (typeof(preferenceslist[0].surfacebitdiam) === 'undefined') ||
            (typeof(preferenceslist[0].surfacespindle) === 'undefined') ||
            (typeof(preferenceslist[0].surfacefeedrate) === 'undefined') ||
            (typeof(preferenceslist[0].surfacestepover) === 'undefined') ||
            (typeof(preferenceslist[0].enable_extruder_panel) === 'undefined') ||
            (typeof(preferenceslist[0].enable_files_panel) === 'undefined') ||
            (typeof(preferenceslist[0].has_TFT_SD) === 'undefined') ||
            (typeof(preferenceslist[0].has_TFT_USB) === 'undefined') ||
            (typeof(preferenceslist[0].interval_positions) === 'undefined') ||
            (typeof(preferenceslist[0].interval_temperatures) === 'undefined') ||
            (typeof(preferenceslist[0].interval_status) === 'undefined') ||
            (typeof(preferenceslist[0].enable_autoscroll) === 'undefined') ||
            (typeof(preferenceslist[0].enable_verbose_mode) === 'undefined') ||
            (typeof(preferenceslist[0].enable_commands_panel) === 'undefined')) {
            modified = true;
        } else {
            //camera
            if (document.getElementById('show_camera_panel').checked != (preferenceslist[0].enable_camera === 'true')) modified = true;
            //Autoload
            if (document.getElementById('autoload_camera_panel').checked != (preferenceslist[0].auto_load_camera === 'true')) modified = true;
            //camera address
            if (document.getElementById('preferences_camera_webaddress').value != decode_entitie(preferenceslist[0].camera_address)) modified = true;
            //DHT
            if (document.getElementById('enable_DHT').checked != (preferenceslist[0].enable_DHT === 'true')) modified = true;
            //Lock UI
            if (document.getElementById('enable_lock_UI').checked != (preferenceslist[0].enable_lock_UI === 'true')) modified = true;
            //Monitor connection
            if (document.getElementById('enable_ping').checked != (preferenceslist[0].enable_ping === 'true')) modified = true;
            //number extruders
            if (document.getElementById('preferences_control_nb_extruders').value != parseInt(preferenceslist[0].number_extruders)) modified = true;
            //is mixed extruder
            if (document.getElementById('enable_mixed_E_controls').checked != (preferenceslist[0].is_mixed_extruder === 'true')) modified = true;
            //heater t0 redundant
            if (document.getElementById('enable_redundant_controls').checked != (preferenceslist[0].enable_redundant === 'true')) modified = true;
            //probe
            if (document.getElementById('enable_probe_controls').checked != (preferenceslist[0].enable_probe === 'true')) modified = true;
            //bed
            if (document.getElementById('enable_bed_controls').checked != (preferenceslist[0].enable_bed === 'true')) modified = true;
            //chamber
            if (document.getElementById('enable_chamber_controls').checked != (preferenceslist[0].enable_chamber === 'true')) modified = true;
            //fan.
            if (document.getElementById('enable_fan_controls').checked != (preferenceslist[0].enable_fan === 'true')) modified = true;
            //control panel
            if (document.getElementById('show_control_panel').checked != (preferenceslist[0].enable_control_panel === 'true')) modified = true;
            //temperatures panel
            if (document.getElementById('show_temperatures_panel').checked != (preferenceslist[0].enable_temperatures_panel === 'true')) modified = true;
            //grbl panel
            if (document.getElementById('show_grbl_panel').checked != (preferenceslist[0].enable_grbl_panel === 'true')) modified = true;
            //grbl probe panel
            if (document.getElementById('show_grbl_probe_tab').checked != (preferenceslist[0].enable_grbl_probe_panel === 'true')) modified = true;
            //grbl surface panel
            if (document.getElementById('show_grbl_surface_tab').checked != (preferenceslist[0].enable_grbl_surface_panel === 'true')) modified = true;
            //extruder panel
            if (document.getElementById('show_extruder_panel').checked != (preferenceslist[0].enable_extruder_panel === 'true')) modified = true;
            //files panel
            if (document.getElementById('show_files_panel').checked != (preferenceslist[0].enable_files_panel === 'true')) modified = true;
            //TFT SD
            if (document.getElementById('has_tft_sd').checked != (preferenceslist[0].has_TFT_SD === 'true')) modified = true;
            //TFT USB
            if (document.getElementById('has_tft_usb').checked != (preferenceslist[0].has_TFT_USB === 'true')) modified = true;
            //commands
            if (document.getElementById('show_commands_panel').checked != (preferenceslist[0].enable_commands_panel === 'true')) modified = true;
            //interval positions
            if (document.getElementById('preferences_pos_Interval_check').value != parseInt(preferenceslist[0].interval_positions)) modified = true;
            //interval status
            if (document.getElementById('preferences_status_Interval_check').value != parseInt(preferenceslist[0].interval_status)) modified = true;
            //xy feedrate
            if (document.getElementById('preferences_control_xy_velocity').value != parseInt(preferenceslist[0].xy_feedrate)) modified = true;
            if ((target_firmware != "grbl-embedded") || (grblaxis > 2)) {
                //z feedrate
                if (document.getElementById('preferences_control_z_velocity').value != parseInt(preferenceslist[0].z_feedrate)) modified = true;
            }
            if (target_firmware == "grbl-embedded") {
                if (grblaxis > 3) {
                    //a feedrate
                    if (document.getElementById('preferences_control_a_velocity').value != parseInt(preferenceslist[0].a_feedrate)) modified = true;
                }
                if (grblaxis > 4) {
                    //b feedrate
                    if (document.getElementById('preferences_control_b_velocity').value != parseInt(preferenceslist[0].b_feedrate)) modified = true;
                }
                if (grblaxis > 5) {
                    //c feedrate
                    if (document.getElementById('preferences_control_c_velocity').value != parseInt(preferenceslist[0].c_feedrate)) modified = true;
                }
            }
            //interval temperatures
            if (document.getElementById('preferences_tempInterval_check').value != parseInt(preferenceslist[0].interval_temperatures)) modified = true;
            //e feedrate
            if (document.getElementById('preferences_e_velocity').value != parseInt(preferenceslist[0].e_feedrate)) modified = true;
            //e distance
            if (document.getElementById('preferences_filament_length').value != parseInt(preferenceslist[0].e_distance)) modified = true;
            //autoscroll
            if (document.getElementById('preferences_autoscroll').checked != (preferenceslist[0].enable_autoscroll === 'true')) modified = true;
            //Verbose Mode
            if (document.getElementById('preferences_verbose_mode').checked != (preferenceslist[0].enable_verbose_mode === 'true')) modified = true;
            //file filters
            if (document.getElementById('preferences_filters').value != preferenceslist[0].f_filters) modified = true;
            //probemaxtravel
            if (document.getElementById('preferences_probemaxtravel').value != parseFloat(preferenceslist[0].probemaxtravel)) modified = true;
            //probefeedrate
            if (document.getElementById('preferences_probefeedrate').value != parseInt(preferenceslist[0].probefeedrate)) modified = true;
            //probetouchplatethickness
            if (document.getElementById('preferences_probetouchplatethickness').value != parseFloat(preferenceslist[0].probetouchplatethickness)) modified = true;
            //surfacewidth
            if (document.getElementById('preferences_surfacewidth').value != parseFloat(preferenceslist[0].surfacewidth)) modified = true;
            //surfacelength
            if (document.getElementById('preferences_surfacelength').value != parseFloat(preferenceslist[0].surfacelength)) modified = true;
            //surfacezdepth
            if (document.getElementById('preferences_surfacezdepth').value != parseFloat(preferenceslist[0].surfacezdepth)) modified = true;
            //surfacebitdiam
            if (document.getElementById('preferences_surfacebitdiam').value != parseFloat(preferenceslist[0].surfacebitdiam)) modified = true;
            //surfacespindle
            if (document.getElementById('preferences_surfacespindle').value != parseInt(preferenceslist[0].surfacespindle)) modified = true;
            //surfacefeedrate
            if (document.getElementById('preferences_surfacefeedrate').value != parseInt(preferenceslist[0].surfacefeedrate)) modified = true;
            //surfacestepover
            if (document.getElementById('preferences_surfacestepover').value != parseInt(preferenceslist[0].surfacestepover)) modified = true;
        }
    } else modified = true;
    if (language_save != language) modified = true;
    if (modified) {
        confirmdlg(translate_text_item("Data modified"), translate_text_item("Do you want to save?"), process_preferencesCloseDialog)
    } else {
        closeModal('cancel');
    }
}

function process_preferencesCloseDialog(answer) {
    if (answer == 'no') {
        //console.log("Answer is no so exit");
        translate_text(language_save);
        closeModal('cancel');
    } else {
        // console.log("Answer is yes so let's save");
        SavePreferences();
    }
}

function SavePreferences(current_preferences) {
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        return;
    }
    console.log("save prefs");
    if (((typeof(current_preferences) != 'undefined') && !current_preferences) || (typeof(current_preferences) == 'undefined')) {
        if (!Checkvalues("preferences_pos_Interval_check") ||
            !Checkvalues("preferences_status_Interval_check") ||
            !Checkvalues("preferences_control_xy_velocity") ||
            !Checkvalues("preferences_e_velocity") ||
            !Checkvalues("preferences_tempInterval_check") ||
            !Checkvalues("preferences_filters") ||
            !Checkvalues("preferences_filament_length") ||
            !Checkvalues("preferences_probemaxtravel") ||
            !Checkvalues("preferences_probefeedrate") ||
            !Checkvalues("preferences_probetouchplatethickness") ||
            !Checkvalues("preferences_surfacewidth") ||
            !Checkvalues("preferences_surfacelength") ||
            !Checkvalues("preferences_surfacebitdiam") ||
            !Checkvalues("preferences_surfacespindle") ||
            !Checkvalues("preferences_surfacefeedrate") ||
            !Checkvalues("preferences_surfacestepover") ||
            !Checkvalues("preferences_surfacezdepth")
        ) return;
        if ((target_firmware != "grbl-embedded") || (grblaxis > 2)) {
            if(!Checkvalues("preferences_control_z_velocity")) return;
        }
        if (target_firmware == "grbl-embedded") {
            if( (grblaxis > 3) && (!Checkvalues("preferences_control_a_velocity"))) return;
            if( (grblaxis > 4) && (!Checkvalues("preferences_control_b_velocity"))) return;
            if( (grblaxis > 5) && (!Checkvalues("preferences_control_c_velocity"))) return;
        }
        preferenceslist = [];
        var saveprefs = "[{\"language\":\"" + language;
        saveprefs += "\",\"enable_camera\":\"" + document.getElementById('show_camera_panel').checked;
        saveprefs += "\",\"auto_load_camera\":\"" + document.getElementById('autoload_camera_panel').checked;
        saveprefs += "\",\"camera_address\":\"" + HTMLEncode(document.getElementById('preferences_camera_webaddress').value);
        saveprefs += "\",\"enable_DHT\":\"" + document.getElementById('enable_DHT').checked;
        saveprefs += "\",\"enable_lock_UI\":\"" + document.getElementById('enable_lock_UI').checked;
        saveprefs += "\",\"enable_ping\":\"" + document.getElementById('enable_ping').checked;
        saveprefs += "\",\"is_mixed_extruder\":\"" + document.getElementById('enable_mixed_E_controls').checked;
        saveprefs += "\",\"number_extruders\":\"" + document.getElementById('preferences_control_nb_extruders').value;
        saveprefs += "\",\"enable_redundant\":\"" + document.getElementById('enable_redundant_controls').checked;
        saveprefs += "\",\"enable_probe\":\"" + document.getElementById('enable_probe_controls').checked;
        saveprefs += "\",\"enable_bed\":\"" + document.getElementById('enable_bed_controls').checked;
        saveprefs += "\",\"enable_chamber\":\"" + document.getElementById('enable_chamber_controls').checked;
        saveprefs += "\",\"enable_fan\":\"" + document.getElementById('enable_fan_controls').checked;
        saveprefs += "\",\"enable_control_panel\":\"" + document.getElementById('show_control_panel').checked;
        saveprefs += "\",\"enable_grbl_probe_panel\":\"" + document.getElementById('show_grbl_probe_tab').checked;
        saveprefs += "\",\"enable_grbl_surface_panel\":\"" + document.getElementById('show_grbl_surface_tab').checked;
        saveprefs += "\",\"enable_temperatures_panel\":\"" + document.getElementById('show_temperatures_panel').checked;
        saveprefs += "\",\"enable_extruder_panel\":\"" + document.getElementById('show_extruder_panel').checked;
        saveprefs += "\",\"enable_grbl_panel\":\"" + document.getElementById('show_grbl_panel').checked;
        saveprefs += "\",\"enable_files_panel\":\"" + document.getElementById('show_files_panel').checked;
        saveprefs += "\",\"has_TFT_SD\":\"" + document.getElementById('has_tft_sd').checked;
        saveprefs += "\",\"has_TFT_USB\":\"" + document.getElementById('has_tft_usb').checked;
        saveprefs += "\",\"probemaxtravel\":\"" + document.getElementById('preferences_probemaxtravel').value;
        saveprefs += "\",\"probefeedrate\":\"" + document.getElementById('preferences_probefeedrate').value;
        saveprefs += "\",\"probetouchplatethickness\":\"" + document.getElementById('preferences_probetouchplatethickness').value;
        saveprefs += "\",\"surfacewidth\":\"" + document.getElementById('preferences_surfacewidth').value;
        saveprefs += "\",\"surfacelength\":\"" + document.getElementById('preferences_surfacelength').value;
        saveprefs += "\",\"surfacezdepth\":\"" + document.getElementById('preferences_surfacezdepth').value;
        saveprefs += "\",\"surfacebitdiam\":\"" + document.getElementById('preferences_surfacebitdiam').value;
        saveprefs += "\",\"surfacespindle\":\"" + document.getElementById('preferences_surfacespindle').value;
        saveprefs += "\",\"surfacefeedrate\":\"" + document.getElementById('preferences_surfacefeedrate').value;
        saveprefs += "\",\"surfacestepover\":\"" + document.getElementById('preferences_surfacestepover').value;
        saveprefs += "\",\"interval_positions\":\"" + document.getElementById('preferences_pos_Interval_check').value;
        saveprefs += "\",\"interval_status\":\"" + document.getElementById('preferences_status_Interval_check').value;
        saveprefs += "\",\"xy_feedrate\":\"" + document.getElementById('preferences_control_xy_velocity').value;
        if ((target_firmware != "grbl-embedded") || (grblaxis > 2)) {
            saveprefs += "\",\"z_feedrate\":\"" + document.getElementById('preferences_control_z_velocity').value;
        }
        if (target_firmware == "grbl-embedded") {
            if (grblaxis > 3){
                saveprefs += "\",\"a_feedrate\":\"" + document.getElementById('preferences_control_a_velocity').value;
            }
            if (grblaxis > 4){
                saveprefs += "\",\"b_feedrate\":\"" + document.getElementById('preferences_control_b_velocity').value;
            }
            if (grblaxis > 5){
                saveprefs += "\",\"c_feedrate\":\"" + document.getElementById('preferences_control_c_velocity').value;
            }
        }
        saveprefs += "\",\"interval_temperatures\":\"" + document.getElementById('preferences_tempInterval_check').value;
        saveprefs += "\",\"e_feedrate\":\"" + document.getElementById('preferences_e_velocity').value;
        saveprefs += "\",\"e_distance\":\"" + document.getElementById('preferences_filament_length').value;
        saveprefs += "\",\"f_filters\":\"" + document.getElementById('preferences_filters').value;
        saveprefs += "\",\"enable_autoscroll\":\"" + document.getElementById('preferences_autoscroll').checked;
        saveprefs += "\",\"enable_verbose_mode\":\"" + document.getElementById('preferences_verbose_mode').checked;
        saveprefs += "\",\"enable_commands_panel\":\"" + document.getElementById('show_commands_panel').checked + "\"}]";
        preferenceslist = JSON.parse(saveprefs);
    }
    var blob = new Blob([JSON.stringify(preferenceslist, null, " ")], {
        type: 'application/json'
    });
    var file;
    if (browser_is("IE") || browser_is("Edge")) {
        file = blob;
        file.name = preferences_file_name;
        file.lastModifiedDate = new Date();
    } else file = new File([blob], preferences_file_name);
    var formData = new FormData();
    var url = "/files";
    formData.append('path', '/');
    formData.append('myfile[]', file, preferences_file_name);
    if ((typeof(current_preferences) != 'undefined') && current_preferences) SendFileHttp(url, formData);
    else SendFileHttp(url, formData, preferencesdlgUploadProgressDisplay, preferencesUploadsuccess, preferencesUploadfailed);
}

function preferencesdlgUploadProgressDisplay(oEvent) {
    if (oEvent.lengthComputable) {
        var percentComplete = (oEvent.loaded / oEvent.total) * 100;
        document.getElementById('preferencesdlg_prg').value = percentComplete;
        document.getElementById('preferencesdlg_upload_percent').innerHTML = percentComplete.toFixed(0);
        document.getElementById('preferencesdlg_upload_msg').style.display = 'block';
    } else {
        // Impossible because size is unknown
    }
}

function preferencesUploadsuccess(response) {
    document.getElementById('preferencesdlg_upload_msg').style.display = 'none';
    applypreferenceslist();
    closeModal('ok');
}

function preferencesUploadfailed(errorcode, response) {
    alertdlg(translate_text_item("Error"), translate_text_item("Save preferences failed!"));
}


function Checkvalues(id_2_check) {
    var status = true;
    var value = 0;
    switch (id_2_check) {
        case "preferences_status_Interval_check":
        case "preferences_tempInterval_check":
        case "preferences_pos_Interval_check":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 100)) {
                error_message = translate_text_item("Value of auto-check must be between 0s and 99s !!");
                status = false;
            }
            break;
        case "preferences_control_xy_velocity":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1)) {
                error_message = translate_text_item("XY Feedrate value must be at least 1 mm/min!");
                status = false;
            }
            break;
        case "preferences_control_z_velocity":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1)) {
                error_message = translate_text_item("Z Feedrate value must be at least 1 mm/min!");
                status = false;
            }
            break;
        case "preferences_control_a_velocity":
        case "preferences_control_b_velocity":
        case "preferences_control_c_velocity":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1)) {
                error_message = translate_text_item("Axis Feedrate value must be at least 1 mm/min!");
                status = false;
            }
            break;
        case "preferences_tempInterval_check":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value > 0 && value < 100)) {
                error_message = translate_text_item("Value of auto-check must be between 0s and 99s !!");
                status = false;
            }
            break;
        case "preferences_e_velocity":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 9999)) {
                error_message = translate_text_item("Value of extruder velocity must be between 1 mm/min and 9999 mm/min !");
                status = false;
            }
            break;
        case "preferences_probefeedrate":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 9999)) {
                error_message = translate_text_item("Value of probe feedrate must be between 1 mm/min and 9999 mm/min !");
                status = false;
            }
            break;
        case "preferences_probemaxtravel":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 9999)) {
                error_message = translate_text_item("Value of maximum probe travel must be between 1 mm and 9999 mm !");
                status = false;
            }
            break;
        case "preferences_probetouchplatethickness":
            value = parseFloat(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 0 && value <= 9999)) {
                error_message = translate_text_item("Value of probe touch plate thickness must be between 0 mm and 9999 mm !");
                status = false;
            }
            break;
        case "preferences_surfacewidth":
            value = parseFloat(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 9999)) {
                error_message = translate_text_item("Value of surface width must be between 1 mm and 9999 mm !");
                status = false;
            }
            break;
        case "preferences_surfacelength":
            value = parseFloat(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1 && value <= 9999)) {
                error_message = translate_text_item("Value of surface length must be between 1 mm and 9999 mm !");
                status = false;
            }
            break;
        case "preferences_surfacezdepth":
            value = parseFloat(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 0 && value <= 100)) {
                error_message = translate_text_item("Value of surface Zdepth must be between 0 mm and 100 mm !");
                status = false;
            }
            break;
        case "preferences_surfacebitdiam":
            value = parseFloat(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 0 && value <= 9999)) {
                error_message = translate_text_item("Value of bit diameter for surfacing must be between 0.1 mm and 999 mm !");
                status = false;
            }
            break;
        case "preferences_surfacespindle":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 1000 && value <= 50000)) {
                error_message = translate_text_item("Value of surfacing spindle RPM must be between 1000 mm and 50000 mm !");
                status = false;
            }
            break;
        case "preferences_surfacefeedrate":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 100 && value <= 10000)) {
                error_message = translate_text_item("Value of surfacing feedrate must be between 100 mm/min and 10000 mm/min !");
                status = false;
            }
            break;
        case "preferences_surfacestepover":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 10 && value <= 90)) {
                error_message = translate_text_item("Value of surfacing stepover must be between 10 % and 90 % !");
                status = false;
            }
            break;
        case "preferences_filament_length":
            value = parseInt(document.getElementById(id_2_check).value);
            if (!(!isNaN(value) && value >= 0.001 && value <= 9999)) {
                error_message = translate_text_item("Value of filament length must be between 0.001 mm and 9999 mm !");
                status = false;
            }
            break;
        case "preferences_filters":
            //TODO a regex would be better
            value = document.getElementById(id_2_check).value;
            if ((value.indexOf(".") != -1) ||
                (value.indexOf("*") != -1)) {
                error_message = translate_text_item("Only alphanumeric chars separated by ; for extensions filters");
                status = false;
            }
            break;
    }
    if (status) {
        document.getElementById(id_2_check + "_group").classList.remove("has-feedback");
        document.getElementById(id_2_check + "_group").classList.remove("has-error");
        document.getElementById(id_2_check + "_icon").innerHTML = "";
    } else {
        document.getElementById(id_2_check + "_group").classList.add("has-feedback");
        document.getElementById(id_2_check + "_group").classList.add("has-error");
        document.getElementById(id_2_check + "_icon").innerHTML = get_icon_svg("remove");
        alertdlg(translate_text_item("Out of range"), error_message);
    }
    return status;
}

function SendPrinterCommand(cmd, echo_on, processfn, errorfn, id, max_id) {
    var url = "/command?commandText=";
    var push_cmd = true;
    if (typeof echo_on !== 'undefined') {
        push_cmd = echo_on;
    }
    if (cmd.trim().length == 0) return;
    if (push_cmd) Monitor_output_Update("[#]" + cmd + "\n");
    //removeIf(production)
    console.log(cmd);
    if (typeof processfn !== 'undefined') processfn("Test response");
    else SendPrinterCommandSuccess("Test response");
    return;
    //endRemoveIf(production)
    if (typeof processfn === 'undefined' || processfn == null) processfn = SendPrinterCommandSuccess;
    if (typeof errorfn === 'undefined' || errorfn == null) errorfn = SendPrinterCommandFailed;
    cmd = encodeURI(cmd);
    cmd = cmd.replace("#", "%23");
    SendGetHttp(url + cmd, processfn, errorfn, id, max_id);
    //console.log(cmd);
}

function SendPrinterSilentCommand(cmd, processfn, errorfn, id, max_id) {
    var url = "/command_silent?commandText=";
    if (cmd.trim().length == 0) return;
    //removeIf(production)
    console.log(cmd);
    if (typeof processfn !== 'undefined') processfn("Test response");
    else SendPrinterCommandSuccess("Test response");
    return;
    //endRemoveIf(production)
    if (typeof processfn === 'undefined' || processfn == null) processfn = SendPrinterSilentCommandSuccess;
    if (typeof errorfn === 'undefined' || errorfn == null) errorfn = SendPrinterCommandFailed;
    cmd = encodeURI(cmd);
    cmd = cmd.replace("#", "%23");
    SendGetHttp(url + cmd, processfn, errorfn, id, max_id);
    //console.log(cmd);
}

function SendPrinterSilentCommandSuccess(response) {
    //console.log(response);
}


function SendPrinterCommandSuccess(response) {
    if ((target_firmware == "grbl") || (target_firmware == "grbl-embedded")) return;
    if (response[response.length - 1] != '\n') Monitor_output_Update(response + "\n");
    else Monitor_output_Update(response);
}

function SendPrinterCommandFailed(error_code, response) {
    if (error_code == 0) {
        Monitor_output_Update(translate_text_item("Connection error") + "\n");
    } else {
         Monitor_output_Update(translate_text_item("Error : ") + error_code + " :" + decode_entitie(response) + "\n");
    }
    console.log("printer cmd Error " + error_code + " :" + decode_entitie(response));
}

//restart dialog
function restartdlg() {
    console.log("show restart");
    var modal = setactiveModal('restartdlg.html');
    if (modal == null) return;
    document.getElementById('prgrestart').style.display = 'block';
    document.getElementById('restartmsg').innerHTML = translate_text_item("Restarting, please wait....");
    showModal();
    SendPrinterCommand("[ESP444]RESTART", false, restart_esp_success, restart_esp_failed);
}

function restart_esp_success(response) {
    var i = 0;
    var interval;
    var x = document.getElementById("prgrestart");
    http_communication_locked = true;
    x.max = 40;
    interval = setInterval(function() {
        last_ping = Date.now();
        i = i + 1;
        var x = document.getElementById("prgrestart");
        x.value = i;
        document.getElementById('restartmsg').innerHTML = translate_text_item("Restarting, please wait....") + (41 - i) + translate_text_item(" seconds");
        if (i > 40) {
            clearInterval(interval);
            location.reload();
        }
    }, 1000);
    //console.log(response);
}

function restart_esp_failed(errorcode, response) {
    document.getElementById('prgrestart').style.display = 'none';
    document.getElementById('restartmsg').innerHTML = translate_text_item("Upload failed : ") + errorcode + " :" + response;
    console.log("Error " + errorcode + " : " + response);
    closeModal('Cancel')
}
var ssid_item_scanwifi = -1;
var ssid_subitem_scanwifi = -1;
//scanwifi dialog
function scanwifidlg(item, subitem) {
    var modal = setactiveModal('scanwifidlg.html', scanwifidlg_close);
    if (modal == null) return;
    ssid_item_scanwifi = item;
    ssid_subitem_scanwifi = subitem;
    showModal();
    refresh_scanwifi();
}

function refresh_scanwifi() {
    document.getElementById('AP_scan_loader').style.display = 'block';
    document.getElementById('AP_scan_list').style.display = 'none';
    document.getElementById('AP_scan_status').style.display = 'block';
    document.getElementById('AP_scan_status').innerHTML = translate_text_item("Scanning");
    document.getElementById('refresh_scanwifi_btn').style.display = 'none';
    //removeIf(production)
    var response_text = "{\"AP_LIST\":[{\"SSID\":\"HP-Setup>71-M277LaserJet\",\"SIGNAL\":\"90\",\"IS_PROTECTED\":\"0\"},{\"SSID\":\"NETGEAR_2GEXT_OFFICE2\",\"SIGNAL\":\"58\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"NETGEAR_2GEXT_OFFICE\",\"SIGNAL\":\"34\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"NETGEAR_2GEXT_COULOIR\",\"SIGNAL\":\"18\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"HP-Print-D3-ColorLaserJetPro\",\"SIGNAL\":\"14\",\"IS_PROTECTED\":\"0\"},{\"SSID\":\"external-wifi\",\"SIGNAL\":\"20\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"Livebox-4D0F\",\"SIGNAL\":\"24\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"SFR_2000\",\"SIGNAL\":\"20\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"SFR_0D90\",\"SIGNAL\":\"26\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"SFRWiFiFON\",\"SIGNAL\":\"18\",\"IS_PROTECTED\":\"0\"},{\"SSID\":\"SFRWiFiMobile\",\"SIGNAL\":\"18\",\"IS_PROTECTED\":\"1\"},{\"SSID\":\"FreeWifi\",\"SIGNAL\":\"16\",\"IS_PROTECTED\":\"0\"}]}";
    getscanWifiSuccess(response_text);
    return;
    //endRemoveIf(production)
    var url = "/command?plain=" + encodeURIComponent("[ESP410]");
    SendGetHttp(url, getscanWifiSuccess, getscanWififailed);
}

function process_scanWifi_answer(response_text) {
    var result = true;
    var content = "";
    try {
        var response = JSON.parse(response_text);
        if (typeof response.AP_LIST == 'undefined') {
            result = false;
        } else {
            var aplist = response.AP_LIST;
            //console.log("found " + aplist.length + " AP");
            aplist.sort(function(a, b) {
                return (parseInt(a.SIGNAL) < parseInt(b.SIGNAL)) ? -1 : (parseInt(a.SIGNAL) > parseInt(b.SIGNAL)) ? 1 : 0
            });
            for (var i = aplist.length - 1; i >= 0; i--) {
                content += "<tr>";
                content += "<td style='vertical-align:middle'>";
                content += aplist[i].SSID;
                content += "</td>";
                content += "<td style='text-align: center;vertical-align:middle;'>";
                content += aplist[i].SIGNAL;
                content += "%</td>";
                content += "<td style='vertical-align:middle'><center>";
                if (aplist[i].IS_PROTECTED == "1") content += get_icon_svg("lock");
                content += "</></td>";
                content += "<td>";
                content += "<button class='btn btn-primary' onclick='select_ap_ssid(\"" + aplist[i].SSID.replace("'","\\'").replace("\"","\\\"") + "\");'>";
                content += get_icon_svg("ok");
                content += "</button>";
                content += "</td>";
                content += "</tr>";
            }
        }
    } catch (e) {
        console.error("Parsing error:", e);
        result = false;
    }
    document.getElementById('AP_scan_data').innerHTML = content;
    return result;
}

function select_ap_ssid(ssid_name) {
    var val = document.getElementById("setting_" + ssid_item_scanwifi + "_" + ssid_subitem_scanwifi).value;
    document.getElementById("setting_" + ssid_item_scanwifi + "_" + ssid_subitem_scanwifi).value = ssid_name;
    document.getElementById("setting_" + ssid_item_scanwifi + "_" + ssid_subitem_scanwifi).focus();
    if (val != ssid_name)setsettingchanged(ssid_item_scanwifi, ssid_subitem_scanwifi);
    closeModal("Ok");
}

function getscanWifiSuccess(response) {
    if (!process_scanWifi_answer(response)) {
        getscanWififailed(406, translate_text_item("Wrong data"));
        return;
    }
    document.getElementById('AP_scan_loader').style.display = "none";
    document.getElementById('AP_scan_list').style.display = "block";
    document.getElementById('AP_scan_status').style.display = "none";
    document.getElementById('refresh_scanwifi_btn').style.display = "block";
}

function getscanWififailed(error_code, response) {
    console.log("Error " + error_code + " :" + response);
    document.getElementById('AP_scan_loader').style.display = "none";
    document.getElementById('AP_scan_status').style.display = "block";
    document.getElementById('AP_scan_status').innerHTML = translate_text_item("Failed:") + error_code + " " + response;
    document.getElementById('refresh_scanwifi_btn').style.display = "block";
}

function scanwifidlg_close(response) {
    //console.log(response);
}

var setting_configList = [];
var setting_error_msg = "";
var setting_lastindex = -1;
var setting_lastsubindex = -1;
var current_setting_filter = "network";
var setup_is_done = false;
var do_not_build_settings = false;

function refreshSettings(hide_setting_list) {
  if (http_communication_locked) {
    document.getElementById("config_status").innerHTML = translate_text_item(
      "Communication locked by another process, retry later."
    );
    return;
  }
  if (typeof hide_setting_list != "undefined")
    do_not_build_settings = hide_setting_list;
  else do_not_build_settings = false;
  document.getElementById("settings_loader").style.display = "block";
  document.getElementById("settings_list_content").style.display = "none";
  document.getElementById("settings_status").style.display = "none";
  document.getElementById("settings_refresh_btn").style.display = "none";

  setting_configList = [];
  //removeIf(production)
  var response_text =
    '{"EEPROM":[{"F":"network","P":"0","T":"B","V":"2","H":"Wifi mode","O":[{"AP":"1"},{"STA":"2"}]},{"F":"network","P":"1","T":"S","V":"totolink_luc","S":"32","H":"Station SSID","M":"1"},{"F":"network","P":"34","T":"S","V":"********","S":"64","H":"Station Password","M":"0"},{"F":"network","P":"99","T":"B","V":"1","H":"Station IP Mode","O":[{"DHCP":"1"},{"Static":"2"}]},{"F":"network","P":"100","T":"A","V":"192.168.0.1","H":"Station Static IP"},{"F":"network","P":"104","T":"A","V":"255.255.255.0","H":"Station Static Mask"},{"F":"network","P":"108","T":"A","V":"192.168.0.12","H":"Station Static Gateway"},{"F":"network","P":"130","T":"S","V":"lucesp","H":"Hostname" ,"S":"32", "M":"1"},{"F":"network","P":"112","T":"I","V":"115200","H":"Baud Rate","O":[{"9600":"9600"},{"19200":"19200"},{"38400":"38400"},{"57600":"57600"},{"115200":"115200"},{"230400":"230400"},{"250000":"250000"}]},{"F":"network","P":"116","T":"B","V":"2","H":"Station Network Mode","O":[{"11b":"1"},{"11g":"2"},{"11n":"3"}]},{"F":"network","P":"117","T":"B","V":"0","H":"Sleep Mode","O":[{"None":"0"},{"Light":"1"},{"Modem":"2"}]},{"F":"network","P":"118","T":"B","V":"9","H":"AP Channel","O":[{"1":"1"},{"2":"2"},{"3":"3"},{"4":"4"},{"5":"5"},{"6":"6"},{"7":"7"},{"8":"8"},{"9":"9"},{"10":"10"},{"11":"11"}]},{"F":"network","P":"119","T":"B","V":"2","H":"Authentication","O":[{"Open":"0"},{"WPA":"2"},{"WPA2":"3"},{"WPA/WPA2":"4"}]},{"F":"network","P":"120","T":"B","V":"1","H":"SSID Visible","O":[{"No":"0"},{"Yes":"1"}]},{"F":"network","P":"121","T":"I","V":"80","H":"Web Port","S":"65001","M":"1"},{"F":"network","P":"125","T":"I","V":"8881","H":"Data Port","S":"65001","M":"1"},{"F":"network","P":"176","T":"S","V":"********","S":"16","H":"Admin Password","M":"1"},{"F":"network","P":"197","T":"S","V":"********","S":"16","H":"User Password","M":"1"},{"F":"network","P":"218","T":"S","V":"MYESP","S":"32","H":"AP SSID","M":"1"},{"F":"network","P":"251","T":"S","V":"********","S":"64","H":"AP Password","M":"0"},{"F":"network","P":"329","T":"B","V":"2","H":"AP IP Mode","O":[{"DHCP":"1"},{"Static":"2"}]},{"F":"network","P":"316","T":"A","V":"192.168.0.1","H":"AP Static IP"},{"F":"network","P":"320","T":"A","V":"255.255.255.0","H":"AP Static Mask"},{"F":"network","P":"324","T":"A","V":"192.168.0.1","H":"AP Static Gateway"},{"F":"network","P":"330","T":"B","V":"1","H":"AP Network Mode","O":[{"11b":"1"},{"11g":"2"}]},{"F":"printer","P":"461","T":"B","V":"7","H":"TargetFW","O":[{"Repetier":"5"},{"Repetier for Davinci":"1"},{"Marlin":"2"},{"MarlinKimbra":"3"},{"Smoothieware":"4"},{"Unknown":"0"}]},{"F":"printer","P":"129","T":"B","V":"3","H":"Temperature Refresh Time","S":"99","M":"0"},{"F":"printer","P":"164","T":"I","V":"1500","H":"XY feedrate","S":"9999","M":"1"},{"F":"printer","P":"168","T":"I","V":"110","H":"Z feedrate","S":"9999","M":"1"},{"F":"printer","P":"172","T":"I","V":"400","H":"E feedrate","S":"9999","M":"1"},{"F":"printer","P":"331","T":"S","V":"NO","S":"128","H":"Camera address","M":"0"},{"F":"printer","P":"460","T":"B","V":"3","H":"Position Refresh Time","S":"99","M":"0"}]}';
  getESPsettingsSuccess(response_text);
  return;
  //endRemoveIf(production)
  var url = "/command?plain=" + encodeURIComponent("[ESP400]");
  SendGetHttp(url, getESPsettingsSuccess, getESPsettingsfailed);
}

function build_select_flag_for_setting_list(index, subindex) {
  var html = "";
  var flag = (html +=
    "<select class='form-control' id='setting_" +
    index +
    "_" +
    subindex +
    "' onchange='setting_checkchange(" +
    index +
    "," +
    subindex +
    ")' >");
  html += "<option value='1'";
  var tmp = setting_configList[index].defaultvalue;
  tmp |= settings_get_flag_value(index, subindex);
  if (tmp == setting_configList[index].defaultvalue) html += " selected ";
  html += ">";
  html += translate_text_item("Disable", true);
  html += "</option>\n";
  html += "<option value='0'";
  var tmp = setting_configList[index].defaultvalue;
  tmp &= ~settings_get_flag_value(index, subindex);
  if (tmp == setting_configList[index].defaultvalue) html += " selected ";
  html += ">";
  html += translate_text_item("Enable", true);
  html += "</option>\n";
  html += "</select>\n";
  //console.log("default:" + setting_configList[index].defaultvalue);
  //console.log(html);
  return html;
}

function build_select_for_setting_list(index, subindex) {
  var html =
    "<select class='form-control input-min wauto' id='setting_" +
    index +
    "_" +
    subindex +
    "' onchange='setting_checkchange(" +
    index +
    "," +
    subindex +
    ")' >";
  for (var i = 0; i < setting_configList[index].Options.length; i++) {
    html += "<option value='" + setting_configList[index].Options[i].id + "'";
    if (
      setting_configList[index].Options[i].id ==
      setting_configList[index].defaultvalue
    )
      html += " selected ";
    html += ">";
    html += translate_text_item(
      setting_configList[index].Options[i].display,
      true
    );
    //Ugly workaround for OSX Chrome and Safari
    if (browser_is("MacOSX"))
      html += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    html += "</option>\n";
  }
  html += "</select>\n";
  //console.log("default:" + setting_configList[index].defaultvalue);
  //console.log(html);
  return html;
}

function getFWshortnamefromid(value) {
  let firmwares = ["unknown","repetier4davinci","marlin","marlinkimbra","smoothieware","repetier","grbl","grbl-embedded"];
  if(isNaN(value)){
    value = 0;
  }
  return firmwares[value];
}

function update_UI_setting() {
  for (var i = 0; i < setting_configList.length; i++) {
    switch (setting_configList[i].pos) {
      //EP_TARGET_FW		461
      case "461":
        target_firmware = getFWshortnamefromid(
          setting_configList[i].defaultvalue
        );
        update_UI_firmware_target();
        init_files_panel(false);
        break;
      // EP_IS_DIRECT_SD   850
      case "850":
        direct_sd = setting_configList[i].defaultvalue == 1 ? true : false;
        update_UI_firmware_target();
        init_files_panel(false);
        break;
      case "130":
        //set title using hostname
        Set_page_title(setting_configList[i].defaultvalue);
        break;
    }
  }
}
//to generate setting editor in setting or setup
function build_control_from_index(index, extra_set_function) {
  var i = index;
  var content = "<table>";
  if (i < setting_configList.length) {
    var nbsub = 1;
    if (setting_configList[i].type == "F") {
      nbsub = setting_configList[i].Options.length;
    }
    for (var sub_element = 0; sub_element < nbsub; sub_element++) {
      if (sub_element > 0) {
        content += "<tr><td style='height:10px;'></td></tr>";
      }
      content += "<tr><td style='vertical-align: middle;'>";
      if (setting_configList[i].type == "F") {
        content += translate_text_item(
          setting_configList[i].Options[sub_element].display,
          true
        );
        content += "</td><td>&nbsp;</td><td>";
      }

      content +=
        "<div id='status_setting_" +
        i +
        "_" +
        sub_element +
        "' class='form-group has-feedback' style='margin: auto;'>";
      content += "<div class='item-flex-row'>";
      content += "<table><tr><td>";
      content += "<div class='input-group'>";
      content += "<div class='input-group-btn'>";
      content +=
        "<button class='btn btn-default btn-svg' onclick='setting_revert_to_default(" +
        i +
        "," +
        sub_element +
        ")' >";
      content += get_icon_svg("repeat");
      content += "</button>";
      content += "</div>";
      content += "<input class='hide_it'></input>";
      content += "</div>";
      content += "</td><td>";
      content += "<div class='input-group'>";
      content += "<span class='input-group-addon hide_it' ></span>";
      //flag
      if (setting_configList[i].type == "F") {
        //console.log(setting_configList[i].label + " " + setting_configList[i].type);
        //console.log(setting_configList[i].Options.length);
        content += build_select_flag_for_setting_list(i, sub_element);
      }
      //drop list
      else if (setting_configList[i].Options.length > 0) {
        content += build_select_for_setting_list(i, sub_element);
      }
      //text
      else {
        content +=
          "<input id='setting_" +
          i +
          "_" +
          sub_element +
          "' type='text' class='form-control input-min'  value='" +
          setting_configList[i].defaultvalue +
          "' onkeyup='setting_checkchange(" +
          i +
          "," +
          sub_element +
          ")' >";
      }
      content +=
        "<span id='icon_setting_" +
        i +
        "_" +
        sub_element +
        "'class='form-control-feedback ico_feedback'></span>";
      content += "<span class='input-group-addon hide_it' ></span>";
      content += "</div>";
      content += "</td></tr></table>";
      content += "<div class='input-group'>";
      content += "<input class='hide_it'></input>";
      content += "<div class='input-group-btn'>";
      content +=
        "<button  id='btn_setting_" +
        i +
        "_" +
        sub_element +
        "' class='btn btn-default' onclick='settingsetvalue(" +
        i +
        "," +
        sub_element +
        ");";
      if (typeof extra_set_function != "undefined") {
        content += extra_set_function + "(" + i + ");";
      }
      content +=
        "' translate english_content='Set' >" +
        translate_text_item("Set") +
        "</button>";
      if (setting_configList[i].pos == EP_STA_SSID) {
        content +=
          "<button class='btn btn-default btn-svg' onclick='scanwifidlg(\"" +
          i +
          '","' +
          sub_element +
          "\")'>";
        content += get_icon_svg("search");
        content += "</button>";
      }
      content += "</div>";
      content += "</div>";
      content += "</div>";
      content += "</div>";
      content += "</td></tr>";
    }
  }
  content += "</table>";
  return content;
}

//get setting UI for specific component instead of parse all
function get_index_from_eeprom_pos(pos) {
  for (var i = 0; i < setting_configList.length; i++) {
    if (pos == setting_configList[i].pos) {
      return i;
    }
  }
  console.log("Cannot find:", pos);
  return -1;
}

function build_HTML_setting_list(filter) {
  //this to prevent concurent process to update after we clean content
  if (do_not_build_settings) return;
  var content = "";
  current_setting_filter = filter;
  document.getElementById(
    current_setting_filter + "_setting_filter"
  ).checked = true;
  for (var i = 0; i < setting_configList.length; i++) {
    if (
      setting_configList[i].F.trim().toLowerCase() == filter ||
      filter == "all"
    ) {
      content += "<tr>";
      content += "<td style='vertical-align:middle'>";
      content += translate_text_item(setting_configList[i].label, true);
      content += "</td>";
      content += "<td style='vertical-align:middle'>";
      content +=
        "<table><tr><td>" + build_control_from_index(i) + "</td></tr></table>";
      content += "</td>";
      content += "</tr>\n";
    }
  }
  if (content.length > 0)
    document.getElementById("settings_list_data").innerHTML = content;
}

function setting_check_value(value, index, subindex) {
  var valid = true;
  var entry = setting_configList[index];
  //console.log("checking value");
  if (entry.type == "F") return valid;
  //does it part of a list?
  if (entry.Options.length > 0) {
    var in_list = false;
    for (var i = 0; i < entry.Options.length; i++) {
      //console.log("checking *" + entry.Options[i].id + "* and *"+ value + "*" );
      if (entry.Options[i].id == value) in_list = true;
    }
    valid = in_list;
    if (!valid) setting_error_msg = " in provided list";
  }
  //check byte / integer
  if (entry.type == "B" || entry.type == "I") {
    //cannot be empty
    value.trim();
    if (value.length == 0) valid = false;
    //check minimum?
    if (parseInt(entry.min_val) > parseInt(value)) valid = false;
    //check maximum?
    if (parseInt(entry.max_val) < parseInt(value)) valid = false;
    if (!valid)
      setting_error_msg = " between " + entry.min_val + " and " + entry.max_val;
    if (isNaN(value)) valid = false;
  } else if (entry.type == "S") {
    //check minimum?
    if (entry.min_val > value.length) valid = false;
    //check maximum?
    if (entry.max_val < value.length) valid = false;
    if (value == "********") valid = false;
    if (!valid)
      setting_error_msg =
        " between " +
        entry.min_val +
        " char(s) and " +
        entry.max_val +
        " char(s) long, and not '********'";
  } else if (entry.type == "A") {
    //check ip address
    var ipformat =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!value.match(ipformat)) {
      valid = false;
      setting_error_msg = " a valid IP format (xxx.xxx.xxx.xxx)";
    }
  }
  return valid;
}

function process_settings_answer(response_text) {
  var result = true;
  try {
    var response = JSON.parse(response_text);
    if (typeof response.EEPROM == "undefined") {
      result = false;
      console.log("No EEPROM");
    } else {
      //console.log("EEPROM has " + response.EEPROM.length + " entries");
      if (response.EEPROM.length > 0) {
        var vindex = 0;
        for (var i = 0; i < response.EEPROM.length; i++) {
          vindex = create_setting_entry(response.EEPROM[i], vindex);
        }
        if (vindex > 0) {
          if (setup_is_done) build_HTML_setting_list(current_setting_filter);
          update_UI_setting();
        } else result = false;
      } else result = false;
    }
  } catch (e) {
    console.error("Parsing error:", e);
    result = false;
  }
  return result;
}

function create_setting_entry(sentry, vindex) {
  if (!is_setting_entry(sentry)) return vindex;
  var slabel = sentry.H;
  var svalue = sentry.V;
  var scmd = "[ESP401]P=" + sentry.P + " T=" + sentry.T + " V=";
  var options = [];
  var min;
  var max;
  if (typeof sentry.M !== "undefined") {
    min = sentry.M;
  } else {
    //add limit according the type
    if (sentry.T == "B") min = -127;
    else if (sentry.T == "S") min = 0;
    else if (sentry.T == "A") min = 7;
    else if (sentry.T == "I") min = 0;
  }
  if (typeof sentry.S !== "undefined") {
    max = sentry.S;
  } else {
    //add limit according the type
    if (sentry.T == "B") max = 255;
    else if (sentry.T == "S") max = 255;
    else if (sentry.T == "A") max = 15;
    else if (sentry.T == "I") max = 2147483647;
  }
  //list possible options if defined
  if (typeof sentry.O !== "undefined") {
    for (var i in sentry.O) {
      var key = i;
      var val = sentry.O[i];
      for (var j in val) {
        var sub_key = j;
        var sub_val = val[j];
        sub_val = sub_val.trim();
        sub_key = sub_key.trim();
        var option = {
          id: sub_val,
          display: sub_key,
        };
        options.push(option);
        //console.log("*" + sub_key + "* and *" + sub_val + "*");
      }
    }
  }
  svalue = svalue.trim();
  //create entry in list
  var config_entry = {
    index: vindex,
    F: sentry.F,
    label: slabel,
    defaultvalue: svalue,
    cmd: scmd,
    Options: options,
    min_val: min,
    max_val: max,
    type: sentry.T,
    pos: sentry.P,
  };
  setting_configList.push(config_entry);
  vindex++;
  return vindex;
}
//check it is valid entry
function is_setting_entry(sline) {
  if (
    typeof sline.T === "undefined" ||
    typeof sline.V === "undefined" ||
    typeof sline.P === "undefined" ||
    typeof sline.H === "undefined"
  ) {
    return false;
  }
  return true;
}

function settings_get_flag_value(index, subindex) {
  var flag = 0;
  if (setting_configList[index].type != "F") return -1;
  if (setting_configList[index].Options.length <= subindex) return -1;
  flag = parseInt(setting_configList[index].Options[subindex].id);
  return flag;
}

function settings_get_flag_description(index, subindex) {
  if (setting_configList[index].type != "F") return -1;
  if (setting_configList[index].Options.length <= subindex) return -1;
  return setting_configList[index].Options[subindex].display;
}

function setting_revert_to_default(index, subindex) {
  var sub = 0;
  if (typeof subindex != "undefined") sub = subindex;
  if (setting_configList[index].type == "F") {
    var flag = settings_get_flag_value(index, subindex);
    var enabled = 0;
    var tmp = parseInt(setting_configList[index].defaultvalue);
    tmp |= flag;
    if (tmp == parseInt(setting_configList[index].defaultvalue))
      document.getElementById("setting_" + index + "_" + sub).value = "1";
    else document.getElementById("setting_" + index + "_" + sub).value = "0";
  } else
    document.getElementById("setting_" + index + "_" + sub).value =
      setting_configList[index].defaultvalue;
  document.getElementById("btn_setting_" + index + "_" + sub).className =
    "btn btn-default";
  document.getElementById("status_setting_" + index + "_" + sub).className =
    "form-group has-feedback";
  document.getElementById("icon_setting_" + index + "_" + sub).innerHTML = "";
}

function settingsetvalue(index, subindex) {
  var sub = 0;
  if (typeof subindex != "undefined") sub = subindex;
  //remove possible spaces
  value = document.getElementById("setting_" + index + "_" + sub).value.trim();
  //Apply flag here
  if (setting_configList[index].type == "F") {
    var tmp = setting_configList[index].defaultvalue;
    if (value == "1") {
      tmp |= settings_get_flag_value(index, subindex);
    } else {
      tmp &= ~settings_get_flag_value(index, subindex);
    }
    value = tmp;
  }
  if (value == setting_configList[index].defaultvalue) return;
  //check validity of value
  var isvalid = setting_check_value(value, index, subindex);
  //if not valid show error
  if (!isvalid) {
    setsettingerror(index);
    alertdlg(
      translate_text_item("Out of range"),
      translate_text_item("Value must be ") + setting_error_msg + " !"
    );
  } else {
    //value is ok save it
    var cmd = setting_configList[index].cmd + value;
    setting_lastindex = index;
    setting_lastsubindex = subindex;
    setting_configList[index].defaultvalue = value;
    document.getElementById("btn_setting_" + index + "_" + sub).className =
      "btn btn-success";
    document.getElementById("icon_setting_" + index + "_" + sub).className =
      "form-control-feedback has-success ico_feedback";
    document.getElementById("icon_setting_" + index + "_" + sub).innerHTML =
      get_icon_svg("ok");
    document.getElementById("status_setting_" + index + "_" + sub).className =
      "form-group has-feedback has-success";
    var url = "/command?plain=" + encodeURIComponent(cmd);
    SendGetHttp(url, setESPsettingsSuccess, setESPsettingsfailed);
  }
}

function setting_checkchange(index, subindex) {
  //console.log("list value changed");
  var val = document
    .getElementById("setting_" + index + "_" + subindex)
    .value.trim();
  if (setting_configList[index].type == "F") {
    //console.log("it is flag value");
    var tmp = setting_configList[index].defaultvalue;
    if (val == "1") {
      tmp |= settings_get_flag_value(index, subindex);
    } else {
      tmp &= ~settings_get_flag_value(index, subindex);
    }
    val = tmp;
  }
  //console.log("value: " + val);
  //console.log("default value: " + setting_configList[index].defaultvalue);
  if (setting_configList[index].defaultvalue == val) {
    console.log("values are identical");
    document.getElementById("btn_setting_" + index + "_" + subindex).className =
      "btn btn-default";
    document.getElementById(
      "icon_setting_" + index + "_" + subindex
    ).className = "form-control-feedback";
    document.getElementById(
      "icon_setting_" + index + "_" + subindex
    ).innerHTML = "";
    document.getElementById(
      "status_setting_" + index + "_" + subindex
    ).className = "form-group has-feedback";
  } else if (setting_check_value(val, index, subindex)) {
    //console.log("Check passed");
    setsettingchanged(index, subindex);
  } else {
    console.log("change bad");
    setsettingerror(index, subindex);
  }
}

function setsettingchanged(index, subindex) {
  document.getElementById(
    "status_setting_" + index + "_" + subindex
  ).className = "form-group has-feedback has-warning";
  document.getElementById("btn_setting_" + index + "_" + subindex).className =
    "btn btn-warning";
  document.getElementById("icon_setting_" + index + "_" + subindex).className =
    "form-control-feedback has-warning ico_feedback";
  document.getElementById("icon_setting_" + index + "_" + subindex).innerHTML =
    get_icon_svg("warning-sign");
}

function setsettingerror(index, subindex) {
  document.getElementById("btn_setting_" + index + "_" + subindex).className =
    "btn btn-danger";
  document.getElementById("icon_setting_" + index + "_" + subindex).className =
    "form-control-feedback has-error ico_feedback";
  document.getElementById("icon_setting_" + index + "_" + subindex).innerHTML =
    get_icon_svg("remove");
  document.getElementById(
    "status_setting_" + index + "_" + subindex
  ).className = "form-group has-feedback has-error";
}

function setESPsettingsSuccess(response) {
  //console.log(response);
  update_UI_setting();
}

function setESPsettingsfailed(error_code, response) {
  alertdlg(
    translate_text_item("Set failed"),
    "Error " + error_code + " :" + response
  );
  console.log("Error " + error_code + " :" + response);
  document.getElementById(
    "btn_setting_" + setting_lastindex + "_" + setting_lastsubindex
  ).className = "btn btn-danger";
  document.getElementById(
    "icon_setting_" + setting_lastindex + "_" + setting_lastsubindex
  ).className = "form-control-feedback has-error ico_feedback";
  document.getElementById(
    "icon_setting_" + setting_lastindex + "_" + setting_lastsubindex
  ).innerHTML = get_icon_svg("remove");
  document.getElementById(
    "status_setting_" + setting_lastindex + "_" + setting_lastsubindex
  ).className = "form-group has-feedback has-error";
}

function getESPsettingsSuccess(response) {
  console.log(response);
  if (!process_settings_answer(response)) {
    getESPsettingsfailed(406, translate_text_item("Wrong data"));
    console.log(response);
    return;
  }
  document.getElementById("settings_loader").style.display = "none";
  document.getElementById("settings_list_content").style.display = "block";
  document.getElementById("settings_status").style.display = "none";
  document.getElementById("settings_refresh_btn").style.display = "block";
}

function getESPsettingsfailed(error_code, response) {
  console.log("Error " + error_code + " :" + response);
  document.getElementById("settings_loader").style.display = "none";
  document.getElementById("settings_status").style.display = "block";
  document.getElementById("settings_status").innerHTML =
    translate_text_item("Failed:") + error_code + " " + response;
  document.getElementById("settings_refresh_btn").style.display = "block";
}

function restart_esp() {
  confirmdlg(
    translate_text_item("Please Confirm"),
    translate_text_item("Restart ESP3D"),
    process_restart_esp
  );
}

function process_restart_esp(answer) {
  if (answer == "yes") {
    restartdlg();
  }
}

//setup dialog

var active_wizard_page = 0;
var maz_page_wizard = 5;

function setupdlg() {
    setup_is_done = false;
    language_save = language;
    document.getElementById('main_ui').style.display = 'none';
    document.getElementById('settings_list_data').innerHTML = "";
    active_wizard_page = 0;
    //reset page 1
    document.getElementById("startsteplink").className = document.getElementById("startsteplink").className.replace(" wizard_done", "");
    document.getElementById("wizard_button").innerHTML = translate_text_item("Start setup");
    document.getElementById("wizard_line1").style.background = "#e0e0e0";
    document.getElementById("step1link").disabled = true;
    document.getElementById("step1link").className = "steplinks disabled";
    //reset page 2
    document.getElementById("step1link").className = document.getElementById("step1link").className.replace(" wizard_done", "");
    document.getElementById("wizard_line2").style.background = "#e0e0e0";
    document.getElementById("step2link").disabled = true;
    document.getElementById("step2link").className = "steplinks disabled";
    //reset page 3
    document.getElementById("step2link").className = document.getElementById("step2link").className.replace(" wizard_done", "");
    document.getElementById("wizard_line3").style.background = "#e0e0e0";
    document.getElementById("step3link").disabled = true;
    document.getElementById("step3link").className = "steplinks disabled";
    if (!direct_sd || (target_firmware == "grbl-embedded") || (target_firmware == "marlin-embedded")) {
        document.getElementById("step3link").style.display = 'none';
        document.getElementById("wizard_line4").style.display = 'none';
    } else {
        document.getElementById("step3link").style.display = 'block';
        document.getElementById("wizard_line4").style.display = 'block';
    }
    //reset page 4
    document.getElementById("step3link").className = document.getElementById("step3link").className.replace(" wizard_done", "");
    document.getElementById("wizard_line4").style.background = "#e0e0e0";
    document.getElementById("endsteplink").disabled = true;
    document.getElementById("endsteplink").className = "steplinks disabled";
    var content = "<table><tr><td>";
    content += get_icon_svg("flag") + "&nbsp;</td><td>";
    content += build_language_list("language_selection");
    content += "</td></tr></table>";
    document.getElementById("setup_langage_list").innerHTML = content;

    var modal = setactiveModal('setupdlg.html', setupdone);
    if (modal == null) return;
    showModal();
    document.getElementById("startsteplink", true).click();
}


function setupdone(response) {
    setup_is_done = true;
    do_not_build_settings = false;
    build_HTML_setting_list(current_setting_filter);
    translate_text(language_save);
    document.getElementById('main_ui').style.display = 'block';
    closeModal("setup done");

}

function continue_setup_wizard() {
    active_wizard_page++;
    switch (active_wizard_page) {
        case 1:
            enablestep1();
            preferenceslist[0].language = language;
            SavePreferences(true);
            language_save = language;
            break;
        case 2:
            enablestep2();
            break;
        case 3:
            if (!direct_sd || (target_firmware == "grbl-embedded") || (target_firmware == "marlin-embedded")) {
                active_wizard_page++;
                document.getElementById("wizard_line3").style.background = "#337AB7";
                enablestep4();
            } else enablestep3();
            break;
        case 4:
            enablestep4();
            break;
        case 5:
            closeModal('ok')
            break;
        default:
            console.log("wizard page out of range");
    }
}

function enablestep1() {
    var content = "";
    var index = 0;
    if (document.getElementById("startsteplink").className.indexOf(" wizard_done") == -1) {
        document.getElementById("startsteplink").className += " wizard_done";
        if (!can_revert_wizard) document.getElementById("startsteplink").className += " no_revert_wizard";
    }
    document.getElementById("wizard_button").innerHTML = translate_text_item("Continue");
    document.getElementById("wizard_line1").style.background = "#337AB7";
    document.getElementById("step1link").disabled = "";
    document.getElementById("step1link").className = document.getElementById("step1link").className.replace(" disabled", "");
    content += "<h4>" + translate_text_item("ESP3D Settings") + "</h4><hr>";
    if (!((target_firmware == "grbl-embedded") || (target_firmware == "marlin-embedded"))) {
        index = get_index_from_eeprom_pos(EP_TARGET_FW);
        content += translate_text_item("Save your printer's firmware base:");
        content += build_control_from_index(index);
        content += translate_text_item("This is mandatory to get ESP working properly.");
        content += "<hr>\n";
        index = get_index_from_eeprom_pos(EP_BAUD_RATE);
        content += translate_text_item("Save your printer's board current baud rate:");
        content += build_control_from_index(index);
        content += translate_text_item("Printer and ESP board must use same baud rate to communicate properly.") + "<br>";
        content += "<hr>\n";
    }
    index = get_index_from_eeprom_pos(EP_HOSTNAME);
    content += translate_text_item("Define ESP name:") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";

    document.getElementById("step1").innerHTML = content
    document.getElementById("step1link").click();
}

function define_esp_role(index) {
    if (!((setting_configList[index].defaultvalue == SETTINGS_AP_MODE) || (setting_configList[index].defaultvalue == SETTINGS_STA_MODE))) {
        document.getElementById("setup_STA").style.display = "none";
        document.getElementById("setup_AP").style.display = "none";
    }
    if (setting_configList[index].defaultvalue == SETTINGS_AP_MODE) {
        document.getElementById("setup_STA").style.display = "none";
        document.getElementById("setup_AP").style.display = "block";
    }
    if (setting_configList[index].defaultvalue == SETTINGS_STA_MODE) {
        document.getElementById("setup_STA").style.display = "block";
        document.getElementById("setup_AP").style.display = "none";
    }
}

function enablestep2() {
    var content = "";
    if (document.getElementById("step1link").className.indexOf("wizard_done") == -1) {
        document.getElementById("step1link").className += " wizard_done";
        if (!can_revert_wizard) document.getElementById("step1link").className += " no_revert_wizard";
    }
    document.getElementById("wizard_line2").style.background = "#337AB7";
    document.getElementById("step2link").disabled = "";
    document.getElementById("step2link").className = document.getElementById("step2link").className.replace(" disabled", "");
    index = get_index_from_eeprom_pos(EP_WIFI_MODE);
    content += "<h4>" + translate_text_item("WiFi Configuration") + "</h4><hr>";
    content += translate_text_item("Define ESP role:") + "<table><tr><td>";
    content += build_control_from_index(index, "define_esp_role");
    content += "</td></tr></table>" + translate_text_item("AP define access point / STA allows to join existing network") + "<br>";
    content += "<hr>\n";
    index = get_index_from_eeprom_pos(EP_STA_SSID);
    content += "<div id='setup_STA'>";
    content += translate_text_item("What access point ESP need to be connected to:") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>" + translate_text_item("You can use scan button, to list available access points.") + "<br>";
    content += "<hr>\n";
    index = get_index_from_eeprom_pos(EP_STA_PASSWORD);
    content += translate_text_item("Password to join access point:") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    content += "</div>";
    content += "<div id='setup_AP'>";
    content += translate_text_item("What is ESP access point SSID:") + "<table><tr><td>";
    index = get_index_from_eeprom_pos(EP_AP_SSID);
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    content += "<hr>\n";
    index = get_index_from_eeprom_pos(EP_AP_PASSWORD);
    content += translate_text_item("Password for access point:") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    if (!((target_firmware == "grbl-embedded") || (target_firmware == "marlin-embedded"))) {
        content += "<hr>\n";
        content += translate_text_item("Define security:") + "<table><tr><td>";
        index = get_index_from_eeprom_pos(EP_AUTH_TYPE);
        content += build_control_from_index(index);
        content += "</td></tr></table>";
    }
    content += "</div>";
    document.getElementById("step2").innerHTML = content;
    define_esp_role(get_index_from_eeprom_pos(EP_WIFI_MODE));
    document.getElementById("step2link").click();
}

function define_sd_role(index) {
    if (setting_configList[index].defaultvalue == 1) {
        document.getElementById("setup_SD").style.display = "block";
        if (target_firmware == "smoothieware") document.getElementById("setup_primary_SD").style.display = "block";
        else document.getElementById("setup_primary_SD").style.display = "none";
    } else {
        document.getElementById("setup_SD").style.display = "none";
        document.getElementById("setup_primary_SD").style.display = "none";
    }
}

function enablestep3() {
    var content = "";
    if (document.getElementById("step2link").className.indexOf("wizard_done") == -1) {
        document.getElementById("step2link").className += " wizard_done";
        if (!can_revert_wizard) document.getElementById("step2link").className += " no_revert_wizard";
    }
    document.getElementById("wizard_line3").style.background = "#337AB7";
    document.getElementById("step3link").disabled = "";
    document.getElementById("step3link").className = document.getElementById("step3link").className.replace(" disabled", "");
    index = get_index_from_eeprom_pos(EP_IS_DIRECT_SD);
    content += "<h4>" + translate_text_item("SD Card Configuration") + "</h4><hr>";
    content += translate_text_item("Is ESP connected to SD card:") + "<table><tr><td>";
    content += build_control_from_index(index, "define_sd_role");
    content += "</td></tr></table>";
    content += "<hr>\n";
    content += "<div id='setup_SD'>";
    index = get_index_from_eeprom_pos(EP_DIRECT_SD_CHECK);
    content += translate_text_item("Check update using direct SD access:") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    content += "<hr>\n";
    content += "<div id='setup_primary_SD'>";
    index = get_index_from_eeprom_pos(EP_PRIMARY_SD);
    content += translate_text_item("SD card connected to ESP") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    content += "<hr>\n";
    index = get_index_from_eeprom_pos(EP_SECONDARY_SD);
    content += translate_text_item("SD card connected to printer") + "<table><tr><td>";
    content += build_control_from_index(index);
    content += "</td></tr></table>";
    content += "<hr>\n";
    content += "</div>";
    content += "</div>";
    document.getElementById("step3").innerHTML = content;
    define_sd_role(get_index_from_eeprom_pos(EP_IS_DIRECT_SD));
    document.getElementById("step3link").click();
}

function enablestep4() {
    if (document.getElementById("step3link").className.indexOf("wizard_done") == -1) {
        document.getElementById("step3link").className += " wizard_done";
        if (!can_revert_wizard) document.getElementById("step3link").className += " no_revert_wizard";
    }
    document.getElementById("wizard_button").innerHTML = translate_text_item("Close");
    document.getElementById("wizard_line4").style.background = "#337AB7";
    document.getElementById("endsteplink").disabled = "";
    document.getElementById("endsteplink").className = document.getElementById("endsteplink").className.replace(" disabled", "");
    document.getElementById("endsteplink").click();
}
// MIT License:
//
// Copyright (c) 2010-2013, Joe Walnes
//               2013-2014, Drew Noakes
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * Smoothie Charts - http://smoothiecharts.org/
 * (c) 2010-2013, Joe Walnes
 *     2013-2014, Drew Noakes
 *
 * v1.0: Main charting library, by Joe Walnes
 * v1.1: Auto scaling of axis, by Neil Dunn
 * v1.2: fps (frames per second) option, by Mathias Petterson
 * v1.3: Fix for divide by zero, by Paul Nikitochkin
 * v1.4: Set minimum, top-scale padding, remove timeseries, add optional timer to reset bounds, by Kelley Reynolds
 * v1.5: Set default frames per second to 50... smoother.
 *       .start(), .stop() methods for conserving CPU, by Dmitry Vyal
 *       options.interpolation = 'bezier' or 'line', by Dmitry Vyal
 *       options.maxValue to fix scale, by Dmitry Vyal
 * v1.6: minValue/maxValue will always get converted to floats, by Przemek Matylla
 * v1.7: options.grid.fillStyle may be a transparent color, by Dmitry A. Shashkin
 *       Smooth rescaling, by Kostas Michalopoulos
 * v1.8: Set max length to customize number of live points in the dataset with options.maxDataSetLength, by Krishna Narni
 * v1.9: Display timestamps along the bottom, by Nick and Stev-io
 *       (https://groups.google.com/forum/?fromgroups#!topic/smoothie-charts/-Ywse8FCpKI%5B1-25%5D)
 *       Refactored by Krishna Narni, to support timestamp formatting function
 * v1.10: Switch to requestAnimationFrame, removed the now obsoleted options.fps, by Gergely Imreh
 * v1.11: options.grid.sharpLines option added, by @drewnoakes
 *        Addressed warning seen in Firefox when seriesOption.fillStyle undefined, by @drewnoakes
 * v1.12: Support for horizontalLines added, by @drewnoakes
 *        Support for yRangeFunction callback added, by @drewnoakes
 * v1.13: Fixed typo (#32), by @alnikitich
 * v1.14: Timer cleared when last TimeSeries removed (#23), by @davidgaleano
 *        Fixed diagonal line on chart at start/end of data stream, by @drewnoakes
 * v1.15: Support for npm package (#18), by @dominictarr
 *        Fixed broken removeTimeSeries function (#24) by @davidgaleano
 *        Minor performance and tidying, by @drewnoakes
 * v1.16: Bug fix introduced in v1.14 relating to timer creation/clearance (#23), by @drewnoakes
 *        TimeSeries.append now deals with out-of-order timestamps, and can merge duplicates, by @zacwitte (#12)
 *        Documentation and some local variable renaming for clarity, by @drewnoakes
 * v1.17: Allow control over font size (#10), by @drewnoakes
 *        Timestamp text won't overlap, by @drewnoakes
 * v1.18: Allow control of max/min label precision, by @drewnoakes
 *        Added 'borderVisible' chart option, by @drewnoakes
 *        Allow drawing series with fill but no stroke (line), by @drewnoakes
 * v1.19: Avoid unnecessary repaints, and fixed flicker in old browsers having multiple charts in document (#40), by @asbai
 * v1.20: Add SmoothieChart.getTimeSeriesOptions and SmoothieChart.bringToFront functions, by @drewnoakes
 * v1.21: Add 'step' interpolation mode, by @drewnoakes
 * v1.22: Add support for different pixel ratios. Also add optional y limit formatters, by @copacetic
 * v1.23: Fix bug introduced in v1.22 (#44), by @drewnoakes
 * v1.24: Fix bug introduced in v1.23, re-adding parseFloat to y-axis formatter defaults, by @siggy_sf
 * v1.25: Fix bug seen when adding a data point to TimeSeries which is older than the current data, by @Nking92
 *        Draw time labels on top of series, by @comolosabia
 *        Add TimeSeries.clear function, by @drewnoakes
 * v1.26: Add support for resizing on high device pixel ratio screens, by @copacetic
 * v1.27: Fix bug introduced in v1.26 for non whole number devicePixelRatio values, by @zmbush
 * v1.28: Add 'minValueScale' option, by @megawac
 *        Fix 'labelPos' for different size of 'minValueString' 'maxValueString', by @henryn
 */

;
(function(exports) {

    var Util = {
        extend: function() {
            arguments[0] = arguments[0] || {};
            for (var i = 1; i < arguments.length; i++) {
                for (var key in arguments[i]) {
                    if (arguments[i].hasOwnProperty(key)) {
                        if (typeof(arguments[i][key]) === 'object') {
                            if (arguments[i][key] instanceof Array) {
                                arguments[0][key] = arguments[i][key];
                            } else {
                                arguments[0][key] = Util.extend(arguments[0][key], arguments[i][key]);
                            }
                        } else {
                            arguments[0][key] = arguments[i][key];
                        }
                    }
                }
            }
            return arguments[0];
        }
    };

    /**
     * Initialises a new <code>TimeSeries</code> with optional data options.
     *
     * Options are of the form (defaults shown):
     *
     * <pre>
     * {
     *   resetBounds: true,        // enables/disables automatic scaling of the y-axis
     *   resetBoundsInterval: 3000 // the period between scaling calculations, in millis
     * }
     * </pre>
     *
     * Presentation options for TimeSeries are specified as an argument to <code>SmoothieChart.addTimeSeries</code>.
     *
     * @constructor
     */
    function TimeSeries(options) {
        this.options = Util.extend({}, TimeSeries.defaultOptions, options);
        this.clear();
    }

    TimeSeries.defaultOptions = {
        resetBoundsInterval: 3000,
        resetBounds: true
    };

    /**
     * Clears all data and state from this TimeSeries object.
     */
    TimeSeries.prototype.clear = function() {
        this.data = [];
        this.maxValue = Number.NaN; // The maximum value ever seen in this TimeSeries.
        this.minValue = Number.NaN; // The minimum value ever seen in this TimeSeries.
    };

    /**
     * Recalculate the min/max values for this <code>TimeSeries</code> object.
     *
     * This causes the graph to scale itself in the y-axis.
     */
    TimeSeries.prototype.resetBounds = function() {
        if (this.data.length) {
            // Walk through all data points, finding the min/max value
            this.maxValue = this.data[0][1];
            this.minValue = this.data[0][1];
            for (var i = 1; i < this.data.length; i++) {
                var value = this.data[i][1];
                if (value > this.maxValue) {
                    this.maxValue = value;
                }
                if (value < this.minValue) {
                    this.minValue = value;
                }
            }
        } else {
            // No data exists, so set min/max to NaN
            this.maxValue = Number.NaN;
            this.minValue = Number.NaN;
        }
    };

    /**
     * Adds a new data point to the <code>TimeSeries</code>, preserving chronological order.
     *
     * @param timestamp the position, in time, of this data point
     * @param value the value of this data point
     * @param sumRepeatedTimeStampValues if <code>timestamp</code> has an exact match in the series, this flag controls
     * whether it is replaced, or the values summed (defaults to false.)
     */
    TimeSeries.prototype.append = function(timestamp, value, sumRepeatedTimeStampValues) {
        // Rewind until we hit an older timestamp
        var i = this.data.length - 1;
        while (i >= 0 && this.data[i][0] > timestamp) {
            i--;
        }

        if (i === -1) {
            // This new item is the oldest data
            this.data.splice(0, 0, [timestamp, value]);
        } else if (this.data.length > 0 && this.data[i][0] === timestamp) {
            // Update existing values in the array
            if (sumRepeatedTimeStampValues) {
                // Sum this value into the existing 'bucket'
                this.data[i][1] += value;
                value = this.data[i][1];
            } else {
                // Replace the previous value
                this.data[i][1] = value;
            }
        } else if (i < this.data.length - 1) {
            // Splice into the correct position to keep timestamps in order
            this.data.splice(i + 1, 0, [timestamp, value]);
        } else {
            // Add to the end of the array
            this.data.push([timestamp, value]);
        }

        this.maxValue = isNaN(this.maxValue) ? value : Math.max(this.maxValue, value);
        this.minValue = isNaN(this.minValue) ? value : Math.min(this.minValue, value);
    };

    TimeSeries.prototype.dropOldData = function(oldestValidTime, maxDataSetLength) {
        // We must always keep one expired data point as we need this to draw the
        // line that comes into the chart from the left, but any points prior to that can be removed.
        var removeCount = 0;
        while (this.data.length - removeCount >= maxDataSetLength && this.data[removeCount + 1][0] < oldestValidTime) {
            removeCount++;
        }
        if (removeCount !== 0) {
            this.data.splice(0, removeCount);
        }
    };

    /**
     * Initialises a new <code>SmoothieChart</code>.
     *
     * Options are optional, and should be of the form below. Just specify the values you
     * need and the rest will be given sensible defaults as shown:
     *
     * <pre>
     * {
     *   minValue: undefined,                      // specify to clamp the lower y-axis to a given value
     *   maxValue: undefined,                      // specify to clamp the upper y-axis to a given value
     *   maxValueScale: 1,                         // allows proportional padding to be added above the chart. for 10% padding, specify 1.1.
     *   minValueScale: 1,                         // allows proportional padding to be added below the chart. for 10% padding, specify 1.1.
     *   yRangeFunction: undefined,                // function({min: , max: }) { return {min: , max: }; }
     *   scaleSmoothing: 0.125,                    // controls the rate at which y-value zoom animation occurs
     *   millisPerPixel: 20,                       // sets the speed at which the chart pans by
     *   enableDpiScaling: true,                   // support rendering at different DPI depending on the device
     *   yMinFormatter: function(min, precision) { // callback function that formats the min y value label
     *     return parseFloat(min).toFixed(precision);
     *   },
     *   yMaxFormatter: function(max, precision) { // callback function that formats the max y value label
     *     return parseFloat(max).toFixed(precision);
     *   },
     *   maxDataSetLength: 2,
     *   interpolation: 'bezier'                   // one of 'bezier', 'linear', or 'step'
     *   timestampFormatter: null,                 // optional function to format time stamps for bottom of chart
     *                                             // you may use SmoothieChart.timeFormatter, or your own: function(date) { return ''; }
     *   scrollBackwards: false,                   // reverse the scroll direction of the chart
     *   horizontalLines: [],                      // [ { value: 0, color: '#ffffff', lineWidth: 1 } ]
     *   grid:
     *   {
     *     fillStyle: '#000000',                   // the background colour of the chart
     *     lineWidth: 1,                           // the pixel width of grid lines
     *     strokeStyle: '#777777',                 // colour of grid lines
     *     millisPerLine: 1000,                    // distance between vertical grid lines
     *     sharpLines: false,                      // controls whether grid lines are 1px sharp, or softened
     *     verticalSections: 2,                    // number of vertical sections marked out by horizontal grid lines
     *     borderVisible: true                     // whether the grid lines trace the border of the chart or not
     *   },
     *   labels
     *   {
     *     disabled: false,                        // enables/disables labels showing the min/max values
     *     fillStyle: '#ffffff',                   // colour for text of labels,
     *     fontSize: 15,
     *     fontFamily: 'sans-serif',
     *     precision: 2
     *   }
     * }
     * </pre>
     *
     * @constructor
     */
    function SmoothieChart(options) {
        this.options = Util.extend({}, SmoothieChart.defaultChartOptions, options);
        this.seriesSet = [];
        this.currentValueRange = 1;
        this.currentVisMinValue = 0;
        this.lastRenderTimeMillis = 0;
    }

    SmoothieChart.defaultChartOptions = {
        millisPerPixel: 20,
        enableDpiScaling: true,
        yMinFormatter: function(min, precision) {
            return parseFloat(min).toFixed(precision);
        },
        yMaxFormatter: function(max, precision) {
            return parseFloat(max).toFixed(precision);
        },
        maxValueScale: 1,
        minValueScale: 1,
        interpolation: 'bezier',
        scaleSmoothing: 0.125,
        maxDataSetLength: 2,
        scrollBackwards: false,
        grid: {
            fillStyle: '#ACACAC',
            strokeStyle: '#777777',
            lineWidth: 1,
            sharpLines: false,
            millisPerLine: 1000,
            verticalSections: 2,
            borderVisible: true
        },
        labels: {
            fillStyle: '#ffffff',
            disabled: false,
            fontSize: 10,
            fontFamily: 'monospace',
            precision: 2
        },
        horizontalLines: []
    };

    // Based on http://inspirit.github.com/jsfeat/js/compatibility.js
    SmoothieChart.AnimateCompatibility = (function() {
        var requestAnimationFrame = function(callback, element) {
                var requestAnimationFrame =
                    window.requestAnimationFrame ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame ||
                    window.oRequestAnimationFrame ||
                    window.msRequestAnimationFrame ||
                    function(callback) {
                        return window.setTimeout(function() {
                            callback(new Date().getTime());
                        }, 16);
                    };
                return requestAnimationFrame.call(window, callback, element);
            },
            cancelAnimationFrame = function(id) {
                var cancelAnimationFrame =
                    window.cancelAnimationFrame ||
                    function(id) {
                        clearTimeout(id);
                    };
                return cancelAnimationFrame.call(window, id);
            };

        return {
            requestAnimationFrame: requestAnimationFrame,
            cancelAnimationFrame: cancelAnimationFrame
        };
    })();

    SmoothieChart.defaultSeriesPresentationOptions = {
        lineWidth: 1,
        strokeStyle: '#ffffff'
    };

    /**
     * Adds a <code>TimeSeries</code> to this chart, with optional presentation options.
     *
     * Presentation options should be of the form (defaults shown):
     *
     * <pre>
     * {
     *   lineWidth: 1,
     *   strokeStyle: '#ffffff',
     *   fillStyle: undefined
     * }
     * </pre>
     */
    SmoothieChart.prototype.addTimeSeries = function(timeSeries, options) {
        this.seriesSet.push({
            timeSeries: timeSeries,
            options: Util.extend({}, SmoothieChart.defaultSeriesPresentationOptions, options)
        });
        if (timeSeries.options.resetBounds && timeSeries.options.resetBoundsInterval > 0) {
            timeSeries.resetBoundsTimerId = setInterval(
                function() {
                    timeSeries.resetBounds();
                },
                timeSeries.options.resetBoundsInterval
            );
        }
    };

    /**
     * Removes the specified <code>TimeSeries</code> from the chart.
     */
    SmoothieChart.prototype.removeTimeSeries = function(timeSeries) {
        // Find the correct timeseries to remove, and remove it
        var numSeries = this.seriesSet.length;
        for (var i = 0; i < numSeries; i++) {
            if (this.seriesSet[i].timeSeries === timeSeries) {
                this.seriesSet.splice(i, 1);
                break;
            }
        }
        // If a timer was operating for that timeseries, remove it
        if (timeSeries.resetBoundsTimerId) {
            // Stop resetting the bounds, if we were
            clearInterval(timeSeries.resetBoundsTimerId);
        }
    };

    /**
     * Gets render options for the specified <code>TimeSeries</code>.
     *
     * As you may use a single <code>TimeSeries</code> in multiple charts with different formatting in each usage,
     * these settings are stored in the chart.
     */
    SmoothieChart.prototype.getTimeSeriesOptions = function(timeSeries) {
        // Find the correct timeseries to remove, and remove it
        var numSeries = this.seriesSet.length;
        for (var i = 0; i < numSeries; i++) {
            if (this.seriesSet[i].timeSeries === timeSeries) {
                return this.seriesSet[i].options;
            }
        }
    };

    /**
     * Brings the specified <code>TimeSeries</code> to the top of the chart. It will be rendered last.
     */
    SmoothieChart.prototype.bringToFront = function(timeSeries) {
        // Find the correct timeseries to remove, and remove it
        var numSeries = this.seriesSet.length;
        for (var i = 0; i < numSeries; i++) {
            if (this.seriesSet[i].timeSeries === timeSeries) {
                var set = this.seriesSet.splice(i, 1);
                this.seriesSet.push(set[0]);
                break;
            }
        }
    };

    /**
     * Instructs the <code>SmoothieChart</code> to start rendering to the provided canvas, with specified delay.
     *
     * @param canvas the target canvas element
     * @param delayMillis an amount of time to wait before a data point is shown. This can prevent the end of the series
     * from appearing on screen, with new values flashing into view, at the expense of some latency.
     */
    SmoothieChart.prototype.streamTo = function(canvas, delayMillis) {
        this.canvas = canvas;
        this.delay = delayMillis;
        this.start();
    };

    /**
     * Make sure the canvas has the optimal resolution for the device's pixel ratio.
     */
    SmoothieChart.prototype.resize = function() {
        // TODO this function doesn't handle the value of enableDpiScaling changing during execution
        if (!this.options.enableDpiScaling || !window || window.devicePixelRatio === 1)
            return;

        var dpr = window.devicePixelRatio;
        var width = parseInt(this.canvas.getAttribute('width'));
        var height = parseInt(this.canvas.getAttribute('height'));

        if (!this.originalWidth || (Math.floor(this.originalWidth * dpr) !== width)) {
            this.canvas.setAttribute('width', (Math.floor(width * dpr)).toString());
            this.canvas.style.width = width + 'px';
            this.canvas.getContext('2d').scale(dpr, dpr);
        }

        if (!this.originalHeight || (Math.floor(this.originalHeight * dpr) !== height)) {
            this.originalHeight = height;
            this.canvas.setAttribute('height', (Math.floor(height * dpr)).toString());
            this.canvas.style.height = height + 'px';
            this.canvas.getContext('2d').scale(dpr, dpr);
        }
    };

    /**
     * Starts the animation of this chart.
     */
    SmoothieChart.prototype.start = function() {
        if (this.frame) {
            // We're already running, so just return
            return;
        }

        // Renders a frame, and queues the next frame for later rendering
        var animate = function() {
            this.frame = SmoothieChart.AnimateCompatibility.requestAnimationFrame(function() {
                this.render();
                animate();
            }.bind(this));
        }.bind(this);

        animate();
    };

    /**
     * Stops the animation of this chart.
     */
    SmoothieChart.prototype.stop = function() {
        if (this.frame) {
            SmoothieChart.AnimateCompatibility.cancelAnimationFrame(this.frame);
            delete this.frame;
        }
    };

    SmoothieChart.prototype.updateValueRange = function() {
        // Calculate the current scale of the chart, from all time series.
        var chartOptions = this.options,
            chartMaxValue = Number.NaN,
            chartMinValue = Number.NaN;

        for (var d = 0; d < this.seriesSet.length; d++) {
            // TODO(ndunn): We could calculate / track these values as they stream in.
            var timeSeries = this.seriesSet[d].timeSeries;
            if (!isNaN(timeSeries.maxValue)) {
                chartMaxValue = !isNaN(chartMaxValue) ? Math.max(chartMaxValue, timeSeries.maxValue) : timeSeries.maxValue;
            }

            if (!isNaN(timeSeries.minValue)) {
                chartMinValue = !isNaN(chartMinValue) ? Math.min(chartMinValue, timeSeries.minValue) : timeSeries.minValue;
            }
        }

        // Scale the chartMaxValue to add padding at the top if required
        if (chartOptions.maxValue != null) {
            chartMaxValue = chartOptions.maxValue;
        } else {
            chartMaxValue *= chartOptions.maxValueScale;
        }

        // Set the minimum if we've specified one
        if (chartOptions.minValue != null) {
            chartMinValue = chartOptions.minValue;
        } else {
            chartMinValue -= Math.abs(chartMinValue * chartOptions.minValueScale - chartMinValue);
        }

        // If a custom range function is set, call it
        if (this.options.yRangeFunction) {
            var range = this.options.yRangeFunction({
                min: chartMinValue,
                max: chartMaxValue
            });
            chartMinValue = range.min;
            chartMaxValue = range.max;
        }

        if (!isNaN(chartMaxValue) && !isNaN(chartMinValue)) {
            var targetValueRange = chartMaxValue - chartMinValue;
            var valueRangeDiff = (targetValueRange - this.currentValueRange);
            var minValueDiff = (chartMinValue - this.currentVisMinValue);
            this.isAnimatingScale = Math.abs(valueRangeDiff) > 0.1 || Math.abs(minValueDiff) > 0.1;
            this.currentValueRange += chartOptions.scaleSmoothing * valueRangeDiff;
            this.currentVisMinValue += chartOptions.scaleSmoothing * minValueDiff;
        }

        this.valueRange = {
            min: chartMinValue,
            max: chartMaxValue
        };
    };

    SmoothieChart.prototype.render = function(canvas, time) {
        var nowMillis = new Date().getTime();

        if (!this.isAnimatingScale) {
            // We're not animating. We can use the last render time and the scroll speed to work out whether
            // we actually need to paint anything yet. If not, we can return immediately.

            // Render at least every 1/6th of a second. The canvas may be resized, which there is
            // no reliable way to detect.
            var maxIdleMillis = Math.min(1000 / 6, this.options.millisPerPixel);

            if (nowMillis - this.lastRenderTimeMillis < maxIdleMillis) {
                return;
            }
        }

        this.resize();

        this.lastRenderTimeMillis = nowMillis;

        canvas = canvas || this.canvas;
        time = time || nowMillis - (this.delay || 0);

        // Round time down to pixel granularity, so motion appears smoother.
        time -= time % this.options.millisPerPixel;

        var context = canvas.getContext('2d'),
            chartOptions = this.options,
            dimensions = {
                top: 0,
                left: 0,
                width: canvas.clientWidth,
                height: canvas.clientHeight
            },
            // Calculate the threshold time for the oldest data points.
            oldestValidTime = time - (dimensions.width * chartOptions.millisPerPixel),
            valueToYPixel = function(value) {
                var offset = value - this.currentVisMinValue;
                return this.currentValueRange === 0 ?
                    dimensions.height :
                    dimensions.height - (Math.round((offset / this.currentValueRange) * dimensions.height));
            }.bind(this),
            timeToXPixel = function(t) {
                if (chartOptions.scrollBackwards) {
                    return Math.round((time - t) / chartOptions.millisPerPixel);
                }
                return Math.round(dimensions.width - ((time - t) / chartOptions.millisPerPixel));
            };

        this.updateValueRange();

        context.font = chartOptions.labels.fontSize + 'px ' + chartOptions.labels.fontFamily;

        // Save the state of the canvas context, any transformations applied in this method
        // will get removed from the stack at the end of this method when .restore() is called.
        context.save();

        // Move the origin.
        context.translate(dimensions.left, dimensions.top);

        // Create a clipped rectangle - anything we draw will be constrained to this rectangle.
        // This prevents the occasional pixels from curves near the edges overrunning and creating
        // screen cheese (that phrase should need no explanation).
        context.beginPath();
        context.rect(0, 0, dimensions.width, dimensions.height);
        context.clip();

        // Clear the working area.
        context.save();
        context.fillStyle = chartOptions.grid.fillStyle;
        context.clearRect(0, 0, dimensions.width, dimensions.height);
        context.fillRect(0, 0, dimensions.width, dimensions.height);
        context.restore();

        // Grid lines...
        context.save();
        context.lineWidth = chartOptions.grid.lineWidth;
        context.strokeStyle = chartOptions.grid.strokeStyle;
        // Vertical (time) dividers.
        if (chartOptions.grid.millisPerLine > 0) {
            context.beginPath();
            for (var t = time - (time % chartOptions.grid.millisPerLine); t >= oldestValidTime; t -= chartOptions.grid.millisPerLine) {
                var gx = timeToXPixel(t);
                if (chartOptions.grid.sharpLines) {
                    gx -= 0.5;
                }
                context.moveTo(gx, 0);
                context.lineTo(gx, dimensions.height);
            }
            context.stroke();
            context.closePath();
        }

        // Horizontal (value) dividers.
        for (var v = 1; v < chartOptions.grid.verticalSections; v++) {
            var gy = Math.round(v * dimensions.height / chartOptions.grid.verticalSections);
            if (chartOptions.grid.sharpLines) {
                gy -= 0.5;
            }
            context.beginPath();
            context.moveTo(0, gy);
            context.lineTo(dimensions.width, gy);
            context.stroke();
            context.closePath();
        }
        // Bounding rectangle.
        if (chartOptions.grid.borderVisible) {
            context.beginPath();
            context.strokeRect(0, 0, dimensions.width, dimensions.height);
            context.closePath();
        }
        context.restore();

        // Draw any horizontal lines...
        if (chartOptions.horizontalLines && chartOptions.horizontalLines.length) {
            for (var hl = 0; hl < chartOptions.horizontalLines.length; hl++) {
                var line = chartOptions.horizontalLines[hl],
                    hly = Math.round(valueToYPixel(line.value)) - 0.5;
                context.strokeStyle = line.color || '#ffffff';
                context.lineWidth = line.lineWidth || 1;
                context.beginPath();
                context.moveTo(0, hly);
                context.lineTo(dimensions.width, hly);
                context.stroke();
                context.closePath();
            }
        }

        // For each data set...
        for (var d = 0; d < this.seriesSet.length; d++) {
            context.save();
            var timeSeries = this.seriesSet[d].timeSeries,
                dataSet = timeSeries.data,
                seriesOptions = this.seriesSet[d].options;

            // Delete old data that's moved off the left of the chart.
            timeSeries.dropOldData(oldestValidTime, chartOptions.maxDataSetLength);

            // Set style for this dataSet.
            context.lineWidth = seriesOptions.lineWidth;
            context.strokeStyle = seriesOptions.strokeStyle;
            // Draw the line...
            context.beginPath();
            // Retain lastX, lastY for calculating the control points of bezier curves.
            var firstX = 0,
                lastX = 0,
                lastY = 0;
            for (var i = 0; i < dataSet.length && dataSet.length !== 1; i++) {
                var x = timeToXPixel(dataSet[i][0]),
                    y = valueToYPixel(dataSet[i][1]);

                if (i === 0) {
                    firstX = x;
                    context.moveTo(x, y);
                } else {
                    switch (chartOptions.interpolation) {
                        case "linear":
                        case "line": {
                            context.lineTo(x, y);
                            break;
                        }
                        case "bezier":
                        default: {
                            // Great explanation of Bezier curves: http://en.wikipedia.org/wiki/Bezier_curve#Quadratic_curves
                            //
                            // Assuming A was the last point in the line plotted and B is the new point,
                            // we draw a curve with control points P and Q as below.
                            //
                            // A---P
                            //     |
                            //     |
                            //     |
                            //     Q---B
                            //
                            // Importantly, A and P are at the same y coordinate, as are B and Q. This is
                            // so adjacent curves appear to flow as one.
                            //
                            context.bezierCurveTo( // startPoint (A) is implicit from last iteration of loop
                                Math.round((lastX + x) / 2), lastY, // controlPoint1 (P)
                                Math.round((lastX + x)) / 2, y, // controlPoint2 (Q)
                                x, y); // endPoint (B)
                            break;
                        }
                        case "step": {
                            context.lineTo(x, lastY);
                            context.lineTo(x, y);
                            break;
                        }
                    }
                }

                lastX = x;
                lastY = y;
            }

            if (dataSet.length > 1) {
                if (seriesOptions.fillStyle) {
                    // Close up the fill region.
                    context.lineTo(dimensions.width + seriesOptions.lineWidth + 1, lastY);
                    context.lineTo(dimensions.width + seriesOptions.lineWidth + 1, dimensions.height + seriesOptions.lineWidth + 1);
                    context.lineTo(firstX, dimensions.height + seriesOptions.lineWidth);
                    context.fillStyle = seriesOptions.fillStyle;
                    context.fill();
                }

                if (seriesOptions.strokeStyle && seriesOptions.strokeStyle !== 'none') {
                    context.stroke();
                }
                context.closePath();
            }
            context.restore();
        }

        // Draw the axis values on the chart.
        if (!chartOptions.labels.disabled && !isNaN(this.valueRange.min) && !isNaN(this.valueRange.max)) {
            var maxValueString = chartOptions.yMaxFormatter(this.valueRange.max, chartOptions.labels.precision),
                minValueString = chartOptions.yMinFormatter(this.valueRange.min, chartOptions.labels.precision),
                maxLabelPos = chartOptions.scrollBackwards ? 0 : dimensions.width - context.measureText(maxValueString).width - 2,
                minLabelPos = chartOptions.scrollBackwards ? 0 : dimensions.width - context.measureText(minValueString).width - 2;
            context.fillStyle = chartOptions.labels.fillStyle;
            context.clearRect(0, 0, context.measureText(maxValueString).width + 4, dimensions.height);
            context.save();
            context.lineWidth = chartOptions.grid.lineWidth;
            context.strokeStyle = chartOptions.grid.strokeStyle;
            context.beginPath();
            context.moveTo(context.measureText(maxValueString).width + 4, 0);
            context.lineTo(context.measureText(maxValueString).width + 4, dimensions.height);
            context.lineTo(dimensions.width, dimensions.height);
            context.stroke();
            context.closePath();
            context.restore();
            //context.fillText(maxValueString, 2, chartOptions.labels.fontSize);
            //context.fillText(minValueString/2, 2, dimensions.height - 2);
            var i = (parseFloat(maxValueString) - parseFloat(minValueString)) / chartOptions.grid.verticalSections;
            var h = dimensions.height / chartOptions.grid.verticalSections;
            if (chartOptions.yMaxFormatter(this.valueRange.min, chartOptions.labels.precision) != chartOptions.yMaxFormatter(this.valueRange.min + i, chartOptions.labels.precision))
                for (var p = 0; p < chartOptions.grid.verticalSections; p++) {
                    context.fillText(chartOptions.yMaxFormatter(this.valueRange.min + (p * i), chartOptions.labels.precision), 2, dimensions.height - (p * h));
                }
        }

        // Display timestamps along x-axis at the bottom of the chart.
        if (chartOptions.timestampFormatter && chartOptions.grid.millisPerLine > 0) {
            var textUntilX = chartOptions.scrollBackwards ?
                context.measureText(minValueString).width :
                dimensions.width - context.measureText(minValueString).width + 4;
            for (var t = time - (time % chartOptions.grid.millisPerLine); t >= oldestValidTime; t -= chartOptions.grid.millisPerLine) {
                var gx = timeToXPixel(t);
                // Only draw the timestamp if it won't overlap with the previously drawn one.
                if ((!chartOptions.scrollBackwards && gx < textUntilX) || (chartOptions.scrollBackwards && gx > textUntilX)) {
                    // Formats the timestamp based on user specified formatting function
                    // SmoothieChart.timeFormatter function above is one such formatting option
                    var tx = new Date(t),
                        ts = chartOptions.timestampFormatter(tx),
                        tsWidth = context.measureText(ts).width;

                    textUntilX = chartOptions.scrollBackwards ?
                        gx + tsWidth + 2 :
                        gx - tsWidth - 2;

                    context.fillStyle = chartOptions.labels.fillStyle;
                    if (chartOptions.scrollBackwards) {
                        context.fillText(ts, gx, dimensions.height - 2);
                    } else {
                        context.fillText(ts, gx - tsWidth, dimensions.height - 2);
                    }
                }
            }
        }

        context.restore(); // See .save() above.
    };

    // Sample timestamp formatting function
    SmoothieChart.timeFormatter = function(date) {
        function pad2(number) {
            return (number < 10 ? '0' : '') + number
        }
        return pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
    };

    exports.TimeSeries = TimeSeries;
    exports.SmoothieChart = SmoothieChart;

})(typeof exports === 'undefined' ? this : exports);
//SPIFFS dialog
var SPIFFS_currentpath = "/";
var SPIFFS_currentfile = "";
var SPIFFS_upload_ongoing = false;

function SPIFFSdlg(root) {
    var modal = setactiveModal('SPIFFSdlg.html');
    if (modal == null) return;
    if (typeof root !== 'undefined') SPIFFS_currentpath = root;
    document.getElementById("SPIFFS-select").value = "";
    document.getElementById("SPIFFS_file_name").innerHTML = translate_text_item("No file chosen");
    document.getElementById("SPIFFS_uploadbtn").style.display = 'none';
    document.getElementById("SPIFFS_prg").style.display = 'none';
    document.getElementById("uploadSPIFFSmsg").style.display = 'none';
    document.getElementById("SPIFFS_select_files").style.display = 'none';
    showModal();
    refreshSPIFFS();
}

function closeSPIFFSDialog(msg) {
    if (SPIFFS_upload_ongoing) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Upload is ongoing, please wait and retry."));
        return;
    }
    closeModal(msg);
}

function SPIFFSnavbar() {
    var content = "<table><tr>";
    var tlist = SPIFFS_currentpath.split("/");
    var path = "/";
    var nb = 1;
    content += "<td><button class='btn btn-primary'  onclick=\"SPIFFS_currentpath='/'; SPIFFSSendCommand('list','all');\">/</button></td>";
    while (nb < (tlist.length - 1)) {
        path += tlist[nb] + "/";
        content += "<td><button class='btn btn-link' onclick=\"SPIFFS_currentpath='" + path + "'; SPIFFSSendCommand('list','all');\">" + tlist[nb] + "</button></td><td>/</td>";
        nb++;
    }
    content += "</tr></table>";
    return content;
}

function SPIFFSselect_dir(directoryname) {
    SPIFFS_currentpath += directoryname + "/";
    SPIFFSSendCommand('list', 'all');
}

function SPIFFS_Createdir() {
    inputdlg(translate_text_item("Please enter directory name"), translate_text_item("Name:"), processSPIFFS_Createdir);
}

function processSPIFFS_Createdir(answer) {
    if (answer.length > 0) SPIFFSSendCommand("createdir", answer.trim());
}

function SPIFFSDelete(filename) {
    SPIFFS_currentfile = filename;
    confirmdlg(translate_text_item("Please Confirm"), translate_text_item("Confirm deletion of file: ") + filename, processSPIFFSDelete);
}

function processSPIFFSDelete(answer) {
    if (answer == "yes") SPIFFSSendCommand("delete", SPIFFS_currentfile);
    SPIFFS_currentfile = "";
}

function SPIFFSDeletedir(filename) {
    SPIFFS_currentfile = filename;
    confirmdlg(translate_text_item("Please Confirm"), translate_text_item("Confirm deletion of directory: ") + filename, processSPIFFSDeleteDir);
}

function processSPIFFSDeleteDir(answer) {
    if (answer == "yes") SPIFFSSendCommand("deletedir", SPIFFS_currentfile);
    SPIFFS_currentfile = "";
}

function SPIFFSSendCommand(action, filename) {
    //removeIf(production)
    var response = "{\"files\":[{\"name\":\"config.html.gz\",\"size\":\"4.76 KB\"},{\"name\":\"index.html.gz\",\"size\":\"21.44 KB\"},{\"name\":\"favicon.ico\",\"size\":\"1.12 KB\"},{\"name\":\"config.htm\",\"size\":\"19.65 KB\"},{\"name\":\"config2.htm\",\"size\":\"19.98 KB\"},{\"name\":\"Testname\",\"size\":\"-1\"},{\"name\":\"index2.html.gz\",\"size\":\"28.89 KB\"}],\"path\":\"/\",\"status\":\"Ok\",\"total\":\"2.81 MB\",\"used\":\"118.88 KB\",\"occupation\":\"4\"}";
    SPIFFSsuccess(response);
    return;
    //endRemoveIf(production)
    var url = "/files?action=" + action;
    url += "&filename=" + encodeURI(filename);
    url += "&path=" + encodeURI(SPIFFS_currentpath);
    document.getElementById('SPIFFS_loader').style.visibility = "visible";
    console.log(url);
    SendGetHttp(url, SPIFFSsuccess, SPIFFSfailed);

}

function SPIFFSsuccess(response) {
    //console.log(response);
    var jsonresponse = JSON.parse(response);
    document.getElementById('SPIFFS_loader').style.visibility = "hidden";
    document.getElementById('refreshSPIFFSbtn').style.display = 'block';
    document.getElementById("SPIFFS_select_files").style.display = 'block';
    SPIFFSdispatchfilestatus(jsonresponse);
}

function SPIFFSfailed(errorcode, response) {
    document.getElementById('SPIFFS_loader').style.visibility = "hidden";
    document.getElementById('refreshSPIFFSbtn').style.display = 'block';
    document.getElementById('refreshSPIFFSbtn').style.display = 'block';
    alertdlg(translate_text_item("Error"), "Error " + errorcode + " : " + response);
    console.log("Error " + errorcode + " : " + response);
}

function SPIFFSdispatchfilestatus(jsonresponse) {
    var content = "";
    content = translate_text_item("Total:") + " " + jsonresponse.total;
    content += "&nbsp;&nbsp;|&nbsp;&nbsp;" + translate_text_item("Used:") + " " + jsonresponse.used;
    content += "&nbsp;";
    content += "<meter min='0' max='100' high='90' value='" + jsonresponse.occupation + "'></meter>&nbsp;" + jsonresponse.occupation + "%";
    if (jsonresponse.status != "Ok") content += "<br>" + translate_text_item(jsonresponse.status);
    document.getElementById('SPIFFS_status').innerHTML = content;
    content = "";
    if (SPIFFS_currentpath != "/") {
        var pos = SPIFFS_currentpath.lastIndexOf("/", SPIFFS_currentpath.length - 2)
        var previouspath = SPIFFS_currentpath.slice(0, pos + 1);
        content += "<tr style='cursor:pointer;' onclick=\"SPIFFS_currentpath='" + previouspath + "'; SPIFFSSendCommand('list','all');\"><td >" + get_icon_svg("level-up") + "</td><td colspan='4'> Up..</td></tr>";
    }
    jsonresponse.files.sort(function(a, b) {
        return compareStrings(a.name, b.name);
    });

    for (var i = 0; i < jsonresponse.files.length; i++) {
        //first display files
        if (String(jsonresponse.files[i].size) != "-1") {
            content += "<tr>";
            content += "<td  style='vertical-align:middle; color:#5BC0DE'>" + get_icon_svg("file") + "</td>";
            content += "<td  width='100%'  style='vertical-align:middle'><a href=\"" + jsonresponse.path + jsonresponse.files[i].name + "\" target=_blank><button  class=\"btn btn-link no_overflow\">";
            content += jsonresponse.files[i].name;
            content += "</button></a></td><td nowrap  style='vertical-align:middle'>";
            content += jsonresponse.files[i].size;
            content += "</td><td width='0%'  style='vertical-align:middle'><button class=\"btn btn-danger btn-xs\" style='padding: 5px 5px 0px 5px;' onclick=\"SPIFFSDelete('" + jsonresponse.files[i].name + "')\">";
            content += get_icon_svg("trash");
            content += "</button></td></tr>";
        }
    }

    //then display directories
    for (var i = 0; i < jsonresponse.files.length; i++) {
        if (String(jsonresponse.files[i].size) == "-1") {
            content += "<tr>";
            content += "<td style='vertical-align:middle ; color:#5BC0DE'>" + get_icon_svg("folder-close") + "</td>";
            content += "<td width='100%'  style='vertical-align:middle'><button class=\"btn btn-link\" onclick=\"SPIFFSselect_dir('" + jsonresponse.files[i].name + "');\">";
            content += jsonresponse.files[i].name;
            content += "</button></td><td>";
            content += "</td><td width='0%' style='vertical-align:middle'><button class=\"btn btn-danger btn-xs\" style='padding: 5px 4px 0px 4px;' onclick=\"SPIFFSDeletedir('" + jsonresponse.files[i].name + "')\">";
            content += get_icon_svg("trash");
            content += "</button></td></tr>";
        }

    }

    document.getElementById('SPIFFS_file_list').innerHTML = content;
    document.getElementById('SPIFFS_path').innerHTML = SPIFFSnavbar();
}

function refreshSPIFFS() {
    document.getElementById('SPIFFS-select').value = "";
    document.getElementById('uploadSPIFFSmsg').innerHTML = "";
    document.getElementById("SPIFFS_file_name").innerHTML = translate_text_item("No file chosen");
    document.getElementById('SPIFFS_uploadbtn').style.display = 'none';
    document.getElementById('refreshSPIFFSbtn').style.display = 'none';
    document.getElementById("SPIFFS_select_files").style.display = 'none';
    //removeIf(production)
    var response = "{\"files\":[{\"name\":\"config.html.gz\",\"size\":\"4.76 KB\"},{\"name\":\"index.html.gz\",\"size\":\"21.44 KB\"},{\"name\":\"favicon.ico\",\"size\":\"1.12 KB\"},{\"name\":\"config.htm\",\"size\":\"19.65 KB\"},{\"name\":\"config2.htm\",\"size\":\"19.98 KB\"},{\"name\":\"Testname\",\"size\":\"-1\"},{\"name\":\"index2.html.gz\",\"size\":\"28.89 KB\"}],\"path\":\"/\",\"status\":\"Ok\",\"total\":\"2.81 MB\",\"used\":\"118.88 KB\",\"occupation\":\"4\"}";
    SPIFFSsuccess(response);
    return;
    //endRemoveIf(production)
    SPIFFSSendCommand('list', 'all');
}

function checkSPIFFSfiles() {
    var files = document.getElementById('SPIFFS-select').files;
    document.getElementById('uploadSPIFFSmsg').style.display = 'none';
    if (files.length == 0) document.getElementById('SPIFFS_uploadbtn').style.display = 'none';
    else document.getElementById('SPIFFS_uploadbtn').style.display = 'block';
    if (files.length > 0) {
        if (files.length == 1) {
            document.getElementById("SPIFFS_file_name").innerHTML = files[0].name;
        } else {
            var tmp = translate_text_item("$n files");
            document.getElementById("SPIFFS_file_name").innerHTML = tmp.replace("$n", files.length);
        }
    } else {
        document.getElementById("SPIFFS_file_name").innerHTML = translate_text_item("No file chosen");
    }
}

function SPIFFSUploadProgressDisplay(oEvent) {
    if (oEvent.lengthComputable) {
        var percentComplete = (oEvent.loaded / oEvent.total) * 100;
        document.getElementById('SPIFFS_prg').value = percentComplete;
        document.getElementById('uploadSPIFFSmsg').innerHTML = translate_text_item("Uploading ") + SPIFFS_currentfile + " " + percentComplete.toFixed(0) + "%";
    } else {
        // Impossible because size is unknown
    }
}

function SPIFFS_UploadFile() {
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        return;
    }
    var files = document.getElementById('SPIFFS-select').files
    var formData = new FormData();
    var url = "/files";
    formData.append('path', SPIFFS_currentpath);
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var arg = SPIFFS_currentpath + file.name + "S";
        //append file size first to check updload is complete
        formData.append(arg, file.size);
        formData.append('myfile[]', file, SPIFFS_currentpath + file.name);
    }
    document.getElementById('SPIFFS-select_form').style.display = 'none';
    document.getElementById('SPIFFS_uploadbtn').style.display = 'none';
    SPIFFS_upload_ongoing = true;
    document.getElementById('uploadSPIFFSmsg').style.display = 'block';
    document.getElementById('SPIFFS_prg').style.display = 'block';
    if (files.length == 1) SPIFFS_currentfile = files[0].name;
    else SPIFFS_currentfile = "";
    document.getElementById('uploadSPIFFSmsg').innerHTML = translate_text_item("Uploading ") + SPIFFS_currentfile;
    SendFileHttp(url, formData, SPIFFSUploadProgressDisplay, SPIFFSUploadsuccess, SPIFFSUploadfailed)
}

function SPIFFSUploadsuccess(response) {
    document.getElementById('SPIFFS-select').value = "";
    document.getElementById("SPIFFS_file_name").innerHTML = translate_text_item("No file chosen");
    document.getElementById('SPIFFS-select_form').style.display = 'block';
    document.getElementById('SPIFFS_prg').style.display = 'none';
    document.getElementById('SPIFFS_uploadbtn').style.display = 'none';
    document.getElementById('uploadSPIFFSmsg').innerHTML = "";
    document.getElementById('refreshSPIFFSbtn').style.display = 'block';
    SPIFFS_upload_ongoing = false;
    response = response.replace("\"status\":\"Ok\"", "\"status\":\"Upload done\"");
    var jsonresponse = JSON.parse(response);
    SPIFFSdispatchfilestatus(jsonresponse);
}

function SPIFFSUploadfailed(errorcode, response) {
    document.getElementById('SPIFFS-select_form').style.display = 'block';
    document.getElementById('SPIFFS_prg').style.display = 'none';
    document.getElementById('SPIFFS_uploadbtn').style.display = 'block';
    document.getElementById('uploadSPIFFSmsg').innerHTML = "";
    document.getElementById("uploadSPIFFSmsg").style.display = 'none';
    document.getElementById('refreshSPIFFSbtn').style.display = 'block';
    console.log("Error " + errorcode + " : " + response);
    if (esp_error_code !=0){
         alertdlg (translate_text_item("Error") + " (" + esp_error_code + ")", esp_error_message);
         document.getElementById('SPIFFS_status').innerHTML = translate_text_item("Error : ") + esp_error_message;
         esp_error_code = 0;
    } else {
        alertdlg (translate_text_item("Error"), "Error " + errorcode + " : " + response);
        document.getElementById('SPIFFS_status').innerHTML = translate_text_item("Upload failed : ") + errorcode;
    }
    SPIFFS_upload_ongoing = false;
    refreshSPIFFS();
}

var statuspage = 0;
var statuscontent = "";
//status dialog
function statusdlg() {
    var modal = setactiveModal('statusdlg.html');
    if (modal == null) return;
    showModal();
    refreshstatus();
    update_btn_status(0);
}

function next_status() {
    var modal = getactiveModal();
    var text = modal.element.getElementsByClassName("modal-text")[0];
    if (statuspage == 0) {
        text.innerHTML = statuscontent;
    } else {
        text.innerHTML = "<table><tr><td width='auto' style='vertical-align:top;'><label translate>Browser:</label></td><td>&nbsp;</td><td width='100%'><span class='text-info'><strong>" + navigator.userAgent + "</strong></span></td></tr></table>";
    }
    update_btn_status();
}

function update_btn_status(forcevalue) {
    if (typeof forcevalue !== 'undefined') {
        statuspage = forcevalue;
    }
    if (statuspage == 0) {
        statuspage = 1;
        document.getElementById('next_status_btn').innerHTML = get_icon_svg("triangle-right", "1em", "1em")
    } else {
        statuspage = 0;
        document.getElementById('next_status_btn').innerHTML = get_icon_svg("triangle-left", "1em", "1em")
    }
}

function statussuccess(response) {
    document.getElementById('refreshstatusbtn').style.display = 'block';
    document.getElementById('status_loader').style.display = 'none';
    var modal = getactiveModal();
    if (modal == null) return;
    var text = modal.element.getElementsByClassName("modal-text")[0];
    var tresponse = response.split("\n");
    statuscontent = "";
    for (var i = 0; i < tresponse.length; i++) {
        var data = tresponse[i].split(":");
        if (data.length >= 2) {
            statuscontent += "<label>" + translate_text_item(data[0]) + ": </label>&nbsp;<span class='text-info'><strong>";
            var data2 = data[1].split(" (")
            statuscontent += translate_text_item(data2[0].trim());
            for (v = 1; v < data2.length; v++) {
                statuscontent += " (" + data2[v];
            }
            for (v = 2; v < data.length; v++) {
                statuscontent += ":" + data[v];
            }
            statuscontent += "</strong></span><br>";
        } //else statuscontent += tresponse[i] + "<br>";
    }
    statuscontent += "<label>" + translate_text_item("WebUI version") + ": </label>&nbsp;<span class='text-info'><strong>";
    statuscontent += web_ui_version
    statuscontent += "</strong></span><br>";
    text.innerHTML = statuscontent;
    update_btn_status(0);
    //console.log(response);
}

function statusfailed(errorcode, response) {
    document.getElementById('refreshstatusbtn').style.display = 'block';
    document.getElementById('status_loader').style.display = 'none';
    document.getElementById('status_msg').style.display = 'block';
    console.log("Error " + errorcode + " : " + response);
    document.getElementById('status_msg').innerHTML = "Error " + errorcode + " : " + response;
}

function refreshstatus() {
    document.getElementById('refreshstatusbtn').style.display = 'none';
    document.getElementById('status_loader').style.display = 'block';
    var modal = getactiveModal();
    if (modal == null) return;
    var text = modal.element.getElementsByClassName("modal-text")[0];
    text.innerHTML = "";
    document.getElementById('status_msg').style.display = 'none';
    //removeIf(production)
    var response = "Chip ID: 13874112\nCPU Frequency: 160Mhz\nFree memory: 24.23 KB\nSDK: 2.0.0(656edbf)\nFlash Size: 4.00 MB\nAvailable Size for update: 652.17 KB(Ok)\nAvailable Size for SPIFFS: 3.00 MB\nBaud rate: 115200\nSleep mode: None\nChannel: 1\nPhy Mode: 11g\nWeb port: 80\nData port: 8888\nHostname: lucesp\nActive Mode: Station (5C:CF:7F:D3:B3:C0)\nConnected to: NETGEAR_2GEXT_OFFICE2\nSignal: 98%\nIP Mode: DHCP\nIP: 192.168.1.51\nGateway: 192.168.1.1\nMask: 255.255.255.0\nDNS: 192.168.1.1\nDisabled Mode: Access Point (5E:CF:7F:D3:B3:C0)\nCaptive portal: Enabled\nSSDP: Enabled\nNetBios: Enabled\nmDNS: Enabled\nWeb Update: Enabled\nPin Recovery: Disabled\nAuthentication: Disabled\nTarget Firmware: Smoothieware\nSD Card Support: Enabled\nFW version: 0.9.93\n";
    statussuccess(response);
    //statusfailed(500, "Error")
    return;
    //endRemoveIf(production)
    var url = "/command?plain=" + encodeURIComponent("[ESP420]plain");;
    SendGetHttp(url, statussuccess, statusfailed)
}

function opentab(evt, tabname, tabcontentid, tablinkid) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        if (tabcontent[i].parentNode.id == tabcontentid) {
            tabcontent[i].style.display = "none";
        }
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        if (tablinks[i].parentNode.id == tablinkid) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
    }
    document.getElementById(tabname).style.display = "block";
    evt.currentTarget.className += " active";
}
var interval_temperature = -1;
var graph_started = false;

var smoothieextuder = new SmoothieChart({
  millisPerPixel: 200,
  maxValueScale: 1.1,
  minValueScale: 1.1,
  enableDpiScaling: false,
  interpolation: "linear",
  grid: {
    fillStyle: "#ffffff",
    strokeStyle: "rgba(128,128,128,0.5)",
    verticalSections: 5,
    millisPerLine: 0,
    borderVisible: false,
  },
  labels: {
    fillStyle: "#000000",
    precision: 1,
  },
});
var smoothiebed = new SmoothieChart({
  millisPerPixel: 200,
  interpolation: "linear",
  maxValueScale: 1.1,
  minValueScale: 1.1,
  enableDpiScaling: false,
  grid: {
    fillStyle: "#ffffff",
    strokeStyle: "rgba(128,128,128,0.5)",
    verticalSections: 5,
    millisPerLine: 0,
    borderVisible: false,
  },
  labels: {
    fillStyle: "#000000",
    precision: 1,
  },
});
var extruder_0_line = new TimeSeries();
var extruder_1_line = new TimeSeries();
var extruder_redundant_line = new TimeSeries();
var probe_line = new TimeSeries();
var bed_line = new TimeSeries();
var chamber_line = new TimeSeries();

function init_temperature_panel() {
  smoothiebed.addTimeSeries(bed_line, {
    lineWidth: 1,
    strokeStyle: "#808080",
    fillStyle: "rgba(128,128,128,0.3)",
  });
  smoothieextuder.addTimeSeries(extruder_0_line, {
    lineWidth: 1,
    strokeStyle: "#ff8080",
    fillStyle: "rgba(255,128,128,0.3)",
  });
  smoothieextuder.streamTo(
    document.getElementById("extruderTempgraph"),
    3000 /*delay*/
  );
  smoothiebed.streamTo(document.getElementById("bedTempgraph"), 3000 /*delay*/);
}

function temperature_second_extruder(enabled) {
  if (enabled) {
    smoothieextuder.addTimeSeries(extruder_1_line, {
      lineWidth: 1,
      strokeStyle: "#000080",
    });
  } else {
    smoothieextuder.removeTimeSeries(extruder_1_line);
  }
}

function temperature_extruder_redundant(enabled) {
  if (enabled) {
    smoothieextuder.addTimeSeries(extruder_redundant_line, {
      lineWidth: 1,
      strokeStyle: "#808080",
    });
  } else {
    smoothieextuder.removeTimeSeries(extruder_redundant_line);
  }
}

function temperature_probe(enabled) {
  if (enabled) {
    smoothiebed.addTimeSeries(probe_line, {
      lineWidth: 1,
      strokeStyle: "#202080",
    });
  } else {
    smoothiebed.removeTimeSeries(probe_line);
  }
}

function temperature_chamber(enabled) {
  if (enabled) {
    smoothiebed.addTimeSeries(chamber_line, {
      lineWidth: 1,
      strokeStyle: "#202020",
    });
  } else {
    smoothiebed.removeTimeSeries(chamber_line);
  }
}

function start_graph_output() {
  document.getElementById("temperatures_output").style.display = "block";
  smoothieextuder.start();
  smoothiebed.start();
  graph_started = true;
}

function stop_graph_output() {
  smoothieextuder.stop();
  smoothiebed.stop();
  graph_started = false;
}

function on_autocheck_temperature(use_value) {
  if (typeof use_value !== "undefined")
    document.getElementById("autocheck_temperature").checked = use_value;
  if (document.getElementById("autocheck_temperature").checked) {
    var interval = parseInt(
      document.getElementById("tempInterval_check").value
    );
    if (!isNaN(interval) && interval > 0 && interval < 100) {
      if (interval_temperature != -1) clearInterval(interval_temperature);
      interval_temperature = setInterval(function () {
        get_Temperatures();
      }, interval * 1000);
      start_graph_output();
    } else {
      document.getElementById("autocheck_temperature").checked = false;
      document.getElementById("tempInterval_check").value = 0;
      if (interval_temperature != -1) clearInterval(interval_temperature);
      interval_temperature = -1;
      stop_graph_output();
    }
  } else {
    if (interval_temperature != -1) clearInterval(interval_temperature);
    interval_temperature = -1;
    stop_graph_output();
  }
}

function onTempIntervalChange() {
  var interval = parseInt(document.getElementById("tempInterval_check").value);
  if (!isNaN(interval) && interval > 0 && interval < 100) {
    on_autocheck_temperature();
  } else {
    document.getElementById("autocheck_temperature").checked = false;
    document.getElementById("tempInterval_check").value = 0;
    if (interval != 0)
      alertdlg(
        translate_text_item("Out of range"),
        translate_text_item("Value of auto-check must be between 0s and 99s !!")
      );
    on_autocheck_temperature();
  }
}

function get_Temperatures() {
  var command = "M105";
  command =
    preferenceslist[0].enable_redundant === "true" &&
    supportsRedundantTemperatures()
      ? command + " R"
      : command;
  //removeIf(production)
  var response = "";
  if (document.getElementById("autocheck_temperature").checked)
    response = "ok T:26.4 /0.0 T1:26.4 /0.0 @0 B:24.9 /0.0 @0 \n";
  else response = "ok T:26.4 /0.0 @0 B:24.9 /0.0 @0\n ";
  process_Temperatures(response);
  return;
  //endRemoveIf(production)
  if (target_firmware == "marlin-embedded")
    SendPrinterCommand(command, false, null, null, 105, 1);
  else SendPrinterCommand(command, false, process_Temperatures, null, 105, 1);
}

function submit_target_temperature(target, selectedTemp) {
  var type = 104;
  if (target == "bed") {
    type = 140;
  } else if (target == "chamber") {
    type = 141;
  }
  var command = "M" + type + " S" + selectedTemp;
  if (target != "bed" && target != "chamber") {
    command += " " + target;
  }
  SendPrinterCommand(command, true, get_Temperatures);
}

function process_Temperatures(response) {
  var regex_temp = /(B|C|P|R|T(\d*)):\s*([+]?[0-9]*\.?[0-9]+)? (\/)([+]?[0-9]*\.?[0-9]+)?/gi;
  var result;
  var timedata = new Date().getTime();
  while ((result = regex_temp.exec(response)) !== null) {
    var tool = result[1];
    var value = "<span>" + parseFloat(result[3]).toFixed(2).toString() + "°C";
    var value2;
    if (isNaN(parseFloat(result[5]))) value2 = "0.00";
    else value2 = parseFloat(result[5]).toFixed(2).toString();
    value += "</span>&nbsp;<span>|</span>&nbsp;" + value2 + "°C</span>";
    //console.log(tool, ":", result[3]);
    if (tool == "T" || tool == "T0") {
      //to push to graph
      extruder_0_line.append(timedata, parseFloat(result[3]));
      document.getElementById("heaterT0DisplayTemp").innerHTML = value;
      //to see if heating or not
      if (Number(value2) > 0)
        document.getElementById("heaterT0TargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("heaterT0TargetTemp_anime").style.visibility =
          "hidden";
    } else if (tool == "R") {
      extruder_redundant_line.append(timedata, parseFloat(result[3]));
      document.getElementById("heaterRDisplayTemp").innerHTML = value;
      if (Number(value2) > 0)
        document.getElementById("heaterRTargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("heaterRTargetTemp_anime").style.visibility =
          "hidden";
    } else if (tool == "T1") {
      extruder_1_line.append(timedata, parseFloat(result[3]));
      document.getElementById("heaterT1DisplayTemp").innerHTML = value;
      if (Number(value2) > 0)
        document.getElementById("heaterT1TargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("heaterT1TargetTemp_anime").style.visibility =
          "hidden";
    } else if (tool == "P") {
      probe_line.append(timedata, parseFloat(result[3]));
      document.getElementById("probeDisplayTemp").innerHTML = value;
      if (Number(value2) > 0)
        document.getElementById("probeTargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("probeTargetTemp_anime").style.visibility =
          "hidden";
    } else if (tool == "B") {
      bed_line.append(timedata, parseFloat(result[3]));
      document.getElementById("bedDisplayTemp").innerHTML = value;
      if (Number(value2) > 0)
        document.getElementById("bedTargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("bedTargetTemp_anime").style.visibility =
          "hidden";
    } else if (tool == "C") {
      chamber_line.append(timedata, parseFloat(result[3]));
      document.getElementById("chamberDisplayTemp").innerHTML = value;
      if (Number(value2) > 0)
        document.getElementById("chamberTargetTemp_anime").style.visibility =
          "visible";
      else
        document.getElementById("chamberTargetTemp_anime").style.visibility =
          "hidden";
    }
  }
}

function temperature_heatOff(target) {
  switch (target) {
    case "T0":
      document.getElementById("heaterT0SelectedTemp").value = 0;
      document.getElementById("heaterT0TargetTemp_anime").style.visibility =
        "hidden";
      document.getElementById("heaterRDisplayTemp").value = 0;
      document.getElementById("heaterRTargetTemp_anime").style.visibility =
        "hidden";
      break;
    case "T1":
      document.getElementById("heaterT1SelectedTemp").value = 0;
      document.getElementById("heaterT1TargetTemp_anime").style.visibility =
        "hidden";
      break;
    case "bed":
      document.getElementById("bedSelectedTemp").value = 0;
      document.getElementById("bedTargetTemp_anime").style.visibility =
        "hidden";
      break;
    case "chamber":
      document.getElementById("chamberSelectedTemp").value = 0;
      document.getElementById("chamberTargetTemp_anime").style.visibility =
        "hidden";
      break;
  }

  submit_target_temperature(target, 0);
}

function temperature_handleKeyUp(event, target) {
  if (event.keyCode == 13) {
    temperature_heatSet(target);
  }
  return true;
}

function temperature_heatSet(target) {
  var selectedTemp = 0;
  switch (target) {
    case "T0":
      selectedTemp = parseInt(
        document.getElementById("heaterT0SelectedTemp").value
      );
      if (
        selectedTemp < 0 ||
        selectedTemp > 999 ||
        isNaN(selectedTemp) ||
        selectedTemp === null
      ) {
        alertdlg(
          translate_text_item("Out of range"),
          translate_text_item(
            "Value must be between 0 degrees and 999 degrees !"
          )
        );
        return;
      }
      break;
    case "T1":
      selectedTemp = parseInt(
        document.getElementById("heaterT1SelectedTemp").value
      );
      if (
        selectedTemp < 0 ||
        selectedTemp > 999 ||
        isNaN(selectedTemp) ||
        selectedTemp === null
      ) {
        alertdlg(
          translate_text_item("Out of range"),
          translate_text_item(
            "Value must be between 0 degrees and 999 degrees !"
          )
        );
        return;
      }
      break;
    case "bed":
      selectedTemp = parseInt(document.getElementById("bedSelectedTemp").value);
      if (
        selectedTemp < 0 ||
        selectedTemp > 999 ||
        isNaN(selectedTemp) ||
        selectedTemp === null
      ) {
        alertdlg(
          translate_text_item("Out of range"),
          translate_text_item(
            "Value must be between 0 degrees and 999 degrees !"
          )
        );
        return;
      }
      break;
    case "chamber":
      selectedTemp = parseInt(
        document.getElementById("chamberSelectedTemp").value
      );
      if (
        selectedTemp < 0 ||
        selectedTemp > 999 ||
        isNaN(selectedTemp) ||
        selectedTemp === null
      ) {
        alertdlg(
          translate_text_item("Out of range"),
          translate_text_item(
            "Value must be between 0 degrees and 999 degrees !"
          )
        );
        return;
      }
      break;
  }

  submit_target_temperature(target, selectedTemp);
}

function supportsRedundantTemperatures() {
  return (
    target_firmware == "marlin-embedded" ||
    target_firmware == "marlin" ||
    target_firmware == "smoothieware"
  );
}

function supportsProbeTemperatures() {
  return (
    target_firmware == "marlin-embedded" ||
    target_firmware == "marlin" ||
    target_firmware == "smoothieware"
  );
}

function supportsChamberTemperatures() {
  return (
    target_firmware == "marlin-embedded" ||
    target_firmware == "marlin" ||
    target_firmware == "marlinkimbra" ||
    target_firmware == "smoothieware"
  );
}

var language = 'en';


var language_list = [
//removeIf(de_lang_disabled)
    ['de', 'Deutsch', 'germantrans'],
//endRemoveIf(de_lang_disabled)
//removeIf(en_lang_disabled)
    ['en', 'English', 'englishtrans'],
//endRemoveIf(en_lang_disabled)
//removeIf(es_lang_disabled)
    ['es', 'Espa&ntilde;ol', 'spanishtrans'],
//endRemoveIf(es_lang_disabled)
//removeIf(fr_lang_disabled)
    ['fr', 'Fran&ccedil;ais', 'frenchtrans'],
//endRemoveIf(fr_lang_disabled)
//removeIf(it_lang_disabled)
    ['it', 'Italiano', 'italiantrans'],
//endRemoveIf(it_lang_disabled)
//removeIf(ja_lang_disabled)
    ['ja', '&#26085;&#26412;&#35486;', 'japanesetrans'],
//endRemoveIf(ja_lang_disabled)
//removeIf(hu_lang_disabled)
    ['hu', 'Magyar', 'hungariantrans'],
//endRemoveIf(hu_lang_disabled)
//removeIf(pl_lang_disabled)
    ['pl', 'Polski', 'polishtrans'],
//endRemoveIf(pl_lang_disabled)
//removeIf(ptbr_lang_disabled)
    ['ptbr', 'Português-Br', 'ptbrtrans'],
//endRemoveIf(ptbr_lang_disabled)
//removeIf(ru_lang_disabled)
    ['ru', 'Русский', 'russiantrans'],
//endRemoveIf(ru_lang_disabled)
//removeIf(tr_lang_disabled)
    ['tr', 'T&uuml;rk&ccedil;e', 'turkishtrans'],
//endRemoveIf(tr_lang_disabled)
//removeIf(uk_lang_disabled)
    ['uk', 'Українська', 'ukrtrans'],
//endRemoveIf(uk_lang_disabled)
//removeIf(zh_cn_lang_disabled)
    ['zh_CN', '&#31616;&#20307;&#20013;&#25991;', 'zh_CN_trans'],
//endRemoveIf(zh_cn_lang_disabled)
//removeIf(zh_tw_lang_disabled)
    ['zh_TW', '&#32321;&#39636;&#20013;&#25991;;', 'zh_TW_trans'],
//endRemoveIf(zh_tw_lang_disabled)
];

//removeIf(production)
var translated_list = [];
//endRemoveIf(production)

function build_language_list(id_item) {
    var content = "<select class='form-control'  id='" + id_item + "' onchange='translate_text(this.value)'>\n";
    for (var lang_i = 0; lang_i < language_list.length; lang_i++) {
        content += "<option value='" + language_list[lang_i][0] + "'";
        if (language_list[lang_i][0] == language) content += " selected";
        content += ">" + language_list[lang_i][1] + "</option>\n";
    }
    content += "</select>\n";
    return content;
}

function translate_text(lang) {
    var currenttrans = {};
    var translated_content = "";
    language = lang;
    for (var lang_i = 0; lang_i < language_list.length; lang_i++) {
        if (language_list[lang_i][0] == lang) {
            currenttrans = eval(language_list[lang_i][2]);
        }
    }
    var All = document.getElementsByTagName('*');
    for (var i = 0; i < All.length; i++) {
        if (All[i].hasAttribute('translate')) {
            var content = "";
            if (!All[i].hasAttribute('english_content')) {
                content = All[i].innerHTML;
                content.trim();
                All[i].setAttribute('english_content', content);
                //removeIf(production)        
                var item = {
                    content: content
                };
                translated_list.push(item);
                //endRemoveIf(production)
            }
            content = All[i].getAttribute('english_content');
            translated_content = translate_text_item(content);

            All[i].innerHTML = translated_content;
        }
        //add support for placeholder attribut
        if (All[i].hasAttribute('translateph') && All[i].hasAttribute('placeholder')) {
            var content = "";
            if (!All[i].hasAttribute('english_content')) {
                content = All[i].getAttribute('placeholder');
                content.trim();
                //removeIf(production) 
                var item = {
                    content: content
                };
                translated_list.push(item);
                //endRemoveIf(production)
                All[i].setAttribute('english_content', content);
            }
            content = All[i].getAttribute('english_content');

            translated_content = decode_entitie(translate_text_item(content));
            All[i].setAttribute('placeholder', translated_content)
        }
    }
};

function translate_text_item(item_text, withtag) {
    var currenttrans = {};
    var translated_content;
    var with_tag = false;
    if (typeof withtag != "undefined") with_tag = withtag;
    for (var lang_i = 0; lang_i < language_list.length; lang_i++) {
        if (language_list[lang_i][0] == language) {
            currenttrans = eval(language_list[lang_i][2]);
        }
    }
    translated_content = currenttrans[item_text];
    if (typeof translated_content === 'undefined') translated_content = item_text;
    if (with_tag) {
        var translated_content_tmp = "<span english_content=\"" + item_text + "\" translate>" + translated_content + "</span>";
        translated_content = translated_content_tmp;
    }
    return translated_content;
}

//UIdisabled dialog
function UIdisableddlg(lostcon) {
    var modal = setactiveModal('UIdisableddlg.html');
    if (modal == null) return;
    if (lostcon) {
        document.getElementById('disconnection_msg').innerHTML = translate_text_item("Connection lost for more than 20s");
    }
    showModal();
}
var update_ongoing = false;
var current_update_filename = "";
//update dialog
function updatedlg() {
    var modal = setactiveModal('updatedlg.html');
    if (modal == null) return;
    document.getElementById("fw_file_name").innerHTML = translate_text_item("No file chosen");
    document.getElementById('prgfw').style.display = 'none';
    document.getElementById('uploadfw-button').style.display = 'none';
    document.getElementById('updatemsg').innerHTML = "";
    document.getElementById('fw-select').value = "";
    if (target_firmware == "grbl-embedded") document.getElementById('fw_update_dlg_title').innerHTML = translate_text_item("ESP3D Update").replace("ESP3D", "GRBL_ESP32");
    if (target_firmware == "marlin-embedded") document.getElementById('fw_update_dlg_title').innerHTML = translate_text_item("ESP3D Update").replace("ESP3D", "Marlin");
    showModal();
}

function closeUpdateDialog(msg) {
    if (update_ongoing) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Update is ongoing, please wait and retry."));
        return;
    }
    closeModal(msg);
}

function checkupdatefile() {
    var files = document.getElementById('fw-select').files;
    document.getElementById('updatemsg').style.display = 'none';
    if (files.length == 0) document.getElementById('uploadfw-button').style.display = 'none';
    else document.getElementById('uploadfw-button').style.display = 'block';
    if (files.length > 0) {
        if (files.length == 1) {
            document.getElementById("fw_file_name").innerHTML = files[0].name;
        } else {
            var tmp = translate_text_item("$n files");
            document.getElementById("fw_file_name").innerHTML = tmp.replace("$n", files.length);
        }
    } else {
        document.getElementById("fw_file_name").innerHTML = translate_text_item("No file chosen");
    }
}


function UpdateProgressDisplay(oEvent) {
    if (oEvent.lengthComputable) {
        var percentComplete = (oEvent.loaded / oEvent.total) * 100;
        document.getElementById('prgfw').value = percentComplete;
        document.getElementById('updatemsg').innerHTML = translate_text_item("Uploading ") + current_update_filename + " " + percentComplete.toFixed(0) + "%";
    } else {
        // Impossible because size is unknown
    }
}

function UploadUpdatefile() {
    confirmdlg(translate_text_item("Please confirm"), translate_text_item("Update Firmware ?"), StartUploadUpdatefile)
}



function StartUploadUpdatefile(response) {
    if (response != "yes") return;
    if (http_communication_locked) {
        alertdlg(translate_text_item("Busy..."), translate_text_item("Communications are currently locked, please wait and retry."));
        return;
    }
    var files = document.getElementById('fw-select').files
    var formData = new FormData();
    var url = "/updatefw";
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var arg = "/" + file.name + "S";
        //append file size first to check updload is complete
        formData.append(arg, file.size);
        formData.append('myfile[]', file, "/" + file.name);
    }
    document.getElementById('fw-select_form').style.display = 'none';
    document.getElementById('uploadfw-button').style.display = 'none';
    update_ongoing = true;
    document.getElementById('updatemsg').style.display = 'block';
    document.getElementById('prgfw').style.display = 'block';
    if (files.length == 1) current_update_filename = files[0].name;
    else current_update_filename = "";
    document.getElementById('updatemsg').innerHTML = translate_text_item("Uploading ") + current_update_filename;
    SendFileHttp(url, formData, UpdateProgressDisplay, updatesuccess, updatefailed)
}

function updatesuccess(response) {
    document.getElementById('updatemsg').innerHTML = translate_text_item("Restarting, please wait....");
    document.getElementById("fw_file_name").innerHTML = "";
    var i = 0;
    var interval;
    var x = document.getElementById("prgfw");
    x.max = 40;
    interval = setInterval(function() {
        i = i + 1;
        var x = document.getElementById("prgfw");
        x.value = i;
        document.getElementById('updatemsg').innerHTML = translate_text_item("Restarting, please wait....") + (41 - i) + translate_text_item(" seconds");
        if (i > 40) {
            update_ongoing = false;
            clearInterval(interval);
            location.reload();
        }
    }, 1000);
    //console.log(response);
}

function updatefailed(errorcode, response) {
    document.getElementById('fw-select_form').style.display = 'block';
    document.getElementById('prgfw').style.display = 'none';
    document.getElementById("fw_file_name").innerHTML = translate_text_item("No file chosen");
    document.getElementById('uploadfw-button').style.display = 'none';
    //document.getElementById('updatemsg').innerHTML = "";
    document.getElementById('fw-select').value = "";
    if (esp_error_code !=0){
        alertdlg (translate_text_item("Error") + " (" + esp_error_code + ")", esp_error_message);
        document.getElementById('updatemsg').innerHTML = translate_text_item("Upload failed : ") + esp_error_message;
        esp_error_code = 0;
    } else {
       alertdlg (translate_text_item("Error"), "Error " + errorcode + " : " + response);
       document.getElementById('updatemsg').innerHTML = translate_text_item("Upload failed : ") + errorcode + " :" + response;
    }
    console.log("Error " + errorcode + " : " + response);
    update_ongoing = false;
    SendGetHttp("/updatefw");
}

var can_revert_wizard = false;

function openstep(evt, stepname) {
    var i, stepcontent, steplinks;
    if (evt.currentTarget.className.indexOf("wizard_done") > -1 && !can_revert_wizard) return;
    stepcontent = document.getElementsByClassName("stepcontent");
    for (i = 0; i < stepcontent.length; i++) {
        stepcontent[i].style.display = "none";
    }
    steplinks = document.getElementsByClassName("steplinks");
    for (i = 0; i < steplinks.length; i++) {
        steplinks[i].className = steplinks[i].className.replace(" active", "");
    }
    document.getElementById(stepname).style.display = "block";
    evt.currentTarget.className += " active";
}
//removeIf(de_lang_disabled)
//german
var germantrans = {
"de":"Deutsch",
"ESP3D for":"ESP3D f&uuml;r",
"Value of auto-check must be between 0s and 99s !!":"Der Wert des Auto-Checks muss zwischen 0s und 99s liegen!!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"Der Wert der Extrudergeschwindigkeit muss zwischen 1 mm/min und 9999 mm/min liegen!",
"Value of filament length must be between 0.001 mm and 9999 mm !":"Der Wert der Filamentl&auml;nge muss zwischen 0.001mm und 9999mm liegen!",
"cannot have '-', '#' char or be empty":"'-', '#' d&uuml;fen nicht benutzt werden oder leer sein",
"cannot have '-', 'e' char or be empty":"'-', 'e' d&uuml;fen nicht benutzt werden oder leer sein",
"Failed:":"Fehlgeschlagen:",
"File config / config.txt not found!":"Die Datei config / config.txt wurde nicht gefunden!",
"File name cannot be empty!":"Dateiname darf nicht leer sein!",
"Value must be ":"Wert muss sein ",
"Value must be between 0 degres and 999 degres !":"Der Wert muss zwischen 0 und 999 Grad liegen!",
"Value must be between 0% and 100% !":"Der Wert muss zwischen 0% und 100% liegen!",
"Value must be between 25% and 150% !":"Der Wert muss zwischen 25% und 150% liegen!",
"Value must be between 50% and 300% !":"Der Wert muss zwischen 50% und 300% liegen!",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"Die XY-Vorschubgeschwindigkeit muss zwischen 1 mm/min und 9999 mm/min liegen!",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Die Z-Vorschubgeschwindigkeit muss zwischen 1mm/min und 999 mm/min liegen !",
" seconds":" Sekunden",
"Abort":"Abbruch",
"auto-check every:":"Auto-Check alle:",
"auto-check position every:":"Auto-Check der Position alle:",
"Autoscroll":"Automatisch scrollen",
"Redundant":"Redundant",
"Probe":"Sensor",
"Bed":"Heizbett",
"Chamber":"Chamber",
"Board":"Board",
"Busy...":"Ausgelastet...",
"Camera":"Kamera",
"Cancel":"Abbrechen",
"Cannot get EEPROM content!":"EEPROM-Inhalt kann nicht ausgelesen werden!",
"Clear":"L&ouml;schen",
"Close":"Schlie&szlig;en",
"Color":"Farbe",
"Commands":"Befehle",
"Communication locked by another process, retry later.":"Kommunikation wird durch einen anderen Prozess blockiert, sp&auml;ter noch einmal versuchen.",
"Communication locked!":"Kommunikation gesperrt!",
"Communications are currently locked, please wait and retry.":"Kommunikation vorr&uuml;bergehen gesperrt, bitte warten und erneut versuchen!",
"Confirm deletion of directory: ":"Best&auml;tigen, um das Verzeichnis zu l&ouml;schen: ",
"Confirm deletion of file: ":"Best&auml;tigen, um diese Datei zu l&ouml;schen: ",
"Connecting ESP3D...":"Verbindungsaufbau ESP3D...",
"Connection failed! is your FW correct?":"Verbindung fehlgeschlagen! Richtige Firmware ausgew&auml;hlt?",
"Controls":"Steuerung",
"Credits":"Credits",
"Dashboard":"Dashboard",
"Data modified":"Daten ge&auml;ndert",
"Do you want to save?":"M&ouml;chten Sie speichern?",
"Enable second extruder controls":"Zweiten Extruder aktivieren",
"Error":"Fehler",
"ESP3D Filesystem":"ESP3D-Dateisystem",
"ESP3D Settings":"ESP3D-Einstellungen",
"ESP3D Status":"ESP3D-Status",
"ESP3D Update":"ESP3D-Aktualisierung",
"Extrude":"Extrudieren",
"Extruder T0":"Extruder T0",
"Extruder T1":"Extruder T1",
"Extruders":"Extruder",
"Fan (0-100%)":"L&uuml;fter (0-100%)",
"Feed (25-150%)":"Vorschub (25-150%)",
"Feedrate :":"Vorschubgeschwindigkeit :",
"Filename":"Dateiname",
"Filename/URI":"Dateiname/URI",
"Verbose mode":"Verbose-Modus",
"Firmware":"Firmware",
"Flow (50-300%)":"Fluss (50-300%)",
"Heater T0":"Hotend T0",
"Heater T1":"Hotend T1",
"Help":"Hilfe",
"Icon":"Icon",
"Interface":"Schnittstelle",
"Join":"Verbinden",
"Label":"Beschreibung",
"List of available Access Points":"Liste der verf&uuml;gbaren Zugangspunkte",
"Macro Editor":"Marco-Editor",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Motoren ausschalten",
"Name":"Name",
"Name:":"Name:",
"Network":"Netzwerk",
"No SD card detected":"Keine SD Karte gefunden",
"No":"Nein",
"Occupation:":"Belegt",
"Ok":"Ok",
"Options":"Optionen",
"Out of range":"Ausser Reichweite",
"Please Confirm":"Bitte Best&auml;tigen",
"Please enter directory name":"Bitte Verzeichnisnamen eingeben",
"Please wait...":"Bitte warten...",
"Printer configuration":"Drucker-Konfiguration",
"GRBL configuration":"GRBL-Konfiguration",
"Printer":"Drucker",
"Progress":"Fortschritt",
"Protected":"Gesichert",
"Refresh":"Aktualisieren",
"Restart ESP3D":"ESP3D neu starten",
"Restarting ESP3D":"ESP3D started neu",
"Restarting":"Started neu",
"Restarting, please wait....":"Neustart, bitte warten...",
"Retry":"Wiederholen",
"Reverse":"R&uuml;ckgängig",
"Save macro list failed!":"Speichern der Macros fehlgeschlagen!",
"Save":"Gespeichert",
"Saving":"Speichern",
"Scanning":"Scannen",
"SD Files":"Dateien SD-Karte",
"sec":"Sek",
"Send Command...":"Befehl gesendet...",
"Send":"Senden",
"Set failed":"Speichern fehlgeschlagen",
"Set":"Einstellen",
"Signal":"Signal",
"Size":"Gr&ouml;&szlig;e",
"Target":"Ziel",
"SSID":"SSID",
"Temperatures":"Temperatur",
"Total:":"Total:",
"Type":"Typ",
"Update Firmware ?":"Firmware updaten?",
"Update is ongoing, please wait and retry.":"Update wird gerade durchgeführt. Bitte warten und sp&auml;ter erneut versuchen.",
"Update":"Update",
"Upload failed":"Hochladen fehlgeschlagen",
"Upload":"Hochladen",
"Uploading ":"Hochladen.. ",
"Upload done":"Hochladen beendet",
"Used:":"Benutzt:",
"Value | Target":"Wert | Ziel",
"Value":"Wert",
"Occupation:":"Belegung:",
"Wrong data":"Falsche Daten",
"Yes":"Ja",
"Light":"Licht",
"None":"Keine",
"Modem":"Modem",
"STA":"Station",
"AP":"Access Point",
"Baud Rate":"Baudrate",
"Sleep Mode":"Schlafmodus",
"Web Port":"Web-Port",
"Data Port":"Data-Port",
"Hostname":"Hostname",
"Wifi mode":"Wifi-Modus",
"Station SSID":"Station SSID",
"Station Password":"Station Passwort",
"Station Network Mode":"Stations-Modus",
"Station IP Mode":"Station IP-Modus",
"DHCP":"Dynamisch (DHCP)",
"Static":"Statisch",
"Station Static IP":"Station statische IP",
"Station Static Mask":"Station statische Maske",
"Station Static Gateway":"Station statisches Gateway",
"AP SSID":"AP SSID",
"AP Password":"AP Passwort",
"AP Network Mode":"AP Netzwerk Modus",
"SSID Visible":"SSID Sichtbar",
"AP Channel":"AP Channel",
"Open":"Offen",
"Authentication":"Authentifizierung",
"AP IP Mode":"AP IP-Modus",
"AP Static IP":"AP statische IP",
"AP Static Mask":"AP statische Maske",
"AP Static Gateway":"AP statisches Gateway",
"Time Zone":"Zeitzone",
"Day Saving Time":"Sommerzeit",
"Time Server 1":"Zeitserver 1",
"Time Server 2":"Zeitserver 2",
"Time Server 3":"Zeitserver 3",
"TargetFW":"Zielfirmware",
"Direct SD access":"Direkter SD-Zugriff",
"Direct SD Boot Check":"Direkter SD-Boot-Check",
"Primary SD":"Prim&auml;re SD",
"Secondary SD":"Sekund&auml;re SD",
"Temperature Refresh Time":"Temperaturintervall",
"Position Refresh Time":"Positionsintervall",
"Status Refresh Time":"Status-Intervall",
"XY feedrate":"XY Vorschubgeschw.",
"Z feedrate":"Z Vorschubgeschw.",
"E feedrate":"E Vorschubgeschw.",
"Camera address":"Kamera IP-Adresse",
"Setup":"Setup",
"Start setup":"Setup starten",
"This wizard will help you to configure the basic settings.":"Dieser Assistent hilft Ihnen bei der Konfiguration der Grundeinstellungen.",
"Press start to proceed.":"Klicken Sie Start, um zu beginnen",
"Save your printer's firmware base:":"Speichern Sie die Grundeinstellungen:",
"This is mandatory to get ESP working properly.":"Dies ist notwendig, damit der ESP richtig funktioniert.",
"Save your printer's board current baud rate:":"Speichern die Baudrate Ihres Druckers:",
"Printer and ESP board must use same baud rate to communicate properly.":"Der Drucker und das ESP m&uuml;ssen die selbe Baudrate nutzen, um kommunizieren zu k&ouml;nnen.",
"Continue":"Weiter",
"WiFi Configuration":"WiFi-Konfiguration",
"Define ESP role:":"Definiere WLAN-Modus:",
"AP define access point / STA allows to join existing network":"AP definiere Access Point / STA erm&ouml;glicht es einem bestehendem Netzwerk beizutreten",
"What access point ESP need to be connected to:":"Mit welchem Netzwerk soll der ESP verbunden werden:",
"You can use scan button, to list available access points.":"Mit dem Scan-Button erhalten Sie eine Liste der verf&uuml;gbaren Access Points.",
"Password to join access point:":"Passwort um dem Access Point beizutreten:",
"Define ESP name:":"ESP Name:",
"What is ESP access point SSID:":"Wie lautet die SSID des ESPs:",
"Password for access point:": "Passwort für Access Point:",
"Define security:":"Sicherheit definieren:",
"SD Card Configuration":"SD-Karten-Konfiguration",
"Is ESP connected to SD card:":"Ist der ESP mit einer SD-Karte verbunden:",
"Check update using direct SD access:":"Updates über direkten SD-Karten-Zugriff prüfen:",
"SD card connected to ESP":"SD Karte verbunden mit ESP",
"SD card connected to printer":"SD Karte verbunden mit Drucker",
"Setup is finished.":"Setup beendet.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Nach dem Schliessen k&ouml;nnen Sie jederzeit &Auml;nderungen oder Feineinstellungen im Hauptmen&uuml; durchf&uuml;hren",
"You may need to restart the board to apply the new settings and connect again.":"Sie m&uuml;ssen das Board eventuell neu starten und sich erneut verbinden, damit die neuen Einstellungen wirksam werden",
"Identification requested":"Anmeldung erforderlich",
"admin":"Admin",
"user":"Benutzer",
"guest":"Gast",
"Identification invalid!":"Anmeldung ung&uuml;ltig!",
"Passwords do not matches!":"Passw&ouml;rter stimmen nicht &uuml;berein!",
"Password must be >1 and <16 without space!":"Passw&ouml;rter m&uuml;ssen zwischen 1 und 16 Zeichen und ohne Leerzeichen sein!",
"User:":"Benutzer:",
"Password:":"Passwort:",
"Submit":"Submit",
"Change Password":"Passwort &auml;ndern",
"Current Password:":"Aktuelles Passwort:",
"New Password:":"Neues Passwort:",
"Confirm New Password:":"Best&auml;tige neues Passwort:",
"Error : Incorrect User":"Fehler : Falscher Benutzer",
"Error: Incorrect password":"Fehler: Falsches Passwort",
"Error: Missing data":"Fehler: Daten unvollst&auml;ndig",
"Error: Cannot apply changes":"Fehler: Kann &Auml;nderungen nicht &uuml;bernehmen",
"Error: Too many connections":"Fehler: Zu viele Connections",
"Authentication failed!":"Authentifizierung fehlgeschlagen!",
"Serial is busy, retry later!":"Serial-Port ist besch&auml;ftigt, sp&auml;pter versuchen!",
"Login":"Einloggen",
"Log out":"Ausloggen",
"Password":"Passwort",
"No SD Card":"Keine SD-Karte",
"Check for Update":"Auf Updates &uuml;berpr&uuml;fen",
"Please use 8.3 filename only.":"Bitte verwenden sie nur 8.3-Dateinamen.",
"Preferences":"Einstellungen",
"Feature":"Eigenschaft",
"Show camera panel":"Zeige Kamera-Panel",
"Auto load camera":"Kamera automatisch starten",
"Enable heater T0 redundant temperatures":"Schalte redundante T0 Tempaturen ein",
"Enable probe temperatures":"Temperatursensor einschalten",
"Enable bed controls":"Heizbettsteuerung aktivieren",
"Enable chamber controls":"Chamber-Steuerung aktivieren",
"Enable fan controls":"Lüftersteuerung aktivieren",
"Enable Z controls":"Z-Achs-Steuerung aktivieren",
"Panels":"Panel",
"Show control panel":"Zeige Steuerungspanel",
"Show temperatures panel":"Zeige Temperaturpanel",
"Show extruder panel":"Zeige Extruderpanel",
"Show files panel":"Zeige Dateien-Panel",
"Show GRBL panel":"Zeige GRBL-Panel",
"Show commands panel":"Zeige Befehls-Panel",
"Select files":"Dateien auswählen",
"Select file":"Datei auswählen",
"$n files":"$n Dateien",
"No file chosen":"Keine Datei ausgew&auml;hlt",
"Length":"Filamentl&auml;nge",
"Output msg":"Nachricht ausgeben",
"Enable":"Aktivieren",
"Disable":"Deaktivieren",
"Serial":"Serieller Anschluss",
"Chip ID":"Prozessor-ID",
"CPU Frequency":"Prozessorfrequenz",
"CPU Temperature":"Prozessortemperatur",
"Free memory":"Freier Speicher",
"Flash Size":"Flash-Gr&ouml;ße",
"Available Size for update":"Verf&uuml;gbare Gr&ouml;ße f&uuml;r das Update",
"Available Size for SPIFFS":"Verf&uuml;gbare Gr&ouml;ße f&uuml;r das SPIFFS",
"Baud rate":"Baudrate",
"Sleep mode":"Schlafmodus",
"Channel":"Kanal",
"Phy Mode":"Netzwerktyp",
"Web port":"Web Port",
"Data port":"Data Port",
"Active Mode":"Aktiver modus",
"Connected to":"Verbunden mit",
"IP Mode":"IP-Modus",
"Gateway":"Gateway",
"Mask":"Maske",
"DNS":"DNS",
"Disabled Mode":"Deaktivierter Modus",
"Captive portal":"Captive Portal",
"Enabled":"Aktiviert",
"Web Update":"Webupate",
"Pin Recovery":"Reset-Taste",
"Disabled":"Deaktiviert",
"Authentication":"Authentifizierung",
"Target Firmware":"Firmware",
"SD Card Support":"SD-Karten-Unterstützung",
"Time Support":"Zeitserver",
"M117 output":"Ausgabe f&ouml;r den Drucker",
"Oled output":"Ausgabe auf Oled Bildschirm",
"Serial output":"Ausgabe am seriellen Port",
"Web socket output":"Ausgabe im Websocket",
"TCP output":"Ausgabe im TCP-Stream",
"FW version":"Version",
"Show DHT output":"Zeige DHT-Output",
"DHT Type":"DHT-Typ",
"DHT check (seconds)":"DHT-Kontrollintervall (Sekunden)",
"SD speed divider":"Geschwindigkeitsteiler der SD-Karte",
"Number of extruders":"Anzahl der Extruder",
"Mixed extruders":"Gemischte Extruder",
"Extruder":"Extruder",
"Enable lock interface":"Aktive Benutzeroberfl&auml;che",
"Lock interface":"Schnittstelle sperren",
"Unlock interface":"Schnittstelle entsperren",
"You are disconnected":"Du bist nicht verbunden",
"Looks like you are connected from another place, so this page is now disconnected":"Es sieht so aus, als ob Sie mit einem anderen Ort verbunden sind, daher ist diese Seite jetzt getrennt.",
"Please reconnect me":"Bitte neu verbinden",
"Mist":"Nebel",
"Flood":"Kühlmittelzufuhr",
"Spindle":"Spindel",
"Connection monitoring":"Verbindungs&uuml;berwachung",
"XY Feedrate value must be at least 1 mm/min!":"XY-Vorschub muss mindesten 1 mm/min betragen!",
"Z Feedrate value must be at least 1 mm/min!":"Z-Vorschub muss mindesten 1 mm/min betragen!",
"Hold:0":"Hold complete. Ready to resume.",
"Hold:1":"Hold in-progress. Reset will throw an alarm.",
"Door:0":"Door closed. Ready to resume.",
"Door:1":"Machine stopped. Door still ajar. Can't resume until closed.",
"Door:2":"Door opened. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Door closed and resuming. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"G-code words consist of a letter and a value. Letter was not found.",
"error:2":"Missing the expected G-code word value or numeric value format is not valid.",
"error:3":"Grbl '$' system command was not recognized or supported.",
"error:4":"Negative value received for an expected positive value.",
"error:5":"Homing cycle failure. Homing is not enabled via settings.",
"error:6":"Minimum step pulse time must be greater than 3usec.",
"error:7":"An EEPROM read failed. Auto-restoring affected EEPROM to default values.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Max characters per line exceeded. Received command line was not executed.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Laser mode requires PWM output.",
"error:20":"Unsupported or invalid g-code command found in block.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Feed rate has not yet been set or is undefined.",
"error:23":"G-code command in block requires an integer value.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Repeated g-code word found in block.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Line number value is invalid.",
"error:28":"G-code command is missing a required value word.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Arc radius value is invalid.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Unused value words found in block.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Tool number greater than max supported value.",
"error:60":"SD failed to mount",
"error:61":"SD card failed to open file for reading",
"error:62":"SD card failed to open directory",
"error:63":"SD Card directory not found",
"error:64":"SD Card file empty",
"error:70":"Bluetooth failed to start",
};
//endRemoveIf(de_lang_disabled)

//removeIf(en_lang_disabled)
//english
var englishtrans = {
"en":"English",
"STA":"Client Station",
"AP":"Access Point",
"BT":"Bluetooth",
"Hold:0":"Hold complete. Ready to resume.",
"Hold:1":"Hold in-progress. Reset will throw an alarm.",
"Door:0":"Door closed. Ready to resume.",
"Door:1":"Machine stopped. Door still ajar. Can't resume until closed.",
"Door:2":"Door opened. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Door closed and resuming. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked, click the Reset Button.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"G-code words consist of a letter and a value. Letter was not found.",
"error:2":"Missing the expected G-code word value or numeric value format is not valid.",
"error:3":"Grbl '$' system command was not recognized or supported.",
"error:4":"Negative value received for an expected positive value.",
"error:5":"Homing cycle failure. Homing is not enabled via settings.",
"error:6":"Minimum step pulse time must be greater than 3usec.",
"error:7":"An EEPROM read failed. Auto-restoring affected EEPROM to default values.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Max characters per line exceeded. Received command line was not executed.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Laser mode requires PWM output.",
"error:20":"Unsupported or invalid g-code command found in block.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Feed rate has not yet been set or is undefined.",
"error:23":"G-code command in block requires an integer value.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Repeated g-code word found in block.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Line number value is invalid.",
"error:28":"G-code command is missing a required value word.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Arc radius value is invalid.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Unused value words found in block.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Tool number greater than max supported value.",
"error:60":"SD failed to mount",
"error:61":"SD card failed to open file for reading",
"error:62":"SD card failed to open directory",
"error:63":"SD Card directory not found",
"error:64":"SD Card file empty",
"error:70":"Bluetooth failed to start",
};
//endRemoveIf(en_lang_disabled)

//removeIf(es_lang_disabled)
//Spanish
var spanishtrans = {
"es":"Espa&ntilde;ol",
"ESP3D for":"ESP3D para",
"Value of auto-check must be between 0s and 99s !!":"&iexcl;El valor del auto-control tiene que estar entre 0s y 99s !",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"&iexcl;El valor de la velocidad del extrusor tiene que estar entre 1 mm/min y 9999 mm/min ! ",
"Value of filament length must be between 0.001 mm and 9999 mm !":"&iexcl;El valor de la longitud de extrusi&oacute;n de filamento tiene que estar entre 0,001 mm y 9999 mm.!",
"cannot have '-', '#' char or be empty":"No puede tener el car&aacute;cter '-', '#' o estar vac&iacute;o",
"cannot have '-', 'e' char or be empty":"No puede tener el car&aacute;cter 'e', '#' o estar vac&iacute;o",
"Failed:":"Fracaso",
"File config / config.txt not found!":"&iexcl;No se encontr&oacute; el archivo config / config.txt.!",
"File name cannot be empty!":"&iexcl;El nombre del archivo no puede estar vac&iacute;o!",
"Value must be ":"El valor  tiene que estar  ",
"Value must be between 0 degres and 999 degres !":"&iexcl;El valor tiene que estar entre 0 grados y 999 grados!",
"Value must be between 0% and 100% !":"&iexcl;El valor tiene que estar entre 0% y 100% !",
"Value must be between 25% and 150% !":"&iexcl;El valor tiene que estar entre 25% y 150% !",
"Value must be between 50% and 300% !":"&iexcl;El valor tiene que estar entre 50% y 300%",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"&iexcl;El valor de avance XY tiene que estar entre 1mm/min y 999mm/min !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"&iexcl;El valor de avance Z tiene que estar entre doit &ecirc;tre entre 1mm/min y 999mm/min !",
" seconds":" secondos",
"Abort":"Interrumpir",
"auto-check every:":"Comprobar cada:",
"auto-check position every:":"Comprobar  la posici&oacute;n cada:",
"Autoscroll":"Desplazamiento auto",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"Base",
"Chamber":"Chamber",
"Board":"Microcontrolador",
"Busy...":"Ocupado...",
"Camera":"C&aacute;mara",
"Cancel":"Cancelar",
"Cannot get EEPROM content!":"No se puede obtener contenido EEPROM!",
"Clear":"Borrar",
"Close":"Cerrar",
"Color":"Color",
"Commands":"Comandos",
"Communication locked by another process, retry later.":"Comunicaci&oacute;n bloqueada, espere",
"Communication locked!":"&iexcl;Comunicaci&oacute;n bloqueada!",
"Communications are currently locked, please wait and retry.":"Comunicaci&oacute;n bloqueada, espere y vuelva a intentarlo.",
"Confirm deletion of directory: ":"Confirmar eliminaci&oacute;n de carpeta:  ",
"Confirm deletion of file: ":"Confirmar eliminaci&oacute;n de archivo: ",
"Connecting ESP3D...":"Conexi&oacute;n a ESP3D",
"Connection failed! is your FW correct?":"&iexcl;La conexi&oacute;n fall&oacute;! &iquest;Es el FW correcto?",
"Controls":"Controles",
"Credits":"Cr&eacute;ditos",
"Dashboard":"Tablero",
"Data modified":"Cambio de datos",
"Do you want to save?":"&iquest;Desea guardar ?",
"Enable second extruder controls":"Activar segundo extrusor",
"Error":"Error",
"ESP3D Filesystem":"Archivos ESP3D",
"ESP3D Settings":"Configuraci&oacute;n ESP3D",
"ESP3D Status":"Estado ESP3D",
"ESP3D Update":"Actualizaci&oacute;n ESP3D",
"Extrude":"Extrusi&oacute;n",
"Extruder T0":"Extrusor T0",
"Extruder T1":"Extrusor T1",
"Extruders":"Extrusores",
"Fan (0-100%)":"Ventilador (0-100%)",
"Feed (25-150%)":"Velocidad (25-150%)",
"Feedrate :":"Avance :",
"Filename":"Archivo",
"Filename/URI":"Archivo/URI",
"Verbose mode":"Modo detallado",
"Firmware":"Firmware",
"Flow (50-300%)":"Flujo (50-300%)",
"Heater T0":"Calefactor T0",
"Heater T1":"Calefactor T1",
"Help":"Ayuda",
"Icon":"Representaci&oacute;n",
"Interface":"Interfaz",
"Join":"Unirse",
"Label":"Etiqueta",
"List of available Access Points":"Puntos de acceso disponibles",
"Macro Editor":"Macro editor",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Apagar motores",
"Name":"Nombre",
"Name:":"Nombre:",
"Network":"Red",
"No SD card detected":"No se detecta la tarjeta SD",
"No":"No",
"Occupation:":"Ocupaci&oacute;n",
"Ok":"Ok",
"Options":"Opciones",
"Out of range":"No es v&aacute;lido",
"Please Confirm":"Por favor, confirma",
"Please enter directory name":"Por favor escriba el nombre de la carpeta",
"Please wait...":"Espere...",
"Printer configuration":"Configuraci&oacute;n de la impresora",
"GRBL configuration":"Configuraci&oacute;n de GRBL",
"Printer":"Impresora ",
"Progress":"Progreso",
"Protected":"Protegido",
"Refresh":"Actualizar",
"Restart ESP3D":"Reinicio ESP3D",
"Restarting ESP3D":"Reinicio ESP3D",
"Restarting":"Reinicio",
"Restarting, please wait....":"Reinicio, espere...",
"Retry":"Reintentar",
"Reverse":"Revocar",
"Save macro list failed!":"Fracaso de guardar la lista de macro",
"Save":"Guardar",
"Saving":"Guarda",
"Scanning":"Exploración",
"SD Files":"Archivos de tarjeta SD",
"sec":"sec",
"Send Command...":"Envia Comando...",
"Send":"Enviar",
"Set failed":"Fracaso guardar",
"Set":"Guardar",
"Signal":"Se&ntilde;al",
"Size":"Tama&ntilde;o",
"SSID":"Identificador",
"Target":"Localizaci&oacute;n",
"Temperatures":"Temperaturas",
"Total:":"Total:",
"Type":"Tipo",
"Update Firmware ?":"&iquest;Actualice el firmware ?",
"Update is ongoing, please wait and retry.":"Actualizaci&oacute;n en curso,  espere y vuelva a intentarlo.",
"Update":"Actualizaci&oacute;n",
"Upload failed : ":"Carga fracasado :",
"Upload failed":"Carga fracasado",
"Upload":"Cargar",
"Uploading ":"Carga ",
"Upload done":"Carga terminado",
"Used:":"Utilizado:",
"Value | Target":"Actual | Objetivo",
"Value":"Valor",
"Wrong data":"Informaci&oacute;n incorrecta",
"Yes":"S&iacute;",
"Light":"Autom&aacute;tico",
"None":"Ninguno",
"Modem":"Modem",
"STA":"Cliente",
"AP":"Punto de acceso",
"Baud Rate":"Velocidad de comunicaci&oacute;n",
"Sleep Mode":"Sleep Mode",
"Web Port":"Puerto web",
"Data Port":"Puerto de datos",
"Hostname":"Nombre del servidor",
"Wifi mode":"Modo WiFi",
"Station SSID":"ID de red WiFi del cliente",
"Station Password":"Contrase&ntilde;a WiFi del cliente",
"Station Network Mode":"Tipo de red del cliente",
"Station IP Mode":"Modo Cliente IP",
"DHCP":"Din&aacute;mica",
"Static":"Fija",
"Station Static IP":"IP fija del cliente",
"Station Static Mask":"M&aacute;scara de subred del cliente",
"Station Static Gateway":"Puerta de enlace del cliente",
"AP SSID":"Identificador del punto de acceso WiFi",
"AP Password":"Contraseña del punto de acceso WiFi",
"AP Network Mode":"Tipo de red del punto de acceso",
"SSID Visible":"Red visible",
"AP Channel":"Canal del punto de acceso",
"Open":"Open",
"Authentication":"Autenticaci&oacute;n",
"AP IP Mode":"Modo IP del punto de acceso",
"AP Static IP":"IP fija del punto de acceso",
"AP Static Mask":"M&aacute;scara de subred del punto de acceso",
"AP Static Gateway":"Puerta de enlace del cliente del punto de acceso",
"Time Zone":"Huso horario",
"Day Saving Time":"Horario de verano ",
"Time Server 1":"Servidor de tiempo 1",
"Time Server 2":"Servidor de tiempo 2",
"Time Server 3":"Servidor de tiempo 3",
"Target FW":"Firmware de destino",
"Direct SD access":"Conexi&oacute;n directa al lector de tarjetas SD",
"Direct SD Boot Check":"Control directo del lector de tarjetas SD al inicio",
"Primary SD":"Lector de tarjetas SD conectado",
"Secondary SD":"Lector de tarjetas SD secundario",
"Temperature Refresh Time":"Per&iacute;odo de control de temperatura",
"Position Refresh Time":"Per&iacute;odo de control de posici&oacute;n",
"Status Refresh Time":"Per&iacute;odo de control de estado",
"XY feedrate":"Aceleraci&oacute;n XY",
"Z feedrate":"Aceleraci&oacute;n Z",
"E feedrate":"Aceleraci&oacute;n E",
"Camera address":"Dirección de la c&aacute;mara",
"Setup":"Configuraci&oacute;n",
"Start setup":"Iniciar configuraci&oacute;n",
"This wizard will help you to configure the basic settings.":"Este asistente le ayudar&aacute; a configurar los ajustes b&aacute;sicos.",
"Press start to proceed.":"Pulse iniciar para continuar.",
"Save your printer's firmware base:":"Guarde la base de firmware de la impresora:",
"This is mandatory to get ESP working properly.":"Esto es obligatorio para que el ESP funcione correctamente.",
"Save your printer's board current baud rate:":"Especifique la velocidad de comunicaci&oacute;n de su impresora:",
"Printer and ESP board must use same baud rate to communicate properly.":"La impresora y ESP3D deben comunicarse a la misma velocidad.",
"Continue":"Continuar",
"WiFi Configuration":"Configuraci&oacute;n WiFi",
"Define ESP role:":"Definir el papel de ESP3D:",
"AP define access point / STA allows to join existing network":"Punto de acceso o cliente de una red existente.",
"What access point ESP need to be connected to:":"Defina el punto de acceso al que se conecta ESP3D:",
"You can use scan button, to list available access points.":"Puede utilizar el bot&oacute;n Escanear, para enumerar los puntos de acceso disponibles.",
"Password to join access point:":"Contrase&ntilde;a para el punto de acceso:",
"Define ESP name:":"Defina el nombre de red de ESP3D:",
"What is ESP access point SSID:":"Definir el identificador del punto de acceso ESP3D:",
"Password for access point:": "Contrase&ntilde;a del punto de acceso:",
"Define security:":"Definir el tipo de protecci&oacute;n:",
"SD Card Configuration":"Configuraci&oacute;n de la tarjeta SD",
"Is ESP connected to SD card:":"ESP3D est&aacute; conectado directamente a el lector SD:",
"Check update using direct SD access:":"Control directo del lector SD al inicio:",
"SD card connected to ESP":"Lector SD directamente conectado a ESP",
"SD card connected to printer":"Lector SD secundario",
"Setup is finished.":"Configuraci&oacute;n completada.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Despu&eacute;s de cerrar el di&aacute;logo, siempre puede modificar los par&aacute;metros en la interfaz principal.",
"You may need to restart the board to apply the new settings and connect again.":"Es posible que necesite reiniciar la placa para aplicar la nueva configuraci&oacute;n y volver a conectarse.",
"Identification requested":"Identificaci&oacute;n requerida",
"admin":"administrador",
"user":"usuario",
"guest":"visitor",
"Identification invalid!":"&iexcl;Identificaci&oacute;n incorrecta!",
"Passwords do not matches!":"&iexcl;Las contrase&ntilde;as no coinciden!",
"Password must be >1 and <16 without space!":"&iexcl;La contrase&ntilde;a debe tener un tama&ntilde;o> 1 y <16 y no hay espacio!",
"User:":"Usuario:",
"Password:":"Contrase&ntilde;a:",
"Submit":"Enviar",
"Change Password":"Cambia la contrase&ntilde;a",
"Current Password:":"Contrase&ntilde;a actual:",
"New Password:":"Nueva contrase&ntilde;a:",
"Confirm New Password:":"Confirmar nueva contrase&ntilde;a:",
"Error : Incorrect User":"Error: Usuario incorrecto",
"Error: Incorrect password":"Error: contrase&ntilde;a incorrecta",
"Error: Missing data":"Error: Datos perdidos",
"Error: Cannot apply changes":"Error: No se pueden aplicar cambios",
"Error: Too many connections":"Error: demasiadas conexiones",
"Authentication failed!":"&iexcl;No se pudo identificar!",
"Serial is busy, retry later!":"Puerto saturado, prueba m&aacute;s tarde!",
"Login":"Acceder",
"Log out":"Cerrar sesi&oacute;n",
"Password":"Contrase&ntilde;a",
"No SD Card":"No Tarjeta SD",
"Check for Update":"Buscar actualizaciones",
"Please use 8.3 filename only.":"Utilizar s&oacute;lo el nombre de archivo de formato 8.3",
"Preferences":"Preferencias",
"Feature":"Funci&oacute;n",
"Show camera panel":"Mostrar el panel de la c&aacute;mara",
"Auto load camera":"Iniciar ls c&aacute;mara autom&aacute;ticamente",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"Activar controles del base",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"Activar controles del ventilador",
"Enable Z controls":"Activar controles del eje Z",
"Panels":"Paneles",
"Show control panel":"Mostrar el panel de posici&oacute;nes ",
"Show temperatures panel":"Mostrar el panel de temperaturas",
"Show extruder panel":"Mostrar el panel de extrusores",
"Show files panel":"Mostrar el panel de archivos",
"Show GRBL panel":"Mostrar el panel GRBL",
"Show commands panel":"Mostrar el panel de comandos",
"Select files":"Selecciona archivos",
"Select file":"Seleccione archivo",
"$n files":"$n archivos",
"No file chosen":"Ning&uacute;n archivo elegido",
"Length":"Longitud",
"Output msg":"Mensajes para",
"Enable":"Habilitar",
"Disable":"Inhabilitar",
"Serial":"Puerto serie",
"Chip ID":"ID del procesador",
"CPU Frequency":"Frecuencia del procesador",
"CPU Temperature":"Temperatura del procesador",
"Free memory":"Memoria libre",
"Flash Size":"Tama&ntilde;o de flash",
"Available Size for update":"Tama&ntilde;o disponible para la actualizaci&oacute;n",
"Available Size for SPIFFS":"Tama&ntilde;o disponible para  SPIFFS",
"Baud rate":"Velocidad de comunicaci&oacute;n",
"Sleep mode":"Sleep mode",
"Channel":"Canal",
"Phy Mode":"Tipo de red",
"Web port":"Puerto web",
"Data port":"Puerto de datos",
"Active Mode":"Modo activo",
"Connected to":"Conectado a",
"IP Mode":"Modo IP",
"Gateway":"Puerta de enlace",
"Mask":"M&aacute;scara de subred",
"DNS":"DNS",
"Disabled Mode":"Modo desactivado",
"Captive portal":"Portal cautivo",
"Enabled":"Activado",
"Web Update":"Actualizaci&oacute;n web",
"Pin Recovery":"Bot&oacute;n restablecer",
"Disabled":"Desactivado",
"Authentication":"Autenticaci&oacute;n",
"Target Firmware":"Firmware de destino",
"SD Card Support":"Soporte de tarjeta SD",
"Time Support":"Servidor de tiempo",
"M117 output":"Pantalla a la impresora",
"Oled output":"Pantalla a oled",
"Serial output":"Pantalla al puerto serie",
"Web socket output":"Pantalla a websocket",
"TCP output":"Pantalla a TCP",
"FW version":"Versi&oacute;n",
"Show DHT output":"Mostrar el DHT",
"DHT Type":"Typo de DHT",
"DHT check (seconds)":"Intervalo de control de DHT (segundos)",
"SD speed divider":"Divisor de velocidad de la tarjeta SD",
"Number of extruders":"Cantidad de extrusores",
"Mixed extruders":"Extrusores mixtos",
"Extruder":"Extrusor",
"Enable lock interface":"Habilitar el bloqueo de la interfaz",
"Lock interface":"Bloquear interfaz",
"Unlock interface":"Desbloquear interfaz",
"You are disconnected":"Est&aacute;s desconectado",
"Looks like you are connected from another place, so this page is now disconnected":"Parece que est&aacute;s conectado a otro lugar, por eso esta p&aacute;gina ahora est&aacute; desconectada.",
"Please reconnect me":"Por favor vuelva a conectarme",
"Mist":"Mist",
"Flood":"Flood",
"Spindle":"Spindle",
"Connection monitoring":"Monitoreo de conexi&oacute;n",
"XY Feedrate value must be at least 1 mm/min!":"XY Feedrate value must be at least 1 mm/min!",
"Z Feedrate value must be at least 1 mm/min!":"Z Feedrate value must be at least 1 mm/min!",
"Hold:0":"Hold complete. Ready to resume.",
"Hold:1":"Hold in-progress. Reset will throw an alarm.",
"Door:0":"Door closed. Ready to resume.",
"Door:1":"Machine stopped. Door still ajar. Can't resume until closed.",
"Door:2":"Door opened. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Door closed and resuming. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"G-code words consist of a letter and a value. Letter was not found.",
"error:2":"Missing the expected G-code word value or numeric value format is not valid.",
"error:3":"Grbl '$' system command was not recognized or supported.",
"error:4":"Negative value received for an expected positive value.",
"error:5":"Homing cycle failure. Homing is not enabled via settings.",
"error:6":"Minimum step pulse time must be greater than 3usec.",
"error:7":"An EEPROM read failed. Auto-restoring affected EEPROM to default values.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Max characters per line exceeded. Received command line was not executed.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Laser mode requires PWM output.",
"error:20":"Unsupported or invalid g-code command found in block.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Feed rate has not yet been set or is undefined.",
"error:23":"G-code command in block requires an integer value.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Repeated g-code word found in block.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Line number value is invalid.",
"error:28":"G-code command is missing a required value word.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Arc radius value is invalid.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Unused value words found in block.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Tool number greater than max supported value.",
"error:60":"SD failed to mount",
"error:61":"SD card failed to open file for reading",
"error:62":"SD card failed to open directory",
"error:63":"SD Card directory not found",
"error:64":"SD Card file empty",
"error:70":"Bluetooth failed to start",
};
//endRemoveIf(es_lang_disabled)

//french
var frenchtrans = {
"fr":"Fran&ccedil;ais",
"ESP3D for":"ESP3D pour",
"Value of auto-check must be between 0s and 99s !!":"La valeur de contr&ocirc;le doit &ecirc;tre entre 0s et 99s !!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"La valeur de vitesse d'extrusion doit &ecirc;tre entre 1 mm/min et 9999 mm/min !",
"Value of filament length must be between 0.001 mm and 9999 mm !":"La valeur de distance d'extrusion doit &ecirc;tre entre 0.001 mm et 9999 mm !",
"cannot have '-', '#' char or be empty":"ne peut contenir les carat&egrave;res '-', '#'  ou &ecirc;tre vide",
"cannot have '-', 'e' char or be empty":"ne peut contenir les carat&egrave;res '-', 'e'  ou &ecirc;tre vide",
"Failed:":"Echec",
"File config / config.txt not found!":"Fichier config / config.txt non trouv&egrave;",
"File name cannot be empty!":"Le nom de fichier ne peut &ecirc;tre vide",
"Value must be ":"La valeur doit &ecirc;tre ",
"Value must be between 0 degres and 999 degres !":"La valeur doit &ecirc;tre entre 0 degr&egrave;s et 999 degr&egrave;s !",
"Value must be between 0% and 100% !":"La valeur doit &ecirc;tre entre 0% et 100% !",
"Value must be between 25% and 150% !":"La valeur doit &ecirc;tre entre 25% et 150% !",
"Value must be between 50% and 300% !":"La valeur doit &ecirc;tre entre 50% et 300%",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"La valeur de l'acc&eacute;l&eacute;ration XY doit &ecirc;tre entre 1mm/min et 999mm/min !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"La valeur de l'acc&eacute;l&eacute;ration Z doit &ecirc;tre entre 1mm/min et 999mm/min !",
" seconds":" secondes",
"Abort":"Stopper",
"auto-check every:":"Contr&ocirc;le toutes les:",
"auto-check position every:":"Contr&ocirc;le position toutes les:",
"Autoscroll":"D&eacute;filement auto",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"Plateforme",
"Chamber":"Chamber",
"Board":"Carte",
"Busy...":"Indisponible...",
"Camera":"Cam&eacute;ra",
"Cancel":"Annuler",
"Cannot get EEPROM content!":"Impossible d'obtenir le contenu de l'EEPROM",
"Clear":"Effacer",
"Close":"Fermer",
"Color":"Couleur",
"Commands":"Commandes",
"Communication locked by another process, retry later.":"Communication bloqu&eacute;e par un autre processus, essayez plus tard.",
"Communication locked!":"Communication bloqu&eacute;e!",
"Communications are currently locked, please wait and retry.":"Les communications sont actuellement bloqu&eacute;e, r&eacute;&eacute;ssayez plus tard!",
"Confirm deletion of directory: ":"Confirmez l'&eacute;ffacement du r&eacute;pertoire: ",
"Confirm deletion of file: ":"Confirmez l'&eacute;ffacement du fichier: ",
"Connecting ESP3D...":"Connexion &agrave; ESP3D",
"Connection failed! is your FW correct?":"Impossible de se connecter! V&eacute;rifiez le micrologiciel",
"Controls":"Controles",
"Credits":"Cr&eacute;dits",
"Dashboard":"Tableau de bord",
"Data modified":"Donn&eacute;es modifi&eacute;es",
"Do you want to save?":"Voulez-vous enregister?",
"Enable second extruder controls":"Activer le controle du second extrudeur",
"Error":"Erreur",
"ESP3D Filesystem":"Fichiers ESP3D",
"ESP3D Settings":"Param&egrave;tres ESP3D",
"ESP3D Status":"Etat ESP3D",
"ESP3D Update":"Mise &agrave; jour ESP3D",
"Extrude":"Extrusion",
"Extruder T0":"Extrudeur T0",
"Extruder T1":"Extrudeur T1",
"Extruders":"Extrudeurs",
"Fan (0-100%)":"Ventilateur (0-100%)",
"Feed (25-150%)":"Vitesse (25-150%)",
"Feedrate :":"Acc&eacute;l&eacute;ration :",
"Filename":"Fichier",
"Filename/URI":"Fichier/URI",
"Verbose mode":"Mode dl&eacute;tailll&eacute;",
"Firmware":"Micrologiciel",
"Flow (50-300%)":"D&eacute;bit (50-300%)",
"Heater T0":"Chauffage T0",
"Heater T1":"Chauffage T1",
"Help":"Aide",
"Icon":"Icone",
"Interface":"Interface",
"Join":"Connecter",
"Label":"Intitul&eacute;",
"List of available Access Points":"Points d'acc&egrave;s disponibles",
"Macro Editor":"Editeur de macro",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Arr&ecirc;t Moteurs",
"Name":"Nom",
"Name:":"Nom:",
"Network":"R&eacute;seau",
"No SD card detected":"Pas de SD carte d&eacute;tect&eacute;e",
"No":"Non",
"Occupation:":"Occupation",
"Ok":"Ok",
"Options":"Options",
"Out of range":"Invalide",
"Please Confirm":"SVP Confirmez",
"Please enter directory name":"Entrez le nom du r&eacute;pertoire",
"Please wait...":"Patientez...",
"Printer configuration":"Configuration imprimante",
"GRBL configuration":"Configuration GRBL",
"Printer":"Imprimante",
"Progress":"Progression",
"Protected":"Prot&eacute;g&eacute;",
"Refresh":"Actualiser",
"Restart ESP3D":"Red&eacute;marrage ESP3D",
"Restarting ESP3D":"Red&eacute;marrage ESP3D",
"Restarting":"Red&eacute;marrage",
"Restarting, please wait....":"Red&eacute;marrage, patientez...",
"Retry":"R&eacute;&eacute;ssayer",
"Reverse":"Annuler",
"Save macro list failed!":"Echec enregistrement des macros",
"Save":"Enregistrer",
"Saving":"Enregistrement",
"Scanning":"Recherche",
"SD Files":"Fichiers de carte SD",
"sec":"sec",
"Send Command...":"Envoi Commande...",
"Send":"Envoyer",
"Set failed":"Echec enregistrement",
"Set":"Enregister",
"Signal":"Signal",
"Size":"Taille",
"SSID":"Identifiant",
"Target":"Emplacement",
"Temperatures":"Temp&eacute;ratures",
"Total:":"Total:",
"Type":"Type",
"Update Firmware ?":"MAJ Micrologiciel ?",
"Update is ongoing, please wait and retry.":"Mise &agrave; jour en cours, SVP attendez et r&eacute;essayez.",
"Update":"Mise &agrave; jour",
"Upload failed : ":"T&eacute;l&eacute;chargement annul&eacute;",
"Upload failed":"T&eacute;l&eacute;chargement annul&eacute;",
"Upload":"T&eacute;l&eacute;chargement",
"Uploading ":"T&eacute;l&eacute;chargement ",
"Upload done":"T&eacute;l&eacute;chargement termin&eacute;",
"Used:":"Utilis&eacute;:",
"Value | Target":"Actuel | Objectif",
"Value":"Valeur",
"Wrong data":"Donn&eacute;es invalides",
"Yes":"Oui",
"Light":"Automatique",
"None":"Aucun",
"Modem":"Modem",
"STA":"Client",
"AP":"Point d'acc&egrave;s",
"Baud Rate":"Vitesse de communication",
"Sleep Mode":"Mode de veille",
"Web Port":"Port internet",
"Data Port":"Port de donn&eacute;es",
"Hostname":"Nom du serveur",
"Wifi mode":"Mode WiFi",
"Station SSID":"Identifiant r&eacute;seau WiFi du client",
"Station Password":"Mot de passe WiFi du client",
"Station Network Mode":"Type de r&eacute;seau client",
"Station IP Mode":"Mode IP client",
"DHCP":"Dynamique",
"Static":"Statique",
"Station Static IP":"IP fixe client",
"Station Static Mask":"Masque de sous-r&eacute;seau client",
"Station Static Gateway":"Gateway client",
"AP SSID":"Identifiant r&eacute;seau WiFi du point d'acc&egrave;s",
"AP Password":"Mot de passe WiFi du point d'acc&egrave;s",
"AP Network Mode":"Type de r&eacute;seau du point d'acc&egrave;s",
"SSID Visible":"R&eacute;seau Visible",
"AP Channel":"Canal du point d'acc&egrave;s",
"Open":"Ouvert",
"Authentication":"Authentification",
"AP IP Mode":"Mode IP point d'acc&egrave;s",
"AP Static IP":"IP fixe du point d'acc&egrave;s",
"AP Static Mask":"Masque de sous-r&eacute;seau du point d'acc&egrave;s",
"AP Static Gateway":"Gateway du point d'acc&egrave;s",
"Time Zone":"Fuseau horaire",
"Day Saving Time":"Heure d'&eacute;t&eacute;",
"Time Server 1":"Serveur NTP 1",
"Time Server 2":"Serveur NTP 2",
"Time Server 3":"Serveur NTP 3",
"Target FW":"Firmware cible",
"Direct SD access":"Connexion directe sur lecteur SD",
"Direct SD Boot Check":"Controle direct du lecteur SD au d&eacute;marrage",
"Primary SD":"Lecteur SD connect&eacute;",
"Secondary SD":"Lecteur SD scondaire",
"Temperature Refresh Time":"P&eacute;riode de controle de temp&eacute;rature",
"Position Refresh Time":"P&eacute;riode de controle de position",
"Status Refresh Time":"P&eacute;riode de controle d'&eacute;tat",
"XY feedrate":"Acc&eacute;l&eacute;ration XY",
"Z feedrate":"Acc&eacute;l&eacute;ration Z",
"E feedrate":"Acc&eacute;l&eacute;ration E",
"Camera address":"Adresse cam&eacute;ra",
"Setup":"Configuration",
"Start setup":"D&egrave;marrer la configuration",
"This wizard will help you to configure the basic settings.":"Cet assistant va vous aider &agrave; d&eacute;finir les param&egrave;tres de base.",
"Press start to proceed.":"Appuyez d&eacute;marrer pour commencer.",
"Save your printer's firmware base:":"Enregistrez le firmware de base de l'imprimante",
"This is mandatory to get ESP working properly.":"Ceci est indispensable pour le bon fonctionnement de ESP3D.",
"Save your printer's board current baud rate:":"Enregistrez la vitesse de communication de votre imprimante:",
"Printer and ESP board must use same baud rate to communicate properly.":"Imprimante et ESP3D doivent communiquer &agrave; la m&ecirc;me vitesse.",
"Continue":"Continuer",
"WiFi Configuration":"Configuration WiFi",
"Define ESP role:":"D&eacute;finir le role de ESP3D:",
"AP define access point / STA allows to join existing network":"Point d'acc&egrave;s ou client d'un reseau existant.",
"What access point ESP need to be connected to:":"D&eacute;finir le point d'acc&egrave;s auquel ESP3D se connecte:",
"You can use scan button, to list available access points.":"Vous pouvez visualiser les points d'acc&egrave;s disponibles en appuyant le bouton recherche.",
"Password to join access point:":"Mot de passe du point d'acc&egrave;s:",
"Define ESP name:":"D&eacute;finir le nom r&eacute;seau de ESP3D:",
"What is ESP access point SSID:":"D&eacute;finir l'identifiant du point d'acc&egrave;s ESP3D:",
"Password for access point:": "Mot de passe du point d'acc&egrave;s:",
"Define security:":"D&eacute;finir le type de protection:",
"SD Card Configuration":"Configuration Carte SD",
"Is ESP connected to SD card:":"ESP3D est directement connect&eacute;e au lecteur SD:",
"Check update using direct SD access:":"Controle direct du lecteur SD au d&eacute;marrage:",
"SD card connected to ESP":"Lecteur SD directement connect&eacute; &agrave; ESP",
"SD card connected to printer":"Lecteur SD Secondaire",
"Setup is finished.":"Configuration termin&eacute;e.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Apr&egrave;s la fermeture de la boite de dialogue, vous pourrez toujours modifier les param&egrave;tres dans l'interface principale.",
"You may need to restart the board to apply the new settings and connect again.":"Il est possible qu'un red&eacute;marrage de la carte et une nouvelle connection &agrave; l'interface soit n&eacute;cessaire pour appliquer/visualiser les modifications.",
"Identification requested":"Identification requise",
"admin":"administrateur",
"user":"utilisateur",
"guest":"invit&eacute;",
"Identification invalid!":"Identification invalide!",
"Passwords do not matches!":"Les mots de passe ne correspondent pas!",
"Password must be >1 and <16 without space!":"Le mot de passe doit avoir une taile >1 et <16 et sans espace!",
"User:":"Utilisateur:",
"Password:":"Mot de passe:",
"Submit":"Soumettre",
"Change Password":"Changement de  mot de passe",
"Current Password:":"Mot de passe actuel:",
"New Password:":"Nouveau mot de passe:",
"Confirm New Password:":"Confirmation mot de passe:",
"Error : Incorrect User":"Erreur : Utilisateur inconnu",
"Error: Incorrect password":"Erreurr: Mot de passe invalide",
"Error: Missing data":"Erreur: Donn&eacute;es incorrectes",
"Error: Cannot apply changes":"Erreur: Modifications impossible",
"Error: Too many connections":"Erreurr: Trop de connexions",
"Authentication failed!":"Echec de l'identification !",
"Serial is busy, retry later!":"Port s&eacute;rie satur&eacute;, essayez plus tard!",
"Login":"Connexion",
"Log out":"D&eacute;connexion",
"Password":"Mot de passe",
"No SD Card":"Pas de Carte SD",
"Check for Update":"V&eacute;rification de MAJ au d&eacute;marrage",
"Please use 8.3 filename only.":"Utilisez des noms de fichier au format 8.3 uniquement.",
"Preferences":"Pr&eacute;f&eacute;rences",
"Feature":"Fonctions",
"Show camera panel":"Afficher le controle de la cam&eacute;ra",
"Auto load camera":"Automatiquement d&eacute;marrer la cam&eacute;ra",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"Activer les controles de la plateforme",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"Activer les controles du ventilateur",
"Enable Z controls":"Activer les controles de l'axe Z",
"Panels":"Panneaux",
"Show control panel":"Afficher le panneau de positions",
"Show temperatures panel":"Afficher le panneau des temp&eacute;ratures",
"Show extruder panel":"Afficher le panneau d'extrusion",
"Show files panel":"Afficher le panneau des fichiers",
"Show GRBL panel":"Afficher le panneau GRBL",
"Show commands panel":"Afficher le panneau des commandes",
"Select files":"S&eacute;lect. fichiers",
"Select file":"S&eacute;lect. fichier",
"$n files":"$n fichiers",
"No file chosen":"Aucun fichier choisi",
"Length":"Longueur d'extrusion",
"Output msg":"Messages vers",
"Enable":"Autoriser",
"Disable":"Bloquer",
"Serial":"Port s&eacute;rie",
"Chip ID":"Identifiant processeur",
"CPU Frequency":"Fr&eacute;quence processeur",
"CPU Temperature":"Temp&eacute;rature processeur",
"Free memory":"M&eacute;moire disponible",
"Flash Size":"Taille m&eacute;moire flash",
"Available Size for update":"Espace disponible pour M.A.J.",
"Available Size for SPIFFS":"Espace disponible SPIFFS",
"Baud rate":"Vitesse de communication",
"Sleep mode":"Mode veille",
"Channel":"Canal",
"Phy Mode":"Type r&eacute;seau",
"Web port":"Port internet",
"Data port":"Port de donn&eacute;es",
"Active Mode":"Mode actif",
"Connected to":"Connect&eacute; &agrave;",
"IP Mode":"Mode IP",
"Gateway":"Gateway",
"Mask":"Masque",
"DNS":"DNS",
"Disabled Mode":"Mode inactif",
"Captive portal":"Portail de capture",
"Enabled":"Activ&eacute;",
"Web Update":"M.A.J. Internet",
"Pin Recovery":"Bouton de R.A.Z.",
"Disabled":"D&eacute;sactiv&eacute;",
"Authentication":"Authentification",
"Target Firmware":"Firmware cible",
"SD Card Support":"Support Carte SD",
"Time Support":"Serveur NTP",
"M117 output":"Affichage vers imprimante",
"Oled output":"Affichage vers oled",
"Serial output":"Affichage vers port s&eacute;rie",
"Web socket output":"Affichage vers websocket",
"TCP output":"Affichage vers flux TCP",
"FW version":"Version",
"Show DHT output":"Afficher DHT",
"DHT Type":"Type de DHT",
"DHT check (seconds)":"Intervalle de contr&ocirc;le du DHT (secondes)",
"SD speed divider":"Facteur diviseur carte SD",
"Number of extruders":"Nombre d'extrudeurs",
"Mixed extruders":"Extrudeurs mix&eacute;s",
"Extruder":"Extrudeur",
"Enable lock interface":"Activer verrouillage interface",
"Lock interface":"Verrouiller interface",
"Unlock interface":"D&eacute;verrouiller interface",
"You are disconnected":"Vous &ecirc;tes d&eacute;connect&eacute;",
"Looks like you are connected from another place, so this page is now disconnected":"Apparement vous &ecirc;tes connect&eacute; sur une autre page, donc cette page est d&eacute;sormais d&eacute;connect&eacute;e.",
"Please reconnect me":"SVP reconnectez-moi",
"Mist":"Brouillard",
"Flood":"Arrosage",
"Spindle":"Broche",
"Connection monitoring":"Surveillance de la connexion",
"XY Feedrate value must be at least 1 mm/min!":"La valeur de l'acc&eacute;l&eacute;ration XY doit &ecirc;tre sup&eacute;rieure &agrave; 1mm/min !",
"Z Feedrate value must be at least 1 mm/min!":"La valeur de l'acc&eacute;l&eacute;ration Z doit &ecirc;tre sup&eacute;rieure &agrave; 1mm/min !",
"Hold:0":"Suspension compl&egrave;te. Pr&ecirc;t &agrave; red&eacute;marrer.",
"Hold:1":"Suspension en cours. Un Reset d&eacute;clenchera une alarme.",
"Door:0":"Porte ferm&eacute;e. Pr&ecirc;t &agrave; red&eacute;marrer.",
"Door:1":"Machine arr&ecirc;t&eacute;e. Porte toujours ouverte. Impossible de red&eacute;marrer tant qu'ouverte.",
"Door:2":"Porte ouverte. Suspension (ou parking) en cours. Un Reset d&eacute;clenchera une alarme.",
"Door:3":"Porte ferm&eacute;e et red&eacute;marrage en cours. Retour du parking si applicable. Un Reset d&eacute;clenchera une alarme.",
"ALARM:1":"Limites mat&eacute;rielles atteintes. La position machine a &eacute;t&eacute; probablement perdue &agrave; cause de l'arr&ecirc;t rapide. La recherche d'origine est fortement recommand&eacute;e.",
"ALARM:2":"Alarme limite logicielles. Un mouvement G-code a d&eacute;pass&eacute; les limites de la machine. La position de la machine a &eacute;t&eacute; conserv&eacute;e. L'alarme peut &egrave;tre acquitt&eacute;e sans probl&egrave;me.",
"ALARM:3":"Reset lors d'un d&eacute;placemnet machine. La position machine est probablement perdue &agrave; cause de l'arr&ecirc;t rapide. La recherche d'origine est fortement recommand&eacute;e.",
"ALARM:4":"Echec du sondage. La sonde n'est pas dans l'&eacute;tat inital attendu apr&egrave;s avoir d&eacute;marr&eacute; le cycle de sondage quand G38.2 et G38.3 ne sont pas d&eacute;clench&eacute;s et G38.4 and G38.5 sont d&eacute;clench&eacute;s.",
"ALARM:5":"Echec du sondage. La sonde n'a pas touch&eacute; la pi&egrave;ce durant le mouvement programm&eacute; pour G38.2 et G38.4.",
"ALARM:6":"Echec de la recherche d'origine. Le cycle a &eacute;t&eacute; interrompu par un reset",
"ALARM:7":"Echec de la recherche d'origine. La porte a &eacute;t&eacute; ouverte durant la recherche d'origine.",
"ALARM:8":"Echec de la recherche d'origine. Le trajet de r&eacute;tractation n'a pas d&eacute;sactiv&eacute; le capteur de la sonde. Essayez d'augmenter la valeur du retrait ou v&eacute;rifiez le c&acirc;blage.",
"ALARM:9":"Echec de la recherche d'origine. La sonde n'a pas &eacute;t&eacute; activ&eacute;e durant le trajet de recherche. Essayez d'augmenter le d&eacute;placement max, de diminuer la distance de r&eacute;tractation ou v&eacute;rifiez le c&acirc;blage.",
"error:1":"Une instruction G-code consiste en une lettre et une valeur num&eacute;rique. La lettre n'a pas &eacute;t&eacute; trouv&eacute;e.",
"error:2":"Valeur de l'instruction G-code ou valeur num&eacute;rique invalide.",
"error:3":"La commande syst&egrave;me '$' de GRBL n'a pas &eacute;t&eacute; reconnue ou est invalide.",
"error:4":"Une valeur n&eacute;gative a &eacute;t&eacute; re&ccedil;ue à la place d'une valeur positive.",
"error:5":"Echec de la recherche d'origine. Elle n'est pas activ&eacute;e dans les param&egrave;tres.",
"error:6":"La largeur d'impulsion de pas doit &ecirc;tre sup&eacute;rieure &agrave; 3usec.",
"error:7":"Echec de la lecture de l'EEPROM. Restauration automatique de son contenu avec les valeurs par d&eacute;faut.",
"error:8":"La commande Grbl '$' ne peut &ecirc;tre utilis&eacute;e tant que grbl n'est pas en attente.",
"error:9":"Les commandes G-code sont verrouill&eacute;es durant une alarme ou un d&eacute;placement rapide.",
"error:10":"Les limites logicielles ne peuvent &ecirc;tre actuv&eacute;es sans que la recherche d'origine ne le soit aussi.",
"error:11":"Le nombre max de caract&egrave;res par ligne a &eacute;t&eacute; atteint.La commande re&ccedil;ue n'a pas &eacute;t&eacute; ex&eacute;cut&eacute;e",
"error:12":"La valeur de la commande Grbl '$' fait que la fr&eacute;quence de pas sera trop importante.",
"error:13":"Porte d&eacute;tect&eacute;e comme ouverte.",
"error:14":"Les informations de compilation ou la ligne de d&eacute;marrage d&eacute;passent les capacit&eacute;s de stockage de l'EEPROM. La ligne ne sera pas stock&eacute;e.",
"error:15":"La cible du mouvement de d&eacute;placement rapide d&eacute;passe les dimensions de la machine. La commande a &eacute;t&eacute; ignor&eacute;e.",
"error:16":"Le d&eacute;placement rapide n'a pas de '=' ou contient du g-code prohib&eacute;.",
"error:17":"Le mode Laser n&eacute;cessite une sortie PWM.",
"error:20":"G-code non support&eacute; ou invalide trouv&eacute; dans le bloc.",
"error:21":"Plus d'une instruction Gcode du m&ecirc;me groupe modal trouv&eacute; dans le block.",
"error:22":"La vitesse de d&eacute;placement n'a pas encore &eacute;t&eacute; d&eacute;finie ou est invalide.",
"error:23":"La commande G-code dans le bloc requiert une valeur enti&egrave;re.",
"error:24":"Plus d'une instruction Gcode requierrant un mot cl&eacute; d'axe trouv&eacute; dans le bloc.",
"error:25":"Mot gcode r&eacute;p&eacute;t&eacute; trouv&eacute; dans le bloc.",
"error:26":"Pas de mot cl&eacute; d'axe trouv&eacute; dans le blog de gcode, alors que le groupe modal courant en n&eacute;cessite.",
"error:27":"Num&eacute;ro de ligne invalide.",
"error:28":"La commande G-code n&eacute;cessite une valeur",
"error:29":"Le jeu de coordonn&eacute;es de travail G59.x n'est pas support&eacute;.",
"error:30":"G53 n'est autoris&eacute; qu'avec les d&eacute;placements G0 et G1.",
"error:31":"Mots cl&eacute;s de d&eacute;placement d'axe trouv&eacute; dans le bloc alors que la commande ou l'&eacute;tat modal courant n'en n&eacute;cessite pas.",
"error:32":"Les arcs G2 and G3 n&eacute;cessitent au moins un mot cl&eacute; d'axe de plan.",
"error:33":"Cible de la commande de d&eacute;placement invalide.",
"error:34":"La valeur du rayon de l'arc est invalide.",
"error:35":"Les arcs G2 et G3 au moins un mot cl&eacute; d&eacute;calage de plan.",
"error:36":"Valeurs inutiles trouv&eacute;es dans le bloc.",
"error:37":"Le d&eacute;calage dynamique d'outil G43.1 n'est pas assign&eacute; à un axe configur&eacute; pour la longeur d'outil.",
"error:38":"Num&eacute;ro d'outil sup&eacute;rieur à la valeur max support&eacute;e.",
"error:60":"Impossible de monter la carte SD",
"error:61":"Impossible d'ouvrir un fichier en lecture sur la carte SD",
"error:62":"Impossible d'ouvrir un r&eacute;pertoire sur la carte SD",
"error:63":"R&eacute;pertoire non trouv&eacute; sur la carte SD",
"error:64":"Fichier vide sur la carte SD",
"error:70":"Echec de d&eacute;marrage du Bluetooth",
};

//removeIf(hu_lang_disabled)
//hungarian
//Hungary by kondorzs
var hungariantrans = {
"hu":"Magyar",
"ESP3D for":"ESP3D hez",
"Value of auto-check must be between 0s and 99s !!":"Az automatikus ellenőrzés értékének 0 és 99 s között kell lennie!",
"Value of extruder velocity must be between1 mm/min and 9999 mm/min !":"Az extruder sebességének 1 mm / perc és 9999 mm / perc között kell lennie!",
"Value of filament length must be between 0.001 mm and 9999 mm !":"Az olvadószál hosszának 0,001 és 9999 mm között kell lennie!",
"cannot have '-', '#' char or be empty":"nem lehet '-', '#' karakter vagy üres",
"cannot have '-', 'e' char or be empty":"nem lehet '-', 'e' karakter vagy üres",
"Failed:":"Nem sikerült:",
"File config / config.txt not found!":"Konfigurációs fájl / config.txt nem található!",
"File name cannot be empty!":"A fájlnév nem lehet üres!",
"Value must be ":"Értéknek kell lennie",
"Value must be between 0 degres and 999 degres !":"Az értéknek 0 és 999 fok között kell lennie!",
"Value must be between 0% and 100% !":"Az értéknek 0% és 100% között kell lennie!",
"Value must be between 25% and 150% !":"Az értéknek 25% és 150% között kell lennie!",
"Value must be between 50% and 300% !":"Az értéknek 50% és 300% között kell lennie!",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"A XY adagolási sebességnek 1 mm / perc és 9999 mm / perc között kell lennie!",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Z Az előtolás sebességének 1 mm / perc és 999 mm / perc között kell lennie!",
" seconds":" második",
"Abort":"Megszakít",
"auto-check every:":"Automatikus ellenőrzés ismétlésének ideje:",
"auto-check position every:":"Az összes automatikus ellenőrzés ismétléseének ideje:",
"Autoscroll":"Autógörgetés",
"Max travel":"Max utazás",
"Feed rate":"Előtolás",
"Touch plate thickness":"Érintőlemez vastagsága",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"Fűtött ágy",
"Chamber":"Chamber",
"Board":"Board",
"Busy...":"Elfoglalt...",
"Camera":"Kamera",
"Cancel":"Elvet",
"Cannot get EEPROM content!":"Az EEPROM tartalom nem olvasható",
"Clear":"Tisztít",
"Close":"Bezár",
"Color":"Szin",
"Commands":"Parancsok",
"Communication locked by another process, retry later.":"A kommunikációt egy másik folyamat zárolja, próbálkozzon később újra.",
"Communication locked!":"A kommunikáció zárolva van!",
"Communications are currently locked, please wait and retry.":"A kommunikációt egy másik folyamat zárolja várjon, majd próbálkozzon újra.",
"Confirm deletion of directory: ":"Erősítse meg a könyvtár törlését: ",
"Confirm deletion of file: ":"Erősítse meg a fájl törlését: ",
"Connecting ESP3D...":"ESP3D kapcsolat létrehozása...",
"Connection failed! is your FW correct?":"Kapcsolat nem sikerült! helyes az Ön FW-je?",
"Controls":"Irányítás",
"Credits":"Köszönet",
"Dashboard":"Alaplap",
"Data modified":"Az adatok frissítve",
"Do you want to save?":"Meg kell menteni?",
"Enable second extruder controls":"Aktiválja a második extrudert",
"Error":"Hiba",
"ESP3D Filesystem":"ESP3D Fájlrendszer",
"ESP3D Settings":"ESP3D Beállítások",
"ESP3D Status":"ESP3D Állapot",
"ESP3D Update":"ESP3D Frissítés",
"Extrude":"Extruder",
"Extruder T0":"Extruder T0",
"Extruder T1":"Extruder T1",
"Extruders":"Extruderek",
"Fan (0-100%)":"Hűtés (0-100%)",
"Feed (25-150%)":"Kitöltés (25-150%)",
"Feedrate :":"Kitöltésielőtolás :",
"Filename":"Fájlnév",
"Filename/URI":"Fájlnév/URI",
"Verbose mode":"Beszédes mód",
"Firmware":"Firmware",
"Flow (50-300%)":"Folyam (50-300%)",
"Heater T0":"Fűtés T0",
"Heater T1":"Fűtés T1",
"Help":"Segítség",
"Icon":"Szimbólum",
"Interface":"Interfész",
"Join":"Csatlakozás",
"Label":"Cimke",
"List of available Access Points":"A rendelkezésre álló hozzáférési pontok listája",
"Macro Editor":"Makró Editor",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Motor KI",
"Name":"Név",
"Name:":"Név:",
"Network":"Hálózat",
"No SD card detected":"SD Kártya felismerhetetlen",
"No":"Nem",
"Occupation:":"Elfoglalt",
"Ok":"Ok",
"Options":"Opciók",
"Out of range":"Hatótávolságon kívül",
"Please Confirm":"Kérem erősítse meg",
"Please enter directory name":"Adja meg a könyvtár nevét",
"Please wait...":"Kérem várjon...",
"Printer configuration":"Nyomtató Konfigurálás",
"GRBL configuration":"GRBL Konfigurálás",
"Printer":"Nyomtató",
"Progress":"Folyamat",
"Protected":"Védett",
"Refresh":"Frissít",
"Restart ESP3D":"ESP3D Újraindít",
"Restarting ESP3D":"ESP3D újraindúl",
"Restarting":"Újraindít",
"Restarting, please wait....":"Újraindítás kérem vájon...",
"Retry":"Újra",
"Reverse":"Fordított",
"Save macro list failed!":"A makrólista mentése sikertelen!",
"Save":"Ment",
"Saving":"Mentés:",
"Scanning":"Letapogat",
"SD Files":"SD Fájlok",
"sec":"mp",
"Send Command...":"Parancs küldése...",
"Send":"Küld",
"Set failed":"A beállítás sikertelen",
"Set":"Beállít",
"Signal":"Jel",
"Size":"Méret",
"SSID":"SSID",
"Target":"Cél",
"Temperatures":"Hőmérsékletek",
"Total:":"Teljes:",
"Type":"Típus",
"Update Firmware ?":"A Firmwaret frissíti?",
"Update is ongoing, please wait and retry.":"A frissítés folyamatban van, kérjük várjon, és próbálkozzon újra.",
"Update":"Frissít",
"Upload failed":"A feltöltés sikertelen",
"Upload":"Feltöltés",
"Uploading ":"Feltöltés ",
"Upload done":"A feltöltés kész",
"Used:":"Benutzt:",
"Value | Target":"Érték | Cél",
"Value":"Érték",
"Wrong data":"Hibás adat",
"Yes":"Igen",
"Light":"Egyszerű",
"None":"Nincs",
"Modem":"Modem",
"STA":"Munkaállomás",
"AP":"Hozzáférési Pont",
"Baud Rate":"Baudrate",
"Sleep Mode":"Alvó Mód",
"Web Port":"Web Port",
"Data Port":"Adat Port",
"Hostname":"Hostnév",
"Wifi mode":"Wifi Mód",
"Station SSID":"Munkaállomás SSID",
"Station Password":"Munkaállomás Jelszó",
"Station Network Mode":"Munkaállomás Hálózat Mód",
"Station IP Mode":"Munkaállomás IP Mód",
"DHCP":"Dinamikus",
"Static":"Fix",
"Station Static IP":"Munkaállomás Fix IP",
"Station Static Mask":"Munkaállomás Fix Maszk",
"Station Static Gateway":"Munkaállomás Fix Átjáró",
"AP SSID":"AP SSID",
"AP Password":"AP Jelszó",
"AP Network Mode":"AP Hálózat Mód",
"SSID Visible":"SSID Láthatóság",
"AP Channel":"AP Csatorna",
"Open":"Megnyit",
"Authentication":"Hitelesítés",
"AP IP Mode":"AP IP Mód",
"AP Static IP":"AP Fix IP",
"AP Static Mask":"AP Fix Maszk",
"AP Static Gateway":"AP Fix Átjáró",
"Time Zone":"Időzóna",
"Day Saving Time":"Nyári időszámítás",
"Time Server 1":"Idő Szerver 1",
"Time Server 2":"Idő Szerver 2",
"Time Server 3":"Idő Szerver 3",
"TargetFW":"Cél FW",
"Target FW":"Cél FW",
"Direct SD access":"Közvetlen SD hozzáférés",
"Direct SD Boot Check":"Közvetlen SD indítási ellenőrzés",
"Primary SD":"Elsődleges SD",
"Secondary SD":"Másodlagos SD",
"Temperature Refresh Time":"Hőmérséklet frissítési idő",
"Position Refresh Time":"Pozíció frissítési ideje",
"Status Refresh Time":"Állapotfrissítési idő",
"XY feedrate":"XY adagolási sebesség",
"Z feedrate":"Z előtolás",
"E feedrate":"E előtolási sebesség",
"Camera address":"Kamera IP",
"Setup":"Beállítás",
"Start setup":"Start",
"This wizard will help you to configure the basic settings.":"Ez a varázsló segít az alapbeállítások konfigurálásában.",
"Press start to proceed.":"A folytatáshoz nyomja meg a Start gombot.",
"Save your printer's firmware base:":"Mentse el az alapvető firmware-beállításokat:",
"This is mandatory to get ESP working properly.":"Ez szükséges az ESP megfelelő működéséhez.",
"Save your printer's board current baud rate:":"Mentse el a Nyomtatók aktuális adatátviteli sebességét:",
"Printer and ESP board must use same baud rate to communicate properly.":"A nyomtatónak és az ESP modulnak ugyanolyan adatátviteli sebességet kell használnia a megfelelő kommunikációhoz.",
"Continue":"Tovább",
"WiFi Configuration":"WiFi Konfigurálása",
"Define ESP role:":"Az ESP szabály meghatározása:",
"AP define access point / STA allows to join existing network":"Az AP meghatározza a hozzáférési pontot / STA lehetővé teszi a létező hálózathoz való csatlakozást",
"What access point ESP need to be connected to:":"Melyik hálózathoz kell csatlakoztatni az ESP-t:",
"You can use scan button, to list available access points.":"A beolvasás gomb segítségével felsorolhatja az elérhető hozzáférési pontokat.",
"Password to join access point:":"Jelszó a hozzáférési ponthoz való csatlakozáshoz:",
"Define ESP name:":"Adja meg az ESP nevét:",
"What is ESP access point SSID:":"Mi legyen az ESP hozzáférési pont SSID neve:",
"Password for access point:":"A hozzáférési pont jelszava:",
"Define security:":"A biztonság meghatározása:",
"SD Card Configuration":"SD kártya konfigurálása",
"Is ESP connected to SD card:":"Csatlakoztatva van az ESP az SD kártyához:",
"Check update using direct SD access:":"Ellenőrizze a frissítést a közvetlen SD-hozzáférés használatával:",
"SD card connected to ESP":"SD kártya csatlakoztatva az ESP-hez",
"SD card connected to printer":"SD-kártya csatlakoztatva a nyomtatóhoz",
"Setup is finished.":"A telepítés kész.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"A bezárás után bármikor módosíthatja vagy finomíthatja a beállításokat a fő felületen.",
"You may need to restart the board to apply the new settings and connect again.":"Az új beállítások alkalmazásához és az újbóli csatlakozáshoz valószínűleg újra kell indítania a Wifi modult.",
"Identification requested":"Regisztráció szükséges",
"admin":"Adminisztrátor",
"user":"Felhasználó",
"guest":"Vendég",
"Identification invalid!":"Azonosítás érvénytelen!",
"Passwords do not matches!":"A jelszaavak nem egyeznek",
"Password must be >1 and <16 without space!":"A jelszónak> 1 és <16 kell lennie szünet nélkül!",
"User:":"Felhasználó:",
"Password:":"Jelszó:",
"Submit":"Küld",
"Change Password":"Jelszó Csere",
"Current Password:":"Aktuális Jelszó:",
"New Password:":"Új Jelszó:",
"Confirm New Password:":"Jelszó megerősítés:",
"Error : Incorrect User":"Hiba: Rossz Felhasználó",
"Error: Incorrect password":"Hiba: Rossz Jelszó",
"Error: Missing data":"Hiba: Helytelen Adat",
"Error: Cannot apply changes":"Hiba: Nem lehet alkalmazni a módosításokat",
"Error: Too many connections":"Hiba: Túl sok a kapcsolat",
"Authentication failed!":"A hitelesítés sikertelen!",
"Serial is busy, retry later!":"Kommunikációs csatorna elfoglalt!",
"Login":"Belépés",
"Log out":"Kilépés",
"Password":"Jelszó",
"No SD Card":"Nimcs SD Kártya",
"Check for Update":"Ellenőrizze a frissítést",
"Please use 8.3 filename only.":"Csak a 8.3 fájlnevet használja.",
"Preferences":"Tulajdonságok",
"Feature":"Funkció",
"Show camera panel":"Mutassa a kamera panelt",
"Auto load camera":"Indítsa el a kamerát automatikusan",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"Aktiválja a fűthető ágyat",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"A ventilátor vezérlésének engedélyezése",
"Enable Z controls":"Aktiválja a Z tengelyt",
"Panels":"Panelek",
"Show control panel":"A pozíciók panel megjelenítése",
"Show temperatures panel":"A hőmérsékleti panel megjelenítése",
"Show extruder panel":"Az extruder panel megjelenítése",
"Show files panel":"A fájlok panel megjelenítése",
"Show GRBL panel":"Mutassa a GRBL panelt",
"Show commands panel":"A parancsok panel megjelenítése",
"Select files":"Válasszon fájlokat",
"Select file":"Válasszon fájlt",
"$n files":"$n fájlok",
"No file chosen":"Nem választott fáltt",
"Length":"Filament hossza",
"Output msg":"Kimeneti üzenet",
"Enable":"Engedélyez",
"Disable":"Tilt",
"Serial":"Soros kapcsolat",
"Chip ID":"Processzor-ID",
"CPU Freqveuency":"Processzor Frekvencia",
"CPU Temperature":"Processzor Hőmérséklet",
"Free memory":"Szabad memória",
"Flash Size":"Flash méret",
"Available Size for update":"Rendelkezésre álló méret a frissítéshez",
"Available Size for SPIFFS":"Rendelkezésre álló méret SPIFFS-hez",
"Baud rate":"Baudrate",
"Sleep mode":"Alvó Mód",
"Channel":"Csatorna",
"Phy Mode":"Hálózat típusa",
"Web port":"Web Port",
"Data port":"Adat Port",
"Active Mode":"Aktív Mód",
"Connected to":"Csatlakoztatva",
"IP Mode":"IP-Mód",
"Gateway":"Átjáró",
"Mask":"Maszk",
"DNS":"DNS",
"Disabled Mode":"Inaktív Mód",
"Captive portal":"Beléptető Portal",
"Enabled":"Aktívált",
"Web Update":"Webes Frissítés",
"Pin Recovery":"Pin helyreállítás",
"Disabled":"Inaktív",
"Target Firmware":"Cél Firmware",
"SD Card Support":"Támogassa az SD kártyát",
"Time Support":"Idő Szerver",
"M117 output":"A nyomtató kimenet",
"Oled output":"Megjelenítés az OLED képernyőn",
"Serial output":"Kijelzés a soros porton",
"Web socket output":"Megjelenítés a web modulon",
"TCP output":"TCP kimenet",
"FW version":"Verzió",
"Show DHT output":"Mutassa a DHT-t",
"DHT Type":"DHT Típus",
"DHT check (seconds)":"DHT vezérlési intervallum (másodpercben)",
"SD speed divider":"Az SD kártya sebesség elosztója",
"Number of extruders":"Az extruderek száma",
"Mixed extruders":"Vegyes extruderek",
"Extruder":"Extruder",
"Enable lock interface":"Zár felület engedélyezése",
"Lock interface":"Zárolt felület",
"Unlock interface":"Nyitott felület",
"You are disconnected":"Nincs kapcsolat",
"Looks like you are connected from another place, so this page is now disconnected":"Úgy tűnik, hogy kapcsolódik egy másik helyhez, tehát ez az oldal elválasztva van.",
"Please reconnect me":"Kérem, csatlakoztasson újra",
"Mist":"Köd",
"Flood":"Áradás",
"Spindle":"Orsó",
"Connection monitoring":"A kapcsolat figyelése",
"XY Feedrate value must be at least 1 mm/min!":"A XY előtolás értékének legalább 1 mm / perc-nek kell lennie!",
"Z Feedrate value must be at least 1 mm/min!":"Z Az előtolás értékének legalább 1 mm / perc-nek kell lennie!",
"Hold:0":"Tartsa teljes. Készen áll a folytatásra.",
"Hold:1":"Tartsd folyamatban. A Reset riasztást ad.",
"Door:0":"Az ajtó zárva. Készen áll a folytatásra.",
"Door:1":"A gép leállt. Ajtó még mindig nyitva van. Nem lehet folytatni, amíg bezárták.",
"Door:2":"Az ajtó kinyílt. Tartsa folyamatban (vagy parkolási visszahúzást) folyamatban. A Reset riasztást ad.",
"Door:3":"Az ajtó zárva és folytatódik. Helyreállítás a parkból, ha alkalmazható. A Reset riasztást ad.",
"ALARM:1":"A kemény limit aktiválódott. A gép helyzete valószínűleg elveszik a hirtelen megállás miatt. Erősen ajánlott az újbóli elhelyezés.",
"ALARM:2":"Lágy végjelzés. A G-kódos mozgáscél meghaladja a gépjármű menetét. A gép helyzete megmarad. A riasztás biztonságosan lezárható.",
"ALARM:3":"Reset mozgás közben. A gép helyzete valószínűleg elveszik a hirtelen megállás miatt. Erősen ajánlott az újbóli elhelyezés.",
"ALARM:4":"A próba meghiúsul. A próba nincs a várt kezdeti állapotban a szondaciklus megkezdése előtt, ha a G38.2 és a G38.3 nem indul el, és a G38.4 és G38.5 indul",
"ALARM:5":"A szonda meghiúsul. A szonda nem érintkezett a munkadarabmal a G38.2 és G38.4 programozott menetében.",
"ALARM:6":"A házba jutás sikertelen. Az aktív illesztési ciklust visszaállítottuk.",
"ALARM:7":"A házba jutás sikertelen. A biztonsági ajtót kinyitották a háztartási ciklus alatt.",
"ALARM:8":"A házba jutás sikertelen. A végállás kapcsolót nem sikerült meghúzni. Próbálja meg növelni a pull-off beállítást, vagy ellenőrizze a huzalozást.",
"ALARM:9":"A házba jutás sikertelen. Nem található a végállás kapcsoló a keresési távolságon belül. Próbálja meg növelni a maximális utazást, csökkentse a lehúzási távolságot, vagy ellenőrizze a vezetékeket.",
"error:1":"A G-kód szavak betűből és értékből állnak. Levél nem található.",
"error:2":"Hiányzik a várt G-kód szóérték vagy numerikus értékformátum.",
"error:3":"Grbl '$' A rendszerparancsot nem ismerte fel vagy nem támogatja.",
"error:4":"A várt pozitív érték negatív értéke.",
"error:5":"Az otthoni ciklus hibája. Az elhelyezés nem engedélyezett a beállításokon keresztül.",
"error:6":"A minimális lépésimpulzus időnek nagyobbnak kell lennie, mint 3 ms.",
"error:7":"Az EEPROM olvasása sikertelen. Az érintett EEPROM automatikus visszaállítása az alapértelmezett értékekre.",
"error:8":"Grbl '$' parancs csak akkor használható, ha a Grbl IDLE. Gondos működést biztosít munka közben.",
"error:9":"A G-kód parancsok ki vannak zárva riasztás vagy jog állapotban.",
"error:10":"A lágy határokat nem lehet engedélyezni, ha a házelhelyezés szintén nem engedélyezett.",
"error:11":"Túlhaladt a soronkénti maximális karakter A fogadott parancssort nem hajtották végre.",
"error:12":"Grbl '$' beállító érték miatt a lépéssebesség meghaladja a maximálisan támogatott értéket.",
"error:13":"A biztonsági ajtó nyitva van és az ajtó állapota beindítva.",
"error:14":"Az építkezési információ vagy az indító vonal meghaladta az EEPROM vonalhossz-határértéket. A sor nincs tárolva.",
"error:15":"A Jog cél meghaladja a gépjárművezetést. A Jog parancsot figyelmen kívül hagyták.",
"error:16":"A Jog parancsnak nincs '=' vagy tiltott g-kódot tartalmaz.",
"error:17":"A lézer üzemmódhoz PWM kimenet szükséges.",
"error:20":"Nem támogatott vagy érvénytelen g-kód parancs található a blokkban.",
"error:21":"Egynél több g-kód parancs ugyanabból a modális csoportból található a blokkban.",
"error:22":"Az előtolás még nincs beállítva, vagy nincs meghatározva.",
"error:23":"A blokkban lévő G-kód parancs egész számot igényel.",
"error:24":"Egynél több g-kód parancs, amely megköveteli a blokkban található tengelyszavak használatát.",
"error:25":"A blokkban található ismétlődő g-kód szó",
"error:26":"Nincsenek tengelyszavak blokkban található g-kód parancshoz vagy az azokat igénylő modális állapothoz.",
"error:27":"A sorszám értéke érvénytelen.",
"error:28":"A G-kód parancsból hiányzik egy kötelező érték szó.",
"error:29":"A G59.x munkakoordináta-rendszerek nem támogatottak.",
"error:30":"A G53 csak G0 és G1 mozgásmóddal engedélyezett.",
"error:31":"Tengelyszavak, amelyek blokkban találhatók, ha egyetlen parancs sem a jelenlegi modális állapot használja őket.",
"error:32":"A G2 és G3 íveknek legalább egy síkban lévő tengelyre van szükségük.",
"error:33":"A mozgásparancs célja érvénytelen.",
"error:34":"Az ív sugara értéke érvénytelen.",
"error:35":"A G2 és G3 íveknek legalább egy síkbeli eltolás szóra van szükségük.",
"error:36":"A blokkban található nem használt értékszavak.",
"error:37":"A G43.1 dinamikus szerszámhossz-eltolás nincs hozzárendelve a konfigurált szerszámhossz-tengelyhez.",
"error:38":"A szerszám száma meghaladja a maximális támogatott értéket.",
"error:60":"Az SD-t nem sikerült csatlakoztatni",
"error:61":"Az SD-kártyaról nem tudta megnyitni a fájlt olvasáshoz",
"error:62":"Nem sikerült az SD-kártyán lévő mappa megnyitása",
"error:63":"Az SD kártya könyvtára nem található",
"error:64":"SD Kártya fájl üres",
"error:70":"Bluetooth nem indult el!",
"Max travel":"Max utazás",
"Plate thickness":"Érintőlemez vastagsága",
"Show probe panel":"Mutassa a szonda panelt",
"Probe":"Szonda",
"Start Probe":"Start Szonda",
"Touch status":"Érintési álllapot",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"A szonda maximális mozgásának értékének 1 mm és 9999 mm között kell lennie!",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"A tapintólemez vastagságának 0 mm és 9999 mm között kell lennie!",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"A szonda előtolásának értékének 1 mm / perc és 9999 mm / perc között kell lennie!",
"Probe failed !":"A szondázás sikertelen!",
"Probe result saved.":"A szondázás eredménye elmentve.",
"Browser:":"Böngésző:",
"Probing...":"Letapogatás...",
"Step pulse, microseconds":"Lépés impulzus, mikroszekundumokban",
"Step idle delay, milliseconds":"Lépés üresjárati késleltetés, ezredmásodperc",
"Step port invert, mask2":"Lépési port fordított, maszk",
"Direction port invert, mask":"Irány port fordított, maszk",
"Step enable invert, boolean":"Lépés bekapcsolása fordított logikai",
"Limit pins invert, boolean":"Végállás kpacsolók fordított, logikai",
"Probe pin invert, boolean":"Szonda/Tapintó fordított, logikai",
"Status report, mask":"Állapotjelentés, maszk",
"Junction deviation, mm":"Csomóponteltérés, mm",
"Arc tolerance, mm":"Ívtűrés, mm",
"Report inches, boolean":"Jelentés hüvelykben, logikai érték",
"Soft limits, boolean":"Lágy határok, logikai",
"Hard limits, boolean":"Kemény határok, logikai",
"Homing cycle, boolean":"Hazatérés, logikai",
"Homing dir invert, mask":"Belső rendezés fordított, maszk",
"Homing feed, mm/min":"Hazatérés lépték, mm/min",
"Homing seek, mm/min":"Lakáskeresés, mm/min",
"Homing debounce, milliseconds":"Hazatérésidő, ezredmásodperc",
"Homing pull-off, mm":"Hazatérés pull-off, mm",
"Max spindle speed, RPM":"Orsó maximális sebessége, RPM",
"Min spindle speed, RPM":"Minimális orsósebesség, RPM",
"Laser mode, boolean":"Lézer mód, logikai",
"X steps/mm":"X lépések/mm",
"Y steps/mm":"Y lépések/mm",
"Z steps/mm":"Z lépések/mm",
"X Max rate, mm/min":"X Maximális arány, mm/min",
"Y Max rate, mm/min":"Y Maximális arány, mm/min",
"Z Max rate, mm/min":"Z Maximális arány, mm/min",
"X Acceleration, mm/sec^2":"X Gyorsulás, mm/sec^2",
"Y Acceleration, mm/sec^2":"Y Gyorsulás, mm/sec^2",
"Z Acceleration, mm/sec^2":"Z Gyorsulás, mm/sec^2",
"X Max travel, mm":"X Max utazás, mm",
"Y Max travel, mm":"Y Max utazás, mm",
"Z Max travel, mm":"Z Max utazás, mm",
"File extensions (use ; to separate)":"Fájl kiterjesztések (használja; szétválasztáshoz)",
"Web Socket":"Web modulon"
};
//endRemoveIf(hu_lang_disabled)

//removeIf(it_lang_disabled)
//italian
var italiantrans = {
"it":"Italiano",
"ESP3D for":"ESP3D per",
"Value of auto-check must be between 0s and 99s !!":"Il valore di controllo deve essere tra 0 e 99 secondi!!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"Il valore della velocit&agrave; di estrusione deve essere tra 1 mm/min e 9999 mm/min !",
"Value of filament length must be between 0.001 mm and 9999 mm !":"Il valore della distanza di estrusione deve essere tra 0.001 mm e 9999 mm !",
"cannot have '-', '#' char or be empty":"non pu&oacute; contenere i caratteri '-', '#'  o essere vuoto",
"cannot have '-', 'e' char or be empty":"non pu&oacute; contenere i caratteri '-', 'e'  o essere vuoto",
"Failed:":"Fallito: ",
"File config / config.txt not found!":"Fle di configurazione config / config.txt non trovato!",
"File name cannot be empty!":"Il nome del file non pu&oacute; essere vuoto",
"Value must be ":"Il valore deve essere ",
"Value must be between 0 degres and 999 degres !":"Il valore deve essere compreso tra 0 e 999 gradi !",
"Value must be between 0% and 100% !":"Il valore deve essere tra 0% e 100% !",
"Value must be between 25% and 150% !":"Il valore deve essere tra 25% e 150% !",
"Value must be between 50% and 300% !":"Il valore deve essere tra 50% e 300%",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"Il valore di avanzamento XY deve essere tra 1mm/min e 999mm/min !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Il valore di avanzamento Z deve essere tra 1mm/min e 999mm/min !",
" seconds":" secondi",
"Abort":"Annulla",
"auto-check every:":"Verifica ogni:",
"auto-check position every:":"Verifica pos. ogni:",
"Autoscroll":"Scorrimento automatico",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"Piatto di stampa",
"Chamber":"Chamber",
"Board":"Scheda",
"Busy...":"Occupato...",
"Camera":"Camera",
"Cancel":"Cancella",
"Cannot get EEPROM content!":"Impossibile ottenere il contenuto della EEPROM",
"Clear":"Pulisci",
"Close":"Chiudi",
"Color":"Colore",
"Commands":"Comandi",
"Communication locked by another process, retry later.":"Comunicazione bloccata da un altro processo, riprovare pi&ugrave; tardi.",
"Communication locked!":"Comunicazione bloccata!",
"Communications are currently locked, please wait and retry.":"Le comunicazioni sono attualmente bloccate; Riprovare pi&ugrave; tardi!",
"Confirm deletion of directory: ":"Confermare la cancellazione della directory: ",
"Confirm deletion of file: ":"Confermare la cancellazione del file: ",
"Connecting ESP3D...":"Connessione a ESP3D",
"Connection failed! is your FW correct?":"Impossibile connettersi! Verificare la scelta del FW",
"Controls":"Controlli",
"Credits":"Crediti",
"Dashboard":"Dashboard",
"Data modified":"Dati modificati",
"Do you want to save?":"Vuoi salvare?",
"Enable second extruder controls":"Attiva controlli per il secondo estrusore",
"Error":"Errore",
"ESP3D Filesystem":"Filesystem ESP3D",
"ESP3D Settings":"Impostazioni ESP3D",
"ESP3D Status":"Stato ESP3D",
"ESP3D Update":"Agg. FW ESP3D",
"Extrude":"Estrusione",
"Extruder T0":"Estrusore E0",
"Extruder T1":"Estrusore E1",
"Extruders":"Estrusori",
"Fan (0-100%)":"Ventola (0-100%)",
"Feed (25-150%)":"Velocit&aacute; (25-150%)",
"Feedrate :":"Avanzamento :",
"Filename":"Nome del File",
"Filename/URI":"Nome del File/URI",
"Verbose mode":"Modalit&agrave; dettagliata",
"Firmware":"Firmware",
"Flow (50-300%)":"Flusso (50-300%)",
"Heater T0":"Risc. E0",
"Heater T1":"Risc. E1",
"Help":"Aiuto",
"Icon":"Icona",
"Interface":"Interfaccia",
"Join":"Connetti",
"Label":"Etichetta",
"List of available Access Points":"Elenco degli Access Point disponibili",
"Macro Editor":"Editor di macro",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Ferma motori",
"Name":"Nome",
"Name:":"Nome:",
"Network":"Rete",
"No SD card detected":"Nessuna Scheda SD rilevata",
"No":"No",
"Occupation:":"Occupazione",
"Ok":"Ok",
"Options":"Opzioni",
"Out of range":"Fuori range",
"Please Confirm":"Confermare prego",
"Please enter directory name":"Inserire il nome della cartella",
"Please wait...":"Attendere...",
"Printer configuration":"Configurazione stampante",
"GRBL configuration":"Configurazione GRBL",
"Printer":"Stampante",
"Progress":"Avanzamento",
"Protected":"Protetto",
"Refresh":"Aggiorna",
"Restart ESP3D":"Riavvia ESP3D",
"Restarting ESP3D":"Riavvio di ESP3D",
"Restarting":"Riavvio in corso",
"Restarting, please wait....":"Riavvio in corso, attendere...",
"Retry":"Riprovare",
"Reverse":"Inverti",
"Save macro list failed!":"Registrazione macro fallita",
"Save":"Salva",
"Saving":"Salvataggio in corso",
"Scanning":"Scansione in corso",
"SD Files":"File sulla SD",
"sec":"sec",
"Send Command...":"Invia Comando...",
"Send":"Invia",
"Set failed":"Impost. fallita",
"Set":"Imposta",
"Signal":"Segnale",
"Size":"Dimens.",
"SSID":"SSID",
"Target":"Posizione",
"Temperatures":"Temperature",
"Total:":"Totale:",
"Type":"Tipo",
"Update Firmware ?":"Aggiornare il FW ?",
"Update is ongoing, please wait and retry.":"Aggiornamento in corso, Attendere e riprovare pi&uacute; tardi.",
"Update":"Aggiornamento",
"Upload failed : ":"Caricamento fallito : ",
"Upload failed":"Caricamento fallito",
"Upload":"Carica",
"Uploading ":"Caricamento ",
"Upload done":"Caricamento terminato",
"Used:":"Usato:",
"Value | Target":"Valore | Obiettivo",
"Value":"Valore",
"Wrong data":"Dati errati",
"Yes":"S&iacute;",
"Light":"Leggero",
"None":"Nessuno",
"Modem":"Modem",
"STA":"Router",
"AP":"AP",
"Baud Rate":"Baud Rate",
"Sleep Mode":"Modalit&agrave; risp. energetico",
"Web Port":"Porta Web",
"Data Port":"Porta dati",
"Hostname":"Nome Host",
"Wifi mode":"Modalit&agrave; WiFi",
"Station SSID":"Identificativo SSID Router",
"Station Password":"Password WiFi Router",
"Station Network Mode":"Tipo di rete Router",
"Station IP Mode":"Modo IP Router",
"DHCP":"DHCP",
"Static":"Statico",
"Station Static IP":"IP Statico Router",
"Station Static Mask":"Maschera sottorete Router",
"Station Static Gateway":"Gateway Router",
"AP SSID":"Identificativo WiFi AP",
"AP Password":"Password WiFi AP",
"AP Network Mode":"Tipo di rete AP",
"SSID Visible":"SSID Visibile",
"AP Channel":"Canale AP",
"Open":"Open",
"Authentication":"Autenticazione",
"AP IP Mode":"Modo IP AP",
"AP Static IP":"IP statico AP",
"AP Static Mask":"Maschera sottorete AP",
"AP Static Gateway":"Gateway AP",
"Time Zone":"Fuso Orario",
"Day Saving Time":"Ora Legale",
"Time Server 1":"Server NTP 1",
"Time Server 2":"Server NTP 2",
"Time Server 3":"Server NTP 3",
"Target FW":"Firmware ",
"Direct SD access":"Connessione diretta al lettore SD",
"Direct SD Boot Check":"Controllo all'avvio del lettore SD",
"Primary SD":"Lettore SD primario",
"Secondary SD":"Lettore SD secondario",
"Temperature Refresh Time":"Intervallo di controllo delle temperature",
"Position Refresh Time":"Intervallo di controllo della Posizione",
"Status Refresh Time":"Intervallo di controllo del stato",
"XY feedrate":"Avanzamento XY",
"Z feedrate":"Avanzamento Z",
"E feedrate":"Avanzamento E",
"Camera address":"Indirizzo Camera",
"Setup":"Configurazione",
"Start setup":"Inizia la configurazione",
"This wizard will help you to configure the basic settings.":"Questo procedura guidata ti aiuter&agrave; nella la configurazione delle impostazioni di base.",
"Press start to proceed.":"Premi Inizia per proseguire.",
"Save your printer's firmware base:":"Salva il FW della Stampante: ",
"This is mandatory to get ESP working properly.":"Questo &eacute; indispensabile per il buon funzionamento di ESP3D.",
"Save your printer's board current baud rate:":"Salva il Baudrate della scheda della stampante:",
"Printer and ESP board must use same baud rate to communicate properly.":"La stampante ed ESP3D devono comunicare alla stessa velocit&aacute;.",
"Continue":"Continua",
"WiFi Configuration":"Configurazione WiFi",
"Define ESP role:":"Definire il ruolo di ESP3D:",
"AP define access point / STA allows to join existing network":"AP (Punto di Accesso) oppure STA (Accedere ad una rete esistente).",
"What access point ESP need to be connected to:":"A quale Rete Wifi ESP3D si deve collegare:",
"You can use scan button, to list available access points.":"Puoi visualizzare gli AP disponibili premendo il tasto Ricerca.",
"Password to join access point:":"Password della rete:",
"Define ESP name:":"Definire il nome di ESP3D nella rete:",
"What is ESP access point SSID:":"Definire l'identificativo AP ESP3D:",
"Password for access point:": "Password AP:",
"Define security:":"Tipo di Sicurezza:",
"SD Card Configuration":"Configurazione scheda SD ",
"Is ESP connected to SD card:":"ESP3D &eacute; direttamente connesso al lettore SD:",
"Check update using direct SD access:":"Controlla aggiornamento tramite accesso diretto al lettore SD all'avvio:",
"SD card connected to ESP":"Lettore scheda SD direttamente connesso all'ESP3D",
"SD card connected to printer":"Lettore SD Secondario",
"Setup is finished.":"Configurazione terminata.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Dopo la chiusura potrai modificare i valori, o affinare gli stessi, attraverso l'interfaccia principale.",
"You may need to restart the board to apply the new settings and connect again.":"Potrebbe essere necessario riavviare la scheda per applicare i nuovi valori e successivamente riconnettersi.",
"Identification requested":"Identificazione richiesta",
"admin":"amministratore",
"user":"utente",
"guest":"ospite;",
"Identification invalid!":"Identificazione non valida!",
"Passwords do not matches!":"Le password non corrispondono!",
"Password must be >1 and <16 without space!":"Le password devono avere una lunghezza compresa tra 1 e 16 caratteri e non devono contenere spazi!",
"User:":"Utente:",
"Password:":"Password:",
"Submit":"Inviare",
"Change Password":"Modifica Password",
"Current Password:":"Password attuale",
"New Password:":"Nuova Password:",
"Confirm New Password:":"Conferma la password:",
"Error : Incorrect User":"Errore : Utente sconosciuto",
"Error: Incorrect password":"Errore: Password non valida",
"Error: Missing data":"Errore: Dati mancanti",
"Error: Cannot apply changes":"Errore: Modifica impossibile",
"Error: Too many connections":"Errore: Troppe connessioni simultanee",
"Authentication failed!":"Autenticazione Fallita !",
"Serial is busy, retry later!":"Porta seriale occupata, riprovare pi&uacute; tardi!",
"Login":"Connetti",
"Log out":"Disconnetti",
"Password":"Password",
"No SD Card":"Nessuna scheda SD",
"Check for Update":"Controlla gli aggiornamenti",
"Please use 8.3 filename only.":"Utilizzare esclusivamente nomi dei file nel formato 8.3.",
"Preferences":"Preferenze",
"Feature":"Propriet&aacute;",
"Show camera panel":"Mostra il pannello della Camera",
"Auto load camera":"Caricare automaticamente la Camera",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"Attiva controlli del piano riscaldato",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"Attiva controlli della ventola",
"Enable Z controls":"Attiva controllo dell'asse Z",
"Panels":"Pannelli",
"Show control panel":"Mostra il pannello della posizione",
"Show temperatures panel":"Mostra il pannello delle temperature",
"Show extruder panel":"Mostra il pannello degli estrusori",
"Show files panel":"Mostra il panello dei file",
"Show GRBL panel":"Mostra il panello GRBL",
"Show commands panel":"Mostra il pannello dei comandi",
"Select files":"Seleziona i file",
"Select file":"Seleziona file",
"$n files":"$n file",
"No file chosen":"Nessun file selezionato",
"Length":"Lunghezza",
"Output msg":"Messaggio prodotto",
"Enable":"Abilita",
"Disable":"Disabilita",
"Serial":"Porta Seriale",
"Chip ID":"ID del processore",
"CPU Frequency":"Frequenza del processore",
"CPU Temperature":"Temperatura del processore",
"Free memory":"Memoria libera",
"Flash Size":"Dimens. flash",
"Available Size for update":"Dimens. disponibile per l'aggiornamento",
"Available Size for SPIFFS":"Dimens. disponibile per SPIFF",
"Baud rate":"Baud rate",
"Sleep mode":"Modalit&agrave; risparmio energetico",
"Channel":"Canale",
"Phy Mode":"Tipo di rete",
"Web port":"Porta Web",
"Data port":"Porta Dati",
"Active Mode":"Modo Attivo",
"Connected to":"Connesso a",
"IP Mode":"Modo IP",
"Gateway":"Gateway",
"Mask":"Subnet Mask",
"DNS":"DNS",
"Disabled Mode":"Modo disattivato",
"Captive portal":"Captive portal",
"Enabled":"Attivato",
"Web Update":"Aggiorna via Web",
"Pin Recovery":"Pin Ripristino",
"Disabled":"Disattivato",
"Authentication":"Autenticazione",
"Target Firmware":"Target Firmware",
"SD Card Support":"Supporto scheda SD",
"Time Support":"Server di tempo",
"M117 output":"M117 output",
"Oled output":"Uscita Oled",
"Serial output":"Uscita Seriale",
"Web socket output":"Uscita Web socket",
"TCP output":"Uscita TCP",
"FW version":"Versione FW",
"Show DHT output":"Mostra Uscita DHT",
"DHT Type":"Typo di DHT",
"DHT check (seconds)":"Intervallo controllo del DHT (secondi)",
"SD speed divider":"Divisore della velocit&agrave; della scheda SD",
"Number of extruders":"Numero di estrusori",
"Mixed extruders":"Estrusori misti",
"Extruder":"Estrusore",
"Enable lock interface":"Abilita il blocco dell'interfaccia",
"Lock interface":"Blocca l'interfaccia",
"Unlock interface":"Sblocca l'interfaccia",
"You are disconnected":"Sei disconnesso",
"Looks like you are connected from another place, so this page is now disconnected":"Sembra che ti sia connesso da un altro dispositivo, quindi questa pagina &egrave; ora disconnessa.",
"Please reconnect me":"Per favore ricollegami",
"Mist":"Nebbia",
"Flood":"Getto",
"Spindle":"Mandrino",
"Connection monitoring":"Monitoraggio della connessione",
"XY Feedrate value must be at least 1 mm/min!":"Avanzamento XY deve essere almeno 1 mm/min!",
"Z Feedrate value must be at least 1 mm/min!":"Avanzamento Z deve essere almeno 1 mm/min!",
"Hold:0":"Sosp Completata. Pronto a riprendere.",
"Hold:1":"Sosp. in corso. Reset generer&agrave; un allarme.",
"Door:0":"Porta chiusa. Pronto a riprendere.",
"Door:1":"Macchina ferma. Porta non chiusa. Non posso riprendere fino a chiusura completa.",
"Door:2":"Porta apertta. Sosp. (o parcheggio o ritrazione) in-corso. Reset generer&agrave; un allarme.",
"Door:3":"Porta chiusa and resuming. Riprensa dal parcheggio, se applicabile. Reset generer&agrave; un allarme.",
"ALARM:1":"Finecorsa fisici scattati. La posizione della macchina &eacute; probabilmente persa. Un nuovo HOME &eacute; altamente raccomandato.",
"ALARM:2":"Finecorsa software raggiunti. Il comando G-code supera i limiti macchina. La posizione macchina è mantenuta. L'Allarme pu&ograve; essere disattivato.",
"ALARM:3":"Reset mentre in movimento. La posizione della macchina &eacute; probabilmente persa. Un nuovo HOME &eacute; altamente raccomandato.",
"ALARM:4":"Sondaggio fallito. La Sonda non si trova nella posizione iniziale attesa prima dell'inizio del ciclo di sondaggio quando G38.2 e G38.3 non sono attivati e G38.4 e G38.5 sono attivat.",
"ALARM:5":"Sondaggio fallito. La Sonda non ha toccato il pezzo entro i limiti programmati da G38.2 e G38.4.",
"ALARM:6":"Homing fallito. Il ciclo di homing &eacute; stato interrotto.",
"ALARM:7":"Homing fallito. La Porta di sicurezza &eacute; stata aperta durante il ciclo di homing.",
"ALARM:8":"Homing fallito. La ritrazione non ha disattivato il finecorsa. Provare ad aumentare la ritrazione o controlla la filatura.",
"ALARM:9":"Homing fallito. Non sono stati trovati i finecorsa entro la distanza di ricerca. Provare ad aumentare la corsa massima, diminuire la ritrazione o controllare la filatura.",
"error:1":"I comandi G-code sono formati da una lettera e da un valore. Non &eacute; stata trovata la Lettera.",
"error:2":"Il valore del comando G-code non è stato trovato, o il formato del valore non &eacute; valido.",
"error:3":"Il comando di sistema '$' di GRBL non &eacute; stato riconosciuto o non &eacute; suportato.",
"error:4":"Ricevuto un valore Negativo quando ci si aspettava un valore positivo.",
"error:5":"Fallimento del di Homing. Homing non &eacute; abilitato nelle impostazioni.",
"error:6":"Il minimo impulso di STEP deve essere superiore a 3usec.",
"error:7":"Lettura della EEPROM fallita. Ripristino dei valori della EEPROM ai valori di default.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Max characters per line exceeded. Received command line was not executed.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Laser mode requires PWM output.",
"error:20":"Unsupported or invalid g-code command found in block.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Feed rate has not yet been set or is undefined.",
"error:23":"G-code command in block requires an integer value.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Repeated g-code word found in block.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Line number value is invalid.",
"error:28":"G-code command is missing a required value word.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Arc radius value is invalid.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Unused value words found in block.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Tool number greater than max supported value.",
"error:60":"SD failed to mount",
"error:61":"SD card failed to open file for reading",
"error:62":"SD card failed to open directory",
"error:63":"SD Card directory not found",
"error:64":"SD Card file empty",
"error:70":"Bluetooth failed to start",
};
//endRemoveIf(it_lang_disabled)

//ja
//removeIf(ja_lang_disabled)
//use https://www.mobilefish.com/services/unicode_converter/unicode_converter.php
var japanesetrans = {
"ja":"&#26085;&#26412;&#35486;",
"ESP3D for":"ESP3D for",
"Value of auto-check must be between 0s and 99s !!":"&#12458;&#12540;&#12488;&#12481;&#12455;&#12483;&#12463;&#12398;&#20516;&#12399;0&#65374;99&#31186;&#12398;&#38291;&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;&#12398;&#36895;&#24230;&#12399;1&#65374;9999mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value of filament length must be between 0.001 mm and 9999 mm !":"&#12501;&#12451;&#12521;&#12513;&#12531;&#12488;&#12398;&#38263;&#12373;&#12399;0.001&#65374;9999mm&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"cannot have '-', '#' char or be empty":"'-', '#'&#12398;&#25991;&#23383;&#12418;&#12375;&#12367;&#12399;&#31354;&#30333;&#12399;&#20837;&#12428;&#12427;&#12371;&#12392;&#12364;&#12391;&#12365;&#12414;&#12379;&#12435;",
"cannot have '-', 'e' char or be empty":"'-', 'e'&#12398;&#25991;&#23383;&#12418;&#12375;&#12367;&#12399;&#31354;&#30333;&#12399;&#20837;&#12428;&#12427;&#12371;&#12392;&#12364;&#12391;&#12365;&#12414;&#12379;&#12435;",
"Failed:":"&#22833;&#25943;:",
"File config / config.txt not found!":"File config / config.txt&#12364;&#35211;&#12388;&#12363;&#12426;&#12414;&#12379;&#12435;&#65281;",
"File name cannot be empty!":"&#12501;&#12449;&#12452;&#12523;&#21517;&#12399;&#31354;&#30333;&#12395;&#12391;&#12365;&#12414;&#12379;&#12435;&#65281;",
"Value must be ":"&#20516;&#12399;&#20197;&#19979;&#12398;&#36890;&#12426;&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;",
"Value must be between 0 degres and 999 degres !":"&#20516;&#12399; 0&#176;&#65374;999&#176;&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value must be between 0% and 100% !":"&#20516;&#12399;0&#65374;100%&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value must be between 25% and 150% !":"&#20516;&#12399;25&#65374;150%&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value must be between 50% and 300% !":"&#20516;&#12399;50&#65374;300%&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"XY&#12398;&#36865;&#12426;&#36895;&#24230;&#12399;1&#65374;9999mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Z&#12398;&#36865;&#12426;&#36895;&#24230;&#12399;1&#65374;999mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
" seconds":" &#31186;",
"Abort":"&#20013;&#27490;",
"auto-check every:":"&#12458;&#12540;&#12488;&#12481;&#12455;&#12483;&#12463;&#38291;&#38548;:",
"auto-check position every:":"&#20301;&#32622;&#12458;&#12540;&#12488;&#12481;&#12455;&#12483;&#12463;&#38291;&#38548;:",
"Autoscroll":"&#12458;&#12540;&#12488;&#12473;&#12463;&#12525;&#12540;&#12523;",
"Max travel":"&#26368;&#22823;&#31227;&#21205;&#37327;",
"Feed rate":"&#36865;&#12426;&#36895;&#24230;",
"Touch plate thickness":"&#12479;&#12483;&#12481;&#12503;&#12524;&#12540;&#12488;&#21402;&#12373;",
"Redundant":"Redundant",
"Probe":"&#12503;&#12525;&#12540;&#12502;",
"Bed":"&#12505;&#12483;&#12489;",
"Chamber":"&#12481;&#12515;&#12531;&#12496;&#12540;",
"Board":"&#12508;&#12540;&#12489;",
"Busy...":"&#12499;&#12472;&#12540;...",
"Camera":"&#12459;&#12513;&#12521;",
"Cancel":"&#12461;&#12515;&#12531;&#12475;&#12523;",
"Cannot get EEPROM content!":"EEPROM&#12398;&#20869;&#23481;&#12434;&#21462;&#24471;&#12391;&#12365;&#12414;&#12379;&#12435;&#65281;",
"Clear":"Clear",
"Close":"&#38281;&#12376;&#12427;",
"Color":"&#12459;&#12521;&#12540;",
"Commands":"&#12467;&#12510;&#12531;&#12489;",
"Communication locked by another process, retry later.":"&#36890;&#20449;&#12364;&#20182;&#12398;&#12503;&#12525;&#12475;&#12473;&#12395;&#12424;&#12387;&#12390;&#12525;&#12483;&#12463;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;&#24460;&#12363;&#12425;&#12522;&#12488;&#12521;&#12452;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"Communication locked!":"&#36890;&#20449;&#12364;&#12525;&#12483;&#12463;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#65281;",
"Communications are currently locked, please wait and retry.":"&#36890;&#20449;&#12364;&#29694;&#22312;&#12525;&#12483;&#12463;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;&#12375;&#12400;&#12425;&#12367;&#24453;&#12388;&#12363;&#12522;&#12488;&#12521;&#12452;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"Confirm deletion of directory: ":"&#12487;&#12451;&#12524;&#12463;&#12488;&#12522;&#21066;&#38500;&#12398;&#30906;&#35469;: ",
"Confirm deletion of file: ":"&#12501;&#12449;&#12452;&#12523;&#21066;&#38500;&#12398;&#30906;&#35469;: ",
"Connecting ESP3D...":"ESP3D&#12395;&#25509;&#32154;&#20013;...",
"Connection failed! is your FW correct?":"&#25509;&#32154;&#22833;&#25943;&#12290;&#27491;&#12375;&#12356;&#12501;&#12449;&#12540;&#12512;&#12454;&#12455;&#12450;&#12391;&#12377;&#12363;&#65311;",
"Controls":"&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;",
"Credits":"&#12463;&#12524;&#12472;&#12483;&#12488;",
"Dashboard":"&#12480;&#12483;&#12471;&#12517;&#12508;&#12540;&#12489;",
"Data modified":"&#12487;&#12540;&#12479;&#22793;&#26356;",
"Do you want to save?":"&#20445;&#23384;&#12375;&#12414;&#12377;&#12363;&#65311;",
"Enable second extruder controls":"&#12475;&#12459;&#12531;&#12489;&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;&#12398;&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#12434;&#26377;&#21177;&#21270;",
"Error":"Error",
"ESP3D Filesystem":"ESP3D &#12501;&#12449;&#12452;&#12523;&#12471;&#12473;&#12486;&#12512;",
"ESP3D Settings":"ESP3D &#35373;&#23450;",
"ESP3D Status":"ESP3D &#12473;&#12486;&#12540;&#12479;&#12473;",
"ESP3D Update":"ESP3D &#12450;&#12483;&#12503;&#12487;&#12540;&#12488;",
"Extrude":"&#25276;&#20986;&#12375;",
"Extruder T0":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540; T0",
"Extruder T1":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;  T1",
"Extruders":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;",
"Fan (0-100%)":"&#12501;&#12449;&#12531; (0-100%)",
"Feed (25-150%)":"&#36865;&#12426; (25-150%)",
"Feedrate :":"&#36865;&#12426;&#36895;&#24230; :",
"Filename":"&#12501;&#12449;&#12452;&#12523;&#21517;",
"Filename/URI":"&#12501;&#12449;&#12452;&#12523;&#21517;/URI",
"Verbose mode":"&#35443;&#32048;&#12514;&#12540;&#12489;",
"Firmware":"&#12501;&#12449;&#12540;&#12512;&#12454;&#12455;&#12450;",
"Flow (50-300%)":"Flow (50-300%)",
"Heater T0":"&#12498;&#12540;&#12479;&#12540; T0",
"Heater T1":"&#12498;&#12540;&#12479;&#12540; T1",
"Help":"&#12504;&#12523;&#12503;",
"Icon":"&#12450;&#12452;&#12467;&#12531;",
"Interface":"&#12452;&#12531;&#12479;&#12540;&#12501;&#12455;&#12540;&#12473;",
"Join":"&#36861;&#21152;",
"Label":"&#12521;&#12505;&#12523;",
"List of available Access Points":"&#26377;&#21177;&#12394;&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12398;&#19968;&#35239;",
"Macro Editor":"&#12510;&#12463;&#12525;&#12456;&#12487;&#12451;&#12479;&#12540;",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"&#12514;&#12540;&#12479;&#12540;off",
"Name":"&#21517;&#21069;",
"Name:":"&#21517;&#21069;:",
"Network":"&#12493;&#12483;&#12488;&#12527;&#12540;&#12463;",
"No SD card detected":"SD&#12459;&#12540;&#12489;&#12364;&#26908;&#20986;&#12373;&#12428;&#12414;&#12379;&#12435;",
"No":"No",
"Occupation:":"Occupation:",
"Ok":"Ok",
"Options":"&#12458;&#12503;&#12471;&#12519;&#12531;",
"Out of range":"&#31684;&#22258;&#22806;",
"Please Confirm":"&#30906;&#35469;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;",
"Please enter directory name":"&#12487;&#12451;&#12524;&#12463;&#12488;&#12522;&#21517;&#12434;&#20837;&#21147;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;",
"Please wait...":"&#12362;&#24453;&#12385;&#12367;&#12384;&#12373;&#12356;...",
"Printer configuration":"&#12503;&#12522;&#12531;&#12479;&#12540;&#35373;&#23450;",
"GRBL configuration":"GRBL&#35373;&#23450;",
"Printer":"&#12503;&#12522;&#12531;&#12479;&#12540;",
"Progress":"&#36914;&#25431;",
"Protected":"Protected",
"Refresh":"&#26356;&#26032;",
"Restart ESP3D":"ESP3D&#12434;&#20877;&#36215;&#21205;",
"Restarting ESP3D":"ESP3D&#12434;&#20877;&#36215;&#21205;&#20013;",
"Restarting":"&#20877;&#36215;&#21205;&#20013;",
"Restarting, please wait....":"&#20877;&#36215;&#21205;&#20013;&#12391;&#12377;&#12290;&#12362;&#24453;&#12385;&#12367;&#12384;&#12373;&#12356;....",
"Retry":"&#12522;&#12488;&#12521;&#12452;",
"Reverse":"Reverse",
"Save macro list failed!":"&#12510;&#12463;&#12525;&#12522;&#12473;&#12488;&#12398;&#20445;&#23384;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#65281;",
"Save":"&#20445;&#23384;",
"Saving":"&#20445;&#23384;&#20013;",
"Scanning":"&#12473;&#12461;&#12515;&#12531;&#20013;",
"SD Files":"SD&#12501;&#12449;&#12452;&#12523;",
"sec":"sec",
"Send Command...":"&#12467;&#12510;&#12531;&#12489;&#36865;&#20449;...",
"Send":"&#36865;&#20449;",
"Set failed":"Set failed",
"Set":"&#12475;&#12483;&#12488;",
"Signal":"&#20449;&#21495;",
"Size":"&#12469;&#12452;&#12474;",
"SSID":"SSID",
"Target":"Target",
"Temperatures":"&#28201;&#24230;",
"Total:":"Total:",
"Type":"Type",
"Update Firmware ?":"&#12501;&#12449;&#12540;&#12512;&#12454;&#12455;&#12450;&#12434;&#12450;&#12483;&#12503;&#12487;&#12540;&#12488;&#12375;&#12414;&#12377;&#12363;&#65311;",
"Update is ongoing, please wait and retry.":"&#12450;&#12483;&#12503;&#12487;&#12540;&#12488;&#12399;&#36914;&#34892;&#20013;&#12391;&#12377;&#12290;&#24453;&#12388;&#12363;&#12522;&#12488;&#12521;&#12452;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"Update":"&#12450;&#12483;&#12503;&#12487;&#12540;&#12488;",
"Upload failed : ":"&#12450;&#12483;&#12503;&#12525;&#12540;&#12489;&#22833;&#25943; : ",
"Upload failed":"&#12450;&#12483;&#12503;&#12525;&#12540;&#12489;&#12375;&#12390;",
"Upload":"&#12450;&#12483;&#12503;&#12525;&#12540;&#12489;",
"Uploading ":"&#12450;&#12483;&#12503;&#12525;&#12540;&#12489;&#20013; ",
"Upload done":"&#12450;&#12483;&#12503;&#12525;&#12540;&#12489;&#23436;&#20102;",
"Used:":"Used:",
"Value | Target":"&#20516; | Target",
"Value":"&#20516;",
"Wrong data":"&#38291;&#36949;&#12387;&#12383;&#12487;&#12540;&#12479;",
"Yes":"Yes",
"Light":"Light",
"None":"None",
"Modem":"Modem",
"STA":"STA",
"AP":"AP",
"BT":"Bluetooth",
"Baud Rate":"&#12508;&#12540;&#12524;&#12540;&#12488;",
"Sleep Mode":"&#12473;&#12522;&#12540;&#12503;&#12514;&#12540;&#12489;",
"Web Port":"Web&#12509;&#12540;&#12488;",
"Data Port":"Data&#12509;&#12540;&#12488;",
"Hostname":"&#12507;&#12473;&#12488;&#21517;",
"Wifi mode":"Wifi&#12514;&#12540;&#12489;",
"Station SSID":"Station SSID",
"Station Password":"Station &#12497;&#12473;&#12527;&#12540;&#12489;",
"Station Network Mode":"Station &#12493;&#12483;&#12488;&#12527;&#12540;&#12463;&#12514;&#12540;&#12489;",
"Station IP Mode":"Station IP &#12514;&#12540;&#12489;",
"DHCP":"DHCP",
"Static":"&#38745;&#30340;",
"Station Static IP":"Station &#38745;&#30340; IP",
"Station Static Mask":"Station &#12493;&#12483;&#12488;&#12510;&#12473;&#12463;",
"Station Static Gateway":"Station &#12466;&#12540;&#12488;&#12454;&#12455;&#12452;",
"AP SSID":"AP SSID",
"AP Password":"AP &#12497;&#12473;&#12527;&#12540;&#12489;",
"AP Network Mode":"AP Network &#12514;&#12540;&#12489;",
"SSID Visible":"SSID Visible",
"AP Channel":"AP &#12481;&#12515;&#12531;&#12493;&#12523;",
"Open":"Open",
"Authentication":"&#35469;&#35388;&#26041;&#24335;",
"AP IP Mode":"AP IP &#12514;&#12540;&#12489;",
"AP Static IP":"AP &#38745;&#30340;IP",
"AP Static Mask":"AP &#12493;&#12483;&#12488;&#12510;&#12473;&#12463;",
"AP Static Gateway":"AP &#12466;&#12540;&#12488;&#12454;&#12455;&#12452;",
"Time Zone":"&#12479;&#12452;&#12512;&#12478;&#12540;&#12531;",
"Day Saving Time":"&#12469;&#12510;&#12540;&#12479;&#12452;&#12512;",
"Time Server 1":"Time Server 1",
"Time Server 2":"Time Server 2",
"Time Server 3":"Time Server 3",
"Target FW":"Target FW",
"Direct SD access":"Direct SD access",
"Direct SD Boot Check":"Direct SD Boot Check",
"Primary SD":"&#12503;&#12521;&#12452;&#12510;&#12522; SD",
"Secondary SD":"&#12475;&#12459;&#12531;&#12480;&#12522; SD",
"Temperature Refresh Time":"&#28201;&#24230;&#26356;&#26032;&#26178;&#38291;",
"Position Refresh Time":"&#20301;&#32622;&#26356;&#26032;&#26178;&#38291;",
"Status Refresh Time":"&#12473;&#12486;&#12540;&#12479;&#12473;&#26356;&#26032;&#26178;&#38291;",
"XY feedrate":"XY &#36865;&#12426;&#36895;&#24230;",
"Z feedrate":"Z &#36865;&#12426;&#36895;&#24230;",
"E feedrate":"E &#36865;&#12426;&#36895;&#24230;",
"Camera address":"&#12459;&#12513;&#12521;&#12398;&#12450;&#12489;&#12524;&#12473;",
"Setup":"&#12475;&#12483;&#12488;&#12450;&#12483;&#12503;",
"Start setup":"&#12475;&#12483;&#12488;&#12450;&#12483;&#12503;&#12434;&#38283;&#22987;",
"This wizard will help you to configure the basic settings.":"&#12371;&#12398;&#12454;&#12451;&#12470;&#12540;&#12489;&#12391;&#22522;&#26412;&#30340;&#12394;&#35373;&#23450;&#12434;&#34892;&#12356;&#12414;&#12377;&#12290;",
"Press start to proceed.":"&#38283;&#22987;&#12434;&#25276;&#12375;&#12390;&#32154;&#34892;&#12375;&#12414;&#12377;&#12290;",
"Save your printer's firmware base:":"&#12503;&#12522;&#12531;&#12479;&#12398;&#12501;&#12449;&#12540;&#12512;&#12454;&#12455;&#12450;&#12434;&#20445;&#23384;:",
"This is mandatory to get ESP working properly.":"ESP&#12434;&#27491;&#24120;&#12395;&#21205;&#20316;&#12373;&#12379;&#12427;&#12383;&#12417;&#12395;&#12399;&#24517;&#38920;&#12391;&#12377;&#12290;",
"Save your printer's board current baud rate:":"&#12503;&#12522;&#12531;&#12479;&#22522;&#26495;&#12398;&#29694;&#22312;&#12398;&#12508;&#12540;&#12524;&#12540;&#12488;&#12434;&#20445;&#23384;:",
"Printer and ESP board must use same baud rate to communicate properly.":"&#12503;&#12522;&#12531;&#12479;&#12392;ESP&#12508;&#12540;&#12489;&#12399;&#36969;&#20999;&#12395;&#36890;&#20449;&#12377;&#12427;&#12383;&#12417;&#12395;&#21516;&#12376;&#12508;&#12540;&#12524;&#12540;&#12488;&#12434;&#20351;&#29992;&#12377;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#12290;",
"Continue":"&#32154;&#34892;",
"WiFi Configuration":"WiFi &#35373;&#23450;",
"Define ESP role:":"ESP&#12398;&#24441;&#21106;&#12434;&#23450;&#32681;:",
"AP define access point / STA allows to join existing network":"AP&#12399;&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12392;&#12375;&#12390;&#21205;&#12365;&#12414;&#12377;/ STA&#12399;&#26082;&#23384;&#12398;&#12493;&#12483;&#12488;&#12527;&#12540;&#12463;&#12395;&#21152;&#12431;&#12426;&#12414;&#12377;",
"What access point ESP need to be connected to:":"&#12393;&#12398;&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12395;&#25509;&#32154;&#12375;&#12414;&#12377;&#12363;&#65311;:",
"You can use scan button, to list available access points.":"&#21033;&#29992;&#21487;&#33021;&#12394;&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12434;&#12522;&#12473;&#12488;&#12450;&#12483;&#12503;&#12377;&#12427;&#12383;&#12417;&#12395;&#12473;&#12461;&#12515;&#12531;&#12508;&#12479;&#12531;&#12434;&#20351;&#29992;&#12377;&#12427;&#12371;&#12392;&#12364;&#12391;&#12365;&#12414;&#12377;&#12290;",
"Password to join access point:":"&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12398;&#12497;&#12473;&#12527;&#12540;&#12489;:",
"Define ESP name:":"ESP&#12398;&#21517;&#21069;&#12434;&#23450;&#32681;:",
"What is ESP access point SSID:":"&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12398;SSID:",
"Password for access point:":"&#12450;&#12463;&#12475;&#12473;&#12509;&#12452;&#12531;&#12488;&#12398;&#12497;&#12473;&#12527;&#12540;&#12489;:",
"Define security:":"&#12475;&#12461;&#12517;&#12522;&#12486;&#12451;&#12434;&#23450;&#32681;:",
"SD Card Configuration":"SD&#12459;&#12540;&#12489; &#35373;&#23450;",
"Is ESP connected to SD card:":"ESP&#12395;SD&#12459;&#12540;&#12489;&#12434;&#25509;&#32154;&#12375;&#12390;&#12356;&#12414;&#12377;&#12363;:",
"Check update using direct SD access:":"&#30452;&#25509;SD&#12395;&#12450;&#12463;&#12475;&#12473;&#12375;&#12450;&#12483;&#12503;&#12487;&#12540;&#12488;&#12434;&#30906;&#35469;:",
"SD card connected to ESP":"ESP&#12395;SD&#12459;&#12540;&#12489;&#12364;&#25509;&#32154;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;",
"SD card connected to printer":"&#12503;&#12522;&#12531;&#12479;&#12540;&#12395;SD&#12459;&#12540;&#12489;&#12364;&#25509;&#32154;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;",
"Setup is finished.":"&#12475;&#12483;&#12488;&#12450;&#12483;&#12503;&#23436;&#20102;",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"&#32066;&#20102;&#24460;&#12418;&#12289;&#12513;&#12452;&#12531;&#12452;&#12531;&#12479;&#12540;&#12501;&#12455;&#12452;&#12473;&#12395;&#12390;&#35373;&#23450;&#12434;&#22793;&#26356;&#12375;&#12383;&#12426;&#12289;&#35519;&#25972;&#12375;&#12383;&#12426;&#12377;&#12427;&#12371;&#12392;&#12399;&#12356;&#12388;&#12391;&#12418;&#21487;&#33021;&#12391;&#12377;&#12290;",
"You may need to restart the board to apply the new settings and connect again.":"&#26032;&#12375;&#12356;&#35373;&#23450;&#12434;&#36969;&#29992;&#12377;&#12427;&#12395;&#12399;&#12289;&#12508;&#12540;&#12489;&#12434;&#20877;&#36215;&#21205;&#12375;&#12390;&#20877;&#24230;&#25509;&#32154;&#12377;&#12427;&#24517;&#35201;&#12364;&#12354;&#12427;&#12363;&#12418;&#12375;&#12428;&#12414;&#12379;&#12435;&#12290;",
"Identification requested":"Identification requested",
"admin":"&#31649;&#29702;&#32773;",
"user":"&#12518;&#12540;&#12470;&#12540;",
"guest":"&#12466;&#12473;&#12488;",
"Identification invalid!":"Identification invalid!",
"Passwords do not matches!":"&#12497;&#12473;&#12527;&#12540;&#12489;&#12364;&#19981;&#19968;&#33268;&#12391;&#12377;&#65281;",
"Password must be >1 and <16 without space!":"&#12497;&#12473;&#12527;&#12540;&#12489;&#12399;&#31354;&#30333;&#12394;&#12375;&#12391;1&#65374;16&#12398;&#38263;&#12373;&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"User:":"&#12518;&#12540;&#12470;&#12540;:",
"Password:":"&#12497;&#12473;&#12527;&#12540;&#12489;:",
"Submit":"&#36865;&#20449;",
"Change Password":"&#12497;&#12473;&#12527;&#12540;&#12489;&#22793;&#26356;",
"Current Password:":"&#29694;&#22312;&#12398;&#12497;&#12473;&#12527;&#12540;&#12489;:",
"New Password:":"&#26032;&#12375;&#12356;&#12497;&#12473;&#12527;&#12540;&#12489;:",
"Confirm New Password:":"&#26032;&#12375;&#12356;&#12497;&#12473;&#12527;&#12540;&#12489;&#12398;&#30906;&#35469;:",
"Error : Incorrect User":"Error : &#12518;&#12540;&#12470;&#12540;&#12364;&#36949;&#12356;&#12414;&#12377;",
"Error: Incorrect password":"Error: &#12497;&#12473;&#12527;&#12540;&#12489;&#12364;&#36949;&#12356;&#12414;&#12377;",
"Error: Missing data":"Error: &#12487;&#12540;&#12479;&#12364;&#35211;&#12388;&#12363;&#12426;&#12414;&#12379;&#12435;",
"Error: Cannot apply changes":"Error: &#22793;&#26356;&#12434;&#36969;&#29992;&#12391;&#12365;&#12414;&#12379;&#12435;",
"Error: Too many connections":"Error: &#25509;&#32154;&#12364;&#22810;&#12377;&#12366;&#12414;&#12377;",
"Authentication failed!":"&#35469;&#35388;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#65281;",
"Serial is busy, retry later!":"&#12471;&#12522;&#12450;&#12523;&#12399;&#12499;&#12472;&#12540;&#29366;&#24907;&#12391;&#12377;&#12290;&#24460;&#12363;&#12425;&#12522;&#12488;&#12521;&#12452;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;&#65281;",
"Login":"&#12525;&#12464;&#12452;&#12531;",
"Log out":"&#12525;&#12464;&#12450;&#12454;&#12488;",
"Password":"&#12497;&#12473;&#12527;&#12540;&#12489;",
"No SD Card":"SD&#12459;&#12540;&#12489;&#12364;&#12354;&#12426;&#12414;&#12379;&#12435;",
"Check for Update":"&#12450;&#12483;&#12503;&#12487;&#12540;&#12488;&#12434;&#30906;&#35469;",
"Please use 8.3 filename only.":"&#12501;&#12449;&#12452;&#12523;&#12493;&#12540;&#12512;&#12399;8.3&#12398;&#12415;&#20351;&#12387;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"Preferences":"&#29872;&#22659;&#35373;&#23450;",
"Feature":"Feature",
"Show camera panel":"&#12459;&#12513;&#12521;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Auto load camera":"&#12459;&#12513;&#12521;&#12434;&#33258;&#21205;&#12525;&#12540;&#12489;",
"Enable heater T0 redundant temperatures":"&#12498;&#12540;&#12479;&#12540;T0&#12398;redundant temperature&#12434;&#26377;&#21177;&#12395;&#12377;&#12427;",
"Enable probe temperatures":"&#12503;&#12525;&#12540;&#12502;&#28201;&#24230;&#26377;&#21177;&#21270;",
"Enable bed controls":"&#12505;&#12483;&#12489;&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#26377;&#21177;&#21270;",
"Enable chamber controls":"&#12481;&#12515;&#12531;&#12496;&#12540;&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#26377;&#21177;&#21270;",
"Enable fan controls":"&#12501;&#12449;&#12531;&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#26377;&#21177;&#21270;",
"Enable Z controls":"Z&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#26377;&#21177;&#21270;",
"Panels":"&#12497;&#12493;&#12523;",
"Show control panel":"&#12467;&#12531;&#12488;&#12525;&#12540;&#12523;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Show temperatures panel":"&#28201;&#24230;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Show extruder panel":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Show files panel":"&#12501;&#12449;&#12452;&#12523;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Show GRBL panel":"GRBL&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Show commands panel":"&#12467;&#12510;&#12531;&#12489;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Select files":"&#35079;&#25968;&#12501;&#12449;&#12452;&#12523;&#12434;&#36984;&#25246;",
"Select file":"&#12501;&#12449;&#12452;&#12523;&#12434;&#36984;&#25246;",
"$n files":"$n &#12501;&#12449;&#12452;&#12523;",
"No file chosen":"&#36984;&#25246;&#12373;&#12428;&#12383;&#12501;&#12449;&#12452;&#12523;&#12399;&#12354;&#12426;&#12414;&#12379;&#12435;",
"Length":"&#38263;&#12373;",
"Output msg":"&#20986;&#21147;&#12513;&#12483;&#12475;&#12540;&#12472;",
"Enable":"&#26377;&#21177;&#21270;",
"Disable":"&#28961;&#21177;&#21270;",
"Serial":"&#12471;&#12522;&#12450;&#12523;",
"Chip ID":"&#12481;&#12483;&#12503; ID",
"CPU Frequency":"CPU &#21608;&#27874;&#25968;",
"CPU Temperature":"CPU &#28201;&#24230;",
"Free memory":"&#31354;&#12365;&#12513;&#12514;&#12522;",
"Flash Size":"Flash &#12469;&#12452;&#12474;",
"Available Size for update":"&#26356;&#26032;&#26178;&#12395;&#21033;&#29992;&#21487;&#33021;&#12394;&#12469;&#12452;&#12474;",
"Available Size for SPIFFS":"SPIFFS&#12395;&#21033;&#29992;&#21487;&#33021;&#12394;&#12469;&#12452;&#12474;",
"Baud rate":"&#12508;&#12540;&#12524;&#12540;&#12488;",
"Sleep mode":"&#12473;&#12522;&#12540;&#12503;&#12514;&#12540;&#12489;",
"Channel":"&#12481;&#12515;&#12531;&#12493;&#12523;",
"Phy Mode":"Phy &#12514;&#12540;&#12489;",
"Web port":"Web &#12509;&#12540;&#12488;",
"Data port":"Data port",
"Active Mode":"Active Mode",
"Connected to":"&#25509;&#32154;&#20808;",
"IP Mode":"IP &#12514;&#12540;&#12489;",
"Gateway":"&#12466;&#12540;&#12488;&#12454;&#12455;&#12452;",
"Mask":"&#12493;&#12483;&#12488;&#12510;&#12473;&#12463;",
"DNS":"DNS",
"Disabled Mode":"&#28961;&#21177;&#21270;&#12373;&#12428;&#12383;&#12514;&#12540;&#12489;",
"Captive portal":"&#12461;&#12515;&#12503;&#12486;&#12451;&#12502; &#12509;&#12540;&#12479;&#12523;",
"Enabled":"&#26377;&#21177;",
"Web Update":"Web &#12450;&#12483;&#12503;&#12487;&#12540;&#12488;",
"Pin Recovery":"Pin Recovery",
"Disabled":"&#28961;&#21177;",
"Target Firmware":"Target Firmware",
"SD Card Support":"SD Card Support",
"Time Support":"Time Support",
"M117 output":"M117 &#20986;&#21147;",
"Oled output":"Oled &#20986;&#21147;",
"Serial output":"&#12471;&#12522;&#12450;&#12523; &#20986;&#21147;",
"Web socket output":"Web socket &#20986;&#21147;",
"TCP output":"TCP &#20986;&#21147;",
"FW version":"FW &#12496;&#12540;&#12472;&#12519;&#12531;",
"Show DHT output":"Show DHT &#20986;&#21147;",
"DHT Type":"DHT Type",
"DHT check (seconds)":"DHT &#30906;&#35469; (&#31186;)",
"SD speed divider":"SD speed divider",
"Number of extruders":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;&#12398;&#25968;",
"Mixed extruders":"Mixed &#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;",
"Extruder":"&#12456;&#12463;&#12473;&#12488;&#12523;&#12540;&#12480;&#12540;",
"Enable lock interface":"&#12452;&#12531;&#12479;&#12540;&#12501;&#12455;&#12540;&#12473;&#12525;&#12483;&#12463;&#12434;&#26377;&#21177;&#21270;",
"Lock interface":"&#12452;&#12531;&#12479;&#12540;&#12501;&#12455;&#12540;&#12473;&#12525;&#12483;&#12463;",
"Unlock interface":"&#12452;&#12531;&#12479;&#12540;&#12501;&#12455;&#12540;&#12473;&#12525;&#12483;&#12463;&#35299;&#38500;",
"You are disconnected":"&#20999;&#26029;&#12375;&#12414;&#12375;&#12383;&#12290;",
"Looks like you are connected from another place, so this page is now disconnected":"&#21029;&#12398;&#22580;&#25152;&#12363;&#12425;&#25509;&#32154;&#12375;&#12390;&#12356;&#12427;&#12424;&#12394;&#12398;&#12391;&#12289;&#12371;&#12398;&#12506;&#12540;&#12472;&#12399;&#29694;&#22312;&#20999;&#26029;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;",
"Please reconnect me":"&#20877;&#25509;&#32154;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;",
"Mist":"&#12511;&#12473;&#12488;",
"Flood":"&#12501;&#12523;&#12540;&#12489;",
"Spindle":"&#12473;&#12500;&#12531;&#12489;&#12523;",
"Connection monitoring":"&#25509;&#32154;&#30435;&#35222;",
"XY Feedrate value must be at least 1 mm/min!":"XY &#36865;&#12426;&#36895;&#24230;&#12399;&#26368;&#20302;1 mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;!",
"Z Feedrate value must be at least 1 mm/min!":"Z &#36865;&#12426;&#36895;&#24230;&#12399;&#26368;&#20302;1 mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Hold:0":"&#19968;&#26178;&#20572;&#27490;&#23436;&#20102;&#12375;&#12414;&#12375;&#12383;&#12290;&#20877;&#38283;&#12391;&#12365;&#12414;&#12377;&#12290;",
"Hold:1":"&#19968;&#26178;&#20572;&#27490;&#12399;&#36914;&#34892;&#20013;&#12391;&#12377;. &#12522;&#12475;&#12483;&#12488;&#12377;&#12427;&#12392;&#12450;&#12521;&#12540;&#12512;&#12364;&#30330;&#29983;&#12375;&#12414;&#12377;.",
"Door:0":"&#12489;&#12450;&#12364;&#38281;&#12414;&#12426;&#12414;&#12375;&#12383;&#12290;&#20877;&#38283;&#12391;&#12365;&#12414;&#12377;&#12290;",
"Door:1":"&#27231;&#26800;&#12364;&#20572;&#27490;&#12375;&#12414;&#12375;&#12383;&#12290;&#12489;&#12450;&#12364;&#38283;&#12356;&#12383;&#12414;&#12414;&#12391;&#12377;&#12290;&#38281;&#12376;&#12427;&#12414;&#12391;&#20877;&#38283;&#12391;&#12365;&#12414;&#12379;&#12435;&#12290;",
"Door:2":"&#12489;&#12450;&#12364;&#38283;&#12365;&#12414;&#12375;&#12383;&#12290;&#19968;&#26178;&#20572;&#27490;&#65288;&#12418;&#12375;&#12367;&#12399;&#12497;&#12540;&#12461;&#12531;&#12464;&#12522;&#12488;&#12521;&#12463;&#12488;&#65289;&#12375;&#12390;&#12356;&#12414;&#12377;&#12290;&#12522;&#12475;&#12483;&#12488;&#12377;&#12427;&#12392;&#12450;&#12521;&#12540;&#12512;&#12364;&#30330;&#29983;&#12375;&#12414;&#12377;&#12290;",
"Door:3":"&#12489;&#12450;&#12364;&#38281;&#12414;&#12426;&#20877;&#38283;&#20013;&#12391;&#12377;&#12290;&#12522;&#12475;&#12483;&#12488;&#12377;&#12427;&#12392;&#12450;&#12521;&#12540;&#12512;&#12364;&#30330;&#29983;&#12375;&#12414;&#12377;&#12290;",
"ALARM:1":"&#12495;&#12540;&#12489;&#12522;&#12511;&#12483;&#12488;&#12364;&#30330;&#29983;&#12375;&#12414;&#12375;&#12383;&#12290;&#31361;&#28982;&#12398;&#20572;&#27490;&#12395;&#12424;&#12426;&#12289;&#27231;&#26800;&#12398;&#20301;&#32622;&#12364;&#22833;&#12431;&#12428;&#12383;&#21487;&#33021;&#24615;&#12364;&#12354;&#12426;&#12414;&#12377;&#12290;&#20877;&#24230;&#12507;&#12540;&#12511;&#12531;&#12464;&#12434;&#24375;&#12367;&#12362;&#21223;&#12417;&#12375;&#12414;&#12377;&#12290;",
"ALARM:2":"&#12477;&#12501;&#12488;&#12522;&#12511;&#12483;&#12488;&#12450;&#12521;&#12540;&#12512;&#12290;G&#12467;&#12540;&#12489;&#12398;&#21205;&#20316;&#12364;&#12510;&#12471;&#12531;&#12398;&#31227;&#21205;&#31684;&#22258;&#12434;&#36229;&#12360;&#12390;&#12356;&#12414;&#12377;&#12290;&#12450;&#12521;&#12540;&#12512;&#12434;&#23433;&#20840;&#12395;&#35299;&#38500;&#12391;&#12365;&#12414;&#12377;&#12290;",
"ALARM:3":"&#21205;&#20316;&#20013;&#12398;&#12522;&#12475;&#12483;&#12488;&#12290; &#31361;&#28982;&#12398;&#20572;&#27490;&#12395;&#12424;&#12426;&#12289;&#27231;&#26800;&#12398;&#20301;&#32622;&#12364;&#22833;&#12431;&#12428;&#12383;&#21487;&#33021;&#24615;&#12364;&#12354;&#12426;&#12414;&#12377;&#12290;&#20877;&#24230;&#12507;&#12540;&#12511;&#12531;&#12464;&#12434;&#24375;&#12367;&#12362;&#21223;&#12417;&#12375;&#12414;&#12377;&#12290;",
"ALARM:4":"&#12503;&#12525;&#12540;&#12502;&#12364;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;G38.2&#12392;G38.3&#12364;&#12488;&#12522;&#12460;&#12540;&#12373;&#12428;&#12390;&#12362;&#12425;&#12378;&#12289;G38.4&#12392;G38.5&#12364;&#12488;&#12522;&#12460;&#12540;&#12373;&#12428;&#12390;&#12356;&#12427;&#22580;&#21512;&#12289;&#12503;&#12525;&#12540;&#12502;&#12399;&#12503;&#12525;&#12540;&#12502;&#12469;&#12452;&#12463;&#12523;&#12434;&#38283;&#22987;&#12377;&#12427;&#21069;&#12395;&#20104;&#26399;&#12373;&#12428;&#12383;&#21021;&#26399;&#29366;&#24907;&#12395;&#12354;&#12426;&#12414;&#12379;&#12435;&#12290;",
"ALARM:5":"&#12503;&#12525;&#12540;&#12502;&#12364;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#12503;&#12525;&#12540;&#12502;&#12364;G38.2&#12392;G38.4&#12398;&#12503;&#12525;&#12464;&#12521;&#12512;&#12373;&#12428;&#12383;&#31227;&#21205;&#37327;&#12391;&#12527;&#12540;&#12463;&#12395;&#25509;&#35302;&#12375;&#12414;&#12379;&#12435;&#12391;&#12375;&#12383;&#12290;",
"ALARM:6":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#12450;&#12463;&#12486;&#12451;&#12502;&#12394;&#12507;&#12540;&#12511;&#12531;&#12464;&#12469;&#12452;&#12463;&#12523;&#12364;&#12522;&#12475;&#12483;&#12488;&#12373;&#12428;&#12414;&#12375;&#12383;&#12290;",
"ALARM:7":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#12507;&#12540;&#12511;&#12531;&#12464;&#12469;&#12452;&#12463;&#12523;&#20013;&#12395;&#23433;&#20840;&#12489;&#12450;&#12364;&#38283;&#12365;&#12414;&#12375;&#12383;&#12290;",
"ALARM:8":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#12522;&#12511;&#12483;&#12488;&#12473;&#12452;&#12483;&#12481;&#12434;&#12463;&#12522;&#12450;&#12377;&#12427;&#12383;&#12417;&#12398;&#31227;&#21205;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;pull-off&#36317;&#38626;&#12434;&#22679;&#12420;&#12377;&#12363;&#12289;&#37197;&#32218;&#12434;&#30906;&#35469;&#12375;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"ALARM:9":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#12507;&#12540;&#12511;&#12531;&#12464;&#31227;&#21205;&#36317;&#38626;&#20869;&#12391;&#12522;&#12511;&#12483;&#12488;&#12473;&#12452;&#12483;&#12481;&#12364;&#35211;&#12388;&#12363;&#12425;&#12394;&#12356;&#12290;&#26368;&#22823;&#31227;&#21205;&#37327;&#12434;&#22679;&#12420;&#12377;&#12289;pull-off&#36317;&#38626;&#12434;&#28187;&#12425;&#12377;&#12289;&#12414;&#12383;&#12399;&#37197;&#32218;&#12434;&#30906;&#35469;&#12375;&#12390;&#12415;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;",
"error:1":"G&#12467;&#12540;&#12489;&#12399;&#12289;&#25991;&#23383;&#12392;&#20516;&#12391;&#27083;&#25104;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;&#25991;&#23383;&#12364;&#35211;&#12388;&#12363;&#12426;&#12414;&#12379;&#12435;&#12391;&#12375;&#12383;&#12290;",
"error:2":"&#26399;&#24453;&#12373;&#12428;&#12427;G&#12467;&#12540;&#12489;&#12398;&#20516;&#12364;&#35211;&#12388;&#12363;&#12425;&#12394;&#12356;&#12289;&#12414;&#12383;&#12399;&#25968;&#20516;&#12398;&#12501;&#12457;&#12540;&#12510;&#12483;&#12488;&#12364;&#28961;&#21177;&#12391;&#12377;&#12290;",
"error:3":"Grbl '$' &#12471;&#12473;&#12486;&#12512;&#12467;&#12510;&#12531;&#12489;&#12364;&#35469;&#35672;&#12373;&#12428;&#12394;&#12363;&#12387;&#12383;&#12363;&#12289;&#12469;&#12509;&#12540;&#12488;&#12373;&#12428;&#12390;&#12356;&#12414;&#12379;&#12435;&#12290;",
"error:4":"&#12503;&#12521;&#12473;&#12398;&#20516;&#12398;&#12501;&#12457;&#12540;&#12510;&#12483;&#12488;&#12395;&#23550;&#12375;&#12390;&#12510;&#12452;&#12490;&#12473;&#12398;&#20516;&#12434;&#21463;&#20449;&#12375;&#12414;&#12375;&#12383;&#12290;",
"error:5":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12469;&#12452;&#12463;&#12523;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;&#35373;&#23450;&#12391;&#12507;&#12540;&#12511;&#12531;&#12464;&#12364;&#26377;&#21177;&#12395;&#12394;&#12387;&#12390;&#12356;&#12414;&#12379;&#12435;&#12290;",
"error:6":"&#26368;&#23567;&#12473;&#12486;&#12483;&#12503;&#12497;&#12523;&#12473;&#26178;&#38291;&#12399;3usec&#20197;&#19978;&#12391;&#12394;&#12369;&#12428;&#12400;&#12394;&#12426;&#12414;&#12379;&#12435;&#12290;",
"error:7":"EEPROM &#12398;&#35501;&#12415;&#21462;&#12426;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;EEPROM &#12434;&#12487;&#12501;&#12457;&#12523;&#12488;&#20516;&#12395;&#33258;&#21205;&#24489;&#20803;&#12375;&#12414;&#12377;&#12290;",
"error:8":"Grbl&#12398;'$'&#12467;&#12510;&#12531;&#12489;&#12399;&#12289;Grbl&#12364;IDLE&#12391;&#12394;&#12356;&#12392;&#20351;&#29992;&#12391;&#12365;&#12414;&#12379;&#12435;&#12290;",
"error:9":"&#12450;&#12521;&#12540;&#12512;&#29366;&#24907;&#12414;&#12383;&#12399;&#12472;&#12519;&#12464;&#29366;&#24907;&#12398;&#38291;&#12399;&#12289;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12399;&#12525;&#12483;&#12463;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;",
"error:10":"&#12477;&#12501;&#12488;&#12522;&#12511;&#12483;&#12488;&#12399;&#12289;&#12507;&#12540;&#12511;&#12531;&#12464;&#35373;&#23450;&#12434;&#26377;&#21177;&#12395;&#12375;&#12394;&#12356;&#12392;&#26377;&#21177;&#12395;&#12391;&#12365;&#12414;&#12379;&#12435;&#12290;",
"error:11":"1&#34892;&#12354;&#12383;&#12426;&#12398;&#26368;&#22823;&#25991;&#23383;&#25968;&#12434;&#36229;&#12360;&#12414;&#12375;&#12383;&#12290;&#21463;&#20449;&#12375;&#12383;&#12467;&#12510;&#12531;&#12489;&#12399;&#23455;&#34892;&#12373;&#12428;&#12414;&#12379;&#12435;&#12391;&#12375;&#12383;&#12290;",
"error:12":"Grbl '$'&#12398;&#35373;&#23450;&#20516;&#12399;&#12289;&#12473;&#12486;&#12483;&#12503;&#12524;&#12540;&#12488;&#12364;&#12469;&#12509;&#12540;&#12488;&#12373;&#12428;&#12390;&#12356;&#12427;&#26368;&#22823;&#20516;&#12434;&#36229;&#12360;&#12390;&#12375;&#12414;&#12356;&#12414;&#12377;&#12290;",
"error:13":"&#23433;&#20840;&#25161;&#12364;&#38283;&#12356;&#12383;&#12371;&#12392;&#12434;&#26908;&#30693;&#12375;&#12289;&#12489;&#12450;&#29366;&#24907;&#12364;&#38283;&#22987;&#12373;&#12428;&#12414;&#12375;&#12383;&#12290;",
"error:14":"&#12499;&#12523;&#12489;&#24773;&#22577;&#12414;&#12383;&#12399;&#12473;&#12479;&#12540;&#12488;&#12450;&#12483;&#12503;&#34892;&#12364;EEPROM&#12398;&#34892;&#38263;&#21046;&#38480;&#12434;&#36229;&#12360;&#12414;&#12375;&#12383;&#12290;&#34892;&#12399;&#20445;&#23384;&#12373;&#12428;&#12390;&#12356;&#12414;&#12379;&#12435;&#12290;",
"error:15":"&#12472;&#12519;&#12464;&#31227;&#21205;&#20808;&#12364;&#12510;&#12471;&#12531;&#12398;&#31227;&#21205;&#37327;&#12434;&#36229;&#12360;&#12390;&#12356;&#12414;&#12377;&#12290;&#12472;&#12519;&#12464;&#12467;&#12510;&#12531;&#12489;&#12364;&#28961;&#35222;&#12373;&#12428;&#12414;&#12375;&#12383;&#12290;",
"error:16":"&#12472;&#12519;&#12464;&#12467;&#12510;&#12531;&#12489;&#12395; '=' &#12364;&#12394;&#12356;&#12363;&#12289;&#31105;&#27490;&#12373;&#12428;&#12390;&#12356;&#12427;G&#12467;&#12540;&#12489;&#12364;&#21547;&#12414;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;",
"error:17":"&#12524;&#12540;&#12470;&#12540;&#12514;&#12540;&#12489;&#12399;PWM&#20986;&#21147;&#12364;&#24517;&#35201;&#12391;&#12377;&#12290;",
"error:20":"&#12469;&#12509;&#12540;&#12488;&#12373;&#12428;&#12390;&#12356;&#12394;&#12356;&#12363;&#12289;&#28961;&#21177;&#12394;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12364;&#12502;&#12525;&#12483;&#12463;&#12391;&#35211;&#12388;&#12363;&#12426;&#12414;&#12375;&#12383;&#12290;",
"error:21":"&#12502;&#12525;&#12483;&#12463;&#20869;&#12391;&#21516;&#12376;&#12514;&#12540;&#12480;&#12523;&#12464;&#12523;&#12540;&#12503;&#12363;&#12425;&#35079;&#25968;&#12398;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12364;&#26908;&#20986;&#12373;&#12428;&#12414;&#12375;&#12383;&#12290;",
"error:22":"&#36865;&#12426;&#36895;&#24230;&#12364;&#12414;&#12384;&#35373;&#23450;&#12373;&#12428;&#12390;&#12356;&#12394;&#12356;&#12363;&#12289;&#26410;&#23450;&#32681;&#12391;&#12377;",
"error:23":"&#12502;&#12525;&#12483;&#12463;&#20869;&#12398;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12399;&#25972;&#25968;&#20516;&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#12290;",
"error:24":"&#12502;&#12525;&#12483;&#12463;&#20869;&#12391;&#35211;&#12388;&#12363;&#12387;&#12383;&#36600;&#21517;&#12434;&#24517;&#35201;&#12392;&#12377;&#12427;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12364;1&#12388;&#20197;&#19978;&#12354;&#12426;&#12414;&#12377;&#12290;",
"error:25":"&#32368;&#12426;&#36820;&#12373;&#12428;&#12383;G&#12467;&#12540;&#12489;&#12364;&#12502;&#12525;&#12483;&#12463;&#20869;&#12391;&#35211;&#12388;&#12363;&#12426;&#12414;&#12375;&#12383;&#12290;",
"error:26":"&#36600;&#21517;&#12434;&#24517;&#35201;&#12392;&#12377;&#12427;G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12289;&#12414;&#12383;&#12399;&#12514;&#12540;&#12480;&#12523;&#29366;&#24907;&#12395;&#12362;&#12356;&#12390;&#12502;&#12525;&#12483;&#12463;&#20869;&#12395;&#36600;&#21517;&#12364;&#35211;&#12388;&#12363;&#12426;&#12414;&#12379;&#12435;&#12391;&#12375;&#12383;&#12290;",
"error:27":"&#34892;&#30058;&#21495;&#12364;&#28961;&#21177;&#12391;&#12377;&#12290;",
"error:28":"G&#12467;&#12540;&#12489;&#12467;&#12510;&#12531;&#12489;&#12395;&#24517;&#35201;&#12394;&#20516;&#12364;&#12354;&#12426;&#12414;&#12379;&#12435;&#12290;",
"error:29":"G59.x&#12398;&#12527;&#12540;&#12463;&#24231;&#27161;&#31995;&#12395;&#12399;&#23550;&#24540;&#12375;&#12390;&#12356;&#12414;&#12379;&#12435;&#12290;",
"error:30":"G53&#12399;G0&#12392;G1&#12398;&#12514;&#12540;&#12471;&#12519;&#12531;&#12514;&#12540;&#12489;&#12398;&#12415;&#35377;&#21487;&#12373;&#12428;&#12390;&#12356;&#12414;&#12377;&#12290;",
"error:31":"&#36600;&#21517;&#12434;&#24517;&#35201;&#12392;&#12375;&#12394;&#12356;&#12467;&#12510;&#12531;&#12489;&#12420;&#12514;&#12540;&#12480;&#12523;&#29366;&#24907;&#12395;&#12362;&#12356;&#12390;&#12502;&#12525;&#12483;&#12463;&#20869;&#12395;&#36600;&#21517;&#12364;&#12415;&#12388;&#12363;&#12426;&#12414;&#12375;&#12383;&#12290;",
"error:32":"G2&#12362;&#12424;&#12403;G3&#12398;&#20870;&#24359;&#12399;&#12289;&#23569;&#12394;&#12367;&#12392;&#12418;1&#12388;&#12398;&#24179;&#38754;&#20869;&#12398;&#36600;&#21517;&#12434;&#24517;&#35201;&#12392;&#12375;&#12414;&#12377;&#12290;",
"error:33":"&#12514;&#12540;&#12471;&#12519;&#12531;&#12467;&#12510;&#12531;&#12489;&#12398;&#12479;&#12540;&#12466;&#12483;&#12488;&#12364;&#28961;&#21177;&#12391;&#12377;&#12290;",
"error:34":"&#20870;&#24359;&#12398;&#21322;&#24452;&#12364;&#28961;&#21177;&#12391;&#12377;&#12290;",
"error:35":"G2&#12362;&#12424;&#12403;G3&#12398;&#20870;&#24359;&#12399;&#12289;&#23569;&#12394;&#12367;&#12392;&#12418;1&#12388;&#12398;&#24179;&#38754;&#20869;&#12398;&#12458;&#12501;&#12475;&#12483;&#12488;&#12527;&#12540;&#12489;&#12434;&#24517;&#35201;&#12392;&#12375;&#12414;&#12377;&#12290;",
"error:36":"&#26410;&#20351;&#29992;&#12398;&#20516;&#12364;&#12502;&#12525;&#12483;&#12463;&#12391;&#35211;&#12388;&#12363;&#12426;&#12414;&#12375;&#12383;&#12290;",
"error:37":"G43.1 &#21205;&#30340;&#24037;&#20855;&#38263;&#12458;&#12501;&#12475;&#12483;&#12488;&#12399;&#12289;&#27083;&#25104;&#12373;&#12428;&#12383;&#24037;&#20855;&#38263;&#36600;&#12395;&#21106;&#12426;&#24403;&#12390;&#12425;&#12428;&#12390;&#12356;&#12414;&#12379;&#12435;&#12290;",
"error:38":"&#12484;&#12540;&#12523;&#30058;&#21495;&#12364;&#12469;&#12509;&#12540;&#12488;&#12373;&#12428;&#12390;&#12356;&#12427;&#26368;&#22823;&#20516;&#12434;&#36229;&#12360;&#12390;&#12356;&#12414;&#12377;&#12290;",
"error:60":"SD&#12398;&#12510;&#12454;&#12531;&#12488;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;&#12290;",
"error:61":"SD&#12459;&#12540;&#12489;&#12364;&#35501;&#12415;&#36796;&#12415;&#20013;&#12398;&#12383;&#12417;&#12398;&#12501;&#12449;&#12452;&#12523;&#12434;&#38283;&#12367;&#12371;&#12392;&#12364;&#12391;&#12365;&#12414;&#12379;&#12435;&#12391;&#12375;&#12383;",
"error:62":"SD&#12459;&#12540;&#12489;&#12398;&#12487;&#12451;&#12524;&#12463;&#12488;&#12522;&#12434;&#38283;&#12367;&#12398;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;",
"error:63":"SD&#12459;&#12540;&#12489;&#12398;&#12487;&#12451;&#12524;&#12463;&#12488;&#12522;&#12364;&#35211;&#12388;&#12363;&#12426;&#12414;&#12379;&#12435;",
"error:64":"SD&#12459;&#12540;&#12489;&#12501;&#12449;&#12452;&#12523;&#12364;&#31354;&#12391;&#12377;",
"error:70":"Bluetooth&#12398;&#38283;&#22987;&#12395;&#22833;&#25943;&#12375;&#12414;&#12375;&#12383;",
"Max travel":"&#26368;&#22823;&#31227;&#21205;&#37327;",
"Plate thickness":"&#12479;&#12483;&#12481;&#12503;&#12524;&#12540;&#12488;&#21402;&#12373;",
"Show probe panel":"&#12503;&#12525;&#12540;&#12502;&#12497;&#12493;&#12523;&#12434;&#34920;&#31034;",
"Probe":"&#12503;&#12525;&#12540;&#12502;",
"Start Probe":"&#12503;&#12525;&#12540;&#12499;&#12531;&#12464;&#12434;&#38283;&#22987;",
"Touch status":"&#12479;&#12483;&#12481;&#12473;&#12486;&#12540;&#12479;&#12473;",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"&#12503;&#12525;&#12540;&#12502;&#12398;&#26368;&#22823;&#31227;&#21205;&#37327;&#12398;&#20516;&#12399;1m&#65374;9999mm&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"&#12479;&#12483;&#12481;&#12503;&#12524;&#12540;&#12488;&#12398;&#21402;&#12373;&#12399;0&#65374;9999mm&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"&#12503;&#12525;&#12540;&#12502;&#12398;&#36865;&#12426;&#36895;&#24230;&#12399;1&#65374;9999mm/min&#12391;&#12354;&#12427;&#24517;&#35201;&#12364;&#12354;&#12426;&#12414;&#12377;&#65281;",
"Probe failed !":"&#12503;&#12525;&#12540;&#12502;&#22833;&#25943;&#65281;",
"Probe result saved.":"&#12503;&#12525;&#12540;&#12499;&#12531;&#12464;&#32080;&#26524;&#20445;&#23384;&#12375;&#12414;&#12375;&#12383;&#12290;",
"Browser:":"&#12502;&#12521;&#12454;&#12470;&#12540;:",
"Probing...":"&#12503;&#12525;&#12540;&#12499;&#12531;&#12464;&#20013;...",
"Step pulse, microseconds":"パルス間隔, microseconds",
"Step idle delay, milliseconds":"&#12514;&#12540;&#12479;&#12540;&#12450;&#12452;&#12489;&#12523;&#12487;&#12451;&#12524;&#12452;, milliseconds",
"Step port invert, mask2":"&#12473;&#12486;&#12483;&#12503;&#12497;&#12523;&#12473;&#21453;&#36578;, mask",
"Direction port invert, mask":"&#26041;&#21521;&#21453;&#36578;, mask",
"Step enable invert, boolean":"&#12452;&#12493;&#12540;&#12502;&#12500;&#12531;&#21453;&#36578;, boolean",
"Limit pins invert, boolean":"&#12522;&#12511;&#12483;&#12488;&#12500;&#12531;&#21453;&#36578;, boolean",
"Probe pin invert, boolean":"&#12503;&#12525;&#12540;&#12502;&#12500;&#12531;&#21453;&#36578;, boolean",
"Status report, mask":"&#12473;&#12486;&#12540;&#12479;&#12473;&#22577;&#21578;&#20869;&#23481;, mask",
"Junction deviation, mm":"&#12472;&#12515;&#12531;&#12463;&#12471;&#12519;&#12531;&#20559;&#24046;, mm",
"Arc tolerance, mm":"&#20870;&#24359;&#20844;&#24046;, mm",
"Report inches, boolean":"&#12452;&#12531;&#12481;&#34920;&#31034;, boolean",
"Soft limits, boolean":"&#12477;&#12501;&#12488;&#12522;&#12511;&#12483;&#12488;, boolean",
"Hard limits, boolean":"&#12495;&#12540;&#12489;&#12522;&#12511;&#12483;&#12488;, boolean",
"Homing cycle, boolean":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12469;&#12452;&#12463;&#12523;, boolean",
"Homing dir invert, mask":"&#12507;&#12540;&#12511;&#12531;&#12464;&#26041;&#21521;&#21453;&#36578;, mask",
"Homing feed, mm/min":"&#12507;&#12540;&#12511;&#12531;&#12464;&#35336;&#28204;&#26178;&#36865;&#12426;&#36895;&#24230;, mm/min",
"Homing seek, mm/min":"&#12507;&#12540;&#12511;&#12531;&#12464;&#36895;&#24230;, mm/min",
"Homing debounce, milliseconds":"&#12507;&#12540;&#12511;&#12531;&#12464;&#12481;&#12515;&#12479;&#12522;&#12531;&#12464;&#28961;&#35222;&#26178;&#38291;, milliseconds",
"Homing pull-off, mm":"&#12507;&#12540;&#12511;&#12531;&#12464; pull-off&#31227;&#21205;&#37327;, mm",
"Max spindle speed, RPM":"&#26368;&#22823;&#12473;&#12500;&#12531;&#12489;&#12523;&#22238;&#36578;&#25968;, RPM",
"Min spindle speed, RPM":"&#26368;&#23567;&#12473;&#12500;&#12531;&#12489;&#12523;&#22238;&#36578;&#25968;, RPM",
"Laser mode, boolean":"&#12524;&#12540;&#12470;&#12540;&#12514;&#12540;&#12489;, boolean",
"X steps/mm":"X steps/mm",
"Y steps/mm":"Y steps/mm",
"Z steps/mm":"Z steps/mm",
"X Max rate, mm/min":"X &#26368;&#22823;&#36895;&#24230;, mm/min",
"Y Max rate, mm/min":"Y &#26368;&#22823;&#36895;&#24230;, mm/min",
"Z Max rate, mm/min":"Z &#26368;&#22823;&#36895;&#24230;, mm/min",
"X Acceleration, mm/sec^2":"X &#21152;&#36895;&#24230;, mm/sec^2",
"Y Acceleration, mm/sec^2":"Y &#21152;&#36895;&#24230;, mm/sec^2",
"Z Acceleration, mm/sec^2":"Z &#21152;&#36895;&#24230;, mm/sec^2",
"X Max travel, mm":"X &#26368;&#22823;&#31227;&#21205;&#37327;, mm",
"Y Max travel, mm":"Y &#26368;&#22823;&#31227;&#21205;&#37327;, mm",
"Z Max travel, mm":"Z &#26368;&#22823;&#31227;&#21205;&#37327;, mm",
"File extensions (use ; to separate)":"&#12501;&#12449;&#12452;&#12523;&#25313;&#24373;&#23376;(&#20998;&#38626;&#12395;&#12399;;&#12434;&#20351;&#29992;))",
"Web Socket":"Web Socket"
};
//endRemoveIf(zh_cn_lang_disabled)

//removeIf(pl_lang_disabled)
//Polish
var polishtrans = {
"pl":"Polski",
"ESP3D for":"ESP3D dla",
"Value of auto-check must be between 0s and 99s !!":"Warto&sacute;&cacute; automatycznego spawdzania musi by&cacute; z zakresu 0-99s !",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"Warto&sacute;&cacute; pr&eogon;dko&sacute;ci ekstrudera musi by&cacute; z zakresu 1-9999 mm/min !",
"Value of filament length must be between 0.001 mm and 9999 mm !":"Warto&sacute;&cacute; d&lstrok;ugo&sacute;ci filamentu musi by&cacute; z zakresu 0.001-9999 mm !",
"cannot have '-', '#' char or be empty":"nie mo&zdot;e zawiera&cacute; '-', '#' lub by&cacute; pusty",
"cannot have '-', 'e' char or be empty":"nie mo&zdot;e zawiera&cacute; '-', 'e' lub by&cacute; pusty",
"Failed:":"Niepowodzenie:",
"File config / config.txt not found!":"Plik konfiguracji / brak pliku config.txt!",
"File name cannot be empty!":"Nazwa pliku nie mo&zacute;e by&cacute; pusta!",
"Value must be ":"Warto&sacute;&cacute; musi by&cacute; ",
"Value must be between 0 degres and 999 degres !":"Warto&sacute;&cacute;  musi by&cacute; z zakresu 0-999 stopni !",
"Value must be between 0% and 100% !":"Warto&sacute;&cacute; musi by&cacute; z zakresu 0-100% !",
"Value must be between 25% and 150% !":"Warto&sacute;&cacute; musi by&cacute; z zakresu 25-150% !",
"Value must be between 50% and 300% !":"Warto&sacute;&cacute; musi by&cacute; z zakresu 50-300% !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"Warto&sacute;&cacute; XY feedrate musi by&cacute; z zakresu 1-9999 mm/min !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Warto&sacute;&cacute; Z feedrate musi by&cacute; z zakresu 1-999 mm/min !",
" seconds":" sek.",
"Abort":"Przerwij",
"auto-check every:":"automatycznie sprawdzaj co:",
"auto-check position every:":"automatycznie sprawdzaj pozycje co:",
"Autoscroll":"Automatyczne przewijanie",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"St&oacute;&lstrok;",
"Chamber":"Chamber",
"Board":"P&lstrok;yta",
"Busy...":"Zaj&eogon;ty...",
"Camera":"Kamera",
"Cancel":"Anuluj",
"Cannot get EEPROM content!":"Nie mo&zacute;na pobra&cacute; danych z EEPROM!",
"Clear":"Wyczy&sacute;&cacute;",
"Close":"Zamknij",
"Color":"Kolor",
"Commands":"Komendy",
"Communication locked by another process, retry later.":"Po&lstrok;&aogon;czenie zablokowane przez inny proces, sp&oacute;buj p&oacute;&zacute;niej.",
"Communication locked!":"Po&lstrok;&aogon;czenie zablokowane!",
"Communications are currently locked, please wait and retry.":"Po&lstrok;&aogon;czenie jest zablokowane, sp&oacute;buj p&oacute;&zacute;niej",
"Confirm deletion of directory: ":"Potwierd&zacute; usuwanie folderu: ",
"Confirm deletion of file: ":"Potwierd&zacute; usuwanie pliku: ",
"Connecting ESP3D...":"&lstrok;&aogon;cznie ESP3D...",
"Connection failed! is your FW correct?":"Po&lstrok;&aogon;czenie przerwane! Czy to pawid&lstrok;owe oprogramowanie?",
"Controls":"Sterowanie",
"Credits":"Informacje",
"Dashboard":"Panel g&lstrok;&oacute;wny",
"Data modified":"Dane zmodyfikowane",
"Do you want to save?":"Czy zapisa&cacute;?",
"Enable second extruder controls":"Enable second extruder controls",
"Error":"B&lstrok;&aogon;d",
"ESP3D Filesystem":"System plik&oacute;w ESP3D",
"ESP3D Settings":"Ustawienia ESP3D",
"ESP3D Status":"Status ESP3D",
"ESP3D Update":"Aktualizuj ESP3D",
"Extrude":"Wysu&nacute; filament",
"Extruder T0":"Extruder T0",
"Extruder T1":"Extruder T1",
"Extruders":"Ekstrudery",
"Fan (0-100%)":"Wentylator (0-100%)",
"Feed (25-150%)":"Podawanie (25-150%)",
"Feedrate :":"Feedrate :",
"Filename":"Nazwa pliku",
"Filename/URI":"Nazwa pliku/&sacute;cie&zdot;ka",
"Verbose mode":"Wi&eogon;cej informacji",
"Firmware":"Oprogramowanie",
"Flow (50-300%)":"Przep&lstrok;yw (50-300%)",
"Heater T0":"G&lstrok;owica T0",
"Heater T1":"G&lstrok;owica T1",
"Help":"Pomoc",
"Icon":"Ikona",
"Interface":"Interfejs",
"Join":"Po&lstrok;&aogon;cz",
"Label":"Etykieta",
"List of available Access Points":"Lista dost&eogon;pnych sieci",
"Macro Editor":"Edytor makr",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Wy&lstrok;&aogon;cz silniki",
"Name":"Nazwa",
"Name:":"Nazwa:",
"Network":"Sie&cacute;",
"No SD card detected":"Nie wykryto karty SD",
"No":"Nie",
"Occupation:":"Stan:",
"Ok":"Ok",
"Options":"Opcje",
"Out of range":"Poza zakresem",
"Please Confirm":"Potwierd&zacute;",
"Please enter directory name":"Wprowad&zacute; nazw&eogon; folderu",
"Please wait...":"Prosz&eogon; czeka&cacute;...",
"Printer configuration":"Konfiguracja drukarki",
"GRBL configuration":"Konfiguracja GRBL",
"Printer":"Drukarka",
"Progress":"Stan",
"Protected":"Zabezpieczenie",
"Refresh":"Od&sacute;wie&zacute;",
"Restart ESP3D":"Uruchom ponownie ESP3D",
"Restarting ESP3D":"Ponowne uruchamianie ESP3D",
"Restarting":"Ponowne uruchamianie",
"Restarting, please wait....":"Ponowne uruchamianie, prosz&eogon; czeka&cacute;....",
"Retry":"Pon&oacute;w",
"Reverse":"Reverse",
"Save macro list failed!":"Zapis makra nieudany!",
"Save":"Zapisz",
"Saving":"Zapisywanie",
"Scanning":"Skanowanie",
"SD Files":"Pliki na karcie SD",
"sec":"sek",
"Send Command...":"Wy&sacute;lij komend&eogon;...",
"Send":"Wy&sacute;lij",
"Set failed":"Zmiana nieudana",
"Set":"Ustaw",
"Signal":"Sygna&lstrok;",
"Size":"Rozmiar",
"SSID":"SSID",
"Target":"Cel",
"Temperatures":"Temperatury",
"Total:":"Rozmiar:",
"Type":"Typ",
"Update Firmware ?":"Aktualizowa&cacute; oprogramowanie ?",
"Update is ongoing, please wait and retry.":"Trwa aktualizacja, prosz&eogon; czaka&cacute;.",
"Update":"Aktualizuj",
"Upload failed : ":"Wysy&lstrok;anie nieudane : ",
"Upload failed":"Wysy&lstrok;anie nieudane",
"Upload":"Wy&sacute;lij",
"Uploading ":"Wysy&lstrok;anie ",
"Upload done":"Wysy&lstrok;anie zakonczone",
"Used:":"U&zacute;ywane:",
"Value | Target":"Warto&sacute;&cacute; | Cel",
"Value":"Warto&sacute;&cacute;",
"Wrong data":"B&lstrok;&eogon;dne dane",
"Yes":"Tak",
"Light":"Light",
"None":"Brak",
"Modem":"Modem",
"STA":"STA",
"AP":"AP",
"Baud Rate":"Pr&eogon;dko&sacute;&cacute;",
"Sleep Mode":"Tryb u&sacute;pienia",
"Web Port":"Port Web",
"Data Port":"Port danych",
"Hostname":"Nazwa hosta",
"Wifi mode":"Tryb Wifi",
"Station SSID":"Klient SSID",
"Station Password":"Klient has&lstrok;o",
"Station Network Mode":"Klient tryb sieci",
"Station IP Mode":"Klient tryb IP",
"DHCP":"DHCP",
"Static":"Statyczny",
"Station Static IP":"Klient statyczny IP",
"Station Static Mask":"Klient statyczny maska",
"Station Static Gateway":"Klient statyczny bramka",
"AP SSID":"Punkt dost&eogon;pu SSID",
"AP Password":"Punkt dost&eogon;pu has&lstrok;o",
"AP Network Mode":"Punkt dost&eogon;pu tryb sieci",
"SSID Visible":"SSID widoczne",
"AP Channel":"Kana&lstrok; punktu dost&eogon;pu",
"Open":"Otwarta",
"Authentication":"Uwierzytelnianie",
"AP IP Mode":"Punkt dost&eogon;pu tryb IP",
"AP Static IP":"Punkt dost&eogon;pu statyczny IP",
"AP Static Mask":"Punkt dost&eogon;pu statyczny maska",
"AP Static Gateway":"Punkt dost&eogon;pu statyczny bramka",
"Time Zone":"Strefa czasowa",
"Day Saving Time":"Czas letni",
"Time Server 1":"Serwer NTP #1",
"Time Server 2":"Serwer NTP #2",
"Time Server 3":"Serwer NTP #3",
"Target FW":"Oprogramowanie drukarki",
"Direct SD access":"Dost&eogon;p bezpo&sacute;redni do karty SD",
"Direct SD Boot Check":"Sprawdzanie karty SD podczas uruchamiania",
"Primary SD":"G&lstrok;&oacute;wna karta SD",
"Secondary SD":"Dodatkowa karta SD",
"Temperature Refresh Time":"Aktualizacja temepratur",
"Position Refresh Time":"Aktualizacja pozycji",
"Status Refresh Time":"Aktualizacja statusu",
"XY feedrate":"XY feedrate",
"Z feedrate":"Z feedrate",
"E feedrate":"E feedrate",
"Camera address":"Adres kamery",
"Setup":"Konfiguracja",
"Start setup":"Uruchom konfiguracj&eogon;",
"This wizard will help you to configure the basic settings.":"Ten kreator pomo&zacute;e Tobie w skonfigurowaniu podstawowych ustawie&nacute;.",
"Press start to proceed.":"Naci&sacute;nij 'Uruchom konfiguracj&eogon;' aby kontynuowa&cacute;.",
"Save your printer's firmware base:":"Ustaw typ oprogramowania drukarki:",
"This is mandatory to get ESP working properly.":"Jest to wymagane do poprawnej pracy ESP.",
"Save your printer's board current baud rate:":"Ustaw pr&eogon;dko&sacute;&cacute; portu szeregowego drukraki:",
"Printer and ESP board must use same baud rate to communicate properly.":"Ustawienia pr&eogon;dko&sacute;ci portu drukarki i ESP musz&aogon; sobie odpowiada&cacute; do poprawnej komunikacji.",
"Continue":"Dalej",
"WiFi Configuration":"Konfiguracja WiFi",
"Define ESP role:":"Wybierz tryb pracy ESP:",
"AP define access point / STA allows to join existing network":"AP ustawia tryb pracy jako punkt dost&eogon;pu / STA pozwala na po&lstrok;&aogon;czenie do istniej&aogon;cej sieci",
"What access point ESP need to be connected to:":"Do jakiejgo SSID ma &lstrok;&aogon;czy&cacute; si&eogon; ESP:",
"You can use scan button, to list available access points.":"Podaj SSID sieci do k&oacute;rej chesz si&eogon; po&lstrok;&aogon;czy&cacute;. Mo&zdot;esz prszeskanowa&cacute; dost&eogon;pne sieci.",
"Password to join access point:":"Has&lstrok;o:",
"Define ESP name:":"Ustaw nazw&eogon; ESP:",
"What is ESP access point SSID:":"SSID punktu dost&eogon;pu ESP:",
"Password for access point:":"Has&lstrok;o dla punktu dost&eogon;pu:",
"Define security:":"Wybierz zabezpieczenie:",
"SD Card Configuration":"Konfiguracja karty SD",
"Is ESP connected to SD card:":"Czy ESP jest pod&lstrok;&aogon;czone do karty SD:",
"Check update using direct SD access:":"Sprawd&zacute; aktualizacj&eogon; poprzez bezpo&sacute;redni dost&eogon;p do kart SD:",
"SD card connected to ESP":"Karta SD pod&lstrok;&aogon;czona do ESP",
"SD card connected to printer":"Karta SD pod&lstrok;&aogon;czona do drukarki",
"Setup is finished.":"Konfiguracja zako&nacute;czona.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Po zako&nacute;czeniu pracy kreatora, zmiana konfiguracji nadal b&eogon;dzi&eogon; dost&eogon;pna.",
"You may need to restart the board to apply the new settings and connect again.":"Aby zastosowa&cacute; zmiany mo&zdot;e by&cacute; potrzebe ponowne uruchomienie ESP.",
"Identification requested":"Wymagane logowanie",
"admin":"admin",
"user":"user",
"guest":"guest",
"Identification invalid!":"Logowanie nieudane!",
"Passwords do not matches!":"Has&lstrok;a nie s&aogon; zgodne!",
"Password must be >1 and <16 without space!":"Has&lstrok;o musi posiada&cacute; 1-16 znak&oacute;w bez spacji!",
"User:":"U&zacute;ytkownik:",
"Password:":"Has&lstrok;o:",
"Submit":"Wy&sacute;lij",
"Change Password":"Zmie&nacute; has&lstrok;o",
"Current Password:":"Aktualne has&lstrok;o:",
"New Password:":"Nowe has&lstrok;o:",
"Confirm New Password:":"Potwierd&zacute; nowe has&lstrok;o:",
"Error: Incorrect User":"B&lstrok;&aogon;d : Nieznany u&zacute;ytkownik",
"Error: Incorrect password":"B&lstrok;&aogon;d: Niepoprawne has&lstrok;o",
"Error: Missing data":"B&lstrok;&aogon;d: Brak danych",
"Error: Cannot apply changes":"B&lstrok;&aogon;d: Nie mo&zacute;na zapisa&cacute; zmian",
"Error: Too many connections":"B&lstrok;&aogon;d: Za du&zacute;o po&lstrok;&aogon;cze&nacute;",
"Error: Wrong Command":"B&lstrok;&aogon;d: Nieznana komenda",
"Authentication failed!":"B&lstrok;&aogon;d autoryzacji!",
"Serial is busy, retry later!":"Port szeregowy jest zaj&eogon;ty, spr&oacute;buj p&oacute;&zacute;niej!",
"Login":"Zaloguj",
"Log out":"Wyloguj",
"Password":"Has&lstrok;o",
"No SD Card":"Brak karty SD",
"Check for Update":"Sprawd&zacute; aktualizacj&eogon;",
"Please use 8.3 filename only.":"Prosz&eogon; u&zacute;ywa&cacute; nazw plik&oacute;w w formacie 8.3.",
"Preferences":"Ustawienia",
"Feature":"Opcje",
"Show camera panel":"Poka&zacute; panel kamery",
"Auto load camera":"Automatycznie &lstrok;aduj kamer&eogon;",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"W&lstrok;&aogon;cz kontol&eogon; sto&lstrok;u",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"W&lstrok;&aogon;cz kontrol&eogon; wentylator&oacute;w",
"Enable Z controls":"W&lstrok;&aogon;cz kontol&eogon; osi Z",
"Panels":"Panele",
"Show control panel":"Poka&zacute; panel sterowania",
"Show temperatures panel":"Poka&zacute; panel temperatur",
"Show extruder panel":"Poka&zacute; panel ekstrudera",
"Show files panel":"Poka&zacute; panel plik&oacute;w",
"Show GRBL panel":"Poka&zacute; panel GRBL (parser g-code)",
"Show commands panel":"Poka&zacute; panel komend",
"Select files":"Wybierz pliki",
"Select file":"Wybierz plik",
"$n files":"$n plik&oacute;w",
"No file chosen":"Nie wybrano pliku",
"Length":"D&lstrok;ugo&sacute;&cacute;",
"Output msg":"Pokazuj iinformacje",
"Enable":"W&lstrok;&aogon;cz",
"Disable":"Wy&lstrok;&aogon;cz",
"Serial":"Port szeregowy",
"Chip ID":"ID procesora",
"CPU Frequency":"Cz&eogon;stotliwo&sacute;&cacute; procesora",
"CPU Temperature":"Temperatura procesora",
"Free memory":"Dost&eogon;pna pami&eogon;&cacute;",
"Flash Size":"Rozmiar pamieci flash",
"Available Size for update":"Dost&eogon;pny pami&eogon;&cacute; do aktualizacji",
"Available Size for SPIFFS":"Dost&eogon;pna pami&eogon;&cacute; dla systemu plik&oacute;w",
"Baud rate":"Pr&eogon;dko&sacute;&cacute;",
"Sleep mode":"Tryb u&sacute;pienia",
"Channel":"Kana&lstrok;",
"Phy Mode":"Tryb pracy sieci",
"Web port":"Port Web",
"Data port":"Port danych",
"Active Mode":"Aktywny tryb",
"Connected to":"Po&lstrok;&aogon;czony do",
"IP Mode":"Tryb IP",
"Gateway":"Bramka",
"Mask":"Maska",
"DNS":"DNS",
"Disabled Mode":"Tryb wy&lstrok;&aogon;czony",
"Captive portal":"Sie&cacute; go&sacute;cinna",
"Enabled":"W&lstrok;&aogon;czone",
"Web Update":"Aktualizacja przez Web",
"Pin Recovery":"Odzyskiwanie pinu",
"Disabled":"Wy&lstrok;&aogon;czone",
"Authentication":"Autoryzacja",
"Target Firmware":"Typ oprogramowania drukarki",
"SD Card Support":"Wsparcie dla karty SD",
"Time Support":"Czas",
"M117 output":"Informacje M117",
"Oled output":"Inormacje Oled",
"Serial output":"Informacja z portu szeregowego",
"Web socket output":"Informacje z Web socket",
"TCP output":"Informacje o TCP",
"FW version":"Wersja oprogramowania",
"Show DHT output":"Informacje z DHT",
"DHT Type":"Typ DHT",
"DHT check (seconds)":"Aktualizacja danych z DHT (sek)",
"SD speed divider":"SD speed divider",
"Number of extruders":"Liczba ekstruder&oacute;w",
"Mixed extruders":"Ekstrudery mieszaj&aogon;ce",
"Extruder":"Ekstruder",
"Enable lock interface":"W&lstrok;&aogon;cz blokad&eogon; interfejsu",
"Lock interface":"Zablokuj interfejs",
"Unlock interface":"Odblokuj interfejs",
"You are disconnected":"Roz&lstrok;&aogon;czony",
"Looks like you are connected from another place, so this page is now disconnected":"Wygl&aogon;da na to, &zdot;e jeste&sacute; pod&lstrok;&aogon;czony z innego miejsca, wi&eogon;c ta strone zosta&lstrok;a roz&lstrok;&aogon;czona",
"Please reconnect me":"Po&lstrok;&aogon;cz ponownie",
"Mist":"Mist",
"Flood":"Flood",
"Spindle":"Spindle",
"Connection monitoring":"Monitorowanie po&lstrok;&aogon;czenia",
"XY Feedrate value must be at least 1 mm/min!":"Minimalna warto&sacute;&cacute; XY Feedrate to 1 mm/min!",
"Z Feedrate value must be at least 1 mm/min!":"Minimalna warto&sacute;&cacute; Z Feedrate to 1 mm/min!",
"Hold:0":"Wstrzymanie zako&nacute;czone. Gotowo&sacute;&cacute; do wznowienia.",
"Hold:1":"Trwa wstrzymywanie. Reset spowoduje alarm.",
"Door:0":"Obudowa zamkni&eogon;ta. Gotowo&sacute;&cacute; do wznowienia.",
"Door:1":"Maszyna zatrzymana. Obudowa nadal otwarta. Nie mo&zdot;na wznowi&cacute;.",
"Door:2":"Obudowa otwarta. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Obudowa zamkni&eogon;ta, wznawianie. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"Komenda g-code sk&lstrok;ada si&eogon; z litery i warto&sacute;ci. Litera nie zosta&lstrok;a znaleziona.",
"error:2":"Brak oczekiwanej warto&sacute;ci g-code lub format warto&sacute;ci liczbowej jest nieprawid&lstrok;owy.",
"error:3":"Grbl '$' system command was not recognized or supported.",
"error:4":"Negative value received for an expected positive value.",
"error:5":"Homing cycle failure. Homing is not enabled via settings.",
"error:6":"Minimum step pulse time must be greater than 3usec.",
"error:7":"An EEPROM read failed. Auto-restoring affected EEPROM to default values.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Przekroczono maksymaln&aogon; ilo&sacute;&cacute; znak&oacute;w w linii. Odebrana komenda nie zosta&lstrok;a uruchomiona.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Tryb lasera wymaga sterowania PWM.",
"error:20":"W bloku znaleziono nieobs&lstrok;ugiwan&aogon; lub b&lstrok;&eogon;dn&aogon; komend&eogon; g-code.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Nie ustawiono lub nie zdefiniowano feed rate.",
"error:23":"Komenda g-code w bloku wymaga warto&sacute;ci ca&lstrok;kowitej.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Powtarzaj&aogon;ca si&eogon; w bloku komenda g-code.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Numer linii jest nieprawid&lstrok;owy.",
"error:28":"W komendzie g-code brakuje warto&sacute;ci.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Warto&sacute;&cacute; k&aogon;ta jest nieprawid&lstrok;owa.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Znaleziono nieu&zdot;ywan&aogon; warto&sacute;&cacute; w bloku.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Liczba g&lstrok;owic wi&eogon;ksza ni&zdot; liczba maksymalnie obs&lstrok;ugiwanych.",
"error:60":"B&lstrok;&aogon;d dost&eogon;pu do karty SD",
"error:61":"B&lstrok;&aogon;d otwarcia pliku z karty SD",
"error:62":"B&lstrok;&aogon;d otwarcia folderu z kart SD",
"error:63":"Nie znaleziono folderu na karcie SD",
"error:64":"Plik na karcie SD jest pusty",
"error:70":"B&lstrok;&aogon;d uruchamiania Bluetooth",
"error:700":"B&lstrok;&aogon;d: Nieznana komenda",
};
//endRemoveIf(pl_lang_disabled)

//removeIf(ptbr_lang_disabled)
//Brazilian Portuguese
var ptbrtrans = {
"pt-br":"Portugu&ecirc;s",
"ESP3D for":"ESP3D para",
"Value of auto-check must be between 0s and 99s !!":"O valor do auto-check deve estar entre 0s e 99s !!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"O valor da velocidade da extrusora deve estar entre 1 mm/min e 9999 mm/min !",
"Value of filament length must be between 0.001 mm and 9999 mm !":"O valor do comprimento do filamento deve estar entre 0.001 mm e 9999 mm !",
"cannot have '-', '#' char or be empty":"N&atilde;o pode ter caracter '-', '#' ou estar vazio",
"cannot have '-', 'e' char or be empty":"N&atilde;o pode ter caracter '-', 'e' ou estar vazio",
"Failed:":"Falhou:",
"File config / config.txt not found!":"Arquivo de configura&ccedil;&atilde;o / config.txt n&atilde;o encontrado!",
"File name cannot be empty!":"O nome do arquivo n&atilde;o pode estar vazio!",
"Value must be ":"O valor deve ser ",
"Value must be between 0 degres and 999 degres !":"O valor deve estar entre 0 graus e 999 graus !",
"Value must be between 0% and 100% !":"O valor deve estar entre 0% e 100% !",
"Value must be between 25% and 150% !":"O valor deve estar entre 25% e 150% !",
"Value must be between 50% and 300% !":"O valor deve estar entre 50% e 300% !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"O valor da velocidade de avan&ccedil;o XY deve estar entre 1 mm/min e 9999 mm/min !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"O valor da velocidade de avan&ccedil;o Z deve estar entre 1 mm/min e 999 mm/min !",
" seconds":" segundos",
"Abort":"Aborta",
"auto-check every:":"auto-check a cada:",
"auto-check position every:":"auto-check posi&ccedil;&atilde;o a cada:",
"Autoscroll":"Rolagem autom&aacute;tica","Max travel":"Max travel",
"Feed rate":"Taxa de avan&ccedil;o",
"Touch plate thickness":"Touch plate thickness",
"Show probe panel":"Show probe panel",
"Probe":"Probe",
"Start Probe":"Start Probe",
"Touch status":"Touch status",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"Value of maximum probe travel must be between 1 mm and 9999 mm !",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"Value of probe touch plate thickness must be between 0 mm and 9999 mm !",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"Base",
"Chamber":"Chamber",
"Board":"Controladora",
"Busy...":"Ocupado...",
"Camera":"Camera",
"Cancel":"Cancela",
"Cannot get EEPROM content!":"N&atilde;o foi poss&iacute;vel ler a EEPROM!",
"Clear":"Limpa",
"Close":"Fecha",
"Color":"Cor",
"Commands":"Comandos",
"Communication locked by another process, retry later.":"Comunica&ccedil;&atilde;o bloqueada por outro processo, tente mais tarde.",
"Communication locked!":"Comunica&ccedil;&atilde;o bloqueada!",
"Communications are currently locked, please wait and retry.":"Comunica&ccedil;&otilde;es est&atilde;o bloqueadas no momento, por favor aguarde e tente novamente.",
"Confirm deletion of directory: ":"Confirma exclus&atilde;o da pasta: ",
"Confirm deletion of file: ":"Conforma exclus&atilde;o do arquivo: ",
"Connecting ESP3D...":"Conectando ESP3D...",
"Connection failed! is your FW correct?":"Falha na conex&atilde;o! Seu FW &eacute; o correto?",
"Controls":"Controles",
"Credits":"Cr&eacute;ditos",
"Dashboard":"Painel de Controle",
"Data modified":"Data da modifica&ccedil;&atilde;o",
"Do you want to save?":"Voc&ecirc; quer salvar?",
"Enable second extruder controls":"Habilita controle do segundo extrusor",
"Error":"Erro",
"ESP3D Filesystem":"Sistema de arquivos ESP3D",
"ESP3D Settings":"Configura&ccedil;&otilde;es ESP3D",
"ESP3D Status":"Estado ESP3D",
"ESP3D Update":"Atualiza&ccedil;&atilde;o ESP3D",
"Extrude":"Extrudar",
"Extruder T0":"Extrusor T0",
"Extruder T1":"Extrusor T1",
"Extruders":"Extrusores",
"Fan (0-100%)":"Vendilador (0-100%)",
"Feed (25-150%)":"Velocidade (25-150%)",
"Feedrate :":"Avan&ccedil;o :",
"Filename":"Nome do arquivo",
"Filename/URI":"Nome do arquivo/URI",
"Verbose mode":"Modo completo",
"Firmware":"Firmware",
"Flow (50-300%)":"Fluxo (50-300%)",
"Heater T0":"Aquecimento T0",
"Heater T1":"Aquecimento T1",
"Help":"Ajuda",
"Icon":"Ícone",
"Interface":"Interface",
"Join":"Unir",
"Label":"Etiqueta",
"List of available Access Points":"Lista de Pontos de Acesso dispon&iacute;veis",
"Macro Editor":"Macro Editor",
"mm":"mm",
"mm/min":"mm/min",
"Motors off":"Motores off",
"Name":"Nome",
"Name:":"Nome:",
"Network":"Rede",
"No SD card detected":"SD card n&atilde;o detectado",
"No":"N&atilde;o",
"Occupation:":"Ocupado:",
"Ok":"Ok",
"Options":"Op&ccedil;&otilde;es",
"Out of range":"Fora de alcance",
"Please Confirm":"Por favor, Confirme",
"Please enter directory name":"Por favor, coloque o nome da pasta",
"Please wait...":"Por favor, espere...",
"Printer configuration":"Configura&ccedil;&atilde;o da impressora",
"GRBL configuration":"Configura&ccedil;&atilde;o GRBL",
"Printer":"Impressora",
"Progress":"Progresso",
"Protected":"Protegido",
"Refresh":"Atualizar",
"Restart ESP3D":"Reiniciar ESP3D",
"Restarting ESP3D":"Reiniciando ESP3D",
"Restarting":"Reiniciando",
"Restarting, please wait....":"Reiniciando, aguarde...",
"Retry":"Tente novamente",
"Reverse":"Voltar",
"Save macro list failed!":"Falha ao salvar o lista macro!",
"Save":"Salvar",
"Saving":"Salvando",
"Scanning":"Escaneando",
"SD Files":"Arquivos SD",
"sec":"seg",
"Send Command...":"Envia Comando...",
"Send":"Envia",
"Set failed":"Falha ao setar",
"Set":"Setar",
"Signal":"Sinal",
"Size":"Tamanho",
"SSID":"SSID",
"Target":"Alvo",
"Temperatures":"Temperaturas",
"Total:":"Total:",
"Type":"Tipo",
"Update Firmware ?":"Atualiza Firmware ?",
"Update is ongoing, please wait and retry.":"Atualiza&ccedil;&atilde;o em andamento. Aguarde e tente depois.",
"Update":"Atualiza",
"Upload failed : ":"Falha no upload : ",
"Upload failed":"Falha no upload",
"Upload":"Upload",
"Uploading ":"Fazendo upload ",
"Upload done":"Upload completo",
"Used:":"Usado:",
"Value | Target":"Valor | Alvo",
"Value":"Valor",
"Wrong data":"Dado errado",
"Yes":"Sim",
"Light":"Luz",
"None":"N&atilde;o",
"Modem":"Modem",
"STA":"STA",
"AP":"AP",
"Baud Rate":"Baud Rate",
"Sleep Mode":"Modo Sleep",
"Web Port":"Porta Web",
"Data Port":"Porta Dados",
"Hostname":"Hostname",
"Wifi mode":"Modo Wifi",
"Station SSID":"Esta&ccedil;&atilde;o SSID",
"Station Password":"Esta&ccedil;&atilde;o Password",
"Station Network Mode":"Esta&ccedil;&atilde;o Modo de Rede",
"Station IP Mode":"Esta&ccedil;&atilde;o Modo IP",
"DHCP":"DHCP",
"Static":"Est&aacute;tico",
"Station Static IP":"Esta&ccedil;&atilde;o Est&aacute;tica IP",
"Station Static Mask":"Esta&ccedil;&atilde;o Est&aacute;tica M&aacute;scara",
"Station Static Gateway":"Esta&ccedil;&atilde;o Est&aacute;tica Gateway",
"AP SSID":"AP SSID",
"AP Password":"AP Senha",
"AP Network Mode":"AP Modo de Rede",
"SSID Visible":"SSID Vis&iacute;vel",
"AP Channel":"AP Canal",
"Open":"Aberto",
"Authentication":"Autentica&ccedil;&atilde;o",
"AP IP Mode":"AP IP Modo",
"AP Static IP":"AP Est&aacute;tico IP",
"AP Static Mask":"AP Est&aacute;tico Mask",
"AP Static Gateway":"AP Est&aacute;tico Gateway",
"Time Zone":"Time Zone",
"Day Saving Time":"Hor&aacute;rio de Ver&atilde;o",
"Time Server 1":"Time Server 1",
"Time Server 2":"Time Server 2",
"Time Server 3":"Time Server 3",
"Target FW":"Firmware",
"Direct SD access":"Acesso direto SD",
"Direct SD Boot Check":"Acesso direto Boot Check",
"Primary SD":"Prim&aacute;rio SD",
"Secondary SD":"Secund&aacute;rio SD",
"Temperature Refresh Time":"Temperatura-Tempo Atualiza&ccedil;&atilde;o",
"Position Refresh Time":"Posi&ccedil;&atilde;o-Tempo Atualiza&ccedil;&atilde;o",
"Status Refresh Time":"Status-Tempo de Atualiza&ccedil;&atilde;o",
"XY feedrate":"XY feedrate",
"Z feedrate":"Z feedrate",
"E feedrate":"E feedrate",
"Camera address":"Endere&ccedil;o da C&acirc;mera",
"Setup":"Configura&ccedil;&atilde;o",
"Start setup":"Inicia configura&ccedil;&atilde;o",
"This wizard will help you to configure the basic settings.":"Este assistente te ajudar&aacute; com as configura&ccedil;&otilde;es b&aacute;sicas.",
"Press start to proceed.":"Pressione start para iniciar.",
"Save your printer's firmware base:":"Salve os firmwares base das impressoras:",
"This is mandatory to get ESP working properly.":"Isto &eacute; mandat&oacute;rio para que o ESP funcione corretamente.",
"Save your printer's board current baud rate:":"Salve os baud rate de suas impressoras:",
"Printer and ESP board must use same baud rate to communicate properly.":"A impressora e o ESP precisa ter o mesmo Baud Rate para comunicar corretamente.",
"Continue":"Continue",
"WiFi Configuration":"Configura&ccedil;&atilde;o WiFi",
"Define ESP role:":"Defina a fun&ccedil;&atilde;o do ESP:",
"AP define access point / STA allows to join existing network":"AP define ponto de acesso / STA permite unir uma rede existente",
"What access point ESP need to be connected to:":"Qual ponto de acesso o ESP precisa para conectar:",
"You can use scan button, to list available access points.":"Voc&ecirc; pode usar o bot&atilde;o de pequisa, para listar os APs dispon&iacute;veis.",
"Password to join access point:":"Senha para entrar no AP:",
"Define ESP name:":"Define nome ESP:",
"What is ESP access point SSID:":"Qual &eacute; o SSID do ESP:",
"Password for access point:":"Senha para o ponto de acesso:",
"Define security:":"Define seguran&ccedil;a:",
"SD Card Configuration":"Configura&ccedil;&atilde;o Cart&atilde;o SD",
"Is ESP connected to SD card:":"Se ESP conectado ao cart&atilde;o SD:",
"Check update using direct SD access:":"Checa atualiza&ccedil;&atilde;o usando acesso direto SD:",
"SD card connected to ESP":"Cart&atilde;o SD conectado ao ESP",
"SD card connected to printer":"Cart&atilde;o SD conectado a impressora",
"Setup is finished.":"Configura&ccedil;&atilde;o finalizada.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Ap&oacute;s fechar, voc&ecirc; ainda poder&aacute; alterar suas configura&ccedil;&otilde;es na interface principal a qualquer momento.",
"You may need to restart the board to apply the new settings and connect again.":"Voc&ecirc; precisa reiniciar para aplicar as novas configura&ccedil;&otilde;es e conectar novamente.",
"Identification requested":"Identifica&ccedil;&atilde;o necess&aacute;ria",
"admin":"admin",
"user":"usu&aacute;rio",
"guest":"convidado",
"Identification invalid!":"Identifica&ccedil;&atilde;o inv&aacute;lida!",
"Passwords do not matches!":"Senhas n&atilde;o conferem!",
"Password must be >1 and <16 without space!":"Senhas precisam ser >1 e <16 sem espa&ccedil;o!",
"User:":"Usu&aacute;rio:",
"Password:":"Senha:",
"Submit":"Enviar",
"Change Password":"Alterar Senha",
"Current Password:":"Senha Corrente:",
"New Password:":"Nova Senha:",
"Confirm New Password:":"Confirma Nova Senha:",
"Error : Incorrect User":"Erro : Usu&aacute;rio Incorreto",
"Error: Incorrect password":"Erro: Senha Incorreta",
"Error: Missing data":"Erro: Faltando dados",
"Error: Cannot apply changes":"Erro: N&atilde;o aplica altera&ccedil;&otilde;es",
"Error: Too many connections":"Erro: Muitas conex&otilde;es",
"Authentication failed!":"Falnha na Autentica&ccedil;&atilde;o!",
"Serial is busy, retry later!":"Serial est&aacute; ocupada, tente depois!",
"Login":"Login",
"Log out":"Sair",
"Password":"Senha",
"No SD Card":"Sem Cart&atilde;o SD",
"Check for Update":"Checa por Atualiza&ccedil;&atilde;o",
"Please use 8.3 filename only.":"Use somente nome de arquivos 8.3.",
"Preferences":"Prefer&ecirc;ncias",
"Feature":"Fun&ccedil;&atilde;o",
"Show camera panel":"Exibe painel da c&acirc;mera",
"Auto load camera":"Auto load da c&acirc;mera",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"Habilita controles da base",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"Habilita controles do ventilador",
"Enable Z controls":"Habilita controles do Z",
"Panels":"Pain&eacute;is",
"Show control panel":"Exibe painel de controle",
"Show temperatures panel":"Exibe painel de temperatura",
"Show extruder panel":"Exibe painel de extrusor",
"Show files panel":"Exibe painel de arquivos",
"Show GRBL panel":"Exibe painel GRBL",
"Show commands panel":"Exibe painel de comandos",
"Select files":"Seleciona arquivos",
"Select file":"Seleciona arquivo",
"$n files":"$n arquivos",
"No file chosen":"Nenhum arquivo selecionado",
"Length":"Tamanho",
"Output msg":"Sa&iacute;da de msg",
"Enable":"Habilita",
"Disable":"Desabilita",
"Serial":"Serial",
"Chip ID":"Chip ID",
"CPU Frequency":"Frequ&ecirc;ncia CPU",
"CPU Temperature":"Temperatura CPU",
"Free memory":"Mem&oacute;ria Livre",
"Flash Size":"Tamanho Flash",
"Available Size for update":"Tamanho Dispon&iacute;vel para Atualiza&ccedil;&atilde;o",
"Available Size for SPIFFS":"Tamanho Dispon&iacute;vel para SPIFFS",
"Baud rate":"Baud rate",
"Sleep mode":"Modo sleep",
"Channel":"Canal",
"Phy Mode":"Modo Phy",
"Web port":"Porta Web",
"Data port":"Porta Data",
"Active Mode":"Modo Ativo",
"Connected to":"Conectado a",
"IP Mode":"Modo IP",
"Gateway":"Gateway",
"Mask":"Mask",
"DNS":"DNS",
"Disabled Mode":"Modo Desabilitado",
"Captive portal":"Captive portal",
"Enabled":"Habilitado",
"Web Update":"Atualiza Web",
"Pin Recovery":"Pino Restauro",
"Disabled":"Desabilitado",
"Authentication":"Autentica&ccedil;&atilde;o",
"Target Firmware":"Firmware Alvo",
"SD Card Support":"Suporte Cart&atilde;o SD",
"Time Support":"Suporte de tempo",
"M117 output":"Sa&iacute;da M117",
"Oled output":"Sa&iacute;da Oled",
"Serial output":"Sa&iacute;da Serial",
"Web socket output":"Sa&iacute;da Web socket",
"TCP output":"Sa&iacute;da TCP",
"FW version":"Vers&atilde;o FW",
"Show DHT output":"Exibe sa&iacute;da DHT",
"DHT Type":"Tipo DHT",
"DHT check (seconds)":"Checagem DHT (segundos)",
"SD speed divider":"Divisor velocidade SD",
"Number of extruders":"N&uacute;mero de extrusores",
"Mixed extruders":"Extrusores Mix",
"Extruder":"Extrusor",
"Enable lock interface":"Habilita bloqueio da interface",
"Lock interface":"Bloqueia interface",
"Unlock interface":"Desbloqueia interface",
"You are disconnected":"Voc&ecirc; est&aacute; disconectado",
"Looks like you are connected from another place, so this page is now disconnected":"Voc&ecirc; deve estar conectado de outro local, esta p&aacute;gina est&aacute; desconectada agora",
"Please reconnect me":"Por favor, reconecte",
"Mist":"Mist",
"Flood":"Flood",
"Spindle":"Spindle",
"Connection monitoring":"Monitorando conex&atilde;o",
"XY Feedrate value must be at least 1 mm/min!":"Valor do avan&ccedil;o XY deve ser de pelo menos 1 mm/min!",
"Z Feedrate value must be at least 1 mm/min!":"Valor do avan&ccedil;o Z deve ser de pelo menos 1 mm/min!",
"Hold:0":"Hold complete. Ready to resume.",
"Hold:1":"Hold in-progress. Reset will throw an alarm.",
"Door:0":"Door closed. Ready to resume.",
"Door:1":"Machine stopped. Door still ajar. Can't resume until closed.",
"Door:2":"Door opened. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Door closed and resuming. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"G-code consiste de uma letra e n&uacute;mero. Letra n&atilde;o encontrada.",
"error:2":"Faltando uma palavra G-code ou valor num&eacute;rico, formato inv&aacute;lido.",
"error:3":"Grbl '$' comando n&atilde;o reconhecido ou suportado.",
"error:4":"Valor Negativo recebido de um valor positivo esperado.",
"error:5":"Falha no ciclo de Homing. Homing n&atilde;o est&aacute; habilitado via configura&ccedil;&otilde;es.",
"error:6":"Tempo M&iacute;nimo no pulso de passo precisa ser maior que 3useg.",
"error:7":"Falha na leitura da EEPROM. Restaurando valores afetados pelos valores padr&otilde;es.",
"error:8":"Comando Grbl '$' n&atilde;o pode ser usado a menos que Grbl esteja ocioso. Garante uma bom funcionamento durante o trabalho.",
"error:9":"Comando G-code est&aacute; bloqueado durante alarme ou trabalhando.",
"error:10":"Limite por software n&atilde;o pode ser habilitado sem o homing estar habilitado.",
"error:11":"Caracteres m&aacute;ximos por linha excedido. Linha de comando recebida n&atilde;o executada.",
"error:12":"Grbl '$' valor setado excede o m&aacute;ximo step rate suportado.",
"error:13":"Detectado porta de seguran&ccedil;a aberta e estado de porta iniciado.",
"error:14":"Informa&ccedil;&atilde;o de Compila&ccedil;&atilde;o or linha de inicializa&ccedil;&atilde;o excede limite do tamanho da linha na EEPROM. Linha n&atilde;o armazenada.",
"error:15":"Alvo do Jog excede movimento da m&aacute;quina. Comando Jog foi ignorado.",
"error:16":"Comando Jog n&atilde;o contem '=' ou contai g-code inv&aacute;lido.",
"error:17":"Modo Laser requer sa&iacute;da PWM.",
"error:20":"Inv&aacute;lido ou n&atilde;o suportado comando g-code encontrado no bloco.",
"error:21":"Mais de um comando g-code do mesmo grupo modal encontrado no bloco.",
"error:22":"Feed rate n&atilde;o foi corretamente setado ou est&aacute; indefinido.",
"error:23":"Comando g-code no bloco requer um valor inteiro.",
"error:24":"Mais de um comando g-code requer informa&ccedil;&atilde;o de eixos encontrados no bloco.",
"error:25":"Palavra g-code repetida encontrada no bloco.",
"error:26":"N&atilde;o encontrado informa&ccedil;&otilde;s de eixos no bloco para um comando g-code ou estado do modal corrente requer isso.",
"error:27":"Valor do n&uacute;mero de linha &eacute; inv&aacute;lido.",
"error:28":"Est&aacute; faltando um valor requerido no comando g-code.",
"error:29":"G59.x trabalho com sistema de coordenada n&atilde;o &eacute; suportado.",
"error:30":"G53 somente permitido com modos de movimenta&ccedil;&atilde;o G0 e G1.",
"error:31":"Palavras de eixo encontradas no bloco quando nenhum comando ou estado modal atual as utiliza.",
"error:32":"Os arcos G2 e G3 exigem pelo menos uma palavra no eixo no plano.",
"error:33":"O destino do comando de movimento &eacute; inv&aacute;lido.",
"error:34":"O valor do raio do arco &eacute; inv&aacute;lido.",
"error:35":"Os arcos G2 e G3 exigem pelo menos uma palavra de deslocamento no plano.",
"error:36":"Palavras de valor n&atilde;o utilizadas encontradas no bloco.",
"error:37":"O deslocamento do comprimento da ferramenta din&acirc;mica G43.1 n&atilde;o &eacute; atribu&iacute;do ao eixo de comprimento da ferramenta configurado.",
"error:38":"N&uacute;mero da ferramenta maior que o valor m&aacute;ximo suportado.",
"error:60":"Falha ao montar cart&atilde;o SD",
"error:61":"Cart&atilde;o SD falhou ao abrir arquivo para leitura",
"error:62":"Cart&atilde;o SD falhou ao abrir pasta",
"error:63":"Pasta n&atilde;o encontrada no Cart&atilde;o SD",
"error:64":"Cart&atilde;o SD arquivo vazio",
"error:70":"Falha ao iniciar Bluetooth",
"Max travel":"Max travel",
"Feed rate":"Feed rate",
"Plate thickness":"Touch plate thickness",
"Show probe panel":"Show probe panel",
"Probe":"Probe",
"Start Probe":"Start Probe",
"Touch status":"Touch status",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"Value of maximum probe travel must be between 1 mm and 9999 mm !",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"Value of probe touch plate thickness must be between 0 mm and 9999 mm !",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !",
"Probe failed !":"Probe failed !",
"Probe result saved.":"Probe result saved.",
"Browser:":"Browser:",
"Probing...":"Probing...",
"Step pulse, microseconds":"Step pulse, microseconds",
"Step idle delay, milliseconds":"Step idle delay, milliseconds",
"Step port invert, mask2":"Step port invert, mask",
"Direction port invert, mask":"Direction port invert, mask",
"Step enable invert, boolean":"Step enable invert, boolean",
"Limit pins invert, boolean":"Limit pins invert, boolean",
"Probe pin invert, boolean":"Probe pin invert, boolean",
"Status report, mask":"Status report, mask",
"Junction deviation, mm":"Junction deviation, mm",
"Arc tolerance, mm":"Arc tolerance, mm",
"Report inches, boolean":"Report inches, boolean",
"Soft limits, boolean":"Soft limits, boolean",
"Hard limits, boolean":"Hard limits, boolean",
"Homing cycle, boolean":"Homing cycle, boolean",
"Homing dir invert, mask":"Homing dir invert, mask",
"Homing feed, mm/min":"Homing feed, mm/min",
"Homing seek, mm/min":"Homing seek, mm/min",
"Homing debounce, milliseconds":"Homing debounce, milliseconds",
"Homing pull-off, mm":"Homing pull-off, mm",
"Max spindle speed, RPM":"Max spindle speed, RPM",
"Min spindle speed, RPM":"Min spindle speed, RPM",
"Laser mode, boolean":"Laser mode, boolean",
"X steps/mm":"X steps/mm",
"Y steps/mm":"Y steps/mm",
"Z steps/mm":"Z steps/mm",
"X Max rate, mm/min":"X Max rate, mm/min",
"Y Max rate, mm/min":"Y Max rate, mm/min",
"Z Max rate, mm/min":"Z Max rate, mm/min",
"X Acceleration, mm/sec^2":"X Acceleration, mm/sec^2",
"Y Acceleration, mm/sec^2":"Y Acceleration, mm/sec^2",
"Z Acceleration, mm/sec^2":"Z Acceleration, mm/sec^2",
"X Max travel, mm":"X Max travel, mm",
"Y Max travel, mm":"Y Max travel, mm",
"Z Max travel, mm":"Z Max travel, mm"
};
//endRemoveIf(ptbr_lang_disabled)

//removeIf(ru_lang_disabled)
//Russian
var russiantrans = {
"ru": "Русский",
"ESP3D for": "ESP3D для",
"Value of auto-check must be between 0s and 99s !!": "Значение автоматической проверки должно быть от 0 до 99 секунд !!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !": "Значение скорости экструдера должно быть от 1 мм/мин до 9999 мм/мин !",
"Value of filament length must be between 0.001 mm and 9999 mm !": "Значение длины нити должно составлять от 0,001 мм до 9999 мм !",
"cannot have '-', '#' char or be empty": "не может быть символом '-', '#' или быть пустым",
"cannot have '-', 'e' char or be empty": "не может быть символом '-', 'e' или быть пустым",
"Failed:": "Неудача:",
"File config / config.txt not found!": "Файл config / config.txt не найден!",
"File name cannot be empty!": "Название файла не может быть пустым!",
"Value must be ": "Значение должно быть ",
"Value must be between 0 degres and 999 degres !": "Значение должно быть от 0 до 999 градусов !",
"Value must be between 0% and 100% !": "Значение должно быть от 0% до 100% !",
"Value must be between 25% and 150% !": "Значение должно быть между 25% и 150% !",
"Value must be between 50% and 300% !": "Значение должно быть между 50% и 300% !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !": "Значение скорости подачи осей XY должно быть от 1 мм/мин до 9999 мм/мин !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !": "Значение скорости подачи оси Z должно быть от 1 мм/мин до 999 мм/мин !",
" seconds": " сек.",
"Abort": "Прервать",
"auto-check every:": "автоматическая проверка каждые:",
"auto-check position every:": "автоматическая проверка позиции каждые:",
"Autoscroll": "Автопрокрутка",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed": "Стол",
"Chamber":"Chamber",
"Board": "Плата",
"Busy...": "Перегружен...",
"Camera": "Камера",
"Cancel": "Отменить",
"Cannot get EEPROM content!": "Не удается получить содержимое EEPROM!",
"Clear": "Очистить",
"Close": "Закрыть",
"Color": "Цвет",
"Commands": "Команды",
"Communication locked by another process, retry later.": "Соединение заблокировано другим процессом, повторите попытку позже.",
"Communication locked!": "Соединение заблокировано!",
"Communications are currently locked, please wait and retry.": "Соединение заблокировано, подождите и повторите попытку.",
"Confirm deletion of directory: ": "Подтвердить удаление каталога: ",
"Confirm deletion of file: ": "Подтвердить удаление файла: ",
"Connecting ESP3D...": "Подключение ESP3D...",
"Connection failed! is your FW correct?": "Соединение не удалось! версия прошивки правильная?",
"Controls": "Управление",
"Credits": "Благодарности",
"Dashboard": "Панель управления",
"Data modified": "Данные изменены",
"Do you want to save?": "Сохранить?",
"Enable second extruder controls": "Включить управление вторым экструдером",
"Error": "Ошибка",
"ESP3D Filesystem": "Файловая система ESP3D",
"ESP3D Settings": "Настройки ESP3D",
"ESP3D Status": "Статус ESP3D",
"ESP3D Update": "Обновить ESP3D",
"Extrude": "Экструдировать",
"Extruder T0": "Экструдер T0",
"Extruder T1": "Экструдер T1",
"Extruders": "Экструдеры",
"Fan (0-100%)": "Вентилятор (0-100%)",
"Feed (25-150%)": "Множитель скорости (25-150%)",
"Feedrate :": "Скорость подачи :",
"Filename": "Название файла",
"Filename/URI": "Название файла/URI",
"Verbose mode": "Подробный режим",
"Firmware": "Прошивка",
"Flow (50-300%)": "Множитель экструзии (50-300%)",
"Heater T0": "Нагреватель T0",
"Heater T1": "Нагреватель T1",
"Help": "Описание",
"Icon": "Символ",
"Interface": "Интерфейс",
"Join": "Подключиться",
"Label": "Параметр",
"List of available Access Points": "Список доступных точек доступа",
"Macro Editor": "Редактор макросов",
"mm": "мм",
"mm/min": "мм/мин",
"Motors off": "Выключить двигатели",
"Name": "Название",
"Name:": "Название:",
"Network": "Сеть",
"No SD card detected": "SD-карта не обнаружена",
"No": "Нет",
"Occupation:": "Захоплення:",
"Ok": "ОК",
"Options": "Опции",
"Out of range": "Вне диапазона",
"Please Confirm": "Подтвердите",
"Please enter directory name": "Введите название каталога ",
"Please wait...": "Подождите...",
"Printer configuration": "Конфигурация принтера",
"GRBL configuration": "Конфигурация GRBL",
"Printer": "Принтер",
"Progress": "Состояние",
"Protected": "Защита",
"Refresh": "Обновить",
"Restart ESP3D": "Перезапустить ESP3D",
"Restarting ESP3D": "Перезапуск ESP3D",
"Restarting": "Перезапуск",
"Restarting, please wait....": "Перезапуск, пожалуйста, подождите....",
"Retry": "Повторить попытку",
"Reverse": "Втянуть",
"Save macro list failed!": "Не удалось сохранить список макросов!",
"Save": "Сохранить",
"Saving": "Сохранение",
"Scanning": "Сканирование",
"SD Files": "Файлы на SD-карте",
"sec": "сек",
"Send Command...": "Отправить команду...",
"Send": "Отправить",
"Set failed": "Изменение не удалось",
"Set": "Изменить",
"Signal": "Сигнал",
"Size": "Размер",
"SSID": "SSID",
"Target": "Цель",
"Temperatures": "Температура",
"Total:": "Размер:",
"Type": "Тип",
"Update Firmware ?": "Обновить прошивку ?",
"Update is ongoing, please wait and retry.": "Обновление прошивки, пожалуйста, подождите",
"Update": "Обновление",
"Upload failed : ": "Загрузка не удалась : ",
"Upload failed": "Загрузка не удалась",
"Upload": "Загрузить",
"Uploading ": "Загрузка ",
"Upload done": "Загрузка завершена",
"Used:": "Использовано:",
"Value | Target": "Значение | Цель",
"Value": "Значение",
"Wrong data": "Неверные данные",
"Yes": "Да",
"Light": "Свет",
"None": "Нет данных",
"Modem": "Модем",
"STA": "Клиент (STA)",
"AP": "Точка доступа (AP)",
"Baud Rate": "Скорость в бодах",
"Sleep Mode": "Спящий режим",
"Web Port": "Веб-Порт",
"Data Port": "Порт данных",
"Hostname": "Имя хоста",
"Wifi mode": "Режим Wi-Fi",
"Station SSID": "STA - SSID",
"Station Password": "STA - Пароль",
"Station Network Mode": "STA - Режим Wi-Fi",
"Station IP Mode": "STA - Режим IP",
"DHCP": "DHCP",
"Static": "Статический",
"Station Static IP": "STA - Статический IP",
"Station Static Mask": "STA - Маска подсети",
"Station Static Gateway": "STA - Статический шлюз",
"AP SSID": "AP - SSID",
"AP Password": "AP - Пароль",
"AP Network Mode": "AP - Режим Wi-Fi",
"SSID Visible": "AP - Видимость SSID",
"AP Channel": "AP - Канал",
"Open": "Открытая",
"Authentication": "AP - Аутентификация",
"AP IP Mode": "AP - Режим IP",
"AP Static IP": "AP - Статический IP",
"AP Static Mask": "AP - Маска подсети",
"AP Static Gateway": "AP - Статический шлюз",
"Time Zone": "Часовой пояс",
"Day Saving Time": "Летнее время",
"Time Server 1": "NTP-сервер 1",
"Time Server 2": "NTP-сервер 2",
"Time Server 3": "NTP-сервер 3",
"Target FW": "Целевая версия прошивки",
"Direct SD access": "Прямой доступ к SD-карте",
"Direct SD Boot Check": "Проверка SD-карты при запуске",
"Primary SD": "Главная SD-карта",
"Secondary SD": "Дополнительная SD-карта",
"Temperature Refresh Time": "Время обновления температуры",
"Position Refresh Time": "Время обновления позиции",
"Status Refresh Time": "Время обновления статуса",
"XY feedrate": "Скорость подачи осей XY",
"Z feedrate": "Скорость подачи оси Z",
"E feedrate": "Скорость подачи оси экструдера",
"Camera address": "Адрес IP-камеры ",
"Setup": "Конфигурация",
"Start setup": "Начать настройку",
"This wizard will help you to configure the basic settings.": "Этот мастер поможет вам настроить основные параметры.",
"Press start to proceed.": "Нажмите кнопку «Начать настройку», чтобы продолжить.",
"Save your printer's firmware base:": "Установите тип программного обеспечения принтера:",
"This is mandatory to get ESP working properly.": "Это необходимо для правильной работы ESP.",
"Save your printer's board current baud rate:": "Установите скорость последовательного порта принтера:",
"Printer and ESP board must use same baud rate to communicate properly.": "Принтер и плата ESP должны использовать одинаковую скорость передачи данных для правильной работы.",
"Continue": "Продолжить",
"WiFi Configuration": "Настройка WiFi",
"Define ESP role:": "Выберите режим передачи данных:",
"AP define access point / STA allows to join existing network": "«Точка доступа» создаст новую Wi-Fi сеть | «Клиент» подключение к существующей Wi-Fi сети",
"What access point ESP need to be connected to:": "К какой точке доступа ESP необходимо подключиться:",
"You can use scan button, to list available access points.": "Вы можете просканировать доступные точки доступа нажав кнопку 🔍.",
"Password to join access point:": "Пароль для соединения с точкой доступа:",
"Define ESP name:": "Придумайте название для ESP",
"What is ESP access point SSID:": "Название точки доступа:",
"Password for access point:": "Пароль точки доступа:",
"Define security:": "Выберите режим безопасности:",
"SD Card Configuration": "Настройки SD-карты",
"Is ESP connected to SD card:": "ESP подключен к SD-карте:",
"Check update using direct SD access:": "Проверять обновления через прямой доступ к SD-карт:",
"SD card connected to ESP": "SD-карта подключена к ESP",
"SD card connected to printer": "SD-карта подключена к принтеру",
"Setup is finished.": "Настройка завершена.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.": "После закрытия, вы все равно сможете изменить или скорректировать свои настройки в главном интерфейсе в любое время.",
"You may need to restart the board to apply the new settings and connect again.": "Вам необходимо перезапустить плату, чтобы применить новые настройки.",
"Identification requested": "Требуется вход в систему",
"admin": "admin",
"user": "user",
"guest": "guest",
"Identification invalid!": "Не удалось войти!",
"Passwords do not matches!": "Пароли не совпадают!",
"Password must be >1 and <16 without space!": "Пароль должен быть от 1 до 16 символов без пробелов!",
"User:": "Пользователь:",
"Password:": "Пароль:",
"Submit": "Отправить",
"Change Password": "Изменить пароль",
"Current Password:": "Текущий пароль:",
"New Password:": "Новый пароль:",
"Confirm New Password:": "Подтвердите новый пароль:",
"Error : Incorrect User": "Ошибка: Неверный Пользователь",
"Error: Incorrect password": "Ошибка: Неверный пароль",
"Error: Missing data": "Ошибка: Отсутствуют данные",
"Error: Cannot apply changes": "Ошибка: Не удается применить изменения",
"Error: Too many connections": "Ошибка: Слишком много соединений",
"Authentication failed!": "Ошибка аутентификации!",
"Serial is busy, retry later!": "Последовательный порт занят, повторите попытку позже!",
"Login": "Авторизоваться",
"Log out": "Выйти из системы",
"Password": "Пароль",
"No SD Card": "Нет SD-карты",
"Check for Update": "Проверить обновления",
"Please use 8.3 filename only.": "Пожалуйста, используйте название файла только в стиле 8.3",
"Preferences": "Настройки",
"Feature": "Опции",
"Show camera panel": "Показать раздел камеры",
"Auto load camera": "Автоматически загружать изображение с камеры",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls": "Включить управление столом",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls": "Включить управление вентилятором",
"Enable Z controls": "Включить управление осью Z",
"Panels": "Панели",
"Show control panel": "Показать панель управления",
"Show temperatures panel": "Показать панель температур",
"Show extruder panel": "Показать панель экструдера",
"Show files panel": "Показать панель файлов",
"Show GRBL panel": "Показать панель GRBL",
"Show commands panel": "Показать панель команд",
"Select files": "Выбор файлов",
"Select file": "Выбрать файл",
"$n files": "$n файлов",
"No file chosen": "Файл не выбран",
"Length": "Длина",
"Output msg": "Показать иинформацию",
"Enable": "Включить",
"Disable": "Выключить",
"Serial": "Последовательный порт",
"Chip ID": "ID процессора",
"CPU Frequency": "Частота процессора",
"CPU Temperature": "Температура процессора",
"Free memory": "Доступно памяти",
"Flash Size": "Размер флэш памяти",
"Available Size for update": "Доступный размер для обновления",
"Available Size for SPIFFS": "Доступный размер для системных файлов",
"Baud rate": "Скорость в бодах",
"Sleep mode": "Режим сна",
"Channel": "Канал",
"Phy Mode": "Режим работы сети",
"Web port": "Веб-порт",
"Data port": "Порт данных",
"Active Mode": "Используемый режим",
"Connected to": "Подключен к",
"IP Mode": "Режим IP",
"Gateway": "Шлюз",
"Mask": "Маска",
"DNS": "DNS",
"Disabled Mode": "Неиспользуемый режим",
"Captive portal": "Captive portal",
"Enabled": "Включено",
"Web Update": "Веб-Обновление",
"Pin Recovery": "Восстановление кнопкой",
"Disabled": "Отключено",
"Target Firmware": "Тип ПО принтера",
"SD Card Support": "Поддержка SD-карты",
"Time Support": "Поддержка режима часов",
"M117 output": "Отправка M117",
"Oled output": "Вывод на OLED экран",
"Serial output": "Вывод в последовательный порт",
"Web socket output": "Вывод в Web-socket",
"TCP output": "Вывод в TCP",
"FW version": "Версия прошивки",
"Show DHT output": "Отображение температуры и влажности с датчика DHT",
"DHT Type": "Тип DHT",
"DHT check (seconds)": "Обновление данных с DHT (сек)",
"SD speed divider": "Делитель скорости SD-карты",
"Number of extruders": "Количество экструдеров",
"Mixed extruders": "Экструдер смешения",
"Extruder": "Экструдер",
"Enable lock interface": "Отображение переключателя блокировки интерфейса",
"Lock interface": "Заблокировать интерфейс",
"Unlock interface": "Разблокировать интерфейс",
"You are disconnected": "Вы отключены",
"Looks like you are connected from another place, so this page is now disconnected": "Похоже, вы подключены из другого места, поэтому эта страница теперь отключена",
"Please reconnect me": "Переподключиться",
"Mist": "Mist",
"Flood": "Flood",
"Spindle": "Spindle",
"Connection monitoring": "Мониторинг соединения",
"XY Feedrate value must be at least 1 mm/min!": "Значение подачи осей XY должно быть не менее 1 мм/мин!",
"Z Feedrate value must be at least 1 mm/min!": "Значение подачи оси Z должно быть не менее 1 мм/мин!",
"Hold:0": "Остановлен. Готов к продолжению печати.",
"Hold:1": "Производится остановка. Сброс вызовет тревогу.",
"Door:0": "Дверь закрыта. Готов к продолжению печати.",
"Door:1": "Машина остановилась. Дверь все еще приоткрыта. Возобновление невозможно до закрытия двери.",
"Door:2": "Дверь открыта. Остановка (или парковка экструдера) в процессе. Сброс вызовет тревогу.",
"Door:3": "Дверь закрыта. Восстановление из точки парковки, если возможно. Сброс вызовет тревогу.",
"ALARM:1": "Сработал аппаратный ограничитель. Положение машины, вероятно, потеряно из-за внезапной остановки. Повторная установка нулевой точки настоятельно рекомендуется.",
"ALARM:2": "Сработал программный ограничитель. Целевая точка находится за пределами области перемещения. Положение машины сохранено. Сигнал может быть безопасно сброшен.",
"ALARM:3": "Сброс во время движения. Положение машины, вероятно, потеряно из-за внезапной остановки. Повторная установка нулевой точки настоятельно рекомендуется.",
"ALARM:4": "Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5": "Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6": "Ошибка установки нулевой точки. Операция была сброшена.",
"ALARM:7": "Ошибка установки нулевой точки. Произошло открытие двери во время производимой операции.",
"ALARM:8": "Ошибка установки нулевой точки. Недостаточно усилия для достижения концевого выключателя. Отрегулируйте ток двигателей или проверьте правильность подключения.",
"ALARM:9": "Ошибка установки нулевой точки. Концевой выключатель находится вне указанной дистанции. Попробуйте увеличить расстояния поиска концевого выключателя, отрегулировать ток двигателей или проверьте правильность подключения.",
"error:1": "Команда g-code состоит из буквы и значения. Буква не найдена.",
"error:2": "Отсутствует ожидаемое значение слова G-кода или формат числового значения недопустим.",
"error:3": "Системная команда Grbl ' $ ' не была распознана или не поддерживается.",
"error:4": "Negative value received for an expected positive value.",
"error:5": "Ошибка установки нулевой точки. Установка нулевой точки отключена в настройках.",
"error:6": "Minimum step pulse time must be greater than 3usec.",
"error:7": "Не удалось прочитать EEPROM. Автоматическое восстановление значений EEPROM по умолчанию.",
"error:8": "Команда Grbl '$' не может использоваться, если Grbl не простаивает. Обеспечивает плавную работу во время работы.",
"error:9": "Команды G-кода блокируются во время тревоги или состояния jog.",
"error:10": "Программные ограничители нельзя включить без включения функции установки нулевой точки.",
"error:11": "Превышено максимальное количество символов в строке. Полученная командная строка не была выполнена.",
"error:12": "Значение параметра Grbl '$' приводит к превышению максимальной поддерживаемой скорости шага.",
"error:13": "Safety door detected as opened and door state initiated.",
"error:14": "Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15": "Jog target exceeds machine travel. Jog command has been ignored.",
"error:16": "Jog command has no '=' or contains prohibited g-code.",
"error:17": "Режим лазера требует выход с режимом PWM.",
"error:20": "Обнаружена неподдерживаемая или недопустимая команда g-кода.",
"error:21": "More than one g-code command from same modal group found in block.",
"error:22": "Скорость подачи еще не установлена или не определена.",
"error:23": "Команда G-code в блоке требует целочисленного значения.",
"error:24": "More than one g-code command that requires axis words found in block.",
"error:25": "Repeated g-code word found in block.",
"error:26": "No axis words found in block for g-code command or current modal state which requires them.",
"error:27": "Line number value is invalid.",
"error:28": "G-code command is missing a required value word.",
"error:29": "G59.x work coordinate systems are not supported.",
"error:30": "G53 допускается только в режимах движения G0 и G1.",
"error:31": "Axis words found in block when no command or current modal state uses them.",
"error:32": "G2 and G3 arcs require at least one in-plane axis word.",
"error:33": "Motion command target is invalid.",
"error:34": "Arc radius value is invalid.",
"error:35": "G2 and G3 arcs require at least one in-plane offset word.",
"error:36": "Unused value words found in block.",
"error:37": "G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38": "Номер инструмента больше, чем максимальное поддерживаемое значение.",
"error:60": "Монтирование SD-карты не удалось",
"error:61": "Открыть файл для чтения с SD-карты не удалось",
"error:62": "Не удалось открыть каталог с SD-карты",
"error:63": "Каталог не найден на SD-карте",
"error:64": "Файл отсутствует на SD-карте",
"error:70": "Запуск Bluetooth невозможен"
};
//endRemoveIf(ru_lang_disabled)

//removeIf(tr_lang_disabled)
//Turkish
var turkishtrans = {
"tr":"T&uuml;rk&ccedil;e",
"ESP3D for":"ESP3D i&ccedil;in",
"Value of auto-check must be between 0s and 99s !!":"Otomatik kontrol de&gbreve;eri 0s ile 99s aras&inodot;nda olmal&inodot;d&inodot;r !!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"Ekstruder h&inodot;z&inodot; 1 mm/dk ile 9999 mm/dk aras&inodot;nda olmal&inodot;d&inodot;r !",
"Value of filament length must be between 0.001 mm and 9999 mm !":"Filament uzunlu&gbreve;u de&gbreve;eri 0.001 mm ile 9999 mm aras&inodot;nda olmal&inodot;d&inodot;r !",
"cannot have '-', '#' char or be empty":" '-', '#' karakterlerini bulunduramaz veya bo&scedil; olamaz",
"cannot have '-', 'e' char or be empty":" '-', 'e' karakterlerini bulunduramaz veya bo&scedil; olamaz",
"Failed:":"Ba&scedil;ar&inodot;s&inodot;z:",
"File config / config.txt not found!":"File config / config.txt bulunamad&inodot;!",
"File name cannot be empty!":"Dosya ad&inodot; bo&scedil; b&inodot;rak&inodot;lamaz!",
"Value must be ":"Olması gereken de&gbreve;er: ",
"Value must be between 0 degres and 999 degres !":"De&gbreve;er 0 ile 999 derece aras&inodot;nda olmal&inodot;d&inodot;r !",
"Value must be between 0% and 100% !":"De&gbreve;er 0% ile 100% aras&inodot;nda olmal&inodot;d&inodot;r !",
"Value must be between 25% and 150% !":"De&gbreve;er 25% ile 150% aras&inodot;nda olmal&inodot;d&inodot;r !",
"Value must be between 50% and 300% !":"De&gbreve;er 50% ile 300% aras&inodot;nda olmal&inodot;d&inodot;r !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"XY feedrate de&gbreve;eri 1 mm/dk ile 9999 mm/dk aras&inodot;nda olmal&inodot;d&inodot;r!",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Z feedrate de&gbreve;eri 1 mm/dk ile 999 mm/dk aras&inodot;nda olmal&inodot;d&inodot;r!",
" seconds":" saniye",
"Abort":"&Idot;ptal Et",
"auto-check every:":"Otomatik-kontrol her:",
"auto-check position every:":"Otomatik pozisyon kontrol&uuml; her:",
"Autoscroll":"Otomatik Kayd&inodot;r",
"Max travel":"Max hareket",
"Feed rate":"ilerleme h&inodot;z&inodot;",
"Touch plate thickness":"Touch plate kal&inodot;nl&inodot;&gbreve;&inodot;",
"Redundant":"Gereksiz",
"Probe":"Probe",
"Bed":"Yatak",
"Chamber":"Hazne",
"Board":"Kart",
"Busy...":"Me&scedil;gul...",
"Camera":"Kamera",
"Cancel":"&Idot;ptal et",
"Cannot get EEPROM content!":"EEPROM i&ccedil;eri&gbreve;i algılanamıyor!",
"Clear":"Temizle",
"Close":"Kapat",
"Color":"Renk",
"Commands":"Komutlar",
"Communication locked by another process, retry later.":"&Idot;leti&scedil;im ba&scedil;ka bir i&scedil;lem nedeniyle kilitli, daha sonra tekrar deneyin.",
"Communication locked!":"&Idot;leti&scedil;im kilitli!",
"Communications are currently locked, please wait and retry.":"&Idot;leti&scedil;im &scedil;u anda kilitli, l&uuml;tfen bekleyin ve tekrar deneyin. ",
"Confirm deletion of directory: ":"Adres silme i&scedil;lemini onayla: ",
"Confirm deletion of file: ":"Dosya silme i&scedil;lemini onayla: ",
"Connecting ESP3D...":"ESP3D&apos;e ba&gbreve;lanılıyor ...",
"Connection failed! is your FW correct?":"Ba&gbreve;lantı ba&scedil;arısız!FW&apos;nizin do&gbreve;rulu&gbreve;unu kontrol edin.",
"Controls":"Kontroller",
"Credits":"Credits",
"Dashboard":"G&ouml;sterge paneli",
"Data modified":"Data de&gbreve;i&scedil;tirildi",
"Do you want to save?":"Kaydetmek istiyor musunuz?",
"Enable second extruder controls":"&Idot;kinci ekstruder kontrol&uuml;n&uuml; etkinle&scedil;tir",
"Error":"Hata",
"ESP3D Filesystem":"ESP3D Dosya sistemi",
"ESP3D Settings":"ESP3D Ayarlar",
"ESP3D Status":"ESP3D Durum",
"ESP3D Update":"ESP3D G&uuml;ncelleme",
"Extrude":"&ccedil;ıkar",
"Extruder T0":"Ekstruder T0",
"Extruder T1":"Eksruder T1",
"Extruders":"Ekstruderler",
"Fan (0-100%)":"Fan (0-100%)",
"Feed (25-150%)":"Feed (25-150%)",
"Feedrate :":"Feedrate :",
"Filename":"Dosya ad&inodot;",
"Filename/URI":"Dosya ad&inodot;/URI",
"Verbose mode":"Ayr&inodot;nt&inodot;l&inodot; mod",
"Firmware":"Donan&inodot;m",
"Flow (50-300%)":"Ak&inodot;&scedil; (50-300%)",
"Heater T0":"Is&inodot;t&inodot;c&inodot; T0",
"Heater T1":"Is&inodot;t&inodot;c&inodot; T1",
"Help":"Yard&inodot;m",
"Icon":"&Idot;kon",
"Interface":"Aray&uuml;z",
"Join":"Kat&inodot;l",
"Label":"Etiket",
"List of available Access Points":"Kullan&inodot;labilir Eri&scedil;im Noktalar&inodot; Listesi",
"Macro Editor":"Makro Edit&ouml;r",
"mm":"mm",
"mm/min":"mm/dk",
"Motors off":"Motorlar kapal&inodot;",
"Name":"Ad",
"Name:":"Ad:",
"Network":"A&gbreve;",
"No SD card detected":"SD kart bulunamad&inodot;",
"No":"Hay&inodot;r",
"Occupation:":"Kullan&inodot;m:",
"Ok":"Tamam",
"Options":"Se&ccedil;enekler",
"Out of range":"Aral&inodot;k/Menzil d&inodot;&scedil;&inodot;",
"Please Confirm":"L&uuml;tfen Onaylay&inodot;n",
"Please enter directory name":"L&uuml;tfen hedef dizin ismini girin",
"Please wait...":"L&uuml;tfen bekleyin...",
"Printer configuration":"Yaz&inodot;c&inodot; bi&ccedil;imi",
"GRBL configuration":"GRBL bi&ccedil;imi",
"Printer":"Yaz&inodot;c&inodot;",
"Progress":"&Idot;&scedil;lem Durumu",
"Protected":"Protected",
"Refresh":"Yenile",
"Restart ESP3D":"ESP3D&apos;i yeniden ba&scedil;lat",
"Restarting ESP3D":"ESP3D yeniden ba&scedil;lat&inodot;l&inodot;yor",
"Restarting":"Yeniden ba&scedil;lat&inodot;l&inodot;yor",
"Restarting, please wait....":"Yeniden ba&scedil;lat&inodot;l&inodot;yor, l&uuml;tfen bekleyin....",
"Retry":"Yeniden dene",
"Reverse":"Reverse",
"Save macro list failed!":"Makro listesi kaydedilemedi!",
"Save":"Kaydet",
"Saving":"Kaydediliyor",
"Scanning":"Taran&inodot;yor",
"SD Files":"SD Dosyalar&inodot;",
"sec":"sa",
"Send Command...":"Komut g&ouml;nder...",
"Send":"G&ouml;nder",
"Set failed":"Ayarlama ba&scedil;ar&inodot;s&inodot;z",
"Set":"Ayarla",
"Signal":"Sinyal",
"Size":"Boyut",
"SSID":"SSID",
"Target":"Hedef",
"Temperatures":"S&inodot;cakl&inodot;klar",
"Total:":"Total:",
"Type":"T&uuml;r",
"Update Firmware ?":"Donan&inodot;m&inodot; G&uuml;ncelle ?",
"Update is ongoing, please wait and retry.":"G&uuml;ncelleme devam ediyor, l&uuml;tfen bekleyin ve yeniden deneyin.",
"Update":"G&uuml;ncelle",
"Upload failed : ":"Y&uuml;kleme ba&scedil;ar&inodot;s&inodot;z : ",
"Upload failed":"Y&uuml;kleme ba&scedil;ar&inodot;s&inodot;z",
"Upload":"Y&uuml;kle",
"Uploading ":"Y&uuml;kleniyor ",
"Upload done":"Y&uuml;kleme tamamland&inodot;",
"Used:":"Kullan&inodot;lanlar:",
"Value | Target":"De&gbreve;er | Hedef",
"Value":"De&gbreve;er",
"Wrong data":"Yanl&inodot;&scedil; data",
"Yes":"Evet",
"Light":"I&scedil;&inodot;k",
"None":"Yok",
"Modem":"Modem",
"STA":"STA",
"AP":"AP",
"BT":"Bluetooth",
"Baud Rate":"Baud Rate",
"Sleep Mode":"Uyku Modu",
"Web Port":"Web Portu",
"Data Port":"Data Portu",
"Hostname":"Hostname",
"Wifi mode":"Wifi modu",
"Station SSID":"Station SSID",
"Station Password":"Station Password",
"Station Network Mode":"Station Network Mode",
"Station IP Mode":"Station IP Mode",
"DHCP":"DHCP",
"Static":"Statik",
"Station Static IP":"Station Statik IP",
"Station Static Mask":"Station Statik Mask",
"Station Static Gateway":"Station Statik Gateway",
"AP SSID":"AP SSID",
"AP Password":"AP &scedil;ifresi",
"AP Network Mode":"AP Network Mode",
"SSID Visible":"SSID Visible",
"AP Channel":"AP Channel",
"Open":"A&ccedil;",
"Authentication":"Yetki",
"AP IP Mode":"AP IP Mode",
"AP Static IP":"AP Statik IP",
"AP Static Mask":"AP Statik Mask",
"AP Static Gateway":"AP Statik Gateway",
"Time Zone":"Saat Dilimi",
"Day Saving Time":"Day Saving Time",
"Time Server 1":"Time Server 1",
"Time Server 2":"Time Server 2",
"Time Server 3":"Time Server 3",
"Target FW":"Hedef FW",
"Direct SD access":"Direkt SD eri&scedil;imi",
"Direct SD Boot Check":"Direkt SD Boot Kontrol&uuml;",
"Primary SD":"Birincil SD",
"Secondary SD":"&Idot;kincil SD",
"Temperature Refresh Time":"S&inodot;cakl&inodot;k Yenileme Zaman&inodot;",
"Position Refresh Time":"Pozisyon Yenileme Zaman&inodot;",
"Status Refresh Time":"Durum Yenileme Zaman&inodot;",
"XY feedrate":"XY feedrate",
"Z feedrate":"Z feedrate",
"E feedrate":"E feedrate",
"Camera address":"Kamera adresi",
"Setup":"Kurulum",
"Start setup":"Kurulumu ba&scedil;lat",
"This wizard will help you to configure the basic settings.":"Kurulum sihirbaz&inodot; basit ayarlar&inodot; bi&ccedil;imlendirmenizde yard&inodot;mc&inodot; olur.",
"Press start to proceed.":"&Idot;lerlemek i&ccedil;in ba&scedil;lat&apos;a bas&inodot;n.",
"Save your printer's firmware base:":"Yaz&inodot;c&inodot;n&inodot;z&inodot;n donan&inodot;m taban&inodot;n&inodot; kaydedin:",
"This is mandatory to get ESP working properly.":"ESP&apos;nin do&gbreve;ru &ccedil;al&inodot;&scedil;mas&inodot; i&ccedil;in bu gereklidir.",
"Save your printer's board current baud rate:":"Yaz&inodot;c&inodot;n&inodot;z&inodot;n kart baud rate&apos;ini kaydedin:",
"Printer and ESP board must use same baud rate to communicate properly.":"Yaz&inodot;c&inodot; ve ESP kart&inodot;n&inodot;n do&gbreve;ru haberle&scedil;mesi i&ccedil;in ayn&inodot; baud rate kullan&inodot;lmal&inodot;d&inodot;r.",
"Continue":"Devam",
"WiFi Configuration":"WiFi Configuration",
"Define ESP role:":"Define ESP role:",
"AP define access point / STA allows to join existing network":"AP define access point / STA allows to join existing network",
"What access point ESP need to be connected to:":"What access point ESP need to be connected to:",
"You can use scan button, to list available access points.":"Kullan&inodot;labilir eri&scedil;im noktalar&inodot;n&inodot; g&ouml;r&uuml;nt&uuml;lemek i&ccedil;in tara tu&scedil;unu kullanabilirsiniz.",
"Password to join access point:":"Eri&scedil;im noktas&inodot;na kat&inodot;lmak i&ccedil;in &scedil;ifre:",
"Define ESP name:":"ESP ismi tan&inodot;mla:",
"What is ESP access point SSID:":"What is ESP access point SSID:",
"Password for access point:":"Eri&scedil;im noktas&inodot; i&ccedil;in &scedil;ifre:",
"Define security:":"G&uuml;venli&gbreve;i tan&inodot;mla:",
"SD Card Configuration":"SD Card Configuration",
"Is ESP connected to SD card:":"Is ESP connected to SD card:",
"Check update using direct SD access:":"Direkt SD eri&scedil;imini kullanarak g&uuml;ncelleme kontrol&uuml; yap:",
"SD card connected to ESP":"SD kart ESP&apos;ye ba&gbreve;land&inodot;",
"SD card connected to printer":"SD kart yaz&inodot;c&inodot;ya ba&gbreve;land&inodot;",
"Setup is finished.":"Kurulum tamamland&inodot;.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"Kapatt&inodot;ktan sonra, ana aray&uuml;z &uuml;zerinde hala ince de&gbreve;i&scedil;iklikler yapabiliyor olacaks&inodot;n&inodot;z.",
"You may need to restart the board to apply the new settings and connect again.":"Yeni de&gbreve;i&scedil;ikliklerin uygulanabilmesi i&ccedil;in kart&inodot; yeniden ba&scedil;latman&inodot;z gerekebilir.",
"Identification requested":"Identification requested",
"admin":"admin",
"user":"kullan&inodot;c&inodot;",
"guest":"misafir",
"Identification invalid!":"ge&ccedil;ersiz kimlik!",
"Passwords do not matches!":"&scedil;ifreler uyu&scedil;muyor!",
"Password must be >1 and <16 without space!":"&Scedil;ifre >1 ve <16 aras&inodot;nda bo&scedil;luksuz olmal&inodot;!",
"User:":"Kullan&inodot;c&inodot;:",
"Password:":"&Scedil;ifre:",
"Submit":"Submit",
"Change Password":"&Scedil;ifre De&gbreve;i&scedil;tir",
"Current Password:":"Eski &Scedil;ifre:",
"New Password:":"Yeni &Scedil;ifre:",
"Confirm New Password:":"Yeni &Scedil;ifreyi Onayla:",
"Error : Incorrect User":"Hata : Yanl&inodot;&scedil; Kullan&inodot;c&inodot;",
"Error: Incorrect password":"Hata: Yanl&inodot;&scedil; &Scedil;ifre",
"Error: Missing data":"Hata: Kay&inodot;p data",
"Error: Cannot apply changes":"Hata: de&gbreve;i&scedil;iklikler uygulanamad&inodot;",
"Error: Too many connections":"Hata: fazla ba&gbreve;lant&inodot;",
"Authentication failed!":"Yetki ba&scedil;ar&inodot;s&inodot;z!",
"Serial is busy, retry later!":"Serial me&scedil;gul, daha sonra yeniden deneyin!",
"Login":"Oturum a&ccedil;",
"Log out":"Oturumu kapat",
"Password":"&Scedil;ifre",
"No SD Card":"SD Card yok",
"Check for Update":"G&uuml;ncelleme Kontrol&uuml; yap",
"Please use 8.3 filename only.":"L&uuml;tfen 8.3 dosya ad&inodot; kullan&inodot;n.",
"Preferences":"Tercihler",
"Feature":"Feature",
"Show camera panel":"Kamera panelini g&ouml;ster",
"Auto load camera":"Kameray&inodot; otomatik y&uuml;kle",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Probe s&inodot;cakl&inodot;klar&inodot;n&inodot; etkinle&scedil;tir",
"Enable bed controls":"Yatak kontrollerini etkinle&scedil;tir",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"Fan kontrollerini etkinle&scedil;tir",
"Enable Z controls":"Z kontrollerini etkinle&scedil;tir",
"Panels":"Paneller",
"Show control panel":"Kontrol panelini g&ouml;ster",
"Show temperatures panel":"S&inodot;cakl&inodot;k panelini g&ouml;ster",
"Show extruder panel":"Ekstruder panelini g&ouml;ster",
"Show files panel":"Dosya panelini g&ouml;ster",
"Show GRBL panel":"GRBL panelini g&ouml;ster",
"Show commands panel":"Komut panelini g&ouml;ster",
"Select files":"Dosyalar&inodot; se&ccedil;",
"Select file":"Dosya se&ccedil;",
"$n files":"$n dosyalar&inodot;",
"No file chosen":"Dosya se&ccedil;ilmedi",
"Length":"Uzunluk",
"Output msg":"Output msg",
"Enable":"Etkinle&scedil;tir",
"Disable":"Devre d&inodot;&scedil;&inodot; b&inodot;rak",
"Serial":"Serial",
"Chip ID":"Chip ID",
"CPU Frequency":"CPU Frekans&inodot;",
"CPU Temperature":"CPU S&inodot;cakl&inodot;&gbreve;&inodot;",
"Free memory":"Bo&scedil; haf&inodot;za",
"Flash Size":"Flash Boyutu",
"Available Size for update":"G&uuml;ncelleme i&ccedil;in bo&scedil; alan",
"Available Size for SPIFFS":"SPIFFS  i&ccedil;in bo&scedil; alan",
"Baud rate":"Baud rate",
"Sleep mode":"Uyku modu",
"Channel":"Channel",
"Phy Mode":"Phy Mode",
"Web port":"Web port",
"Data port":"Data port",
"Active Mode":"Aktif Mod",
"Connected to":"Ba&gbreve;land&inodot;:",
"IP Mode":"IP Mode",
"Gateway":"Gateway",
"Mask":"Mask",
"DNS":"DNS",
"Disabled Mode":"Devre d&inodot;&scedil;&inodot; mod",
"Captive portal":"Captive portal",
"Enabled":"Enabled",
"Web Update":"Web Update",
"Pin Recovery":"Pin Recovery",
"Disabled":"Devre d&inodot;&scedil;&inodot;",
"Target Firmware":"Hedef Donan&inodot;m",
"SD Card Support":"SD Card Support",
"Time Support":"Time Support",
"M117 output":"M117 output",
"Oled output":"Oled output",
"Serial output":"Serial output",
"Web socket output":"Web socket output",
"TCP output":"TCP output",
"FW version":"FW version",
"Show DHT output":"Show DHT output",
"DHT Type":"DHT Type",
"DHT check (seconds)":"DHT kontrol&uuml; (saniye)",
"SD speed divider":"SD speed divider",
"Number of extruders":"Ekstruder say&inodot;s&inodot;",
"Mixed extruders":"Mixed extruders",
"Extruder":"Ekstruder",
"Enable lock interface":"Aray&uuml;z kilidini etkinle&scedil;tir",
"Lock interface":"Kilit aray&uuml;z&uuml;",
"Unlock interface":"Aray&uuml;z kilidini a&ccedil;",
"You are disconnected":"Ba&gbreve;lant&inodot;n&inodot;z kesildi",
"Looks like you are connected from another place, so this page is now disconnected":"Ba&scedil;ka bir yerden ba&gbreve;l&inodot;s&inodot;n&inodot;z,bu sayfan&inodot;n Ba&gbreve;lant&inodot;s&inodot; kesildi ",
"Please reconnect me":"Please reconnect me",
"Mist":"Mist",
"Flood":"Flood",
"Spindle":"Spindle",
"Connection monitoring":"Ba&gbreve;lant&inodot; kontrol&uuml;",
"XY Feedrate value must be at least 1 mm/min!":"XY Feedrate de&gbreve;eri en az 1 mm/dk olmal&inodot;d&inodot;r!",
"Z Feedrate value must be at least 1 mm/min!":"Z Feedrate de&gbreve;eri en az 1 mm/dk olmal&inodot;d&inodot;r!",
"Hold:0":"Hold complete. Ready to resume.",
"Hold:1":"Hold in-progress. Reset will throw an alarm.",
"Door:0":"Door closed. Ready to resume.",
"Door:1":"Machine stopped. Door still ajar. Can't resume until closed.",
"Door:2":"Door opened. Hold (or parking retract) in-progress. Reset will throw an alarm.",
"Door:3":"Door closed and resuming. Restoring from park, if applicable. Reset will throw an alarm.",
"ALARM:1":"Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:2":"Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.",
"ALARM:3":"Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.",
"ALARM:4":"Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5":"Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6":"Homing fail. The active homing cycle was reset.",
"ALARM:7":"Homing fail. Safety door was opened during homing cycle.",
"ALARM:8":"Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.",
"ALARM:9":"Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.",
"error:1":"G-code words consist of a letter and a value. Letter was not found.",
"error:2":"Missing the expected G-code word value or numeric value format is not valid.",
"error:3":"Grbl '$' system command was not recognized or supported.",
"error:4":"Negative value received for an expected positive value.",
"error:5":"Homing cycle failure. Homing is not enabled via settings.",
"error:6":"Minimum step pulse time must be greater than 3usec.",
"error:7":"An EEPROM read failed. Auto-restoring affected EEPROM to default values.",
"error:8":"Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
"error:9":"G-code commands are locked out during alarm or jog state.",
"error:10":"Soft limits cannot be enabled without homing also enabled.",
"error:11":"Max characters per line exceeded. Received command line was not executed.",
"error:12":"Grbl '$' setting value cause the step rate to exceed the maximum supported.",
"error:13":"Safety door detected as opened and door state initiated.",
"error:14":"Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15":"Jog target exceeds machine travel. Jog command has been ignored.",
"error:16":"Jog command has no '=' or contains prohibited g-code.",
"error:17":"Laser mode requires PWM output.",
"error:20":"Unsupported or invalid g-code command found in block.",
"error:21":"More than one g-code command from same modal group found in block.",
"error:22":"Feed rate has not yet been set or is undefined.",
"error:23":"G-code command in block requires an integer value.",
"error:24":"More than one g-code command that requires axis words found in block.",
"error:25":"Repeated g-code word found in block.",
"error:26":"No axis words found in block for g-code command or current modal state which requires them.",
"error:27":"Line number value is invalid.",
"error:28":"G-code command is missing a required value word.",
"error:29":"G59.x work coordinate systems are not supported.",
"error:30":"G53 only allowed with G0 and G1 motion modes.",
"error:31":"Axis words found in block when no command or current modal state uses them.",
"error:32":"G2 and G3 arcs require at least one in-plane axis word.",
"error:33":"Motion command target is invalid.",
"error:34":"Arc radius value is invalid.",
"error:35":"G2 and G3 arcs require at least one in-plane offset word.",
"error:36":"Unused value words found in block.",
"error:37":"G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38":"Tool number greater than max supported value.",
"error:60":"SD failed to mount",
"error:61":"SD card failed to open file for reading",
"error:62":"SD card failed to open directory",
"error:63":"SD Card directory not found",
"error:64":"SD Card file empty",
"error:70":"Bluetooth failed to start",
"Max travel":"Max travel",
"Plate thickness":"Touch plate thickness",
"Show probe panel":"Show probe panel",
"Probe":"Probe",
"Start Probe":"Start Probe",
"Touch status":"Touch status",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"Value of maximum probe travel must be between 1 mm and 9999 mm !",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"Value of probe touch plate thickness must be between 0 mm and 9999 mm !",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !",
"Probe failed !":"Probe failed !",
"Probe result saved.":"Probe result saved.",
"Browser:":"Browser:",
"Probing...":"Probing...",
"Step pulse, microseconds":"Step pulse, microseconds",
"Step idle delay, milliseconds":"Step idle delay, milliseconds",
"Step port invert, mask2":"Step port invert, mask",
"Direction port invert, mask":"Direction port invert, mask",
"Step enable invert, boolean":"Step enable invert, boolean",
"Limit pins invert, boolean":"Limit pins invert, boolean",
"Probe pin invert, boolean":"Probe pin invert, boolean",
"Status report, mask":"Status report, mask",
"Junction deviation, mm":"Junction deviation, mm",
"Arc tolerance, mm":"Arc tolerance, mm",
"Report inches, boolean":"Report inches, boolean",
"Soft limits, boolean":"Soft limits, boolean",
"Hard limits, boolean":"Hard limits, boolean",
"Homing cycle, boolean":"Homing cycle, boolean",
"Homing dir invert, mask":"Homing dir invert, mask",
"Homing feed, mm/min":"Homing feed, mm/min",
"Homing seek, mm/min":"Homing seek, mm/min",
"Homing debounce, milliseconds":"Homing debounce, milliseconds",
"Homing pull-off, mm":"Homing pull-off, mm",
"Max spindle speed, RPM":"Max spindle speed, RPM",
"Min spindle speed, RPM":"Min spindle speed, RPM",
"Laser mode, boolean":"Lazer modu, boolean",
"X steps/mm":"X steps/mm",
"Y steps/mm":"Y steps/mm",
"Z steps/mm":"Z steps/mm",
"X Max rate, mm/min":"X Max rate, mm/min",
"Y Max rate, mm/min":"Y Max rate, mm/min",
"Z Max rate, mm/min":"Z Max rate, mm/min",
"X Acceleration, mm/sec^2":"X ivmesi, mm/sec^2",
"Y Acceleration, mm/sec^2":"Y ivmesi, mm/sec^2",
"Z Acceleration, mm/sec^2":"Z ivmesi, mm/sec^2",
"X Max travel, mm":"X Max haraket, mm",
"Y Max travel, mm":"Y Max haraket, mm",
"Z Max travel, mm":"Z Max haraket, mm",
"File extensions (use ; to separate)":"Dosya uzant&inodot;lar&inodot; (kullan ; ay&inodot;rma)",
"Web Socket":"Web Socket"
};
//endRemoveIf(tr_lang_disabled)

//removeIf(uk_lang_disabled)
//Ukrainian
var ukrtrans = {
"uk": "Українська",
"ESP3D for": "ESP3D для",
"Value of auto-check must be between 0s and 99s !!": "Значення автоматичної перевірки має бути від 0 до 99 секунд !!",
"Value of extruder velocity must be between 1 mm/min and 9999 mm/min !": "Значення швидкості екструдера повинна бути від 1 мм/хв до 9999 мм/хв !",
"Value of filament length must be between 0.001 mm and 9999 mm !": "Значення довжини нитки має становити від 0,001 мм до 9999 мм !",
"cannot have '-', '#' char or be empty": "не може бути символом '-', '#' або бути порожньою",
"cannot have '-', 'e' char or be empty": "не може бути символом '-', 'e' або бути порожньою",
"Failed:": "Невдача:",
"File config / config.txt not found!": "Файл config / config.txt не знайдено!",
"File name cannot be empty!": "Назва файлу не може бути порожнім!",
"Value must be ": "Значення має бути ",
"Value must be between 0 degres and 999 degres !": "Значення має бути від 0 до 999 градусів !",
"Value must be between 0% and 100% !": "Значення має бути від 0% до 100% !",
"Value must be between 25% and 150% !": "Значення мусить бути між 25% і 150% !",
"Value must be between 50% and 300% !": "Значення мусить бути між 50% і 300% !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !": "Значення швидкості подачі осей XY має бути від 1 мм/хв до 9999 мм/хв !",
"Z feedrate value must be between 1 mm/min and 999 mm/min !": "Значення швидкості подачі осі Z повинно бути від 1 мм/хв до 999 мм/хв !",
" seconds": " с.",
"Abort": "Перервати",
"auto-check every:": "автоматична перевірка кожні:",
"auto-check position every:": "автоматична перевірка позиції кожні:",
"Autoscroll": "Автопрокрутка",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed": "Стіл",
"Chamber":"Chamber",
"Board": "Плата",
"Busy...": "Перевантажений...",
"Camera": "Камера",
"Cancel": "Скасувати",
"Cannot get EEPROM content!": "Не вдається отримати вміст EEPROM!",
"Clear": "Очистити",
"Close": "Закрити",
"Color": "Колір",
"Commands": "Команди",
"Communication locked by another process, retry later.": "З'єднання заблоковано іншим процесом, повторіть спробу пізніше.",
"Communication locked!": "З'єднання заблоковано!",
"Communications are currently locked, please wait and retry.": "З'єднання заблоковано, почекайте і повторіть спробу.",
"Confirm deletion of directory: ": "Підтвердити видалення каталогу: ",
"Confirm deletion of file: ": "Підтвердити видалення файлу: ",
"Connecting ESP3D...": "Підключення ESP3D...",
"Connection failed! is your FW correct?": "З'єднання не вдалося! версія прошивки правильна?",
"Controls": "Управління",
"Credits": "Подяки",
"Dashboard": "Панель управління",
"Data modified": "Дані змінено",
"Do you want to save?": "Зберегти?",
"Enable second extruder controls": "Увімкнути керування другим екструдером",
"Error": "Помилка",
"ESP3D Filesystem": "Файлова система ESP3D",
"ESP3D Settings": "Налаштування ESP3D",
"ESP3D Status": "Статус ESP3D",
"ESP3D Update": "Оновити ESP3D",
"Extrude": "Екструдувати",
"Extruder T0": "Екструдер T0",
"Extruder T1": "Екструдер T1",
"Extruders": "Екструдери",
"Fan (0-100%)": "Вентилятор (0-100%)",
"Feed (25-150%)": "Множник швидкості (25-150%)",
"Feedrate :": "Швидкість подачі :",
"Filename": "Назва файлу",
"Filename/URI": "Назва файлу/URI",
"Verbose mode": "Докладний режим",
"Firmware": "Прошивка",
"Flow (50-300%)": "Множник екструзії (50-300%)",
"Heater T0": "Нагрівач T0",
"Heater T1": "Нагрівач T1",
"Help": "Опис",
"Icon": "Символ",
"Interface": "Інтерфейс",
"Join": "Підключитися",
"Label": "Параметр",
"List of available Access Points": "Список доступних точок доступу",
"Macro Editor": "Редактор макросів",
"mm": "мм",
"mm/min": "мм/хв",
"Motors off": "Вимкнути двигуни",
"Name": "Назва",
"Name:": "Назва:",
"Network": "Мережа",
"No SD card detected": "SD-карта не виявлена",
"No": "Ні",
"Occupation:": "Захоплення:",
"Ok": "ОК",
"Options": "Опції",
"Out of range": "Поза діапазону",
"Please Confirm": "Підтвердіть",
"Please enter directory name": "Введіть назву каталогу ",
"Please wait...": "Зачекайте...",
"Printer configuration": "Конфігурація принтера",
"GRBL configuration": "Конфігурація GRBL",
"Printer": "Принтер",
"Progress": "Стан",
"Protected": "Захист",
"Refresh": "Оновити",
"Restart ESP3D": "Перезапустити ESP3D",
"Restarting ESP3D": "Перезапуск ESP3D",
"Restarting": "Перезапуск",
"Restarting, please wait....": "Перезапуск, будь ласка, почекайте....",
"Retry": "Повторити спробу",
"Reverse": "Втягнути",
"Save macro list failed!": "Не вдалося зберегти список макросів!",
"Save": "Зберегти",
"Saving": "Збереження",
"Scanning": "Сканування",
"SD Files": "Файли на SD-карті",
"sec": "с",
"Send Command...": "Відправити команду...",
"Send": "Відправити",
"Set failed": "Зміна не вдалося",
"Set": "Змінити",
"Signal": "Сигнал",
"Size": "Розмір",
"SSID": "SSID",
"Target": "Мета",
"Temperatures": "Температура",
"Total:": "Розмір:",
"Type": "Тип",
"Update Firmware ?": "Оновити прошивку ?",
"Update is ongoing, please wait and retry.": "Оновлення прошивки, будь ласка, зачекайте",
"Update": "Оновлення",
"Upload failed : ": "Завантаження не вдалася : ",
"Upload failed": "Завантаження не вдалася",
"Upload": "Завантажити",
"Uploading ": "Завантаження ",
"Upload done": "Завантаження завершено",
"Used:": "Використано:",
"Value | Target": "Значення | Мета",
"Value": "Значення",
"Wrong data": "Невірні дані",
"Yes": "Так",
"Light": "Світ",
"None": "Немає даних",
"Modem": "Модем",
"STA": "Клієнт (STA)",
"AP": "Точка доступу (AP)",
"Baud Rate": "Швидкість в бодах",
"Sleep Mode": "Сплячий режим",
"Web Port": "Веб-Порт",
"Data Port": "Порт даних",
"Hostname": "Ім'я хоста",
"Wifi mode": "Режим Wi-Fi",
"Station SSID": "STA - SSID",
"Station Password": "STA - Пароль",
"Station Network Mode": "STA - Режим Wi-Fi",
"Station IP Mode": "STA - Режим IP",
"DHCP": "DHCP",
"Static": "Статичний",
"Station Static IP": "STA - Статичний IP",
"Station Static Mask": "STA - Маска підмережі",
"Station Static Gateway": "STA - Статичний шлюз",
"AP SSID": "AP - SSID",
"AP Password": "AP - Пароль",
"AP Network Mode": "AP - Режим Wi-Fi",
"SSID Visible": "AP - Видимість SSID",
"AP Channel": "AP - Канал",
"Open": "Відкрита",
"Authentication": "AP - Аутентифікація",
"AP IP Mode": "AP - Режим IP",
"AP Static IP": "AP - Статичний IP",
"AP Static Mask": "AP - Маска підмережі",
"AP Static Gateway": "AP - Статичний шлюз",
"Time Zone": "Часовий пояс",
"Day Saving Time": "Літній час",
"Time Server 1": "NTP-сервер 1",
"Time Server 2": "NTP-сервер 2",
"Time Server 3": "NTP-сервер 3",
"Target FW": "Цільова версія прошивки",
"Direct SD access": "Прямий доступ до SD карті",
"Direct SD Boot Check": "Перевірка SD-карти при запуску",
"Primary SD": "Головна SD-карта",
"Secondary SD": "Додаткова SD-карта",
"Temperature Refresh Time": "Час оновлення температури",
"Position Refresh Time": "Час оновлення позиції",
"Status Refresh Time": "Час оновлення статусу",
"XY feedrate": "Швидкість подачі осей XY",
"Z feedrate": "Швидкість подачі осі Z",
"E feedrate": "Швидкість подачі осі екструдера",
"Camera address": "IP-камери ",
"Setup": "Конфігурація",
"Start setup": "Почати налаштування",
"This wizard will help you to configure the basic settings.": "Цей майстер допоможе вам налаштувати основні параметри.",
"Press start to proceed.": "Натисніть кнопку «Почати налаштування», щоб продовжити.",
"Save your printer's firmware base:": "Виберіть тип програмного забезпечення принтера:",
"This is mandatory to get ESP working properly.": "Це необхідно для правильної роботи ESP.",
"Save your printer's board current baud rate:": "Встановіть швидкість послідовного порту принтера:",
"Printer and ESP board must use same baud rate to communicate properly.": "Принтер та плата ESP повинні використовувати однакову швидкість передачі даних для правильної роботи.",
"Continue": "Продовжити",
"WiFi Configuration": "Налаштування WiFi",
"Define ESP role:": "Виберіть режим передачі даних:",
"AP define access point / STA allows to join existing network": "«Точка доступу» створить нову мережу Wi-Fi | «Клієнт» підключення до існуючої Wi-Fi мережі",
"What access point ESP need to be connected to:": "До якої точки доступу ESP необхідно підключитися:",
"You can use scan button, to list available access points.": "Ви можете просканувати доступні точки доступу натиснувши кнопку 🔍.",
"Password to join access point:": "Пароль для з'єднання з точкою доступу:",
"Define ESP name:": "Придумайте назву для ESP",
"What is ESP access point SSID:": "Назва точки доступу:",
"Password for access point:": "Пароль точки доступу:",
"Define security:": "Виберіть режим безпеки:",
"SD Card Configuration": "Налаштування SD-карти",
"Is ESP connected to SD card:": "ESP підключений до SD карті:",
"Check update using direct SD access:": "Перевіряти оновлення через прямий доступ до SD-карт:",
"SD card connected to ESP": "SD-карта підключена до ESP",
"SD card connected to printer": "SD-карта підключено до принтера",
"Setup is finished.": "Налаштування завершено.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.": "Після закриття, ви все одно зможете змінити чи скоригувати свої налаштування в головному інтерфейсі у будь-який час.",
"You may need to restart the board to apply the new settings and connect again.": "Вам необхідно перезапустити плату, щоб застосувати нові налаштування.",
"Identification requested": "Вам потрібно увійти в систему",
"admin": "admin",
"user": "user",
"guest": "guest",
"Identification invalid!": "Не вдалося увійти!",
"Passwords do not matches!": "Паролі не збігаються!",
"Password must be >1 and <16 without space!": "Пароль має бути від 1 до 16 символів без пробілів!",
"User:": "Користувач:",
"Password:": "Пароль:",
"Submit": "Відправити",
"Change Password": "Змінити пароль",
"Current Password:": "Поточний пароль:",
"New Password:": "Новий пароль:",
"Confirm New Password:": "Підтвердіть новий пароль:",
"Error : Incorrect User": "Помилка: Невірний Користувач",
"Error: Incorrect password": "Помилка: Невірний пароль",
"Error: Missing data": "Помилка: дані Відсутні",
"Error: Cannot apply changes": "Помилка: Не вдається застосувати зміни",
"Error: Too many connections": "Помилка: Занадто багато сполук",
"Authentication failed!": "Помилка аутентифікації!",
"Serial is busy, retry later!": "Послідовний порт зайнятий, повторіть спробу пізніше!",
"Login": "Авторизуватися",
"Log out": "Вийти з системи",
"Password": "Пароль",
"No SD Card": "Немає SD-карти",
"Check for Update": "Перевірити оновлення",
"Please use 8.3 filename only.": "Будь ласка, використовуйте назва файлу тільки в стилі 8.3",
"Preferences": "Налаштування",
"Feature": "Опції",
"Show camera panel": "Показати розділ камери",
"Auto load camera": "Автоматично завантажувати зображення з камери",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls": "Увімкнути керування столом",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls": "Увімкнути керування вентилятором",
"Enable Z controls": "Увімкнути керування віссю Z",
"Panels": "Панелі",
"Show control panel": "Показати панель управління",
"Show temperatures panel": "Показати панель температур",
"Show extruder panel": "Показати панель екструдера",
"Show files panel": "Показати панель файлів",
"Show GRBL panel": "Показати панель GRBL",
"Show commands panel": "Показати панель команд",
"Select files": "Вибір файлів",
"Select file": "Вибрати файл",
"$n files": "$n файлів",
"No file chosen": "Файл не вибрано",
"Length": "Довжина",
"Output msg": "Показати иинформацию",
"Enable": "Включити",
"Disable": "Вимкнути",
"Serial": "Послідовний порт",
"Chip ID": "ID процесора",
"CPU Frequency": "Частота процесора",
"CPU Temperature": "Температура процесора",
"Free memory": "Доступно пам'яті",
"Flash Size": "Розмір флеш пам'яті",
"Available Size for update": "Доступний розмір для оновлення",
"Available Size for SPIFFS": "Доступний розмір для системних файлів",
"Baud rate": "Швидкість в бодах",
"Sleep mode": "Режим сну",
"Channel": "Канал",
"Phy Mode": "Режим роботи мережі",
"Web port": "Веб-порт",
"Data port": "Порт даних",
"Active Mode": "Використовуваний режим",
"Connected to": "Підключений до",
"IP Mode": "Режим IP",
"Gateway": "Шлюз",
"Mask": "Маска",
"DNS": "DNS",
"Disabled Mode": "Невикористаний режим",
"Captive portal": "Captive portal",
"Enabled": "Включено",
"Web Update": "Веб-Оновлення",
"Pin Recovery": "Відновлення кнопкою",
"Disabled": "Вимкнено",
"Target Firmware": "Тип ПО принтера",
"SD Card Support": "Підтримка SD-карти",
"Time Support": "Підтримка режиму годин",
"M117 output": "Відправка M117",
"Oled output": "Висновок на OLED екран",
"Serial output": "Висновок в послідовний порт",
"Web socket output": "Висновок у Web-socket",
"TCP output": "Висновок в TCP",
"FW version": "Версія прошивки",
"Show DHT output": "Відображення температури і вологості з датчика DHT",
"DHT Type": "Тип DHT",
"DHT check (seconds)": "Оновлення даних з DHT (с)",
"SD speed divider": "Дільник швидкості SD-карти",
"Number of extruders": "Кількість екструдерів",
"Mixed extruders": "Екструдер змішування",
"Extruder": "Екструдер",
"Enable lock interface": "Відображення перемикача блокування інтерфейсу",
"Lock interface": "Заблокувати інтерфейс",
"Unlock interface": "Розблокувати інтерфейс",
"You are disconnected": "Ви відключені",
"Looks like you are connected from another place, so this page is now disconnected": "Схоже, що ви підключені з іншого місця, тому ця сторінка тепер вимкнено",
"Please reconnect me": "Перепідключитися",
"Mist": "Mist",
"Flood": "Flood",
"Spindle": "Spindle",
"Connection monitoring": "Моніторинг з'єднання",
"XY Feedrate value must be at least 1 mm/min!": "Значення подачі осей XY має бути не менше 1 мм/хв!",
"Z Feedrate value must be at least 1 mm/min!": "Значення подачі осі Z має бути не менше 1 мм/хв!",
"Hold:0": "Зупинений. Готовий до продовження друку.",
"Hold:1": "Проводиться зупинка. Скидання викличе тривогу.",
"Door:0": "Двері закриті. Готовий до продовження друку.",
"Door:1": "Машина зупинилася. Двері все ще відчинені. Відновлення неможливо до закриття дверей.",
"Door:2": "Двері відчинені. Зупинка (або парковка екструдера) в процесі. Скидання викличе тривогу.",
"Door:3": "Двері закриті. Відновлення з точки паркування, якщо можливо. Скидання викличе тривогу.",
"ALARM:1": "Спрацював апаратний обмежувач. Положення машини, ймовірно, втрачено з-за раптової зупинки. Повторна установка нульової точки настійно рекомендується.",
"ALARM:2": "Спрацював програмний обмежувач. Цільова точка знаходиться за межами області переміщення. Положення машини збережено. Сигнал може бути безпечно скинутий.",
"ALARM:3": "Скидання під час руху. Положення машини, ймовірно, втрачено з-за раптової зупинки. Повторна установка нульової точки настійно рекомендується.",
"ALARM:4": "Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.",
"ALARM:5": "Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.",
"ALARM:6": "Помилка встановлення нульової точки. Операція була скинута.",
"ALARM:7": "Помилка встановлення нульової точки. Відбулося відкриття дверей під час виробленої операції.",
"ALARM:8": "Помилка встановлення нульової точки. Недостатньо зусиль для досягнення кінцевого вимикача. Відрегулюйте струм двигунів або перевірте правильність підключення.",
"ALARM:9": "Помилка встановлення нульової точки. Кінцевий вимикач знаходиться поза зазначеної дистанції. Спробуйте збільшити відстані пошуку кінцевого вимикача, відрегулювати струм двигунів або перевірте правильність підключення.",
"error:1": "Команда g-code складається з літери та значення. Буква не знайдено.",
"error:2": "Відсутній очікуване значення слова G-коду або формат числового значення неприпустимий.",
"error:3": "Системна команда Grbl ' $ ' не була розпізнана або не підтримується.",
"error:4": "Negative value received for an expected positive value.",
"error:5": "Помилка встановлення нульової точки. Установка нульової точки відключена в налаштуваннях.",
"error:6": "Minimum step pulse time must be greater than 3usec.",
"error:7": "Не вдалося прочитати EEPROM. Автоматичне відновлення значень EEPROM за замовчуванням.",
"error:8": "Команда Grbl '$' не може використовуватися, якщо Grbl не простоює. Забезпечує плавну роботу під час роботи.",
"error:9": "Команди G-коду блокуються під час тривоги або стану jog.",
"error:10": "Програмні обмежувачі не можна увімкнути без включення функції встановлення нульової точки.",
"error:11": "Перевищено максимальну кількість символів у рядку. Отримана командний рядок не була виконана.",
"error:12": "Значення параметра Grbl '$' призводить до перевищення максимальної підтримуваної швидкості кроку.",
"error:13": "Safety door detected as door opened and state ініціював.",
"error:14": "Build info or startup line exceeded EEPROM line length limit. Line not stored.",
"error:15": "Jog target exceeds machine travel. Jog command has been ignored.",
"error:16": "Jog command has no '=' or contains prohibited g-code.",
"error:17": "Режим лазера вимагає вихід з режимом PWM.",
"error:20": "Виявлена непідтримувана або неприпустима команда g-коду.",
"error:21": "More than one g-code from command same modal group found in block.",
"error:22": "Швидкість подачі ще не встановлено або не визначена.",
"error:23": "Команда G-code у блоці вимагає цілочисельного значення.",
"error:24": "More than one g-code command that requires axis words found in block.",
"error:25": "Repeated g-code word found in block.",
"error:26": "No axis words found in block for g-code command or current modal state which requires them.",
"error:27": "Line number value is invalid.",
"error:28": "G-code command is missing a required value word.",
"error:29": "G59.x work coordinate systems are not supported.",
"error:30": "G53 допускається тільки в режимах руху G0 і G1.",
"error:31": "Axis words found in block when no command or current modal state uses them.",
"error:32": "G2 and G3 arcs require at least one in-plane axis word.",
"error:33": "Motion command target is invalid.",
"error:34": "Arc radius value is invalid.",
"error:35": "G2 and G3 arcs require at least one in-plane offset word.",
"error:36": "Unused value words found in block.",
"error:37": "G43.1 dynamic tool length offset is not assigned to configured tool length axis.",
"error:38": "Номер інструменту більше, ніж максимальна роздільна значення.",
"error:60": "Монтування SD-карти не вдалося",
"error:61": "Відкрити файл для читання з SD-карти не вдалося",
"error:62": "Не вдалося відкрити каталог з SD-карти",
"error:63": "Каталог не знайдено на SD-карті",
"error:64": "Файл відсутній на SD-карті",
"error:70": "Запуск Bluetooth неможливий"
};
//endRemoveIf(uk_lang_disabled)

//zh_CN
//removeIf(zh_cn_lang_disabled)
//use https://www.mobilefish.com/services/unicode_converter/unicode_converter.php
var zh_CN_trans = {
"zh_cn":"&#31616;&#20307;&#20013;&#25991;",
"ESP3D for":"ESP3D for",
"Value of auto-check must be between 0s and 99s !!":"&#33258;&#21160;&#26816;&#26597;&#30340;&#20540;&#24517;&#39035;&#22312;0s&#21040;99s&#20043;&#38388;!!",
"Value of extruder velocity must be between 1 &#27627;&#31859;/&#20998;&#38047; and 9999 &#27627;&#31859;/&#20998;&#38047; !":"&#25380;&#20986;&#26426;&#36895;&#24230;&#20540;&#24517;&#39035;&#22312;1 &#27627;&#31859;/&#20998;&#38047;&#33267;9999 &#27627;&#31859;/&#20998;&#38047;&#20043;&#38388;&#65281;",
"Value of filament length must be between 0.001 mm and 9999 mm !":"&#28783;&#19997;&#38271;&#24230;&#30340;&#20540;&#24517;&#39035;&#22312;0.001 &#27627;&#31859;&#21644;9999 &#27627;&#31859;&#20043;&#38388;&#65281;",
"cannot have '-', '#' char or be empty":"&#19981;&#33021;&#21547;&#26377; '-', '#' &#25110; &#31354;&#23383;&#31526;",
"cannot have '-', 'e' char or be empty":"&#19981;&#33021;&#21547;&#26377; '-', 'e' &#25110; &#31354;&#23383;&#31526;",
"Failed:":"&#22833;&#36133;:",
"File config / config.txt not found!":"&#25214;&#19981;&#21040;&#25991;&#20214; config / config.txt!",
"File name cannot be empty!":"&#25991;&#20214;&#21517;&#19981;&#33021;&#20026;&#31354;!",
"Value must be ":"&#20540;&#24517;&#39035;&#20026; ",
"Value must be between 0 degres and 999 degres !":"&#20540;&#24517;&#39035;&#22312; 0 &#21040; 999 &#20043;&#38388; !",
"Value must be between 0% and 100% !":"&#20540;&#24517;&#39035;&#22312; 0% &#21040; 100% &#20043;&#38388; !",
"Value must be between 25% and 150% !":"&#20540;&#24517;&#39035;&#22312; 25% &#21040; 150% &#20043;&#38388; !",
"Value must be between 50% and 300% !":"&#20540;&#24517;&#39035;&#22312; 50% &#21040; 300% &#20043;&#38388; !",
"XY feedrate value must be between 1 mm/min and 9999 mm/min !":"XY&#36827;&#32473;&#29575;&#20540;&#24517;&#39035;&#22312; 1 &#27627;&#31859;/&#20998;&#38047; and 9999 &#27627;&#31859;/&#20998;&#38047; &#20043;&#38388;!",
"Z feedrate value must be between 1 mm/min and 999 mm/min !":"Z&#36827;&#32473;&#29575;&#20540;&#24517;&#39035;&#22312; 1 &#27627;&#31859;/&#20998;&#38047; and 999 &#27627;&#31859;/&#20998;&#38047; &#20043;&#38388;!",
" seconds":" &#31186;",
"Abort":"&#32456;&#27490;",
"auto-check every:":"&#33258;&#21160;&#26816;&#26597;&#27599;&#38548;:",
"auto-check position every:":"&#33258;&#21160;&#26816;&#26597;&#20301;&#32622;&#27599;&#38548;:",
"Autoscroll":"&#33258;&#21160;&#28378;&#21160;",
"Max travel":"&#26368;&#22823;&#34892;&#31243;",
"Feed rate":"&#36827;&#32473;&#29575;",
"Touch plate thickness":"Touch plate thickness",
"Redundant":"Redundant",
"Probe":"Probe",
"Bed":"&#28909;&#24202;",
"Chamber":"Chamber",
"Board":"&#20027;&#26495;",
"Busy...":"&#24537;...",
"Camera":"&#25668;&#20687;&#26426;",
"Cancel":"&#21462;&#28040;",
"Cannot get EEPROM content!":"&#26080;&#27861;&#33719;&#21462;EEPROM&#20869;&#23481;!",
"Clear":"&#28165;&#38500;",
"Close":"&#20851;&#38381;",
"Color":"&#39068;&#33394;",
"Commands":"&#21629;&#20196;",
"Communication locked by another process, retry later.":"&#36890;&#20449;&#34987;&#21478;&#19968;&#20010;&#36827;&#31243;&#38145;&#23450;&#65292;&#35831;&#31245;&#21518;&#37325;&#35797;.",
"Communication locked!":"&#36890;&#35759;&#24050;&#38145;&#23450;!",
"Communications are currently locked, please wait and retry.":"&#36890;&#20449;&#24403;&#21069;&#22788;&#20110;&#38145;&#23450;&#29366;&#24577;&#65292;&#35831;&#31245;&#21518;&#37325;&#35797;.",
"Confirm deletion of directory: ":"&#30830;&#35748;&#21024;&#38500;&#30446;&#24405;: ",
"Confirm deletion of file: ":"&#30830;&#35748;&#21024;&#38500;&#25991;&#20214;: ",
"Connecting ESP3D...":"&#27491;&#22312;&#36830;&#25509; ESP3D...",
"Connection failed! is your FW correct?":"&#36830;&#25509;&#22833;&#36133;!&#24744;&#30340;&#22266;&#20214;&#27491;&#30830;&#21527;?",
"Controls":"&#25511;&#21046;",
"Credits":"Credits",
"Dashboard":"&#20202;&#34920;&#30424;",
"Data modified":"&#25968;&#25454;&#24050;&#20462;&#25913;",
"Do you want to save?":"&#24744;&#35201;&#20445;&#23384;&#21527;?",
"Enable second extruder controls":"&#21551;&#29992;&#31532;&#20108;&#25380;&#20986;&#26426;",
"Error":"&#38169;&#35823;",
"ESP3D Filesystem":"ESP3D &#25991;&#20214;&#31995;&#32479;",
"ESP3D Settings":"ESP3D &#35774;&#32622;",
"ESP3D Status":"ESP3D &#29366;&#24577;",
"ESP3D Update":"ESP3D &#26356;&#26032;",
"Extrude":"&#36827;&#26009;",
"Extruder T0":"&#25380;&#20986;&#26426; T0",
"Extruder T1":"&#25380;&#20986;&#26426; T1",
"Extruders":"&#25380;&#20986;&#26426;",
"Fan (0-100%)":"&#39118;&#25159;&#36895;&#24230; (0-100%)",
"Feed (25-150%)":"&#36865;&#26009; (25-150%)",
"Feedrate :":"&#36865;&#26009;&#36895;&#24230; :",
"Filename":"&#25991;&#20214;&#21517;",
"Filename/URI":"Filename/URI",
"Verbose mode":"&#35814;&#32454;&#27169;&#24335;",
"Firmware":"&#22266;&#20214;",
"Flow (50-300%)":"&#27969;&#37327; (50-300%)",
"Heater T0":"&#21152;&#28909;&#22836; T0",
"Heater T1":"&#21152;&#28909;&#22836; T1",
"Help":"&#24110;&#21161;",
"Icon":"&#22270;&#26631;",
"Interface":"&#25509;&#21475;",
"Join":"&#21152;&#20837;",
"Label":"&#26631;&#31614;",
"List of available Access Points":"&#21487;&#29992;AP&#21015;&#34920;",
"Macro Editor":"&#23439;&#21629;&#20196;&#32534;&#36753;&#22120;",
"mm":"&#27627;&#31859;",
"mm/min":"&#27627;&#31859;/&#20998;&#38047;",
"Motors off":"&#20851;&#38381;&#30005;&#26426;",
"Name":"&#21517;&#31216;",
"Name:":"&#21517;&#31216;:",
"Network":"&#32593;&#32476;",
"No SD card detected":"&#26410;&#26816;&#27979;&#21040;SD&#21345;",
"No":"No",
"Occupation:":"Occupation:",
"Ok":"Ok",
"Options":"&#36873;&#39033;",
"Out of range":"&#36229;&#20986;&#33539;&#22260;",
"Please Confirm":"&#35831;&#30830;&#35748;",
"Please enter directory name":"&#35831;&#36755;&#20837;&#30446;&#24405;&#21517;&#31216;",
"Please wait...":"&#35831;&#31245;&#20505;...",
"Printer configuration":"&#25171;&#21360;&#26426;&#37197;&#32622;",
"GRBL configuration":"GRBL &#37197;&#32622;",
"Printer":"&#25171;&#21360;&#26426;",
"Progress":"&#36827;&#24230;",
"Protected":"&#21463;&#20445;&#25252;",
"Refresh":"&#21047;&#26032;",
"Restart ESP3D":"&#37325;&#21551; ESP3D",
"Restarting ESP3D":"&#27491;&#22312;&#37325;&#21551; ESP3D",
"Restarting":"&#27491;&#22312;&#37325;&#21551;",
"Restarting, please wait....":"&#27491;&#22312;&#37325;&#26032;&#21551;&#21160;&#65292;&#35831;&#31245;&#20505;....",
"Retry":"&#37325;&#35797;",
"Reverse":"&#22238;&#25277;",
"Save macro list failed!":"&#20445;&#23384;&#23439;&#21015;&#34920;&#22833;&#36133;!",
"Save":"&#20445;&#23384;",
"Saving":"&#27491;&#22312;&#20445;&#23384;",
"Scanning":"&#27491;&#22312;&#25195;&#25551;",
"SD Files":"SD&#25991;&#20214;",
"sec":"&#31186;",
"Send Command...":"&#21457;&#36865;&#21629;&#20196;...",
"Send":"&#21457;&#36865;",
"Set failed":"&#35774;&#32622;&#22833;&#36133;",
"Set":"&#35774;&#32622;",
"Signal":"&#20449;&#21495;",
"Size":"&#23610;&#23544;",
"SSID":"SSID",
"Target":"&#30446;&#26631;",
"Temperatures":"&#28201;&#24230;",
"Total:":"&#24635;&#35745;:",
"Type":"&#31867;&#22411;",
"Update Firmware ?":"&#26356;&#26032;&#22266;&#20214;&#21527; ?",
"Update is ongoing, please wait and retry.":"&#26356;&#26032;&#27491;&#22312;&#36827;&#34892;&#65292;&#35831;&#31245;&#21518;&#37325;&#35797;.",
"Update":"&#26356;&#26032;",
"Upload failed : ":"&#19978;&#20256;&#22833;&#36133; : ",
"Upload failed":"&#19978;&#20256;&#22833;&#36133;",
"Upload":"&#19978;&#20256;",
"Uploading ":"&#27491;&#22312;&#19978;&#20256; ",
"Upload done":"&#19978;&#20256;&#23436;&#25104;",
"Used:":"&#20351;&#29992;:",
"Value | Target":"&#24403;&#21069;&#20540; | &#39044;&#35774;&#20540;",
"Value":"&#20540;",
"Wrong data":"&#38169;&#35823;&#30340;&#25968;&#25454;",
"Yes":"Yes",
"Light":"&#28783;",
"None":"&#26080;",
"Modem":"&#35843;&#21046;&#35299;&#35843;&#22120;",
"STA":"&#23458;&#25143;&#31471;&#27169;&#24335;",
"AP":"AP&#27169;&#24335;",
"BT":"&#34013;&#29273;",
"Baud Rate":"&#27874;&#29305;&#29575;",
"Sleep Mode":"&#30561;&#30496;&#27169;&#24335;",
"Web Port":"Web&#31471;&#21475;",
"Data Port":"&#25968;&#25454;&#31471;&#21475;",
"Hostname":"&#20027;&#26426;&#21517;",
"Wifi mode":"Wifi&#27169;&#24335;",
"Station SSID":"&#32593;&#32476;&#21517;&#31216;",
"Station Password":"&#23494;&#30721;",
"Station Network Mode":"&#23458;&#25143;&#31471;&#32593;&#32476;&#27169;&#24335;",
"Station IP Mode":"&#23458;&#25143;&#31471;IP&#27169;&#24335;",
"DHCP":"DHCP",
"Static":"&#38745;&#24577;",
"Station Static IP":"&#23458;&#25143;&#31471;&#38745;&#24577;IP",
"Station Static Mask":"Station Static Mask",
"Station Static Gateway":"Station Static Gateway",
"AP SSID":"AP SSID",
"AP Password":"AP&#23494;&#30721;",
"AP Network Mode":"AP Network Mode",
"SSID Visible":"SSID&#21487;&#35265;",
"AP Channel":"AP&#39057;&#36947;",
"Open":"Open",
"Authentication":"&#36523;&#20221;&#39564;&#35777;",
"AP IP Mode":"AP IP Mode",
"AP Static IP":"AP Static IP",
"AP Static Mask":"AP Static Mask",
"AP Static Gateway":"AP Static Gateway",
"Time Zone":"Time Zone",
"Day Saving Time":"Day Saving Time",
"Time Server 1":"Time Server 1",
"Time Server 2":"Time Server 2",
"Time Server 3":"Time Server 3",
"Target FW":"Target FW",
"Direct SD access":"&#30452;&#25509;SD&#35775;&#38382;",
"Direct SD Boot Check":"&#30452;&#25509;SD&#24341;&#23548;&#26816;&#26597;",
"Primary SD":"Primary SD",
"Secondary SD":"Secondary SD",
"Temperature Refresh Time":"&#28201;&#24230;&#21047;&#26032;&#26102;&#38388;",
"Position Refresh Time":"&#20301;&#32622;&#21047;&#26032;&#26102;&#38388;",
"Status Refresh Time":"&#29366;&#24577;&#21047;&#26032;&#26102;&#38388;",
"XY feedrate":"XY&#36827;&#32473;&#29575;",
"Z feedrate":"Z&#36827;&#32473;&#29575;",
"E feedrate":"E&#36827;&#32473;&#29575;",
"Camera address":"&#25668;&#20687;&#26426;&#22320;&#22336;",
"Setup":"&#35774;&#32622;",
"Start setup":"&#24320;&#22987;&#35774;&#32622;",
"This wizard will help you to configure the basic settings.":"&#27492;&#21521;&#23548;&#23558;&#24110;&#21161;&#24744;&#37197;&#32622;&#22522;&#26412;&#35774;&#32622;.",
"Press start to proceed.":"&#25353;&#24320;&#22987;&#36827;&#34892;.",
"Save your printer's firmware base:":"&#20445;&#23384;&#25171;&#21360;&#26426;&#30340;&#22266;&#20214;&#24211;:",
"This is mandatory to get ESP working properly.":"&#36825;&#26159;&#27491;&#24120;&#36816;&#34892;ESP&#25152;&#24517;&#38656;&#30340;.",
"Save your printer's board current baud rate:":"&#20445;&#23384;&#25171;&#21360;&#26426;&#20027;&#26495;&#30340;&#24403;&#21069;&#27874;&#29305;&#29575;:",
"Printer and ESP board must use same baud rate to communicate properly.":"&#25171;&#21360;&#26426;&#21644;ESP&#26495;&#24517;&#39035;&#20351;&#29992;&#30456;&#21516;&#30340;&#27874;&#29305;&#29575;&#25165;&#33021;&#27491;&#30830;&#36890;&#20449;.",
"Continue":"&#32487;&#32493;",
"WiFi Configuration":"WiFi&#37197;&#32622;",
"Define ESP role:":"Define ESP role:",
"AP define access point / STA allows to join existing network":"AP&#27169;&#24335;&#33258;&#23450;&#20041;&#25509;&#20837;&#28857; / STA&#27169;&#24335;&#21152;&#20837;&#29616;&#26377;&#32593;&#32476;",
"What access point ESP need to be connected to:":"What access point ESP need to be connected to:",
"You can use scan button, to list available access points.":"&#24744;&#21487;&#20197;&#20351;&#29992;&#25195;&#25551;&#25353;&#38062;&#21015;&#20986;&#21487;&#29992;&#30340;&#32593;&#32476;.",
"Password to join access point:":"Password to join access point:",
"Define ESP name:":"Define ESP name:",
"What is ESP access point SSID:":"What is ESP access point SSID:",
"Password for access point:":"AP&#35775;&#38382;&#23494;&#30721;:",
"Define security:":"&#23450;&#20041;&#23433;&#20840;&#24615;:",
"SD Card Configuration":"SD&#21345;&#37197;&#32622;",
"Is ESP connected to SD card:":"ESP&#26159;&#21542;&#36830;&#25509;&#21040;SD&#21345;:",
"Check update using direct SD access:":"&#20351;&#29992;&#30452;&#25509;SD&#35775;&#38382;&#26816;&#26597;&#26356;&#26032;:",
"SD card connected to ESP":"SD&#21345;&#36830;&#25509;&#21040;ESP",
"SD card connected to printer":"SD&#21345;&#36830;&#25509;&#21040;&#25171;&#21360;&#26426;",
"Setup is finished.":"&#35774;&#32622;&#23436;&#25104;.",
"After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"&#20851;&#38381;&#21518;&#65292;&#24744;&#20173;&#28982;&#21487;&#20197;&#38543;&#26102;&#22312;&#20027;&#30028;&#38754;&#20013;&#26356;&#25913;&#25110;&#24494;&#35843;&#35774;&#32622;.",
"You may need to restart the board to apply the new settings and connect again.":"&#24744;&#21487;&#33021;&#38656;&#35201;&#37325;&#26032;&#21551;&#21160;&#20027;&#26495;&#26469;&#24212;&#29992;&#26032;&#30340;&#35774;&#32622;&#24182;&#37325;&#26032;&#36830;&#25509;.",
"Identification requested":"Identification requested",
"admin":"admin",
"user":"user",
"guest":"guest",
"Identification invalid!":"Identification invalid!",
"Passwords do not matches!":"&#23494;&#30721;&#19981;&#21305;&#37197;!",
"Password must be >1 and <16 without space!":"&#23494;&#30721;&#39035;&#20026;2-15&#20301;&#19988;&#27809;&#26377;&#31354;&#26684;!",
"User:":"User:",
"Password:":"Password:",
"Submit":"&#25552;&#20132;",
"Change Password":"&#26356;&#25913;&#23494;&#30721;",
"Current Password:":"&#24403;&#21069;&#23494;&#30721;:",
"New Password:":"&#26032;&#23494;&#30721;:",
"Confirm New Password:":"&#30830;&#35748;&#26032;&#23494;&#30721;:",
"Error : Incorrect User":"&#38169;&#35823;: &#19981;&#27491;&#30830;&#30340;&#29992;&#25143;&#21517;",
"Error: Incorrect password":"&#38169;&#35823;: &#19981;&#27491;&#30830;&#30340;&#23494;&#30721;",
"Error: Missing data":"&#38169;&#35823;: &#32570;&#23569;&#25968;&#25454;",
"Error: Cannot apply changes":"&#38169;&#35823;: &#26080;&#27861;&#24212;&#29992;&#26356;&#25913;",
"Error: Too many connections":"&#38169;&#35823;: &#36830;&#25509;&#36807;&#22810;",
"Authentication failed!":"&#39564;&#35777;&#22833;&#36133;!",
"Serial is busy, retry later!":"&#20018;&#34892;&#21475;&#24537;&#65292;&#35831;&#31245;&#21518;&#37325;&#35797;!",
"Login":"&#30331;&#24405;",
"Log out":"&#27880;&#38144;",
"Password":"&#23494;&#30721;",
"No SD Card":"&#27809;&#26377;SD&#21345;",
"Check for Update":"&#26816;&#26597;&#26356;&#26032;",
"Please use 8.3 filename only.":"&#21482;&#33021;&#20351;&#29992;8.3&#25991;&#20214;&#21517;.",
"Preferences":"&#20559;&#22909;",
"Feature":"&#21151;&#33021;",
"Show camera panel":"&#26174;&#31034;&#25668;&#20687;&#26426;&#38754;&#26495;",
"Auto load camera":"&#33258;&#21160;&#21152;&#36733;&#25668;&#20687;&#26426;",
"Enable heater T0 redundant temperatures":"Enable heater T0 redundant temperatures",
"Enable probe temperatures":"Enable probe temperatures",
"Enable bed controls":"&#21551;&#29992;&#28909;&#24202;&#25511;&#20214;",
"Enable chamber controls":"Enable chamber controls",
"Enable fan controls":"&#21551;&#29992;&#39118;&#25159;&#25511;&#20214;",
"Enable Z controls":"&#21551;&#29992;Z&#36724;&#25511;&#20214;",
"Panels":"&#38754;&#26495;",
"Show control panel":"&#26174;&#31034;&#25511;&#21046;&#38754;&#26495;",
"Show temperatures panel":"&#26174;&#31034;&#28201;&#24230;&#38754;&#26495;",
"Show extruder panel":"&#26174;&#31034;&#25380;&#20986;&#26426;&#38754;&#26495;",
"Show files panel":"&#26174;&#31034;&#25991;&#20214;&#38754;&#26495;",
"Show GRBL panel":"&#26174;&#31034;GRBL&#38754;&#26495;",
"Show commands panel":"&#26174;&#31034;&#21629;&#20196;&#38754;&#26495;",
"Select files":"&#36873;&#25321;&#25991;&#20214;",
"Select file":"&#36873;&#25321;&#25991;&#20214;",
"$n files":"$n &#25991;&#20214;",
"No file chosen":"&#26410;&#36873;&#25321;&#25991;&#20214;",
"Length":"Length",
"Output msg":"Output msg",
"Enable":"&#21551;&#29992;",
"Disable":"&#31105;&#29992;",
"Serial":"&#20018;&#34892;&#21475;",
"Chip ID":"&#33455;&#29255;ID",
"CPU Frequency":"CPU&#39057;&#29575;",
"CPU Temperature":"CPU&#28201;&#24230;",
"Free memory":"&#21487;&#29992;&#20869;&#23384;",
"Flash Size":"&#38378;&#23384;&#23481;&#37327;",
"Available Size for update":"&#21487;&#29992;&#30340;&#26356;&#26032;&#22823;&#23567;",
"Available Size for SPIFFS":"&#21487;&#29992;&#30340;SPIFFS&#22823;&#23567;",
"Baud rate":"&#27874;&#29305;&#29575;",
"Sleep mode":"&#30561;&#30496;&#27169;&#24335;",
"Channel":"&#39057;&#36947;",
"Phy Mode":"Phy Mode",
"Web port":"Web&#31471;&#21475;",
"Data port":"&#25968;&#25454;&#31471;&#21475;",
"Active Mode":"&#27963;&#21160;&#27169;&#24335;",
"Connected to":"&#24050;&#36830;&#25509;&#21040;",
"IP Mode":"IP&#27169;&#24335;",
"Gateway":"Gateway",
"Mask":"&#25513;&#30721;",
"DNS":"DNS",
"Disabled Mode":"&#31105;&#29992;&#27169;&#24335;",
"Captive portal":"Captive portal",
"Enabled":"&#21551;&#29992;",
"Web Update":"Web&#21319;&#32423;",
"Pin Recovery":"Pin Recovery",
"Disabled":"&#31105;&#29992;",
"Target Firmware":"&#30446;&#26631;&#22266;&#20214;",
"SD Card Support":"SD&#21345;&#25903;&#25345;",
"Time Support":"&#26102;&#38388;&#25903;&#25345;",
"M117 output":"M117&#36755;&#20986;",
"Oled output":"Oled&#36755;&#20986;",
"Serial output":"&#20018;&#34892;&#36755;&#20986;",
"Web socket output":"Web socket&#36755;&#20986;",
"TCP output":"TCP&#36755;&#20986;",
"FW version":"FW&#29256;&#26412;",
"Show DHT output":"Show DHT&#36755;&#20986;",
"DHT Type":"DHT&#31867;&#22411;",
"DHT check (seconds)":"DHT&#26816;&#26597;(&#31186;)",
"SD speed divider":"SD speed divider",
"Number of extruders":"&#25380;&#20986;&#26426;&#25968;&#37327;",
"Mixed extruders":"&#28151;&#21512;&#25380;&#20986;&#26426;",
"Extruder":"&#25380;&#20986;&#26426;",
"Enable lock interface":"&#21551;&#29992;&#38145;&#23450;&#30028;&#38754;",
"Lock interface":"&#38145;&#23450;&#30028;&#38754;",
"Unlock interface":"&#35299;&#38145;&#30028;&#38754;",
"You are disconnected":"&#24744;&#24050;&#26029;&#24320;&#36830;&#25509;",
"Looks like you are connected from another place, so this page is now disconnected":"&#24744;&#24050;&#20174;&#21478;&#19968;&#20010;&#20301;&#32622;&#36830;&#25509;&#65292;&#22240;&#27492;&#26412;&#39029;&#38754;&#29616;&#22312;&#24050;&#26029;&#24320;&#36830;&#25509;",
"Please reconnect me":"&#35831;&#37325;&#26032;&#36830;&#25509;",
"Mist":"&#20919;&#21364;&#21943;&#38654;",
"Flood":"&#20919;&#21364;&#28082;",
"Spindle":"&#20027;&#36724;",
"Connection monitoring":"&#36830;&#25509;&#30417;&#35270;",
"XY Feedrate value must be at least 1 mm/min!":"XY Feedrate value must be at least 1 &#27627;&#31859;/&#20998;&#38047;!",
"Z Feedrate value must be at least 1 mm/min!":"Z Feedrate value must be at least 1 &#27627;&#31859;/&#20998;&#38047;!",
"Hold:0":"&#24050;&#23436;&#25104;&#12290;&#20934;&#22791;&#24674;&#22797;&#12290;",
"Hold:1":"&#36827;&#34892;&#20013;&#12290;&#37325;&#32622;&#23558;&#21457;&#20986;&#35686;&#25253;&#12290;",
"Door:0":"&#38376;&#24050;&#20851;&#38381;&#12290;&#20934;&#22791;&#24674;&#22797;&#12290;",
"Door:1":"&#26426;&#22120;&#20572;&#27490;&#20102;&#12290;&#38376;&#20173;&#28982;&#24320;&#30528;&#12290;&#30452;&#21040;&#20851;&#38376;&#21518;&#25165;&#33021;&#24674;&#22797;&#12290;",
"Door:2":"&#38376;&#25171;&#24320;&#12290;&#20445;&#25345;&#65288;&#25110;&#20572;&#36710;&#32553;&#22238;&#65289;&#36827;&#34892;&#20013;&#12290;&#22797;&#20301;&#23558;&#21457;&#20986;&#35686;&#25253;&#12290;",
"Door:3":"&#38376;&#24050;&#20851;&#38381;&#24182;&#27491;&#22312;&#24674;&#22797;&#12290;&#20174;&#20572;&#36710;&#22788;&#24674;&#22797;&#65288;&#22914;&#26524;&#36866;&#29992;&#65289;&#12290;&#37325;&#32622;&#23558;&#24341;&#21457;&#35686;&#25253;&#12290;",
"ALARM:1":"&#24050;&#35302;&#21457;&#30828;&#26497;&#38480;&#12290;&#30001;&#20110;&#31361;&#28982;&#20572;&#27490;,&#26426;&#22120;&#20301;&#32622;&#21487;&#33021;&#20002;&#22833;&#12290;&#24378;&#28872;&#24314;&#35758;&#37325;&#26032;&#22238;&#21407;&#28857;&#12290;",
"ALARM:2":"&#36719;&#38480;&#20301;&#35686;&#25253;&#12290;G&#20195;&#30721;&#36816;&#21160;&#30446;&#26631;&#36229;&#20986;&#20102;&#26426;&#22120;&#34892;&#31243;&#12290;&#20445;&#30041;&#20102;&#26426;&#22120;&#20301;&#32622;&#12290;&#21487;&#20197;&#23433;&#20840;&#22320;&#35299;&#38500;&#35686;&#25253;,&#35831;&#21333;&#20987;&#22797;&#20301;&#25353;&#38062;&#12290;",
"ALARM:3":"&#36816;&#21160;&#26102;&#22797;&#20301;&#12290;&#30001;&#20110;&#31361;&#28982;&#20572;&#27490;,&#26426;&#22120;&#20301;&#32622;&#21487;&#33021;&#20250;&#20002;&#22833;&#12290;&#24378;&#28872;&#24314;&#35758;&#37325;&#26032;&#22238;&#21407;&#28857;&#12290;",
"ALARM:4":"&#25506;&#27979;&#22833;&#36133;&#12290;&#22312;&#24320;&#22987;&#25506;&#27979;&#24490;&#29615;&#20043;&#21069;,&#25506;&#27979;&#26410;&#22788;&#20110;&#39044;&#26399;&#30340;&#21021;&#22987;&#29366;&#24577;&#12290;",
"ALARM:5":"&#25506;&#27979;&#22833;&#36133;&#12290;&#22312;G38.2&#21644;G38.4&#30340;&#32534;&#31243;&#34892;&#31243;&#20869;,&#27979;&#22836;&#26410;&#19982;&#24037;&#20214;&#25509;&#35302;&#12290;",
"ALARM:6":"&#22238;&#21407;&#28857;&#22833;&#36133;&#12290;&#22797;&#20301;&#20102;&#26377;&#25928;&#30340;&#22238;&#21407;&#28857;&#21608;&#26399;&#12290;",
"ALARM:7":"&#22238;&#21407;&#28857;&#22833;&#36133;&#12290;&#22312;&#22238;&#21407;&#28857;&#21608;&#26399;&#20013;&#23433;&#20840;&#38376;&#25171;&#24320;&#12290;",
"ALARM:8":"&#22238;&#21407;&#28857;&#22833;&#36133;&#12290;&#25289;&#20986;&#34892;&#31243;&#26410;&#33021;&#28165;&#38500;&#38480;&#20301;&#24320;&#20851;&#12290;&#23581;&#35797;&#22686;&#21152;&#25289;&#20986;&#35774;&#32622;&#25110;&#26816;&#26597;&#25509;&#32447;&#12290;",
"ALARM:9":"&#22238;&#21407;&#28857;&#22833;&#36133;&#12290;&#26080;&#27861;&#22312;&#25628;&#32034;&#36317;&#31163;&#20869;&#25214;&#21040;&#38480;&#20301;&#24320;&#20851;&#12290;&#35831;&#23581;&#35797;&#22686;&#21152;&#26368;&#22823;&#34892;&#31243;,&#20943;&#23567;&#19979;&#25289;&#36317;&#31163;&#25110;&#26816;&#26597;&#25509;&#32447;&#12290;",
"error:1":"G&#30721;&#23383;&#30001;&#19968;&#20010;&#23383;&#27597;&#21644;&#19968;&#20010;&#20540;&#32452;&#25104;&#12290;&#25214;&#19981;&#21040;&#23383;&#27597;&#12290;",
"error:2":"&#32570;&#23569;&#39044;&#26399;&#30340;G&#20195;&#30721;&#23383;&#20540;&#25110;&#25968;&#20540;&#26684;&#24335;&#26080;&#25928;&#12290;",
"error:3":"&#26410;&#35782;&#21035;&#25110;&#19981;&#25903;&#25345;Grbl'$'&#31995;&#32479;&#21629;&#20196;&#12290;",
"error:4":"&#25509;&#25910;&#21040;&#30340;&#36127;&#20540;&#20026;&#26399;&#26395;&#30340;&#27491;&#20540;&#12290;",
"error:5":"&#22238;&#21407;&#28857;&#24490;&#29615;&#22833;&#36133;&#12290;&#26410;&#36890;&#36807;&#35774;&#32622;&#21551;&#29992;&#22238;&#21407;&#28857;&#12290;",
"error:6":"&#26368;&#23567;&#27493;&#36827;&#33033;&#20914;&#26102;&#38388;&#24517;&#39035;&#22823;&#20110;3usec&#12290;",
"error:7":"EEPROM&#35835;&#21462;&#22833;&#36133;&#12290;&#23558;&#21463;&#24433;&#21709;&#30340;EEPROM&#33258;&#21160;&#24674;&#22797;&#20026;&#40664;&#35748;&#20540;&#12290;",
"error:8":"&#38500;&#38750;Grbl&#20026;IDLE,&#21542;&#21017;&#26080;&#27861;&#20351;&#29992;Grbl'$'&#21629;&#20196;&#12290;&#30830;&#20445;&#20316;&#19994;&#26399;&#38388;&#30340;&#24179;&#31283;&#25805;&#20316;&#12290;",
"error:9":"&#22312;&#25253;&#35686;&#25110;&#24930;&#36827;&#29366;&#24577;&#26399;&#38388;,G&#20195;&#30721;&#21629;&#20196;&#34987;&#38145;&#23450;&#12290;",
"error:10":"&#22312;&#26410;&#21551;&#29992;&#22238;&#21407;&#28857;&#30340;&#24773;&#20917;&#19979;&#20063;&#26080;&#27861;&#21551;&#29992;&#36719;&#38480;&#21046;&#12290;",
"error:11":"&#27599;&#34892;&#36229;&#20986;&#26368;&#22823;&#23383;&#31526;&#12290;&#26410;&#25191;&#34892;&#25509;&#25910;&#21040;&#30340;&#21629;&#20196;&#34892;&#12290;",
"error:12":"Grbl'$'&#35774;&#32622;&#20540;&#23548;&#33268;&#27493;&#36895;&#36229;&#36807;&#25903;&#25345;&#30340;&#26368;&#22823;&#20540;&#12290;",
"error:13":"&#26816;&#27979;&#21040;&#23433;&#20840;&#38376;&#24050;&#25171;&#24320;&#24182;&#19988;&#38376;&#29366;&#24577;&#24050;&#21551;&#21160;&#12290;",
"error:14":"&#26500;&#24314;&#20449;&#24687;&#25110;&#21551;&#21160;&#34892;&#36229;&#20986;EEPROM&#34892;&#38271;&#24230;&#38480;&#21046;&#12290;&#34892;&#26410;&#23384;&#20648;&#12290;",
"error:15":"&#28857;&#21160;&#30446;&#26631;&#36229;&#20986;&#20102;&#26426;&#22120;&#34892;&#31243;&#12290;&#28857;&#21160;&#21629;&#20196;&#24050;&#34987;&#24573;&#30053;&#12290;",
"error:16":"&#28857;&#21160;&#21629;&#20196;&#27809;&#26377;'='&#25110;&#21253;&#21547;&#31105;&#27490;&#30340;g&#20195;&#30721;&#12290;",
"error:17":"&#28608;&#20809;&#27169;&#24335;&#38656;&#35201;PWM&#36755;&#20986;&#12290;",
"error:20":"&#22312;&#22359;&#20013;&#21457;&#29616;&#19981;&#25903;&#25345;&#25110;&#26080;&#25928;&#30340;g&#20195;&#30721;&#21629;&#20196;&#12290;",
"error:21":"&#22312;&#22359;&#20013;&#25214;&#21040;&#30340;&#21516;&#19968;&#27169;&#24577;&#32452;&#20013;&#26377;&#22810;&#20010;g&#20195;&#30721;&#21629;&#20196;&#12290;",
"error:22":"&#36827;&#32440;&#36895;&#24230;&#23578;&#26410;&#35774;&#32622;&#25110;&#26410;&#23450;&#20041;&#12290;",
"error:23":"&#22359;&#20013;&#30340;G&#20195;&#30721;&#21629;&#20196;&#38656;&#35201;&#19968;&#20010;&#25972;&#25968;&#20540;&#12290;",
"error:24":"&#26377;&#22810;&#20010;g&#20195;&#30721;&#21629;&#20196;,&#38656;&#35201;&#22312;&#22359;&#20013;&#25214;&#21040;&#36724;&#23383;&#12290;",
"error:25":"&#22312;&#22359;&#20013;&#25214;&#21040;&#37325;&#22797;&#30340;g&#30721;&#23383;&#12290;",
"error:26":"&#22312;g&#20195;&#30721;&#21629;&#20196;&#25110;&#38656;&#35201;&#23427;&#20204;&#30340;&#24403;&#21069;&#27169;&#24577;&#19979;,&#22312;&#31243;&#24207;&#27573;&#20013;&#25214;&#19981;&#21040;&#36724;&#23383;&#12290;",
"error:27":"&#34892;&#21495;&#20540;&#26080;&#25928;&#12290;",
"error:28":"G&#20195;&#30721;&#21629;&#20196;&#32570;&#23569;&#24517;&#38656;&#30340;&#20540;&#23383;&#12290;",
"error:29":"&#19981;&#25903;&#25345;G59.x&#24037;&#20316;&#22352;&#26631;&#31995;&#12290;",
"error:30":"G53&#20165;&#22312;G0&#21644;G1&#36816;&#21160;&#27169;&#24335;&#19979;&#20801;&#35768;&#12290;",
"error:31":"&#24403;&#27809;&#26377;&#21629;&#20196;&#25110;&#24403;&#21069;&#27169;&#24577;&#20351;&#29992;&#23427;&#20204;&#26102;,&#22312;&#22359;&#20013;&#25214;&#21040;&#36724;&#23383;&#12290;",
"error:32":"G2&#21644;G3&#22278;&#24359;&#33267;&#23569;&#38656;&#35201;&#19968;&#20010;&#24179;&#38754;&#20869;&#36724;&#23383;&#12290;",
"error:33":"&#36816;&#21160;&#21629;&#20196;&#30446;&#26631;&#26080;&#25928;&#12290;",
"error:34":"&#22278;&#24359;&#21322;&#24452;&#20540;&#26080;&#25928;&#12290;",
"error:35":"G2&#21644;G3&#22278;&#24359;&#33267;&#23569;&#38656;&#35201;&#19968;&#20010;&#24179;&#38754;&#20869;&#20559;&#31227;&#23383;&#12290;",
"error:36":"&#22312;&#22359;&#20013;&#25214;&#21040;&#26410;&#20351;&#29992;&#30340;&#20215;&#20540;&#35789;&#12290;",
"error:37":"G43.1&#21160;&#24577;&#20992;&#20855;&#38271;&#24230;&#34917;&#20607;&#26410;&#20998;&#37197;&#32473;&#24050;&#32452;&#24577;&#30340;&#20992;&#20855;&#38271;&#24230;&#36724;&#12290;",
"error:38":"&#20992;&#20855;&#32534;&#21495;&#22823;&#20110;&#26368;&#22823;&#25903;&#25345;&#20540;&#12290;",
"error:60":"SD&#26080;&#27861;&#25346;&#36733;",
"error:61":"SD&#21345;&#26080;&#27861;&#25171;&#24320;&#25991;&#20214;&#36827;&#34892;&#35835;&#21462;",
"error:62":"SD&#21345;&#26080;&#27861;&#25171;&#24320;&#30446;&#24405;",
"error:63":"&#25214;&#19981;&#21040;SD&#21345;&#30446;&#24405;",
"error:64":"SD&#21345;&#25991;&#20214;&#20026;&#31354;",
"error:70":"&#34013;&#29273;&#26080;&#27861;&#21551;&#21160;",
"Max travel":"&#26368;&#22823;&#34892;&#31243;",
"Plate thickness":"&#25506;&#38024;&#25968;&#25454;&#20462;&#27491;",
"Show probe panel":"&#26174;&#31034;&#25506;&#38024;&#38754;&#26495;",
"Probe":"&#25506;&#38024;",
"Start Probe":"&#21551;&#21160;&#25506;&#38024;",
"Touch status":"&#23545;&#20992;&#29366;&#24577;",
"Value of maximum probe travel must be between 1 mm and 9999 mm !":"&#26368;&#22823;&#25506;&#22836;&#34892;&#31243;&#20540;&#24517;&#39035;&#22312; 1 &#27627;&#31859; &#33267; 9999 &#27627;&#31859;&#20043;&#38388;!",
"Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"&#25506;&#38024;&#25968;&#25454;&#20462;&#27491;&#20540;&#24517;&#39035;&#22312; 0 &#27627;&#31859; &#33267; 9999 &#27627;&#31859;&#20043;&#38388;!",
"Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"&#25506;&#38024;&#36827;&#32473;&#29575;&#20540;&#24517;&#39035;&#22312; 1 &#27627;&#31859;/&#20998;&#38047; &#33267; 9999 &#27627;&#31859;/&#20998;&#38047;&#20043;&#38388;!",
"Probe failed !":"&#25506;&#27979;&#22833;&#36133; !",
"Probe result saved.":"&#25506;&#27979;&#32467;&#26524;&#24050;&#20445;&#23384;.",
"Browser:":"&#27983;&#35272;:",
"Probing...":"&#27491;&#22312;&#25506;&#27979;...",
"Step pulse, microseconds":"&#27493;&#36827;&#33033;&#20914;, &#24494;&#31186;",
"Step idle delay, milliseconds":"&#27493;&#36827;&#30005;&#26426;&#31354;&#38386;&#26102;&#37322;&#25918;&#21147;&#30697;&#26102;&#38388;,255&#26159;&#19968;&#30452;&#20445;&#25345;",
"Step port invert, mask":"&#27493;&#36827;&#33033;&#20914;&#32763;&#36716;&#25509;&#21475;, mask",
"Direction port invert, mask":"&#26041;&#21521;&#32763;&#36716;&#25509;&#21475;, mask",
"Step enable invert, boolean":"&#27493;&#36827;&#20351;&#33021;&#32763;&#36716;, boolean",
"Limit pins invert, boolean":"&#38480;&#20301;&#24341;&#33050;&#32763;&#36716;, boolean",
"Probe pin invert, boolean":"&#25506;&#27979;&#24341;&#33050;&#32763;&#36716;, boolean",
"Status report, mask":"&#29366;&#24577;&#25253;&#21578;, mask",
"Junction deviation, mm":"&#32467;&#20559;&#24046;, mm",
"Arc tolerance, mm":"&#22278;&#24359;&#20844;&#24046;, mm",
"Report inches, boolean":"&#25253;&#21578;&#33521;&#23544;, boolean",
"Soft limits, boolean":"&#26159;&#21542;&#21551;&#29992;&#36719;&#20214;&#26368;&#22823;&#34892;&#31243;&#38480;&#21046;, boolean",
"Hard limits, boolean":"&#26159;&#21542;&#21551;&#29992;&#30828;&#20214;&#38480;&#20301;, boolean",
"Homing cycle, boolean":"&#26159;&#21542;&#21551;&#29992;$H&#22238;&#38480;&#20301;&#25805;&#20316;, boolean",
"Homing dir invert, mask":"&#22797;&#20301;&#26041;&#21521;&#32763;&#36716;",
"Homing feed, mm/min":"&#22797;&#20301;&#23547;&#25214;&#36895;&#24230;, &#27627;&#31859;/&#20998;&#38047;",
"Homing seek, mm/min":"&#22797;&#20301;&#32473;&#36827;&#36895;&#24230;, &#27627;&#31859;/&#20998;&#38047;",
"Homing debounce, milliseconds":"&#20301;&#28040;&#25238;, &#27627;&#31186;",
"Homing pull-off, mm":"&#22797;&#20301;&#36820;&#22238;&#34892;&#31243;, &#27627;&#31859;",
"Max spindle speed, RPM":"&#26368;&#22823;&#20027;&#36724;&#36716;&#36895;, RPM",
"Min spindle speed, RPM":"&#26368;&#23567;&#20027;&#36724;&#36716;&#36895;, RPM",
"Laser mode, boolean":"&#28608;&#20809;&#27169;&#24335;, boolean",
"X steps/mm":"X&#36724;&#30005;&#26426; &#27493;&#25968;/&#27627;&#31859;,&#36208;1mm&#33033;&#20914;&#25968;",
"Y steps/mm":"Y&#36724;&#30005;&#26426; &#27493;&#25968;/&#27627;&#31859;,&#36208;1mm&#33033;&#20914;&#25968;",
"Z steps/mm":"Z&#36724;&#30005;&#26426; &#27493;&#25968;/&#27627;&#31859;,&#36208;1mm&#33033;&#20914;&#25968;",
"X Max rate, mm/min":"X&#36724;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#38047;",
"Y Max rate, mm/min":"Y&#36724;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#38047;",
"Z Max rate, mm/min":"Z&#36724;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#38047;",
"X Acceleration, mm/sec^2":"X&#36724;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
"Y Acceleration, mm/sec^2":"Y&#36724;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
"Z Acceleration, mm/sec^2":"Z&#36724;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
"X Max travel, mm":"X&#36724;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
"Y Max travel, mm":"Y&#36724;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
"Z Max travel, mm":"Z&#36724;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
"File extensions (use ; to separate)":"&#25991;&#20214;&#25193;&#23637;&#21517; (&#20351;&#29992; ; &#20998;&#38548;)"
};
//endRemoveIf(zh_cn_lang_disabled)

//zh_TW
//removeIf(zh_tw_lang_disabled)
//use https://www.mobilefish.com/services/unicode_converter/unicode_converter.php
var zh_TW_trans = {
    "zh_tw":"&#32321;&#39636;&#20013;&#25991;",
    "ESP3D for":"ESP3D for",
    "Value of auto-check must be between 0s and 99s !!":"&#33258;&#21205;&#27298;&#26597;&#30340;&#20540;&#24517;&#38920;&#22312;0s&#21040;99s&#20043;&#38291;!!",
    "Value of extruder velocity must be between 1 mm/min and 9999 mm/min !":"&#25824;&#20986;&#27231;&#36895;&#24230;&#20540;&#24517;&#38920;&#22312;1 &#27627;&#31859;/&#20998;&#37912;&#33267;9999 &#27627;&#31859;/&#20998;&#37912;&#20043;&#38291;&#65281;",
    "Value of filament length must be between 0.001 mm and 9999 mm !":"&#29128;&#32114;&#38263;&#24230;&#30340;&#20540;&#24517;&#38920;&#22312;0.001 &#27627;&#31859;&#21644;9999 &#27627;&#31859;&#20043;&#38291;&#65281;",
    "cannot have '-', '#' char or be empty":"&#19981;&#33021;&#21547;&#26377; '-', '#' &#25110; &#31354;&#23383;&#20803;",
    "cannot have '-', 'e' char or be empty":"&#19981;&#33021;&#21547;&#26377; '-', 'e' &#25110; &#31354;&#23383;&#20803;",
    "Failed:":"&#22833;&#25943;:",
    "File config / config.txt not found!":"&#25214;&#19981;&#21040;&#27284;&#26696; config / config.txt!",
    "File name cannot be empty!":"&#27284;&#21517;&#19981;&#33021;&#28858;&#31354;!",
    "Value must be ":"&#20540;&#24517;&#38920;&#28858; ",
    "Value must be between 0 degres and 999 degres !":"&#20540;&#24517;&#38920;&#22312; 0 &#21040; 999 &#20043;&#38291; !",
    "Value must be between 0% and 100% !":"&#20540;&#24517;&#38920;&#22312; 0% &#21040; 100% &#20043;&#38291; !",
    "Value must be between 25% and 150% !":"&#20540;&#24517;&#38920;&#22312; 25% &#21040; 150% &#20043;&#38291; !",
    "Value must be between 50% and 300% !":"&#20540;&#24517;&#38920;&#22312; 50% &#21040; 300% &#20043;&#38291; !",
    "XY feedrate value must be between 1 mm/min and 9999 mm/min !":"XY&#36914;&#32102;&#29575;&#20540;&#24517;&#38920;&#22312; 1 &#27627;&#31859;/&#20998;&#37912; and 9999 &#27627;&#31859;/&#20998;&#37912; &#20043;&#38291;!",
    "Z feedrate value must be between 1 mm/min and 999 mm/min !":"Z&#36914;&#32102;&#29575;&#20540;&#24517;&#38920;&#22312; 1 &#27627;&#31859;/&#20998;&#37912; and 999 &#27627;&#31859;/&#20998;&#37912; &#20043;&#38291;!",
    " seconds":" &#31186;",
    "Abort":"&#32066;&#27490;",
    "auto-check every:":"&#33258;&#21205;&#27298;&#26597;&#27599;&#38548;:",
    "auto-check position every:":"&#33258;&#21205;&#27298;&#26597;&#20301;&#32622;&#27599;&#38548;:",
    "Autoscroll":"&#33258;&#21205;&#28414;&#21205;",
    "Max travel":"&#26368;&#22823;&#34892;&#31243;",
    "Feed rate":"&#36914;&#32102;&#29575;",
    "Touch plate thickness":"Touch plate thickness",
    "Bed":"&#29105;&#24202;",
    "Board":"&#20027;&#27231;&#26495;",
    "Busy...":"&#24537;...",
    "Camera":"&#25885;&#20687;&#27231;",
    "Cancel":"&#21462;&#28040;",
    "Cannot get EEPROM content!":"&#28961;&#27861;&#29554;&#21462;EEPROM&#20839;&#23481;!",
    "Clear":"&#28165;&#38500;",
    "Close":"&#38364;&#38281;",
    "Color":"&#38991;&#33394;",
    "Commands":"&#21629;&#20196;",
    "Communication locked by another process, retry later.":"&#36890;&#35338;&#34987;&#21478;&#19968;&#20491;&#31243;&#24207;&#37782;&#23450;&#65292;&#35531;&#31245;&#24460;&#37325;&#35430;.",
    "Communication locked!":"&#36890;&#35338;&#24050;&#37782;&#23450;!",
    "Communications are currently locked, please wait and retry.":"&#36890;&#35338;&#30070;&#21069;&#34389;&#26044;&#37782;&#23450;&#29376;&#24907;&#65292;&#35531;&#31245;&#24460;&#37325;&#35430;.",
    "Confirm deletion of directory: ":"&#30906;&#35469;&#21034;&#38500;&#30446;&#37636;: ",
    "Confirm deletion of file: ":"&#30906;&#35469;&#21034;&#38500;&#27284;&#26696;: ",
    "Connecting ESP3D...":"&#27491;&#22312;&#36899;&#32218; ESP3D...",
    "Connection failed! is your FW correct?":"&#36899;&#32218;&#22833;&#25943;!&#24744;&#30340;&#38860;&#39636;&#27491;&#30906;&#21966;?",
    "Controls":"&#25511;&#21046;",
    "Credits":"Credits",
    "Dashboard":"&#20736;&#34920;&#30436;",
    "Data mofified":"&#36039;&#26009;&#24050;&#20462;&#25913;",
    "Do you want to save?":"&#24744;&#35201;&#20786;&#23384;&#21966;?",
    "Enable second extruder controls":"&#21855;&#29992;&#31532;&#20108;&#25824;&#20986;&#27231;",
    "Error":"&#37679;&#35492;",
    "ESP3D Filesystem":"ESP3D &#27284;&#26696;&#31995;&#32113;",
    "ESP3D Settings":"ESP3D &#35373;&#23450;",
    "ESP3D Status":"ESP3D &#29376;&#24907;",
    "ESP3D Update":"ESP3D &#26356;&#26032;",
    "Extrude":"&#36914;&#26009;",
    "Extruder T0":"&#25824;&#20986;&#27231; T0",
    "Extruder T1":"&#25824;&#20986;&#27231; T1",
    "Extruders":"&#25824;&#20986;&#27231;",
    "Fan (0-100%)":"&#39080;&#25159;&#36895;&#24230; (0-100%)",
    "Feed (25-150%)":"&#36865;&#26009; (25-150%)",
    "Feedrate :":"&#36865;&#26009;&#36895;&#24230; :",
    "Filename":"&#27284;&#21517;",
    "Filename/URI":"Filename/URI",
    "Verbose mode":"&#35443;&#32048;&#27169;&#24335;",
    "Firmware":"&#38860;&#39636;",
    "Flow (50-300%)":"&#27969;&#37327; (50-300%)",
    "Heater T0":"&#21152;&#29105;&#38957; T0",
    "Heater T1":"&#21152;&#29105;&#38957; T1",
    "Help":"&#24171;&#21161;",
    "Icon":"&#22294;&#31034;",
    "Interface":"&#20171;&#38754;",
    "Join":"&#21152;&#20837;",
    "Label":"&#27161;&#31844;",
    "List of available Access Points":"&#21487;&#29992;AP&#21015;&#34920;",
    "Macro Editor":"&#24040;&#38598;&#21629;&#20196;&#32232;&#36655;&#22120;",
    "mm":"&#27627;&#31859;",
    "mm/min":"&#27627;&#31859;/&#20998;&#37912;",
    "Motors off":"&#38364;&#38281;&#38651;&#27231;",
    "Name":"&#21517;&#31281;",
    "Name:":"&#21517;&#31281;:",
    "Network":"&#32178;&#36335;",
    "No SD card detected":"&#26410;&#27298;&#28204;&#21040;SD&#21345;",
    "No":"No",
    "Occupation:":"Occupation:",
    "Ok":"Ok",
    "Options":"&#36984;&#38917;",
    "Out of range":"&#36229;&#20986;&#31684;&#22285;",
    "Please Confirm":"&#35531;&#30906;&#35469;",
    "Please enter directory name":"&#35531;&#36664;&#20837;&#30446;&#37636;&#21517;&#31281;",
    "Please wait...":"&#35531;&#31245;&#20505;...",
    "Printer configuration":"&#21360;&#34920;&#27231;&#37197;&#32622;",
    "GRBL configuration":"GRBL &#37197;&#32622;",
    "Printer":"&#21360;&#34920;&#27231;",
    "Progress":"&#36914;&#24230;",
    "Protected":"&#21463;&#20445;&#35703;",
    "Refresh":"&#37325;&#26032;&#25972;&#29702;",
    "Restart ESP3D":"&#37325;&#21855; ESP3D",
    "Restarting ESP3D":"&#27491;&#22312;&#37325;&#21855; ESP3D",
    "Restarting":"&#27491;&#22312;&#37325;&#21855;",
    "Restarting, please wait....":"&#27491;&#22312;&#37325;&#26032;&#21855;&#21205;&#65292;&#35531;&#31245;&#20505;....",
    "Retry":"&#37325;&#35430;",
    "Reverse":"&#22238;&#25277;",
    "Save macro list failed!":"&#20786;&#23384;&#24040;&#38598;&#21015;&#34920;&#22833;&#25943;!",
    "Save":"&#20786;&#23384;",
    "Saving":"&#27491;&#22312;&#20786;&#23384;",
    "Scanning":"&#27491;&#22312;&#25475;&#25551;",
    "SD Files":"SD&#27284;&#26696;",
    "sec":"&#31186;",
    "Send Command...":"&#20659;&#36865;&#21629;&#20196;...",
    "Send":"&#20659;&#36865;",
    "Set failed":"&#35373;&#23450;&#22833;&#25943;",
    "Set":"&#35373;&#23450;",
    "Signal":"&#35338;&#34399;",
    "Size":"&#23610;&#23544;",
    "SSID":"SSID",
    "Target":"&#30446;&#27161;",
    "Temperatures":"&#28331;&#24230;",
    "Total:":"&#32317;&#35336;:",
    "Type":"&#22411;&#21029;",
    "Update Firmware ?":"&#26356;&#26032;&#38860;&#39636;&#21966; ?",
    "Update is ongoing, please wait and retry.":"&#26356;&#26032;&#27491;&#22312;&#36914;&#34892;&#65292;&#35531;&#31245;&#24460;&#37325;&#35430;.",
    "Update":"&#26356;&#26032;",
    "Upload failed : ":"&#19978;&#20659;&#22833;&#25943; : ",
    "Upload failed":"&#19978;&#20659;&#22833;&#25943;",
    "Upload":"&#19978;&#20659;",
    "Uploading ":"&#27491;&#22312;&#19978;&#20659; ",
    "Upload done":"&#19978;&#20659;&#23436;&#25104;",
    "Used:":"&#20351;&#29992;:",
    "Value | Target":"&#30070;&#21069;&#20540; | &#38928;&#35373;&#20540;",
    "Value":"&#20540;",
    "Wrong data":"&#37679;&#35492;&#30340;&#36039;&#26009;",
    "Yes":"Yes",
    "Light":"&#29128;",
    "None":"&#28961;",
    "Modem":"&#35519;&#35722;&#35299;&#35519;&#22120;",
    "STA":"&#23458;&#25142;&#31471;&#27169;&#24335;",
    "AP":"AP&#27169;&#24335;",
    "BT":"&#34253;&#33469;",
    "Baud Rate":"&#27874;&#29305;&#29575;",
    "Sleep Mode":"&#30561;&#30496;&#27169;&#24335;",
    "Web Port":"Web&#22496;",
    "Data Port":"&#36039;&#26009;&#22496;",
    "Hostname":"&#20027;&#27231;&#21517;",
    "Wifi mode":"Wifi&#27169;&#24335;",
    "Station SSID":"&#32178;&#36335;&#21517;&#31281;",
    "Station Password":"&#23494;&#30908;",
    "Station Network Mode":"&#23458;&#25142;&#31471;&#32178;&#36335;&#27169;&#24335;",
    "Station IP Mode":"&#23458;&#25142;&#31471;IP&#27169;&#24335;",
    "DHCP":"DHCP",
    "Static":"&#38748;&#24907;",
    "Station Static IP":"&#23458;&#25142;&#31471;&#38748;&#24907;IP",
    "Station Static Mask":"Station Static Mask",
    "Station Static Gateway":"Station Static Gateway",
    "AP SSID":"AP SSID",
    "AP Password":"AP&#23494;&#30908;",
    "AP Network Mode":"AP Network Mode",
    "SSID Visible":"SSID&#21487;&#35211;",
    "AP Channel":"AP&#38971;&#36947;",
    "Open":"Open",
    "Authentication":"&#36523;&#20221;&#39511;&#35657;",
    "AP IP Mode":"AP IP Mode",
    "AP Static IP":"AP Static IP",
    "AP Static Mask":"AP Static Mask",
    "AP Static Gateway":"AP Static Gateway",
    "Time Zone":"Time Zone",
    "Day Saving Time":"Day Saving Time",
    "Time Server 1":"Time Server 1",
    "Time Server 2":"Time Server 2",
    "Time Server 3":"Time Server 3",
    "Target FW":"Target FW",
    "Direct SD access":"&#30452;&#25509;SD&#35370;&#21839;",
    "Direct SD Boot Check":"&#30452;&#25509;SD&#24341;&#23566;&#27298;&#26597;",
    "Primary SD":"Primary SD",
    "Secondary SD":"Secondary SD",
    "Temperature Refresh Time":"&#28331;&#24230;&#37325;&#26032;&#25972;&#29702;&#26178;&#38291;",
    "Position Refresh Time":"&#20301;&#32622;&#37325;&#26032;&#25972;&#29702;&#26178;&#38291;",
    "Status Refresh Time":"&#29376;&#24907;&#37325;&#26032;&#25972;&#29702;&#26178;&#38291;",
    "XY feedrate":"XY&#36914;&#32102;&#29575;",
    "Z feedrate":"Z&#36914;&#32102;&#29575;",
    "E feedrate":"E&#36914;&#32102;&#29575;",
    "Camera address":"&#25885;&#20687;&#27231;&#22320;&#22336;",
    "Setup":"&#35373;&#23450;",
    "Start setup":"&#38283;&#22987;&#35373;&#23450;",
    "This wizard will help you to configure the basic settings.":"&#27492;&#22190;&#23566;&#23559;&#24171;&#21161;&#24744;&#37197;&#32622;&#22522;&#26412;&#35373;&#23450;.",
    "Press start to proceed.":"&#25353;&#38283;&#22987;&#36914;&#34892;.",
    "Save your printer's firmware base:":"&#20786;&#23384;&#21360;&#34920;&#27231;&#30340;&#38860;&#39636;&#24235;:",
    "This is mandatory to get ESP working properly.":"&#36889;&#26159;&#27491;&#24120;&#22519;&#34892;ESP&#25152;&#24517;&#38656;&#30340;.",
    "Save your printer's board current baud rate:":"&#20786;&#23384;&#21360;&#34920;&#27231;&#20027;&#27231;&#26495;&#30340;&#30070;&#21069;&#27874;&#29305;&#29575;:",
    "Printer and ESP board must use same baud rate to communicate properly.":"&#21360;&#34920;&#27231;&#21644;ESP&#26495;&#24517;&#38920;&#20351;&#29992;&#30456;&#21516;&#30340;&#27874;&#29305;&#29575;&#25165;&#33021;&#27491;&#30906;&#36890;&#35338;.",
    "Continue":"&#32380;&#32396;",
    "WiFi Configuration":"WiFi&#37197;&#32622;",
    "Define ESP role:":"Define ESP role:",
    "AP define access point / STA allows to join existing network":"AP&#27169;&#24335;&#33258;&#23450;&#32681;&#25509;&#20837;&#40670; / STA&#27169;&#24335;&#21152;&#20837;&#29694;&#26377;&#32178;&#36335;",
    "What access point ESP need to be connected to:":"What access point ESP need to be connected to:",
    "You can use scan button, to list available access points.":"&#24744;&#21487;&#20197;&#20351;&#29992;&#25475;&#25551;&#25353;&#37397;&#21015;&#20986;&#21487;&#29992;&#30340;&#32178;&#36335;.",
    "Password to join access point:":"Password to join access point:",
    "Define ESP name:":"Define ESP name:",
    "What is ESP access point SSID:":"What is ESP access point SSID:",
    "Password for access point:":"AP&#35370;&#21839;&#23494;&#30908;:",
    "Define security:":"&#23450;&#32681;&#23433;&#20840;&#24615;:",
    "SD Card Configuration":"SD&#21345;&#37197;&#32622;",
    "Is ESP connected to SD card:":"ESP&#26159;&#21542;&#36899;&#32218;&#21040;SD&#21345;:",
    "Check update using direct SD access:":"&#20351;&#29992;&#30452;&#25509;SD&#35370;&#21839;&#27298;&#26597;&#26356;&#26032;:",
    "SD card connected to ESP":"SD&#21345;&#36899;&#32218;&#21040;ESP",
    "SD card connected to printer":"SD&#21345;&#36899;&#32218;&#21040;&#21360;&#34920;&#27231;",
    "Setup is finished.":"&#35373;&#23450;&#23436;&#25104;.",
    "After closing, you will still be able to change or to fine tune your settings in main interface anytime.":"&#38364;&#38281;&#24460;&#65292;&#24744;&#20173;&#28982;&#21487;&#20197;&#38568;&#26178;&#22312;&#20027;&#20171;&#38754;&#20013;&#26356;&#25913;&#25110;&#24494;&#35519;&#35373;&#23450;.",
    "You may need to restart the board to apply the new settings and connect again.":"&#24744;&#21487;&#33021;&#38656;&#35201;&#37325;&#26032;&#21855;&#21205;&#20027;&#27231;&#26495;&#20358;&#25033;&#29992;&#26032;&#30340;&#35373;&#23450;&#20006;&#37325;&#26032;&#36899;&#32218;.",
    "Identification requested":"Identification requested",
    "admin":"admin",
    "user":"user",
    "guest":"guest",
    "Identification invalid!":"Identification invalid!",
    "Passwords do not matches!":"&#23494;&#30908;&#19981;&#21305;&#37197;!",
    "Password must be >1 and <16 without space!":"&#23494;&#30908;&#38920;&#28858;2-15&#20301;&#19988;&#27794;&#26377;&#31354;&#26684;!",
    "User:":"User:",
    "Password:":"Password:",
    "Submit":"&#25552;&#20132;",
    "Change Password":"&#26356;&#25913;&#23494;&#30908;",
    "Current Password:":"&#30070;&#21069;&#23494;&#30908;:",
    "New Password:":"&#26032;&#23494;&#30908;:",
    "Confirm New Password:":"&#30906;&#35469;&#26032;&#23494;&#30908;:",
    "Error : Incorrect User":"&#37679;&#35492;: &#19981;&#27491;&#30906;&#30340;&#20351;&#29992;&#32773;&#21517;&#31281;",
    "Error: Incorrect password":"&#37679;&#35492;: &#19981;&#27491;&#30906;&#30340;&#23494;&#30908;",
    "Error: Missing data":"&#37679;&#35492;: &#32570;&#23569;&#36039;&#26009;",
    "Error: Cannot apply changes":"&#37679;&#35492;: &#28961;&#27861;&#25033;&#29992;&#26356;&#25913;",
    "Error: Too many connections":"&#37679;&#35492;: &#36899;&#32218;&#36942;&#22810;",
    "Authentication failed!":"&#39511;&#35657;&#22833;&#25943;!",
    "Serial is busy, retry later!":"&#24207;&#21015;&#21475;&#24537;&#65292;&#35531;&#31245;&#24460;&#37325;&#35430;!",
    "Login":"&#30331;&#20837;",
    "Log out":"&#30331;&#20986;",
    "Password":"&#23494;&#30908;",
    "No SD Card":"&#27794;&#26377;SD&#21345;",
    "Check for Update":"&#27298;&#26597;&#26356;&#26032;",
    "Please use 8.3 filename only.":"&#21482;&#33021;&#20351;&#29992;8.3&#27284;&#21517;.",
    "Preferences":"&#20559;&#22909;",
    "Feature":"&#21151;&#33021;",
    "Show camera panel":"&#39023;&#31034;&#25885;&#20687;&#27231;&#38754;&#26495;",
    "Auto load camera":"&#33258;&#21205;&#36617;&#20837;&#25885;&#20687;&#27231;",
    "Enable bed controls":"&#21855;&#29992;&#29105;&#24202;&#25511;&#21046;&#20803;&#20214;",
    "Enable fan controls":"&#21855;&#29992;&#39080;&#25159;&#25511;&#21046;&#20803;&#20214;",
    "Enable Z controls":"&#21855;&#29992;Z&#36600;&#25511;&#21046;&#20803;&#20214;",
    "Panels":"&#38754;&#26495;",
    "Show control panel":"&#39023;&#31034;&#25511;&#21046;&#38754;&#26495;",
    "Show temperatures panel":"&#39023;&#31034;&#28331;&#24230;&#38754;&#26495;",
    "Show extruder panel":"&#39023;&#31034;&#25824;&#20986;&#27231;&#38754;&#26495;",
    "Show files panel":"&#39023;&#31034;&#27284;&#26696;&#38754;&#26495;",
    "Show GRBL panel":"&#39023;&#31034;GRBL&#38754;&#26495;",
    "Show commands panel":"&#39023;&#31034;&#21629;&#20196;&#38754;&#26495;",
    "Select files":"&#36984;&#25799;&#27284;&#26696;",
    "Select file":"&#36984;&#25799;&#27284;&#26696;",
    "$n files":"$n &#27284;&#26696;",
    "No file chosen":"&#26410;&#36984;&#25799;&#27284;&#26696;",
    "Length":"Length",
    "Output msg":"Output msg",
    "Enable":"&#21855;&#29992;",
    "Disable":"&#31105;&#29992;",
    "Serial":"&#24207;&#21015;&#21475;",
    "Chip ID":"&#26230;&#29255;ID",
    "CPU Frequency":"CPU&#38971;&#29575;",
    "CPU Temperature":"CPU&#28331;&#24230;",
    "Free memory":"&#21487;&#29992;&#35352;&#25014;&#39636;",
    "Flash Size":"&#24555;&#38275;&#35352;&#25014;&#39636;&#23481;&#37327;",
    "Available Size for update":"&#21487;&#29992;&#30340;&#26356;&#26032;&#22823;&#23567;",
    "Available Size for SPIFFS":"&#21487;&#29992;&#30340;SPIFFS&#22823;&#23567;",
    "Baud rate":"&#27874;&#29305;&#29575;",
    "Sleep mode":"&#30561;&#30496;&#27169;&#24335;",
    "Channel":"&#38971;&#36947;",
    "Phy Mode":"Phy Mode",
    "Web port":"Web&#22496;",
    "Data port":"&#36039;&#26009;&#22496;",
    "Active Mode":"&#27963;&#21205;&#27169;&#24335;",
    "Connected to":"&#24050;&#36899;&#32218;&#21040;",
    "IP Mode":"IP&#27169;&#24335;",
    "Gateway":"Gateway",
    "Mask":"&#25513;&#30908;",
    "DNS":"DNS",
    "Disabled Mode":"&#31105;&#29992;&#27169;&#24335;",
    "Captive portal":"Captive portal",
    "Enabled":"&#21855;&#29992;",
    "Web Update":"Web&#21319;&#32026;",
    "Pin Recovery":"Pin Recovery",
    "Disabled":"&#31105;&#29992;",
    "Target Firmware":"&#30446;&#27161;&#38860;&#39636;",
    "SD Card Support":"SD&#21345;&#25903;&#25588;",
    "Time Support":"&#26178;&#38291;&#25903;&#25588;",
    "M117 output":"M117&#36664;&#20986;",
    "Oled output":"Oled&#36664;&#20986;",
    "Serial output":"&#24207;&#21015;&#36664;&#20986;",
    "Web socket output":"Web socket&#36664;&#20986;",
    "TCP output":"TCP&#36664;&#20986;",
    "FW version":"FW&#29256;&#26412;",
    "Show DHT output":"Show DHT&#36664;&#20986;",
    "DHT Type":"DHT&#22411;&#21029;",
    "DHT check (seconds)":"DHT&#27298;&#26597;(&#31186;)",
    "SD speed divider":"SD speed divider",
    "Number of extruders":"&#25824;&#20986;&#27231;&#25976;&#37327;",
    "Mixed extruders":"&#28151;&#21512;&#25824;&#20986;&#27231;",
    "Extruder":"&#25824;&#20986;&#27231;",
    "Enable lock interface":"&#21855;&#29992;&#37782;&#23450;&#20171;&#38754;",
    "Lock interface":"&#37782;&#23450;&#20171;&#38754;",
    "Unlock interface":"&#35299;&#37782;&#20171;&#38754;",
    "You are disconnected":"&#24744;&#24050;&#26039;&#38283;&#36899;&#32218;",
    "Looks like you are connected from another place, so this page is now disconnected":"&#24744;&#24050;&#24478;&#21478;&#19968;&#20491;&#20301;&#32622;&#36899;&#32218;&#65292;&#22240;&#27492;&#26412;&#38913;&#38754;&#29694;&#22312;&#24050;&#26039;&#38283;&#36899;&#32218;",
    "Please reconnect me":"&#35531;&#37325;&#26032;&#36899;&#32218;",
    "Mist":"&#20919;&#21371;&#22132;&#38695;",
    "Flood":"&#20919;&#21371;&#28082;",
    "Spindle":"&#20027;&#36600;",
    "Connection monitoring":"&#36899;&#32218;&#30435;&#35222;",
    "XY Feedrate value must be at least 1 mm/min!":"XY Feedrate value must be at least 1 &#27627;&#31859;/&#20998;&#37912;!",
    "Z Feedrate value must be at least 1 mm/min!":"Z Feedrate value must be at least 1 &#27627;&#31859;/&#20998;&#37912;!",
    "Hold:0":"&#24050;&#23436;&#25104;&#12290;&#28310;&#20633;&#24674;&#24489;&#12290;",
    "Hold:1":"&#36914;&#34892;&#20013;&#12290;&#37325;&#32622;&#23559;&#30332;&#20986;&#35686;&#22577;&#12290;",
    "Door:0":"&#38272;&#24050;&#38364;&#38281;&#12290;&#28310;&#20633;&#24674;&#24489;&#12290;",
    "Door:1":"&#27231;&#22120;&#20572;&#27490;&#20102;&#12290;&#38272;&#20173;&#28982;&#38283;&#33879;&#12290;&#30452;&#21040;&#38364;&#38272;&#24460;&#25165;&#33021;&#24674;&#24489;&#12290;",
    "Door:2":"&#38272;&#38283;&#21855;&#12290;&#20445;&#25345;&#65288;&#25110;&#20572;&#36554;&#32302;&#22238;&#65289;&#36914;&#34892;&#20013;&#12290;&#24489;&#20301;&#23559;&#30332;&#20986;&#35686;&#22577;&#12290;",
    "Door:3":"&#38272;&#24050;&#38364;&#38281;&#20006;&#27491;&#22312;&#24674;&#24489;&#12290;&#24478;&#20572;&#36554;&#34389;&#24674;&#24489;&#65288;&#22914;&#26524;&#36969;&#29992;&#65289;&#12290;&#37325;&#32622;&#23559;&#24341;&#30332;&#35686;&#22577;&#12290;",
    "ALARM:1":"&#24050;&#35320;&#30332;&#30828;&#26997;&#38480;&#12290;&#30001;&#26044;&#31361;&#28982;&#20572;&#27490;,&#27231;&#22120;&#20301;&#32622;&#21487;&#33021;&#19999;&#22833;&#12290;&#24375;&#28872;&#24314;&#35696;&#37325;&#26032;&#22238;&#21407;&#40670;&#12290;",
    "ALARM:2":"&#36575;&#38480;&#20301;&#35686;&#22577;&#12290;G&#31243;&#24335;&#30908;&#36939;&#21205;&#30446;&#27161;&#36229;&#20986;&#20102;&#27231;&#22120;&#34892;&#31243;&#12290;&#20445;&#30041;&#20102;&#27231;&#22120;&#20301;&#32622;&#12290;&#21487;&#20197;&#23433;&#20840;&#22320;&#35299;&#38500;&#35686;&#22577;,&#35531;&#21934;&#25802;&#24489;&#20301;&#25353;&#37397;&#12290;",
    "ALARM:3":"&#36939;&#21205;&#26178;&#24489;&#20301;&#12290;&#30001;&#26044;&#31361;&#28982;&#20572;&#27490;,&#27231;&#22120;&#20301;&#32622;&#21487;&#33021;&#26371;&#19999;&#22833;&#12290;&#24375;&#28872;&#24314;&#35696;&#37325;&#26032;&#22238;&#21407;&#40670;&#12290;",
    "ALARM:4":"&#25506;&#28204;&#22833;&#25943;&#12290;&#22312;&#38283;&#22987;&#25506;&#28204;&#36852;&#22280;&#20043;&#21069;,&#25506;&#28204;&#26410;&#34389;&#26044;&#38928;&#26399;&#30340;&#21021;&#22987;&#29376;&#24907;&#12290;",
    "ALARM:5":"&#25506;&#28204;&#22833;&#25943;&#12290;&#22312;G38.2&#21644;G38.4&#30340;&#31243;&#24335;&#35373;&#35336;&#34892;&#31243;&#20839;,&#28204;&#38957;&#26410;&#33287;&#24037;&#20214;&#25509;&#35320;&#12290;",
    "ALARM:6":"&#22238;&#21407;&#40670;&#22833;&#25943;&#12290;&#24489;&#20301;&#20102;&#26377;&#25928;&#30340;&#22238;&#21407;&#40670;&#36913;&#26399;&#12290;",
    "ALARM:7":"&#22238;&#21407;&#40670;&#22833;&#25943;&#12290;&#22312;&#22238;&#21407;&#40670;&#36913;&#26399;&#20013;&#23433;&#20840;&#38272;&#38283;&#21855;&#12290;",
    "ALARM:8":"&#22238;&#21407;&#40670;&#22833;&#25943;&#12290;&#25289;&#20986;&#34892;&#31243;&#26410;&#33021;&#28165;&#38500;&#38480;&#20301;&#38283;&#38364;&#12290;&#22039;&#35430;&#22686;&#21152;&#25289;&#20986;&#35373;&#23450;&#25110;&#27298;&#26597;&#25509;&#32218;&#12290;",
    "ALARM:9":"&#22238;&#21407;&#40670;&#22833;&#25943;&#12290;&#28961;&#27861;&#22312;&#25628;&#23563;&#36317;&#38626;&#20839;&#25214;&#21040;&#38480;&#20301;&#38283;&#38364;&#12290;&#35531;&#22039;&#35430;&#22686;&#21152;&#26368;&#22823;&#34892;&#31243;,&#28187;&#23567;&#19979;&#25289;&#36317;&#38626;&#25110;&#27298;&#26597;&#25509;&#32218;&#12290;",
    "error:1":"G&#30908;&#23383;&#30001;&#19968;&#20491;&#23383;&#27597;&#21644;&#19968;&#20491;&#20540;&#32068;&#25104;&#12290;&#25214;&#19981;&#21040;&#23383;&#27597;&#12290;",
    "error:2":"&#32570;&#23569;&#38928;&#26399;&#30340;G&#31243;&#24335;&#30908;&#23383;&#20540;&#25110;&#25976;&#20540;&#26684;&#24335;&#28961;&#25928;&#12290;",
    "error:3":"&#26410;&#35672;&#21029;&#25110;&#19981;&#25903;&#25588;Grbl'$'&#31995;&#32113;&#21629;&#20196;&#12290;",
    "error:4":"&#25509;&#25910;&#21040;&#30340;&#36000;&#20540;&#28858;&#26399;&#26395;&#30340;&#27491;&#20540;&#12290;",
    "error:5":"&#22238;&#21407;&#40670;&#36852;&#22280;&#22833;&#25943;&#12290;&#26410;&#36890;&#36942;&#35373;&#23450;&#21855;&#29992;&#22238;&#21407;&#40670;&#12290;",
    "error:6":"&#26368;&#23567;&#27493;&#36914;&#33032;&#34909;&#26178;&#38291;&#24517;&#38920;&#22823;&#26044;3usec&#12290;",
    "error:7":"EEPROM&#35712;&#21462;&#22833;&#25943;&#12290;&#23559;&#21463;&#24433;&#38911;&#30340;EEPROM&#33258;&#21205;&#24674;&#24489;&#28858;&#38928;&#35373;&#20540;&#12290;",
    "error:8":"&#38500;&#38750;Grbl&#28858;IDLE,&#21542;&#21063;&#28961;&#27861;&#20351;&#29992;Grbl'$'&#21629;&#20196;&#12290;&#30906;&#20445;&#20316;&#26989;&#26399;&#38291;&#30340;&#24179;&#31337;&#25805;&#20316;&#12290;",
    "error:9":"&#22312;&#22577;&#35686;&#25110;&#24930;&#36914;&#29376;&#24907;&#26399;&#38291;,G&#31243;&#24335;&#30908;&#21629;&#20196;&#34987;&#37782;&#23450;&#12290;",
    "error:10":"&#22312;&#26410;&#21855;&#29992;&#22238;&#21407;&#40670;&#30340;&#24773;&#27841;&#19979;&#20063;&#28961;&#27861;&#21855;&#29992;&#36575;&#38480;&#21046;&#12290;",
    "error:11":"&#27599;&#34892;&#36229;&#20986;&#26368;&#22823;&#23383;&#20803;&#12290;&#26410;&#22519;&#34892;&#25509;&#25910;&#21040;&#30340;&#21629;&#20196;&#21015;&#12290;",
    "error:12":"Grbl'$'&#35373;&#23450;&#20540;&#23566;&#33268;&#27493;&#36895;&#36229;&#36942;&#25903;&#25588;&#30340;&#26368;&#22823;&#20540;&#12290;",
    "error:13":"&#27298;&#28204;&#21040;&#23433;&#20840;&#38272;&#24050;&#38283;&#21855;&#20006;&#19988;&#38272;&#29376;&#24907;&#24050;&#21855;&#21205;&#12290;",
    "error:14":"&#27083;&#24314;&#36039;&#35338;&#25110;&#21855;&#21205;&#34892;&#36229;&#20986;EEPROM&#34892;&#38263;&#24230;&#38480;&#21046;&#12290;&#34892;&#26410;&#20786;&#23384;&#12290;",
    "error:15":"&#40670;&#21205;&#30446;&#27161;&#36229;&#20986;&#20102;&#27231;&#22120;&#34892;&#31243;&#12290;&#40670;&#21205;&#21629;&#20196;&#24050;&#34987;&#24573;&#30053;&#12290;",
    "error:16":"&#40670;&#21205;&#21629;&#20196;&#27794;&#26377;'='&#25110;&#21253;&#21547;&#31105;&#27490;&#30340;g&#31243;&#24335;&#30908;&#12290;",
    "error:17":"&#37939;&#23556;&#27169;&#24335;&#38656;&#35201;PWM&#36664;&#20986;&#12290;",
    "error:20":"&#22312;&#22602;&#20013;&#30332;&#29694;&#19981;&#25903;&#25588;&#25110;&#28961;&#25928;&#30340;g&#31243;&#24335;&#30908;&#21629;&#20196;&#12290;",
    "error:21":"&#22312;&#22602;&#20013;&#25214;&#21040;&#30340;&#21516;&#19968;&#27169;&#24907;&#32068;&#20013;&#26377;&#22810;&#20491;g&#31243;&#24335;&#30908;&#21629;&#20196;&#12290;",
    "error:22":"&#36914;&#32025;&#36895;&#24230;&#23578;&#26410;&#35373;&#23450;&#25110;&#26410;&#23450;&#32681;&#12290;",
    "error:23":"&#22602;&#20013;&#30340;G&#31243;&#24335;&#30908;&#21629;&#20196;&#38656;&#35201;&#19968;&#20491;&#25972;&#25976;&#20540;&#12290;",
    "error:24":"&#26377;&#22810;&#20491;g&#31243;&#24335;&#30908;&#21629;&#20196;,&#38656;&#35201;&#22312;&#22602;&#20013;&#25214;&#21040;&#36600;&#23383;&#12290;",
    "error:25":"&#22312;&#22602;&#20013;&#25214;&#21040;&#37325;&#35079;&#30340;g&#30908;&#23383;&#12290;",
    "error:26":"&#22312;g&#31243;&#24335;&#30908;&#21629;&#20196;&#25110;&#38656;&#35201;&#23427;&#20497;&#30340;&#30070;&#21069;&#27169;&#24907;&#19979;,&#22312;&#31243;&#24335;&#27573;&#20013;&#25214;&#19981;&#21040;&#36600;&#23383;&#12290;",
    "error:27":"&#34892;&#34399;&#20540;&#28961;&#25928;&#12290;",
    "error:28":"G&#31243;&#24335;&#30908;&#21629;&#20196;&#32570;&#23569;&#24517;&#38656;&#30340;&#20540;&#23383;&#12290;",
    "error:29":"&#19981;&#25903;&#25588;G59.x&#24037;&#20316;&#24231;&#27161;&#31995;&#12290;",
    "error:30":"G53&#20677;&#22312;G0&#21644;G1&#36939;&#21205;&#27169;&#24335;&#19979;&#20801;&#35377;&#12290;",
    "error:31":"&#30070;&#27794;&#26377;&#21629;&#20196;&#25110;&#30070;&#21069;&#27169;&#24907;&#20351;&#29992;&#23427;&#20497;&#26178;,&#22312;&#22602;&#20013;&#25214;&#21040;&#36600;&#23383;&#12290;",
    "error:32":"G2&#21644;G3&#22291;&#24359;&#33267;&#23569;&#38656;&#35201;&#19968;&#20491;&#24179;&#38754;&#20839;&#36600;&#23383;&#12290;",
    "error:33":"&#36939;&#21205;&#21629;&#20196;&#30446;&#27161;&#28961;&#25928;&#12290;",
    "error:34":"&#22291;&#24359;&#21322;&#24465;&#20540;&#28961;&#25928;&#12290;",
    "error:35":"G2&#21644;G3&#22291;&#24359;&#33267;&#23569;&#38656;&#35201;&#19968;&#20491;&#24179;&#38754;&#20839;&#20559;&#31227;&#23383;&#12290;",
    "error:36":"&#22312;&#22602;&#20013;&#25214;&#21040;&#26410;&#20351;&#29992;&#30340;&#20729;&#20540;&#35422;&#12290;",
    "error:37":"G43.1&#21205;&#24907;&#20992;&#20855;&#38263;&#24230;&#35036;&#20767;&#26410;&#20998;&#37197;&#32102;&#24050;&#32068;&#24907;&#30340;&#20992;&#20855;&#38263;&#24230;&#36600;&#12290;",
    "error:38":"&#20992;&#20855;&#32232;&#34399;&#22823;&#26044;&#26368;&#22823;&#25903;&#25588;&#20540;&#12290;",
    "error:60":"SD&#28961;&#27861;&#25499;&#36617;",
    "error:61":"SD&#21345;&#28961;&#27861;&#38283;&#21855;&#27284;&#26696;&#36914;&#34892;&#35712;&#21462;",
    "error:62":"SD&#21345;&#28961;&#27861;&#38283;&#21855;&#30446;&#37636;",
    "error:63":"&#25214;&#19981;&#21040;SD&#21345;&#30446;&#37636;",
    "error:64":"SD&#21345;&#27284;&#26696;&#28858;&#31354;",
    "error:70":"&#34253;&#33469;&#28961;&#27861;&#21855;&#21205;",
    "Max travel":"&#26368;&#22823;&#34892;&#31243;",
    "Plate thickness":"&#25506;&#37341;&#36039;&#26009;&#20462;&#27491;",
    "Show probe panel":"&#39023;&#31034;&#25506;&#37341;&#38754;&#26495;",
    "Probe":"&#25506;&#37341;",
    "Start Probe":"&#21855;&#21205;&#25506;&#37341;",
    "Touch status":"&#23565;&#20992;&#29376;&#24907;",
    "Value of maximum probe travel must be between 1 mm and 9999 mm !":"&#26368;&#22823;&#25506;&#38957;&#34892;&#31243;&#20540;&#24517;&#38920;&#22312; 1 &#27627;&#31859; &#33267; 9999 &#27627;&#31859;&#20043;&#38291;!",
    "Value of probe touch plate thickness must be between 0 mm and 9999 mm !":"&#25506;&#37341;&#36039;&#26009;&#20462;&#27491;&#20540;&#24517;&#38920;&#22312; 0 &#27627;&#31859; &#33267; 9999 &#27627;&#31859;&#20043;&#38291;!",
    "Value of probe feedrate must be between 1 mm/min and 9999 mm/min !":"&#25506;&#37341;&#36914;&#32102;&#29575;&#20540;&#24517;&#38920;&#22312; 1 &#27627;&#31859;/&#20998;&#37912; &#33267; 9999 &#27627;&#31859;/&#20998;&#37912;&#20043;&#38291;!",
    "Probe failed !":"&#25506;&#28204;&#22833;&#25943; !",
    "Probe result saved.":"&#25506;&#28204;&#32080;&#26524;&#24050;&#20786;&#23384;.",
    "Browser:":"&#28687;&#35261;:",
    "Probing...":"&#27491;&#22312;&#25506;&#28204;...",
    "Step pulse, microseconds":"&#27493;&#36914;&#33032;&#34909;, &#24494;&#31186;",
    "Step idle delay, milliseconds":"&#27493;&#36914;&#38651;&#27231;&#31354;&#38290;&#26178;&#37323;&#25918;&#21147;&#30697;&#26178;&#38291;,255&#26159;&#19968;&#30452;&#20445;&#25345;",
    "Step port invert, mask":"&#27493;&#36914;&#33032;&#34909;&#32763;&#36681;&#20171;&#38754;, mask",
    "Direction port invert, mask":"&#26041;&#21521;&#32763;&#36681;&#20171;&#38754;, mask",
    "Step enable invert, boolean":"&#27493;&#36914;&#20351;&#33021;&#32763;&#36681;, boolean",
    "Limit pins invert, boolean":"&#38480;&#20301;&#24341;&#33139;&#32763;&#36681;, boolean",
    "Probe pin invert, boolean":"&#25506;&#28204;&#24341;&#33139;&#32763;&#36681;, boolean",
    "Status report, mask":"&#29376;&#24907;&#22577;&#21578;, mask",
    "Junction deviation, mm":"&#32080;&#20559;&#24046;, mm",
    "Arc tolerance, mm":"&#22291;&#24359;&#20844;&#24046;, mm",
    "Report inches, boolean":"&#22577;&#21578;&#33521;&#23544;, boolean",
    "Soft limits, boolean":"&#26159;&#21542;&#21855;&#29992;&#36575;&#39636;&#26368;&#22823;&#34892;&#31243;&#38480;&#21046;, boolean",
    "Hard limits, boolean":"&#26159;&#21542;&#21855;&#29992;&#30828;&#39636;&#38480;&#20301;, boolean",
    "Homing cycle, boolean":"&#26159;&#21542;&#21855;&#29992;$H&#22238;&#38480;&#20301;&#25805;&#20316;, boolean",
    "Homing dir invert, mask":"&#24489;&#20301;&#26041;&#21521;&#32763;&#36681;",
    "Homing feed, mm/min":"&#24489;&#20301;&#23563;&#25214;&#36895;&#24230;, &#27627;&#31859;/&#20998;&#37912;",
    "Homing seek, mm/min":"&#24489;&#20301;&#32102;&#36914;&#36895;&#24230;, &#27627;&#31859;/&#20998;&#37912;",
    "Homing debounce, milliseconds":"&#20301;&#28040;&#25238;, &#27627;&#31186;",
    "Homing pull-off, mm":"&#24489;&#20301;&#36820;&#22238;&#34892;&#31243;, &#27627;&#31859;",
    "Max spindle speed, RPM":"&#26368;&#22823;&#20027;&#36600;&#36681;&#36895;, RPM",
    "Min spindle speed, RPM":"&#26368;&#23567;&#20027;&#36600;&#36681;&#36895;, RPM",
    "Laser mode, boolean":"&#37939;&#23556;&#27169;&#24335;, boolean",
    "X steps/mm":"X&#36600;&#38651;&#27231; &#27493;&#25976;/&#27627;&#31859;,&#36208;1mm&#33032;&#34909;&#25976;",
    "Y steps/mm":"Y&#36600;&#38651;&#27231; &#27493;&#25976;/&#27627;&#31859;,&#36208;1mm&#33032;&#34909;&#25976;",
    "Z steps/mm":"Z&#36600;&#38651;&#27231; &#27493;&#25976;/&#27627;&#31859;,&#36208;1mm&#33032;&#34909;&#25976;",
    "X Max rate, mm/min":"X&#36600;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#37912;",
    "Y Max rate, mm/min":"Y&#36600;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#37912;",
    "Z Max rate, mm/min":"Z&#36600;&#26368;&#22823;&#36895;&#29575;, &#27627;&#31859;/&#20998;&#37912;",
    "X Acceleration, mm/sec^2":"X&#36600;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
    "Y Acceleration, mm/sec^2":"Y&#36600;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
    "Z Acceleration, mm/sec^2":"Z&#36600;&#21152;&#36895;&#24230;&#65292;&#27627;&#31859;/&#31186;^2",
    "X Max travel, mm":"X&#36600;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
    "Y Max travel, mm":"Y&#36600;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
    "Z Max travel, mm":"Z&#36600;&#26368;&#22823;&#34892;&#31243;&#65292;&#27627;&#31859;",
    "File extensions (use ; to separate):":"&#21103;&#27284;&#21517; (&#20351;&#29992; ; &#20998;&#38548;):",
    
};
//endRemoveIf(zh_tw_lang_disabled)
