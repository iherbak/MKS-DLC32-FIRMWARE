/*
  WebSettings.cpp - Settings and Commands for Grbl_ESP32's interface
  to ESP3D_WebUI.  Code snippets extracted from commands.cpp in the
  old WebUI interface code are presented via the Settings class.

  Copyright (c) 2020 Mitch Bradley
  Copyright (c) 2014 Luc Lebosse. All rights reserved.

  Grbl is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Grbl is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Grbl.  If not, see <http://www.gnu.org/licenses/>.
*/

#include "../Grbl.h"

#include <WiFi.h>
#include <FS.h>
#include <SPIFFS.h>
#include <esp_wifi.h>
#include <esp_ota_ops.h>

#include "ESPResponse.h"
#include "WebServer.h"
#include <string.h>

namespace WebUI
{

#ifdef ENABLE_WIFI
    StringSetting *wifi_sta_ssid;
    StringSetting *wifi_sta_password;

    EnumSetting *wifi_sta_mode;
    IPaddrSetting *wifi_sta_ip;
    IPaddrSetting *wifi_sta_gateway;
    IPaddrSetting *wifi_sta_netmask;

    StringSetting *wifi_ap_ssid;
    StringSetting *wifi_ap_password;

    IPaddrSetting *wifi_ap_ip;

    IntSetting *wifi_ap_channel;

    StringSetting *wifi_hostname;
    EnumSetting *http_enable;
    IntSetting *http_port;
    EnumSetting *telnet_enable;
    IntSetting *telnet_port;

    typedef std::map<const char *, int8_t, cmp_str> enum_opt_t;

    enum_opt_t staModeOptions = {
        {"DHCP", DHCP_MODE},
        {"Static", STATIC_MODE},
    };
#endif

#ifdef WIFI_OR_BLUETOOTH
    EnumSetting *wifi_radio_mode;
    enum_opt_t radioOptions = {
        {"None", ESP_RADIO_OFF},
        {"STA", ESP_WIFI_STA},
        {"AP", ESP_WIFI_AP},
        {"BT", ESP_BT},
    };
    enum_opt_t radioEnabledOptions = {
        {"NONE", ESP_RADIO_OFF},
#ifdef ENABLE_WIFI
        {"STA", ESP_WIFI_STA},
        {"AP", ESP_WIFI_AP},
#endif
#ifdef ENABLE_BLUETOOTH
        {"BT", ESP_BT},
#endif
    };
#endif

#ifdef ENABLE_BLUETOOTH
    StringSetting *bt_name;
#endif

#ifdef ENABLE_NOTIFICATIONS
    enum_opt_t notificationOptions = {
        {"NONE", 0},
        {"LINE", 3},
        {"PUSHOVER", 1},
        {"EMAIL", 2},
    };
    EnumSetting *notification_type;
    StringSetting *notification_t1;
    StringSetting *notification_t2;
    StringSetting *notification_ts;
#endif

    enum_opt_t onoffOptions = {{"OFF", 0}, {"ON", 1}};

    static ESPResponseStream *espresponse;

    typedef struct
    {
        char *key;
        char *value;
    } keyval_t;

    static keyval_t params[10];
    bool split_params(char *parameter)
    {
        int i = 0;
        for (char *s = parameter; *s; s++)
        {
            if (*s == '=')
            {
                params[i].value = s + 1;
                *s = '\0';
                // Search backward looking for the start of the key,
                // either just after a space or at the beginning of the strin
                if (s == parameter)
                {
                    return false;
                }
                for (char *k = s - 1; k >= parameter; --k)
                {
                    if (*k == '\0')
                    {
                        // If we find a NUL - i.e. the end of the previous key -
                        // before finding a space, the string is malformed.
                        return false;
                    }
                    if (*k == ' ')
                    {
                        *k = '\0';
                        params[i++].key = k + 1;
                        break;
                    }
                    if (k == parameter)
                    {
                        params[i++].key = k;
                    }
                }
            }
        }
        params[i].key = NULL;
        return true;
    }

    char nullstr[1] = {'\0'};
    char *get_param(const char *key, bool allowSpaces)
    {
        for (keyval_t *p = params; p->key; p++)
        {
            if (!strcasecmp(key, p->key))
            {
                if (!allowSpaces)
                {
                    for (char *s = p->value; *s; s++)
                    {
                        if (*s == ' ')
                        {
                            *s = '\0';
                            break;
                        }
                    }
                }
                return p->value;
            }
        }
        return nullstr;
    }
}

Error WebCommand::action(char *value, WebUI::AuthenticationLevel auth_level, WebUI::ESPResponseStream *out)
{

    if (_cmdChecker && _cmdChecker())
    {
        return Error::AnotherInterfaceBusy;
    }
    char empty = '\0';
    if (!value)
    {
        value = &empty;
    }
    WebUI::espresponse = out;
    return _action(value, auth_level);
};

namespace WebUI
{
    static int webColumn = 0;
    // We create a variety of print functions to make the rest
    // of the code more compact and readable.
    static void webPrint(const char *s)
    {
        if (espresponse)
        {
            espresponse->sendJson(s);
        }
    }
    static Error SPIFFSSize(char *parameter, AuthenticationLevel auth_level)
    { // ESP720
        JSONencoder encoder;
        encoder.begin();
        encoder.member("Total", ESPResponseStream::formatBytes(SPIFFS.totalBytes()));
        encoder.member("Used", ESPResponseStream::formatBytes(SPIFFS.usedBytes()));
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    static Error formatSpiffs(char *parameter, AuthenticationLevel auth_level)
    { // ESP710
        JSONencoder encoder;
        encoder.begin();
        if (strcmp(parameter, "FORMAT") != 0)
        {
            encoder.member(JSONencoder::status, "Parameter must be FORMAT");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        SPIFFS.format();
        encoder.member(JSONencoder::status, JSONencoder::ok);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    static Error showLocalFile(char *parameter, AuthenticationLevel auth_level)
    { // ESP701
        JSONencoder encoder;
        encoder.begin();
        if (sys.state != State::Idle && sys.state != State::Alarm)
        {
            return Error::IdleError;
        }
        String path = trim(parameter);
        if ((path.length() > 0) && (path[0] != '/'))
        {
            path = "/" + path;
        }
        if (!SPIFFS.exists(path))
        {
            encoder.member(JSONencoder::status, "No such file!");
            webPrint(encoder.end().c_str());
            return Error::FsFileNotFound;
        }
        File currentfile = SPIFFS.open(path, FILE_READ);
        if (!currentfile)
        {
            return Error::FsFailedOpenFile;
        }
        while (currentfile.available())
        {
            // String currentline = currentfile.readStringUntil('\n');
            //            if (currentline.length() > 0) {
            //                webPrintln(currentline);
            //            }
            encoder.member(JSONencoder::status, JSONencoder::ok);
            encoder.member("Content", currentfile.readStringUntil('\n'));
            webPrint(encoder.end().c_str());
        }
        currentfile.close();
        return Error::Ok;
    }

#ifdef ENABLE_NOTIFICATIONS
    static Error showSetNotification(char *parameter, AuthenticationLevel auth_level)
    { // ESP610
        JSONEncoder encoder;
        encoder.begin();
        if (*parameter == '\0')
        {
            encoder.member("Notfication_type", notification_type->getStringValue());
            encoder.member("Notfication_TS", notification_ts->getStringValue());
            webprint(encoder.end().c_str());
            return Error::Ok;
        }
        if (!split_params(parameter))
        {
            encoder.member(JSONencoder::status, "Invalid value");
            webprint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        char *ts = get_param("TS", false);
        char *t2 = get_param("T2", false);
        char *t1 = get_param("T1", false);
        char *ty = get_param("type", false);
        Error err = notification_type->setStringValue(ty);
        if (err == Error::Ok)
        {
            err = notification_t1->setStringValue(t1);
        }
        if (err == Error::Ok)
        {
            err = notification_t2->setStringValue(t2);
        }
        if (err == Error::Ok)
        {
            err = notification_ts->setStringValue(ts);
        }
        encoder.member(JSONencoder::status, err == Error::OK ? JSONencoder::ok : "Error during setting");
        webprint(encoder.end().c_str());
        return err;
    }

    static Error sendMessage(char *parameter, AuthenticationLevel auth_level)
    { // ESP600
        JSONencoder encoder;
        encode.beging();
        if (*parameter == '\0')
        {
            encoder.member(JSONencoder::status, "Invalid message!");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        if (!notificationsservice.sendMSG("GRBL Notification", parameter))
        {
            encoder.member(JSONencoder::status, "Cannot send message!");
            webPrint(encoder.end().c_str());
            return Error::MessageFailed;
        }
        encoder.member(JSONencoder::status, JSonencoder::ok);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }
#endif

#ifdef ENABLE_AUTHENTICATION
    static Error setUserPassword(char *parameter, AuthenticationLevel auth_level)
    { // ESP555
        JSONencoder encoder;
        encode.beging();
        if (*parameter == '\0')
        {
            user_password->setDefault();
            encoder.member(JSONencoder::status, JSONencoder::ok);
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        if (user_password->setStringValue(parameter) != Error::Ok)
        {
            encoder.member(JSONencoder::status, "Invalid password");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        encoder.member(JSONencoder::status, JSONencoder::ok);
        webPrint(encoder.end().c_str());

        return Error::Ok;
    }
#endif

    static Error setSystemMode(char *parameter, AuthenticationLevel auth_level)
    { // ESP444
        JSONencoder encoder;
        encoder.begin();
        parameter = trim(parameter);
        if (strcasecmp(parameter, "RESTART") != 0)
        {
            encoder.member(JSONencoder::status, "Parameter RESTART is missing");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        grbl_send(CLIENT_ALL, "[MSG:Restart ongoing]\r\n");
        COMMANDS::restart_ESP();
        return Error::Ok;
    }

    static Error showSysStats(char *parameter, AuthenticationLevel auth_level)
    { // ESP420
        JSONencoder encoder;
        encoder.begin();
        encoder.member("Chip_ID", String((uint16_t)(ESP.getEfuseMac() >> 32)));
        encoder.member("CPU_Frequency", String(ESP.getCpuFreqMHz()) + "Mhz");
        encoder.member("CPU_Temperature", String(temperatureRead(), 1) + "C");
        encoder.member("Free_memory", ESPResponseStream::formatBytes(ESP.getFreeHeap()));
        encoder.member("SDK", ESP.getSdkVersion());
        encoder.member("Board_Version", "DLC32 V003"); // mks fix
        encoder.member("Firmware", "DLC32 V1.10C");    // mks fix
        encoder.member("Flash_Size", ESPResponseStream::formatBytes(ESP.getFlashChipSize()));

        // Round baudRate to nearest 100 because ESP32 can say e.g. 115201
        encoder.member("Baud_rate", String((Serial.baudRate() / 100) * 100));
        encoder.member("Sleep_mode", WiFi.getSleep() ? "Modem" : "None");

#ifdef ENABLE_WIFI
        int mode = WiFi.getMode();
        if (mode != WIFI_MODE_NULL)
        {
            // Is OTA available ?
            size_t flashsize = 0;
            if (esp_ota_get_running_partition())
            {
                const esp_partition_t *partition = esp_ota_get_next_update_partition(NULL);
                if (partition)
                {
                    flashsize = partition->size;
                }
            }
            encoder.begin_named_object("Capacities");
            encoder.member("Flash", ESPResponseStream::formatBytes(flashsize));
            encoder.member("SPIFFS", ESPResponseStream::formatBytes(SPIFFS.totalBytes()));
            encoder.end_object();
            encoder.begin_named_object("Network");
#if defined(ENABLE_HTTP)
            encoder.member("Web_port", String(web_server.port()));
#endif
#if defined(ENABLE_TELNET)
            encoder.member("Data_port", String(telnet_server.port()));
#endif
            encoder.member("Hostname", wifi_config.Hostname());
        }
        switch (mode)
        {
        case WIFI_STA:
            encoder.member("Wifi_Mode", "STA");
            encoder.member("MAC", WiFi.macAddress());

            if (WiFi.isConnected())
            { // in theory no need but ...
                encoder.member("Connected", WiFi.SSID());

                encoder.member("Signal", String(wifi_config.getSignal(WiFi.RSSI())) + "%");

                uint8_t PhyMode;
                esp_wifi_get_protocol(WIFI_IF_STA, &PhyMode);
                const char *modeName;
                switch (PhyMode)
                {
                case WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N:
                    modeName = "11n";
                    break;
                case WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G:
                    modeName = "11g";
                    break;
                case WIFI_PROTOCOL_11B:
                    modeName = "11b";
                    break;
                default:
                    modeName = "???";
                }
                encoder.member("Phy_Mode", modeName);

                encoder.member("Channel", String(WiFi.channel()));

                tcpip_adapter_dhcp_status_t dhcp_status;
                tcpip_adapter_dhcpc_get_status(TCPIP_ADAPTER_IF_STA, &dhcp_status);
                encoder.member("IP_Mode", dhcp_status == TCPIP_ADAPTER_DHCP_STARTED ? "DHCP" : "Static");
                encoder.member("IP", WiFi.localIP());
                encoder.member("Gateway", WiFi.gatewayIP());
                encoder.member("Mask", WiFi.subnetMask());
                encoder.member("DNS", WiFi.dnsIP());

            } // this is web command so connection => no command
            encoder.member("Soft_MAC", WiFi.softAPmacAddress());
            break;
        case WIFI_AP:
            encoder.member("Wifi_Mode", "AP");
            encoder.member("MAC", WiFi.softAPmacAddress());

            wifi_config_t conf;
            esp_wifi_get_config(WIFI_IF_AP, &conf);
            encoder.member("SSID", (const char *)conf.ap.ssid);
            encoder.member("Visible", (conf.ap.ssid_hidden == 0) ? "Yes" : "No");

            const char *mode;
            switch (conf.ap.authmode)
            {
            case WIFI_AUTH_OPEN:
                mode = "None";
                break;
            case WIFI_AUTH_WEP:
                mode = "WEP";
                break;
            case WIFI_AUTH_WPA_PSK:
                mode = "WPA";
                break;
            case WIFI_AUTH_WPA2_PSK:
                mode = "WPA2";
                break;
            default:
                mode = "WPA/WPA2";
            }

            encoder.member("Authentication", mode);
            encoder.member("Max_Connections", String(conf.ap.max_connection));

            tcpip_adapter_dhcp_status_t dhcp_status;
            tcpip_adapter_dhcps_get_status(TCPIP_ADAPTER_IF_AP, &dhcp_status);
            encoder.member("DHCP_Server", dhcp_status == TCPIP_ADAPTER_DHCP_STARTED ? "Started" : "Stopped");

            encoder.member("IP", WiFi.softAPIP());

            tcpip_adapter_ip_info_t ip_AP;
            tcpip_adapter_get_ip_info(TCPIP_ADAPTER_IF_AP, &ip_AP);
            encoder.member("Gateway", IPAddress(ip_AP.gw.addr));
            encoder.member("Mask", IPAddress(ip_AP.netmask.addr));

            wifi_sta_list_t station;
            tcpip_adapter_sta_list_t tcpip_sta_list;
            esp_wifi_ap_get_sta_list(&station);
            tcpip_adapter_get_sta_list(&station, &tcpip_sta_list);
            encoder.begin_named_object("Connected_Clients");
            encoder.member("Count", String(station.num));
            encoder.begin_array("Clients_detail");
            for (int i = 0; i < station.num; i++)
            {
                encoder.begin_object();
                encoder.member("Client_" + i, wifi_config.mac2str(tcpip_sta_list.sta[i].mac));
                encoder.member("Client_IP_" + i, IPAddress(tcpip_sta_list.sta[i].ip.addr));
                encoder.end_object();
            }
            encoder.end_array();
            encoder.end_object();
            encoder.member("Disabled Mode", "STA (" + WiFi.macAddress() + ")");
            break;
        case WIFI_AP_STA: // we should not be in this state but just in case ....
            encoder.member("Mixed", "STA (" + WiFi.macAddress() + ") " + "AP (" + WiFi.softAPmacAddress() + ")");
            break;
        default: // we should not be there if no wifi ....
            encoder.member("Off", "");
            break;
        }
#endif // ENABLE_WIFI
#ifdef ENABLE_BLUETOOTH
        if (bt_config.Is_BT_on())
        {
            encoder.member("BT mode", "On");

            encoder.member("BT_Name", bt_config.BTname());
            encoder.member("BT_Address", bt_config.device_address());
            if (SerialBT.hasClient())
            {
                encoder.member("Connected", bt_config._btclient);
            }
            else
            {
                encoder.member("Connected", "no");
            }
        }
        else
        {
            encoder.member("BT mode", "Off");
        }
#endif
#ifdef ENABLE_NOTIFICATIONS
        encoder.member("Notifications", notificationsservice.started() ? "Enabled" : "Disabled");
        if (notificationsservice.started())
        {
            encoder.member("Notification_service", notificationsservice.getTypeString());
        }
#endif
        encoder.end_object();
        encoder.member("FW_version", GRBL_VERSION);
        encoder.member("Build_Number", GRBL_VERSION_BUILD);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

#ifdef ENABLE_WIFI
    static Error listAPs(char *parameter, AuthenticationLevel auth_level)
    { // ESP410
        JSONencoder j(espresponse->client() != CLIENT_WEBUI);
        j.begin();
        j.begin_array("AP_LIST");
        // An initial async scanNetworks was issued at startup, so there
        // is a good chance that scan information is already available.
        int n = WiFi.scanComplete();
        switch (n)
        {
        case -2:                     // Scan not triggered
            WiFi.scanNetworks(true); // Begin async scan
            break;
        case -1: // Scan in progress
            break;
        default:
            for (int i = 0; i < n; ++i)
            {
                j.begin_object();
                j.member("SSID", WiFi.SSID(i));
                j.member("SIGNAL", wifi_config.getSignal(WiFi.RSSI(i)));
                j.member("IS_PROTECTED", WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
                //            j->member("IS_PROTECTED", WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "0" : "1");
                j.end_object();
            }
            WiFi.scanDelete();
            // Restart the scan in async mode so new data will be available
            // when we ask again.
            n = WiFi.scanComplete();
            if (n == -2)
            {
                WiFi.scanNetworks(true);
            }
            break;
        }
        j.end_array();
        webPrint(j.end().c_str());
        return Error::Ok;
    }
#endif

    static Error setWebSetting(char *parameter, AuthenticationLevel auth_level)
    { // ESP401
        // We do not need the "T=" (type) parameter because the
        // Setting objects know their own type
        JSONencoder encoder;
        encoder.begin();
        if (!split_params(parameter))
        {
            encoder.member(JSONencoder::status, "Invalid value");
            webPrint(encoder.end().c_str());
        }
        char *sval = get_param("V", true);
        const char *spos = get_param("P", false);
        if (*spos == '\0')
        {
            encoder.member(JSONencoder::status, "Missing parameter");
            webPrint(encoder.end().c_str());
        }
        Error ret = do_command_or_setting(spos, sval, auth_level, espresponse);
        if (ret == Error::Ok)
        {
            encoder.member(JSONencoder::status, JSONencoder::ok);
            webPrint(encoder.end().c_str());
        }
        else
        {
            encoder.member(JSONencoder::status, uint8_t(ret));
            webPrint(encoder.end().c_str());
        }
        return ret;
    }

    static Error listSettings(char *parameter, AuthenticationLevel auth_level)
    { // ESP400
        JSONencoder j(espresponse->client() != CLIENT_WEBUI);
        j.begin();
        j.begin_array("EEPROM");
        for (Setting *js = Setting::List; js; js = js->next())
        {
            if (js->getType() == WEBSET)
            {
                js->addWebui(&j);
            }
        }
        j.end_array();
        webPrint(j.end().c_str());
        return Error::Ok;
    }

#ifdef ENABLE_SD_CARD
    static Error openSDFile(char *parameter)
    {
        JSONencoder encoder;
        encoder.begin();
        if (*parameter == '\0')
        {
            encoder.member(JSONencoder::status, "Missing file name!");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        String path = trim(parameter);
        if (path[0] != '/')
        {
            path = "/" + path;
        }
        SDState state = get_sd_state(true);
        if (state != SDState::Idle)
        {
            if (state == SDState::NotPresent)
            {
                encoder.member(JSONencoder::status, "No SD Card");
                webPrint(encoder.end().c_str());
                return Error::FsFailedMount;
            }
            else
            {
                encoder.member(JSONencoder::status, "SD Card Busy");
                webPrint(encoder.end().c_str());
                return Error::FsFailedBusy;
            }
        }
        if (!openFile(SD, path.c_str()))
        {
            report_status_message(Error::FsFailedRead, (espresponse) ? espresponse->client() : CLIENT_ALL);
            encoder.member(JSONencoder::status, "Opening file failed!");
            webPrint(encoder.end().c_str());
            return Error::FsFailedOpenFile;
        }
        encoder.member(JSONencoder::status, JSONencoder::ok);
        webPrint(encoder.end().c_str());

        return Error::Ok;
    }

    static Error showSDFile(char *parameter, AuthenticationLevel auth_level)
    { // ESP221
        if (sys.state != State::Idle && sys.state != State::Alarm)
        {
            return Error::IdleError;
        }
        Error err;
        if ((err = openSDFile(parameter)) != Error::Ok)
        {
            return err;
        }
        JSONencoder encoder;
        encoder.begin();

        SD_client = (espresponse) ? espresponse->client() : CLIENT_ALL;
        char fileLine[255];
        String file;
        while (readFileLine(fileLine, 255))
        {
            file += fileLine;
        }
        closeFile();
        encoder.member(JSONencoder::status, JSONencoder::ok);
        encoder.member("FileContent", file);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    static Error runSDFile(char *parameter, AuthenticationLevel auth_level)
    { // ESP220
        Error err;
        JSONencoder encoder;
        encoder.begin();
        if (sys.state == State::Alarm)
        {
            encoder.member(JSONencoder::status, "Alarm");
            webPrint(encoder.end().c_str());
            return Error::IdleError;
        }
        if (sys.state != State::Idle)
        {
            encoder.member(JSONencoder::status, "Busy");
            webPrint(encoder.end().c_str());
            return Error::IdleError;
        }
        if ((err = openSDFile(parameter)) != Error::Ok)
        {
            return err;
        }
        char fileLine[255];
        if (!readFileLine(fileLine, 255))
        {
            // No need notification here it is just a macro
            closeFile();
            encoder.member(JSONencoder::status, JSONencoder::ok);
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        SD_client = (espresponse) ? espresponse->client() : CLIENT_ALL;
        SD_auth_level = auth_level;
        // execute the first line now; Protocol.cpp handles later ones when SD_ready_next
        report_status_message(execute_line(fileLine, SD_client, SD_auth_level), SD_client);
        report_realtime_status(SD_client);
        return Error::Ok;
    }

    static Error deleteSDObject(char *parameter, AuthenticationLevel auth_level)
    { // ESP215
        JSONencoder encoder;
        encoder.begin();
        parameter = trim(parameter);
        if (*parameter == '\0')
        {
            encoder.member(JSONencoder::status, "Missing file name!");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        SDState state = get_sd_state(true);
        if (state != SDState::Idle)
        {
            encoder.member(JSONencoder::status, (state == SDState::NotPresent) ? "No SD card" : "Busy");
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        String path = parameter;
        if (parameter[0] != '/')
        {
            path = "/" + path;
        }
        File file2del = SD.open(path);
        if (!file2del)
        {
            encoder.member(JSONencoder::status, "Cannot start file!");
            webPrint(encoder.end().c_str());
            return Error::FsFileNotFound;
        }
        if (file2del.isDirectory())
        {
            if (!SD.rmdir(path))
            {
                encoder.member(JSONencoder::status, "Cannot delete directory! Is directory empty?");
                webPrint(encoder.end().c_str());
                return Error::FsFailedDelDir;
            }
            encoder.member(JSONencoder::status, "Directory deleted.");
            webPrint(encoder.end().c_str());
        }
        else
        {
            if (!SD.remove(path))
            {

                encoder.member(JSONencoder::status, "Cannot delete file!");
                webPrint(encoder.end().c_str());
                return Error::FsFailedDelFile;
            }
            encoder.member(JSONencoder::status, "File deleted.");
            webPrint(encoder.end().c_str());
        }
        file2del.close();
        return Error::Ok;
    }

    static Error listSDFiles(char *parameter, AuthenticationLevel auth_level)
    { // ESP210
        SDState state = get_sd_state(true);
        JSONencoder encoder;
        encoder.begin();
        if (state != SDState::Idle)
        {
            if (state == SDState::NotPresent)
            {
                encoder.member(JSONencoder::status, "No SD Card");
                webPrint(encoder.end().c_str());
                return Error::FsFailedMount;
            }
            else
            {
                encoder.member(JSONencoder::status, "SD Card Busy");
                webPrint(encoder.end().c_str());
                return Error::FsFailedBusy;
            }
        }

        listDir(SD, "/", 10, espresponse->client());
        encoder.member("Free", ESPResponseStream::formatBytes(SD.totalBytes() - SD.usedBytes()));
        encoder.member("Used", ESPResponseStream::formatBytes(SD.usedBytes()));
        encoder.member("Total", ESPResponseStream::formatBytes(SD.totalBytes()));
        webPrint(encoder.end().c_str());
        SD.end();
        return Error::Ok;
    }
#endif

    void listDirLocalFS(fs::FS &fs, const char *dirname, uint8_t levels, uint8_t client)
    {
        // char temp_filename[128]; // to help filter by extension	TODO: 128 needs a definition based on something
        File root = fs.open(dirname);
        if (!root)
        {
            // FIXME: need proper error for FS and not usd sd one
            report_status_message(Error::FsFailedOpenDir, client);
            return;
        }
        if (!root.isDirectory())
        {
            // FIXME: need proper error for FS and not usd sd one
            report_status_message(Error::FsDirNotFound, client);
            return;
        }
        File file = root.openNextFile();
        while (file)
        {
            if (file.isDirectory())
            {
                if (levels)
                {
                    listDirLocalFS(fs, file.name(), levels - 1, client);
                }
            }
            else
            {
                grbl_sendf(CLIENT_ALL, "[FILE:%s|SIZE:%d]\r\n", file.name(), file.size());
            }
            file = root.openNextFile();
        }
    }

    static void listDirJSON(fs::FS &fs, const char *dirname, uint8_t levels, JSONencoder *j)
    {
        File root = fs.open(dirname);
        File file = root.openNextFile();
        while (file)
        {
            const char *tailName = strchr(file.name(), '/');
            tailName = tailName ? tailName + 1 : file.name();
            if (file.isDirectory() && levels)
            {
                j->begin_array(tailName);
                listDirJSON(fs, file.name(), levels - 1, j);
                j->end_array();
            }
            else
            {
                j->begin_object();
                j->member("name", tailName);
                j->member("size", file.size());
                j->end_object();
            }
            file = root.openNextFile();
        }
    }

    static Error listLocalFilesJSON(char *parameter, AuthenticationLevel auth_level)
    { // No ESP command
        JSONencoder j(espresponse->client() != CLIENT_WEBUI);
        j.begin();
        j.begin_array("files");
        listDirJSON(SPIFFS, "/", 4, &j);
        j.end_array();
        j.member("total", SPIFFS.totalBytes());
        j.member("used", SPIFFS.usedBytes());
        j.member("occupation", String(100 * SPIFFS.usedBytes() / SPIFFS.totalBytes()));
        webPrint(j.end().c_str());
        return Error::Ok;
    }

    static Error showSDStatus(char *parameter, AuthenticationLevel auth_level)
    { // ESP200
        const char *resp = "No SD card";
#ifdef ENABLE_SD_CARD
        switch (get_sd_state(true))
        {
        case SDState::Idle:
            resp = "SD card detected";
            break;
        case SDState::NotPresent:
            resp = "No SD card";
            break;
        default:
            resp = "Busy";
        }
#else
        resp = "SD card not enabled";
#endif
        JSONencoder encoder;
        encoder.begin();
        encoder.member(JSONencoder::status, resp);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    static Error setRadioState(char *parameter, AuthenticationLevel auth_level)
    { // ESP115
        JSONencoder encoder;
        encoder.begin();
        parameter = trim(parameter);
        if (*parameter == '\0')
        {
            // Display the radio state
            bool on = false;
#if defined(ENABLE_WIFI)
            if (WiFi.getMode() != WIFI_MODE_NULL)
            {
                on = true;
            }
#endif
#if defined(ENABLE_BLUETOOTH)
            if (bt_config.Is_BT_on())
            {
                on = true;
            }
#endif

            encoder.member(JSONencoder::status, on ? "ON" : "OFF");
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        int8_t on = -1;
        if (strcasecmp(parameter, "ON") == 0)
        {
            on = 1;
        }
        else if (strcasecmp(parameter, "OFF") == 0)
        {
            on = 0;
        }
        if (on == -1)
        {
            encoder.member(JSONencoder::status, "only ON or OFF mode supported!");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }

        // Stop everything
#if defined(ENABLE_WIFI)
        if (WiFi.getMode() != WIFI_MODE_NULL)
        {
            wifi_config.StopWiFi();
        }
#endif
#if defined(ENABLE_BLUETOOTH)
        if (bt_config.Is_BT_on())
        {
            bt_config.end();
        }
#endif
        // if On start proper service
        if (!on)
        {
            encoder.member(JSONencoder::status, "Radio is OFF");
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        // On
#ifdef WIFI_OR_BLUETOOTH
        switch (wifi_radio_mode->get())
        {
        case ESP_WIFI_AP:
        case ESP_WIFI_STA:
#if !defined(ENABLE_WIFI)
            encoder.member(JSONencoder::status, "Wifi is not enabled");
            webPrint(encoder.end().c_str());
            return Error::WifiFailBegin;

#else
            wifi_config.begin();
            encoder.member(JSONencoder::status, JSONencoder::ok);
            webPrint(encoder.end().c_str());
            return Error::Ok;
#endif
        case ESP_BT:
#if !defined(ENABLE_BLUETOOTH)
            encoder.member(JSONencoder::status, "Bluetooth is not enabled");
            webPrint(encoder.end().c_str());
            return Error::BtFailBegin;
#else
            bt_config.begin();
            encoder.member(JSONencoder::status, JSONencoder::ok);
            webPrint(encoder.end().c_str());
            return Error::Ok;
#endif
        default:
            encoder.member(JSONencoder::status, "Radio is Off");
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
#endif
        encoder.member(JSONencoder::status, JSONencoder::ok);
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

#ifdef ENABLE_WIFI
    static Error showIP(char *parameter, AuthenticationLevel auth_level)
    { // ESP111
        JSONencoder encoder;
        encoder.begin();
        encoder.member("IP", WiFi.getMode() == WIFI_STA ? WiFi.localIP().toString() : WiFi.softAPIP().toString());
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    static Error showSetStaParams(char *parameter, AuthenticationLevel auth_level)
    { // ESP103
        JSONencoder encoder;
        encoder.begin();
        if (*parameter == '\0')
        {
            encoder.member("IP", wifi_sta_ip->getStringValue());
            encoder.member("GW", wifi_sta_gateway->getStringValue());
            encoder.member("MSK", wifi_sta_netmask->getStringValue());
            webPrint(encoder.end().c_str());
            return Error::Ok;
        }
        if (!split_params(parameter))
        {
            encoder.member(JSONencoder::status, "Invalid value");
            webPrint(encoder.end().c_str());
            return Error::InvalidValue;
        }
        char *gateway = get_param("GW", false);
        char *netmask = get_param("MSK", false);
        char *ip = get_param("IP", false);

        Error err = wifi_sta_ip->setStringValue(ip);
        if (err == Error::Ok)
        {
            err = wifi_sta_netmask->setStringValue(netmask);
        }
        if (err == Error::Ok)
        {
            err = wifi_sta_gateway->setStringValue(gateway);
        }
        encoder.member(JSONencoder::status, err == Error::Ok ? JSONencoder::ok : "Error during setting up");
        webPrint(encoder.end().c_str());
        return err;
    }
#endif

    static Error showWebHelp(char *parameter, AuthenticationLevel auth_level)
    { // ESP0
        JSONencoder encoder;
        encoder.begin();
        encoder.begin_array("Persisitent_ESPSettings");
        //        webPrintln("Persistent web settings - $name to show, $name=value to set");
        //      webPrintln("ESPname FullName         Description");
        //    webPrintln("------- --------         -----------");
        for (Setting *s = Setting::List; s; s = s->next())
        {
            if (s->getType() == WEBSET)
            {
                encoder.begin_object();
                if (s->getGrblName())
                {
                    encoder.member("Grblname", s->getGrblName());
                }
                encoder.member("Name", s->getName());
                encoder.member("Description", s->getDescription());
                encoder.end_object();
            }
        }
        encoder.end_array();
        encoder.begin_array("Other_Commands");
        //        webPrintln("Other web commands: $name to show, $name=value to set");
        //      webPrintln("ESPname FullName         Values");
        //    webPrintln("------- --------         ------");
        for (Command *cp = Command::List; cp; cp = cp->next())
        {
            if (cp->getType() == WEBCMD)
            {
                encoder.begin_object();
                encoder.member("Grblname", cp->getGrblName());
                encoder.member("Name", cp->getName());
                encoder.member("Description", cp->getDescription());
                encoder.end_object();
            }
        }
        encoder.end_array();
        webPrint(encoder.end().c_str());
        return Error::Ok;
    }

    // WEB_COMMON should always be defined.  It is a trick to make the definitions
    // line up while allowing VSCode code folding to work correction.
#define WEB_COMMON

    void make_web_settings()
    {
        // If authentication enabled, display_settings skips or displays <Authentication Required>
        // RU - need user or admin password to read
        // WU - need user or admin password to set
        // WA - need admin password to set
#ifdef WEB_COMMON
        new WebCommand(NULL, WEBCMD, WU, "ESP720", "LocalFS/Size", SPIFFSSize);
        new WebCommand("FORMAT", WEBCMD, WA, "ESP710", "LocalFS/Format", formatSpiffs);
        new WebCommand("path", WEBCMD, WU, "ESP701", "LocalFS/Show", showLocalFile);
        new WebCommand("path", WEBCMD, WU, NULL, "LocalFS/ListJSON", listLocalFilesJSON);
#endif
#ifdef ENABLE_NOTIFICATIONS
        new WebCommand(
            "TYPE=NONE|PUSHOVER|EMAIL|LINE T1=token1 T2=token2 TS=settings", WEBCMD, WA, "ESP610", "Notification/Setup", showSetNotification);
        new WebCommand("message", WEBCMD, WU, "ESP600", "Notification/Send", sendMessage);
#endif
#ifdef ENABLE_AUTHENTICATION
        new WebCommand("password", WEBCMD, WA, "ESP555", "WebUI/SetUserPassword", setUserPassword);
#endif
#ifdef WEB_COMMON
        new WebCommand("RESTART", WEBCMD, WA, "ESP444", "System/Control", setSystemMode);
        new WebCommand(NULL, WEBCMD, WU, "ESP420", "System/Stats", showSysStats, anyState);
#endif
#ifdef ENABLE_WIFI
        new WebCommand(NULL, WEBCMD, WU, "ESP410", "WiFi/ListAPs", listAPs);
#endif
#ifdef WEB_COMMON
        new WebCommand("P=position T=type V=value", WEBCMD, WA, "ESP401", "WebUI/Set", setWebSetting);
        new WebCommand(NULL, WEBCMD, WU, "ESP400", "WebUI/List", listSettings, anyState);
#endif
#ifdef ENABLE_SD_CARD
        new WebCommand("path", WEBCMD, WU, "ESP221", "SD/Show", showSDFile);
        new WebCommand("path", WEBCMD, WU, "ESP220", "SD/Run", runSDFile);
        new WebCommand("file_or_directory_path", WEBCMD, WU, "ESP215", "SD/Delete", deleteSDObject);
        new WebCommand(NULL, WEBCMD, WU, "ESP210", "SD/List", listSDFiles);
#endif
#ifdef WEB_COMMON
        new WebCommand(NULL, WEBCMD, WU, "ESP200", "SD/Status", showSDStatus);
        new WebCommand("STA|AP|BT|OFF", WEBCMD, WA, "ESP115", "Radio/State", setRadioState);
#endif
#ifdef ENABLE_WIFI
        new WebCommand(NULL, WEBCMD, WG, "ESP111", "System/IP", showIP);
        new WebCommand("IP=ipaddress MSK=netmask GW=gateway", WEBCMD, WA, "ESP103", "Sta/Setup", showSetStaParams);
#endif
#ifdef WEB_COMMON
        new WebCommand(NULL, WEBCMD, WG, "ESP0", "WebUI/Help", showWebHelp, anyState);
        new WebCommand(NULL, WEBCMD, WG, "ESP", "WebUI/Help", showWebHelp, anyState);
#endif
        // WebUI Settings
        // Standard WEBUI authentication is user+ to get, admin to set unless otherwise specified
#ifdef ENABLE_NOTIFICATIONS
        notification_ts = new StringSetting(
            "Notification Settings", WEBSET, WA, NULL, "Notification/TS", DEFAULT_TOKEN, 0, MAX_NOTIFICATION_SETTING_LENGTH, NULL);
        notification_t2 = new StringSetting("Notification Token 2",
                                            WEBSET,
                                            WA,
                                            NULL,
                                            "Notification/T2",
                                            DEFAULT_TOKEN,
                                            MIN_NOTIFICATION_TOKEN_LENGTH,
                                            MAX_NOTIFICATION_TOKEN_LENGTH,
                                            NULL);
        notification_t1 = new StringSetting("Notification Token 1",
                                            WEBSET,
                                            WA,
                                            NULL,
                                            "Notification/T1",
                                            DEFAULT_TOKEN,
                                            MIN_NOTIFICATION_TOKEN_LENGTH,
                                            MAX_NOTIFICATION_TOKEN_LENGTH,
                                            NULL);
        notification_type = new EnumSetting(
            "Notification type", WEBSET, WA, NULL, "Notification/Type", DEFAULT_NOTIFICATION_TYPE, &notificationOptions, NULL);
#endif
#ifdef ENABLE_AUTHENTICATION
        user_password = new StringSetting("User password",
                                          WEBSET,
                                          WA,
                                          NULL,
                                          "WebUI/UserPassword",
                                          DEFAULT_USER_PWD,
                                          MIN_LOCAL_PASSWORD_LENGTH,
                                          MAX_LOCAL_PASSWORD_LENGTH,
                                          &COMMANDS::isLocalPasswordValid);
        admin_password = new StringSetting("Admin password",
                                           WEBSET,
                                           WA,
                                           NULL,
                                           "WebUI/AdminPassword",
                                           DEFAULT_ADMIN_PWD,
                                           MIN_LOCAL_PASSWORD_LENGTH,
                                           MAX_LOCAL_PASSWORD_LENGTH,
                                           &COMMANDS::isLocalPasswordValid);
#endif
#ifdef ENABLE_BLUETOOTH
        bt_name = new StringSetting("Bluetooth name",
                                    WEBSET,
                                    WA,
                                    "ESP140",
                                    "Bluetooth/Name",
                                    DEFAULT_BT_NAME,
                                    WebUI::BTConfig::MIN_BTNAME_LENGTH,
                                    WebUI::BTConfig::MAX_BTNAME_LENGTH,
                                    (bool (*)(char *))BTConfig::isBTnameValid);
#endif

#ifdef WIFI_OR_BLUETOOTH
        // user+ to get, admin to set
        wifi_radio_mode = new EnumSetting("Radio mode", WEBSET, WA, "ESP110", "Radio/Mode", DEFAULT_RADIO_MODE, &radioEnabledOptions, NULL);
#endif

#ifdef ENABLE_WIFI
        telnet_port = new IntSetting(
            "Telnet Port", WEBSET, WA, "ESP131", "Telnet/Port", DEFAULT_TELNETSERVER_PORT, MIN_TELNET_PORT, MAX_TELNET_PORT, NULL);
        telnet_enable = new EnumSetting("Telnet Enable", WEBSET, WA, "ESP130", "Telnet/Enable", DEFAULT_TELNET_STATE, &onoffOptions, NULL);
        http_port =
            new IntSetting("HTTP Port", WEBSET, WA, "ESP121", "Http/Port", DEFAULT_WEBSERVER_PORT, MIN_HTTP_PORT, MAX_HTTP_PORT, NULL);
        http_enable = new EnumSetting("HTTP Enable", WEBSET, WA, "ESP120", "Http/Enable", DEFAULT_HTTP_STATE, &onoffOptions, NULL);
        wifi_hostname = new StringSetting("Hostname",
                                          WEBSET,
                                          WA,
                                          "ESP112",
                                          "System/Hostname",
                                          DEFAULT_HOSTNAME,
                                          MIN_HOSTNAME_LENGTH,
                                          MAX_HOSTNAME_LENGTH,
                                          (bool (*)(char *))WiFiConfig::isHostnameValid);
        wifi_ap_channel =
            new IntSetting("AP Channel", WEBSET, WA, "ESP108", "AP/Channel", DEFAULT_AP_CHANNEL, MIN_CHANNEL, MAX_CHANNEL, NULL);
        wifi_ap_ip = new IPaddrSetting("AP Static IP", WEBSET, WA, "ESP107", "AP/IP", DEFAULT_AP_IP, NULL);
        // no get, admin to set
        wifi_ap_password = new StringSetting("AP Password",
                                             WEBSET,
                                             WA,
                                             "ESP106",
                                             "AP/Password",
                                             DEFAULT_AP_PWD,
                                             MIN_PASSWORD_LENGTH,
                                             MAX_PASSWORD_LENGTH,
                                             (bool (*)(char *))WiFiConfig::isPasswordValid);
        wifi_ap_ssid = new StringSetting(
            "AP SSID", WEBSET, WA, "ESP105", "AP/SSID", DEFAULT_AP_SSID, MIN_SSID_LENGTH, MAX_SSID_LENGTH, (bool (*)(char *))WiFiConfig::isSSIDValid);
        wifi_sta_netmask = new IPaddrSetting("Station Static Mask", WEBSET, WA, NULL, "Sta/Netmask", DEFAULT_STA_MK, NULL);
        wifi_sta_gateway = new IPaddrSetting("Station Static Gateway", WEBSET, WA, NULL, "Sta/Gateway", DEFAULT_STA_GW, NULL);
        wifi_sta_ip = new IPaddrSetting("Station Static IP", WEBSET, WA, NULL, "Sta/IP", DEFAULT_STA_IP, NULL);
        wifi_sta_mode = new EnumSetting("Station IP Mode", WEBSET, WA, "ESP102", "Sta/IPMode", DEFAULT_STA_IP_MODE, &staModeOptions, NULL);
        // no get, admin to set
        wifi_sta_password = new StringSetting("Station Password",
                                              WEBSET,
                                              WA,
                                              "ESP101",
                                              "Sta/Password",
                                              DEFAULT_STA_PWD,
                                              MIN_PASSWORD_LENGTH,
                                              MAX_PASSWORD_LENGTH,
                                              (bool (*)(char *))WiFiConfig::isPasswordValid);
        wifi_sta_ssid = new StringSetting("Station SSID",
                                          WEBSET,
                                          WA,
                                          "ESP100",
                                          "Sta/SSID",
                                          DEFAULT_STA_SSID,
                                          MIN_SSID_LENGTH,
                                          MAX_SSID_LENGTH,
                                          (bool (*)(char *))WiFiConfig::isSSIDValid);
#endif
    }
}
